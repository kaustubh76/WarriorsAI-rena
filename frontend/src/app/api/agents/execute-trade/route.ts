/**
 * API Route: Agent Trade Execution
 * Server-side trade execution for iNFT agents on prediction markets
 *
 * This endpoint allows agents to autonomously execute trades using a server wallet,
 * eliminating the need for user wallet signatures.
 *
 * Security:
 * - Only executes verified predictions from 0G Compute
 * - Rate limited to prevent abuse
 * - Amount capped per trade
 * - Agent validation required
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Contract addresses on Flow Testnet (545)
const FLOW_RPC = 'https://testnet.evm.nodes.onflow.org';
const CROWN_TOKEN = '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';
const PREDICTION_MARKET = '0x1b26203A2752557ecD4763a9A8A26119AC5e18e4';

// Trade limits
const MAX_TRADE_AMOUNT = ethers.parseEther('100'); // Max 100 CRwN per trade
const MIN_CONFIDENCE = 60; // Minimum confidence threshold

// ABIs (minimal for the functions we need)
const CROWN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const PREDICTION_MARKET_ABI = [
  'function buy(uint256 marketId, bool isYes, uint256 collateralAmount, uint256 minSharesOut) returns (uint256 sharesOut)',
  'function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, uint256 endTime, uint256 resolutionTime, uint8 status, uint8 outcome, uint256 yesTokens, uint256 noTokens, uint256 liquidity, uint256 totalVolume, address creator, uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 createdAt))',
  'function getPrice(uint256 marketId) view returns (uint256 yesPrice, uint256 noPrice)'
];

interface ExecuteTradeRequest {
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  prediction: {
    marketId: string;
    agentId: string;
    isYes: boolean;
    confidence: number;
    reasoning: string;
    isVerified: boolean;
    fallbackMode: boolean;
    chatId: string;
    proof: {
      inputHash: string;
      outputHash: string;
      providerAddress: string;
      modelHash: string;
    };
    timestamp: number;
  };
}

interface ExecuteTradeResponse {
  success: boolean;
  txHash?: string;
  sharesReceived?: string;
  error?: string;
  walletAddress?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  copyTrades?: unknown;
}

// Rate limiting (simple in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // Max 10 trades per minute per agent

function checkRateLimit(agentId: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(agentId);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(agentId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * POST: Execute trade on behalf of agent
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: ExecuteTradeRequest = await request.json();
    const { agentId, marketId, isYes, amount, prediction } = body;

    // Validate required fields
    if (!agentId || !marketId || amount === undefined || !prediction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentId, marketId, amount, prediction' },
        { status: 400 }
      );
    }

    // Check rate limit
    if (!checkRateLimit(agentId)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Max 10 trades per minute per agent.' },
        { status: 429 }
      );
    }

    // Validate prediction verification
    if (!prediction.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Cannot execute unverified prediction. Only 0G verified predictions are allowed.' },
        { status: 400 }
      );
    }

    // Reject fallback mode predictions
    if (prediction.fallbackMode) {
      return NextResponse.json(
        { success: false, error: 'Cannot execute fallback mode prediction. Real 0G inference required.' },
        { status: 400 }
      );
    }

    // Check confidence threshold
    if (prediction.confidence < MIN_CONFIDENCE) {
      return NextResponse.json(
        { success: false, error: `Confidence ${prediction.confidence}% is below minimum ${MIN_CONFIDENCE}%` },
        { status: 400 }
      );
    }

    // Parse amount and validate
    const tradeAmount = BigInt(amount);
    if (tradeAmount <= BigInt(0)) {
      return NextResponse.json(
        { success: false, error: 'Trade amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (tradeAmount > MAX_TRADE_AMOUNT) {
      return NextResponse.json(
        { success: false, error: `Trade amount exceeds maximum of ${ethers.formatEther(MAX_TRADE_AMOUNT)} CRwN` },
        { status: 400 }
      );
    }

    // Get server wallet from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server wallet not configured' },
        { status: 500 }
      );
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🤖 Agent #${agentId} executing trade on market #${marketId}`);
    console.log(`   Position: ${isYes ? 'YES' : 'NO'}, Amount: ${ethers.formatEther(tradeAmount)} CRwN`);
    console.log(`   Wallet: ${wallet.address}`);

    // Create contract instances
    const crownContract = new ethers.Contract(CROWN_TOKEN, CROWN_ABI, wallet);
    const marketContract = new ethers.Contract(PREDICTION_MARKET, PREDICTION_MARKET_ABI, wallet);

    // Check CRwN balance
    const balance = await crownContract.balanceOf(wallet.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} CRwN`);

    if (balance < tradeAmount) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient CRwN balance. Has ${ethers.formatEther(balance)}, needs ${ethers.formatEther(tradeAmount)}`,
          walletAddress: wallet.address,
          balanceBefore: ethers.formatEther(balance)
        },
        { status: 400 }
      );
    }

    // Check and set approval if needed
    const allowance = await crownContract.allowance(wallet.address, PREDICTION_MARKET);
    if (allowance < tradeAmount) {
      console.log(`   Approving ${ethers.formatEther(tradeAmount)} CRwN for PredictionMarket...`);
      const approveTx = await crownContract.approve(PREDICTION_MARKET, tradeAmount);
      await approveTx.wait();
      console.log(`   ✅ Approval confirmed: ${approveTx.hash}`);
    }

    // Verify market exists and is active
    try {
      const market = await marketContract.getMarket(BigInt(marketId));
      if (market.status !== 0n) { // 0 = Active
        return NextResponse.json(
          { success: false, error: 'Market is not active' },
          { status: 400 }
        );
      }
    } catch (marketError) {
      return NextResponse.json(
        { success: false, error: `Market #${marketId} not found or error fetching: ${marketError}` },
        { status: 400 }
      );
    }

    // Execute the trade
    console.log(`   📤 Executing buy(${marketId}, ${isYes}, ${tradeAmount}, 0)...`);
    const buyTx = await marketContract.buy(
      BigInt(marketId),
      isYes,
      tradeAmount,
      BigInt(0) // minSharesOut = 0 for simplicity
    );

    console.log(`   ⏳ Waiting for confirmation: ${buyTx.hash}`);
    const receipt = await buyTx.wait();

    // Get balance after trade
    const balanceAfter = await crownContract.balanceOf(wallet.address);

    console.log(`   ✅ Trade executed successfully!`);
    console.log(`   TX Hash: ${receipt.hash}`);
    console.log(`   Balance after: ${ethers.formatEther(balanceAfter)} CRwN`);

    // Trigger copy trades for followers (fire and forget)
    let copyTradeResult = null;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const copyTradeResponse = await fetch(`${baseUrl}/api/copy-trade/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: Number(agentId),
          marketId: Number(marketId),
          isYes: isYes,
          agentTradeAmount: ethers.formatEther(tradeAmount)
        })
      });
      copyTradeResult = await copyTradeResponse.json();
      console.log(`   📋 Copy trades executed:`, copyTradeResult.summary || copyTradeResult);
    } catch (copyError) {
      console.error('   ⚠️ Copy trade execution failed (non-fatal):', copyError);
    }

    const response: ExecuteTradeResponse = {
      success: true,
      txHash: receipt.hash,
      walletAddress: wallet.address,
      balanceBefore: ethers.formatEther(balance),
      balanceAfter: ethers.formatEther(balanceAfter),
      copyTrades: copyTradeResult
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Agent trade execution error:', error);

    // Extract useful error message
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
      // Check for common contract errors
      if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient native tokens for gas';
      } else if (errorMessage.includes('execution reverted')) {
        errorMessage = 'Transaction reverted by contract';
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET: Check agent trading status and wallet balance
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    // Get server wallet from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({
        success: false,
        error: 'Server wallet not configured'
      });
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create contract instance
    const crownContract = new ethers.Contract(CROWN_TOKEN, CROWN_ABI, wallet);

    // Get balances
    const crwnBalance = await crownContract.balanceOf(wallet.address);
    const nativeBalance = await provider.getBalance(wallet.address);
    const allowance = await crownContract.allowance(wallet.address, PREDICTION_MARKET);

    // Get rate limit status
    let rateLimit = null;
    if (agentId) {
      const limit = rateLimitMap.get(agentId);
      if (limit && Date.now() < limit.resetAt) {
        rateLimit = {
          remaining: RATE_LIMIT_MAX - limit.count,
          resetIn: Math.ceil((limit.resetAt - Date.now()) / 1000)
        };
      } else {
        rateLimit = { remaining: RATE_LIMIT_MAX, resetIn: 0 };
      }
    }

    return NextResponse.json({
      success: true,
      wallet: {
        address: wallet.address,
        crwnBalance: ethers.formatEther(crwnBalance),
        nativeBalance: ethers.formatEther(nativeBalance),
        marketAllowance: ethers.formatEther(allowance)
      },
      limits: {
        maxTradeAmount: ethers.formatEther(MAX_TRADE_AMOUNT),
        minConfidence: MIN_CONFIDENCE
      },
      rateLimit,
      contracts: {
        crownToken: CROWN_TOKEN,
        predictionMarket: PREDICTION_MARKET,
        rpc: FLOW_RPC
      }
    });
  } catch (error) {
    console.error('Agent status check error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
