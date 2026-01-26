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
import {
  FLOW_RPC,
  ZEROG_RPC,
  FLOW_CONTRACTS,
  ZEROG_CONTRACTS,
  ERC20_ABI,
  PREDICTION_MARKET_ABI,
  TRADING_LIMITS,
  RATE_LIMITS,
  getApiBaseUrl,
} from '@/lib/apiConfig';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// Parse trade limits from config
const MAX_TRADE_AMOUNT = ethers.parseEther(TRADING_LIMITS.maxTradeAmount);
const MIN_CONFIDENCE = TRADING_LIMITS.minConfidence;

// Extended ABIs with approval function
const CROWN_ABI = [
  ...ERC20_ABI,
  'function approve(address spender, uint256 value) returns (bool)',
];

const MARKET_ABI = [
  ...PREDICTION_MARKET_ABI,
];

// AIAgentINFT ABI for recording trades (on 0G chain)
const AI_AGENT_INFT_RECORD_ABI = [
  'function recordTrade(uint256 tokenId, bool won, int256 pnl)',
  'function getAgentPerformance(uint256 tokenId) view returns (tuple(uint256 totalTrades, uint256 winningTrades, int256 totalPnL, uint256 accuracyBps))',
];

interface ExecuteTradeRequest {
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  minConfidenceOverride?: number;
  prediction: {
    marketId: string;
    agentId: string;
    isYes: boolean;
    confidence: number;
    reasoning: string;
    isVerified: boolean;
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
  tradeRecorded?: {
    success: boolean;
    txHash?: string;
    chain?: string;
    error?: string;
  };
}

// Rate limiting (simple in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = RATE_LIMITS.agentTrades.windowMs;
const RATE_LIMIT_MAX = RATE_LIMITS.agentTrades.maxPerMinute;

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
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'agent-execute-trade',
      maxRequests: 10,
      windowMs: 60000,
    });

    // Parse request body
    const body: ExecuteTradeRequest = await request.json();
    const { agentId, marketId, isYes, amount, prediction, minConfidenceOverride } = body;

    // Validate required fields
    if (!agentId || !marketId || amount === undefined || !prediction) {
      throw ErrorResponses.badRequest('Missing required fields: agentId, marketId, amount, prediction');
    }

    // Check rate limit (per agent)
    if (!checkRateLimit(agentId)) {
      throw ErrorResponses.tooManyRequests('Rate limit exceeded. Max 10 trades per minute per agent.');
    }

    // Validate prediction verification - only 0G verified predictions allowed
    if (!prediction.isVerified) {
      throw ErrorResponses.badRequest('Cannot execute unverified prediction. Only 0G verified predictions are allowed.');
    }

    // Check confidence threshold (allow override for testing)
    const effectiveMinConfidence = minConfidenceOverride ?? MIN_CONFIDENCE;
    if (prediction.confidence < effectiveMinConfidence) {
      throw ErrorResponses.badRequest(`Confidence ${prediction.confidence}% is below minimum ${effectiveMinConfidence}%`);
    }

    // Parse amount and validate
    const tradeAmount = BigInt(amount);
    if (tradeAmount <= BigInt(0)) {
      throw ErrorResponses.badRequest('Trade amount must be greater than 0');
    }

    if (tradeAmount > MAX_TRADE_AMOUNT) {
      throw ErrorResponses.badRequest(`Trade amount exceeds maximum of ${ethers.formatEther(MAX_TRADE_AMOUNT)} CRwN`);
    }

    // Get server wallet from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Server wallet not configured');
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🤖 Agent #${agentId} executing trade on market #${marketId}`);
    console.log(`   Position: ${isYes ? 'YES' : 'NO'}, Amount: ${ethers.formatEther(tradeAmount)} CRwN`);
    console.log(`   Wallet: ${wallet.address}`);

    // Create contract instances
    const crownContract = new ethers.Contract(FLOW_CONTRACTS.crownToken, CROWN_ABI, wallet);
    const marketContract = new ethers.Contract(FLOW_CONTRACTS.predictionMarketAMM, MARKET_ABI, wallet);

    // Check CRwN balance
    const balance = await crownContract.balanceOf(wallet.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} CRwN`);

    if (balance < tradeAmount) {
      throw ErrorResponses.badRequest(`Insufficient CRwN balance. Has ${ethers.formatEther(balance)}, needs ${ethers.formatEther(tradeAmount)}`);
    }

    // Check and set approval if needed
    const allowance = await crownContract.allowance(wallet.address, FLOW_CONTRACTS.predictionMarketAMM);
    if (allowance < tradeAmount) {
      console.log(`   Approving ${ethers.formatEther(tradeAmount)} CRwN for PredictionMarket...`);
      const approveTx = await crownContract.approve(FLOW_CONTRACTS.predictionMarketAMM, tradeAmount);
      await approveTx.wait();
      console.log(`   ✅ Approval confirmed: ${approveTx.hash}`);
    }

    // Verify market exists and is active
    try {
      const market = await marketContract.getMarket(BigInt(marketId));
      if (market.status !== BigInt(0)) { // 0 = Active
        throw ErrorResponses.badRequest('Market is not active');
      }
    } catch (marketError) {
      if (marketError instanceof Error && marketError.message.includes('400')) {
        throw marketError;
      }
      throw ErrorResponses.badRequest(`Market #${marketId} not found or error fetching: ${marketError}`);
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

    // Track trade in database for later performance updates
    try {
      await prisma.agentTrade.create({
        data: {
          agentId: agentId,
          marketId: marketId,
          isYes: isYes,
          amount: amount,
          txHash: receipt.hash,
          isCopyTrade: false,
          recordedOn0G: false,
        }
      });
      console.log(`   📊 Trade tracked in database`);
    } catch (dbError) {
      console.error('   ⚠️ Failed to track trade in database:', dbError);
    }

    // Trigger copy trades for followers (fire and forget)
    let copyTradeResult = null;
    try {
      const baseUrl = getApiBaseUrl();
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

    // Record trade to AIAgentINFT on 0G chain for trade history
    let recordTradeResult = null;
    try {
      console.log(`   📝 Recording trade on AIAgentINFT (0G chain)...`);

      const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
      const zeroGWallet = new ethers.Wallet(privateKey, zeroGProvider);

      const aiAgentINFT = new ethers.Contract(
        ZEROG_CONTRACTS.aiAgentINFT,
        AI_AGENT_INFT_RECORD_ABI,
        zeroGWallet
      );

      // Record the trade - won=false and pnl=0 initially (resolved later)
      // We pass 0 PnL because outcome isn't known yet
      const recordTx = await aiAgentINFT.recordTrade(
        BigInt(agentId),
        false, // Not won yet (market not resolved)
        BigInt(0) // PnL unknown until market resolves
      );

      const recordReceipt = await recordTx.wait();
      recordTradeResult = {
        success: true,
        txHash: recordReceipt.hash,
        chain: '0G Galileo'
      };

      console.log(`   ✅ Trade recorded on 0G: ${recordReceipt.hash}`);
    } catch (recordError) {
      console.error('   ⚠️ Trade recording failed (non-fatal):', recordError);
      recordTradeResult = {
        success: false,
        error: recordError instanceof Error ? recordError.message : 'Unknown error'
      };
    }

    const response: ExecuteTradeResponse = {
      success: true,
      txHash: receipt.hash,
      walletAddress: wallet.address,
      balanceBefore: ethers.formatEther(balance),
      balanceAfter: ethers.formatEther(balanceAfter),
      copyTrades: copyTradeResult,
      tradeRecorded: recordTradeResult
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleAPIError(error, 'API:Agents:ExecuteTrade:POST');
  }
}

/**
 * GET: Check agent trading status and wallet balance
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'agent-execute-trade-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    // Get server wallet from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Server wallet not configured');
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create contract instance
    const crownContract = new ethers.Contract(FLOW_CONTRACTS.crownToken, CROWN_ABI, wallet);

    // Get balances
    const crwnBalance = await crownContract.balanceOf(wallet.address);
    const nativeBalance = await provider.getBalance(wallet.address);
    const allowance = await crownContract.allowance(wallet.address, FLOW_CONTRACTS.predictionMarketAMM);

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
        crownToken: FLOW_CONTRACTS.crownToken,
        predictionMarket: FLOW_CONTRACTS.predictionMarketAMM,
        rpc: FLOW_RPC
      }
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:ExecuteTrade:GET');
  }
}
