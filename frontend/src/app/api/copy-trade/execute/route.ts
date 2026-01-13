import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  ZEROG_RPC,
  FLOW_RPC,
  ZEROG_CONTRACTS,
  FLOW_CONTRACTS,
  AI_AGENT_INFT_ABI,
  PREDICTION_MARKET_ABI,
  ERC20_ABI,
  getServerPrivateKey,
} from '@/lib/apiConfig';

// Copy trade config from AIAgentINFT (0G chain)
interface CopyTradeConfig {
  tokenId: bigint;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  startedAt: bigint;
  isActive: boolean;
}

// Agent on-chain data from AIAgentINFT (0G chain)
interface AgentOnChainData {
  tier: number;
  stakedAmount: bigint;
  isActive: boolean;
  copyTradingEnabled: boolean;
  createdAt: bigint;
  lastUpdatedAt: bigint;
}

interface ExecutionResult {
  follower: string;
  amount: string;
  success: boolean;
  txHash?: string;
  error?: string;
  tokensReceived?: string;
}

/**
 * POST /api/copy-trade/execute
 * Execute copy trades for all followers of an agent
 *
 * Body: {
 *   agentId: number,
 *   marketId: number,
 *   isYes: boolean,
 *   agentTradeAmount: string (in CRwN, e.g., "10")
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, marketId, isYes, agentTradeAmount } = body;

    if (!agentId || marketId === undefined || isYes === undefined || !agentTradeAmount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentId, marketId, isYes, agentTradeAmount' },
        { status: 400 }
      );
    }

    // Get server private key for executing trades
    const privateKey = getServerPrivateKey();
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server not configured for copy trade execution' },
        { status: 500 }
      );
    }

    // Setup providers and wallet
    // 0G provider for reading copy trade data (followers, configs)
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
    // Flow provider for executing trades
    const flowProvider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, flowProvider);

    // Create contract instances
    // AIAgentINFT on 0G - for reading followers and copy configs
    const inftContract = new ethers.Contract(
      ZEROG_CONTRACTS.aiAgentINFT,
      AI_AGENT_INFT_ABI,
      zeroGProvider
    );

    const marketContract = new ethers.Contract(
      FLOW_CONTRACTS.predictionMarketAMM,
      PREDICTION_MARKET_ABI,
      wallet
    );

    const crownToken = new ethers.Contract(
      FLOW_CONTRACTS.crownToken,
      ERC20_ABI,
      wallet
    );

    // Get agent info from 0G iNFT contract
    let agentData: AgentOnChainData;
    let agentOwner: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      agentOwner = await inftContract.ownerOf(agentId);
    } catch (err) {
      console.error('Error getting agent data from 0G:', err);
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} not found on 0G chain` },
        { status: 400 }
      );
    }

    if (!agentData.isActive) {
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} is not active` },
        { status: 400 }
      );
    }

    if (!agentData.copyTradingEnabled) {
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} does not have copy trading enabled` },
        { status: 400 }
      );
    }

    // Get all followers of this agent from 0G
    const followers: string[] = await inftContract.getAgentFollowers(agentId);

    if (followers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No followers to execute copy trades for',
        agentId,
        marketId,
        isYes,
        executed: 0
      });
    }

    // Verify market is active
    const market = await marketContract.getMarket(marketId);
    console.log(`[Copy Trade] Market #${marketId} status:`, market.status, 'type:', typeof market.status);
    // Handle both BigInt and number comparison
    if (Number(market.status) !== 0) { // ACTIVE = 0
      return NextResponse.json(
        { success: false, error: `Market #${marketId} is not active (status: ${market.status})` },
        { status: 400 }
      );
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (Number(market.endTime) <= currentTime) {
      return NextResponse.json(
        { success: false, error: `Market #${marketId} has expired` },
        { status: 400 }
      );
    }

    const results: ExecutionResult[] = [];
    let successCount = 0;
    let totalVolume = BigInt(0);

    // Check server wallet balance
    const walletBalance = await crownToken.balanceOf(wallet.address);
    console.log(`Server wallet balance: ${ethers.formatEther(walletBalance)} CRwN`);

    // Check and approve if needed
    const currentAllowance = await crownToken.allowance(wallet.address, FLOW_CONTRACTS.predictionMarketAMM);
    const neededAmount = ethers.parseEther(agentTradeAmount) * BigInt(followers.length);

    if (currentAllowance < neededAmount) {
      console.log('Approving CRwN for copy trades...');
      const approveTx = await crownToken.approve(
        FLOW_CONTRACTS.predictionMarketAMM,
        ethers.MaxUint256 // Infinite approval for convenience
      );
      await approveTx.wait();
      console.log('Approval confirmed');
    }

    // For each follower, check their config and execute copy trade
    for (const follower of followers) {
      try {
        // Get follower's copy trade config from 0G
        const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(follower, agentId);

        if (!config.isActive) {
          results.push({
            follower,
            amount: '0',
            success: false,
            error: 'Copy trading not active for this follower'
          });
          continue;
        }

        // Calculate trade amount (min of agent trade and follower's max)
        const agentAmount = ethers.parseEther(agentTradeAmount);
        const maxAmount = config.maxAmountPerTrade;
        const tradeAmount = agentAmount < maxAmount ? agentAmount : maxAmount;

        // Check if we have enough balance
        if (tradeAmount > walletBalance) {
          results.push({
            follower,
            amount: ethers.formatEther(tradeAmount),
            success: false,
            error: 'Insufficient server wallet balance'
          });
          continue;
        }

        // Execute copy trade
        // Note: This uses server wallet to execute on behalf of follower
        // In production, this should use the follower's own approval/signature
        const tx = await marketContract.executeCopyTrade(
          agentId,
          marketId,
          isYes,
          tradeAmount
        );
        const receipt = await tx.wait();

        // Parse events to get tokens received
        let tokensReceived = 'unknown';
        for (const log of receipt.logs) {
          try {
            const parsed = marketContract.interface.parseLog(log);
            if (parsed?.name === 'TokensPurchased') {
              tokensReceived = ethers.formatEther(parsed.args.tokensOut);
            }
          } catch {
            // Not our event
          }
        }

        results.push({
          follower,
          amount: ethers.formatEther(tradeAmount),
          success: true,
          txHash: receipt.hash,
          tokensReceived
        });

        successCount++;
        totalVolume += tradeAmount;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          follower,
          amount: '0',
          success: false,
          error: errorMessage
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        agentId,
        agentOwner,
        agentTier: Number(agentData.tier),
        marketId,
        marketQuestion: market.question,
        direction: isYes ? 'YES' : 'NO',
        totalFollowers: followers.length,
        successfulExecutions: successCount,
        failedExecutions: followers.length - successCount,
        totalVolume: ethers.formatEther(totalVolume)
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Copy trade execution error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/copy-trade/execute?agentId=1
 * Get copy trade readiness status for an agent
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    // 0G provider for reading agent data
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
    // Flow provider for server wallet check
    const flowProvider = new ethers.JsonRpcProvider(FLOW_RPC);

    const inftContract = new ethers.Contract(
      ZEROG_CONTRACTS.aiAgentINFT,
      AI_AGENT_INFT_ABI,
      zeroGProvider
    );

    // Get agent info from 0G
    let agentData: AgentOnChainData;
    let agentOwner: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      agentOwner = await inftContract.ownerOf(agentId);
    } catch (err) {
      console.error('Error getting agent data from 0G:', err);
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} not found on 0G chain` },
        { status: 404 }
      );
    }

    // Get followers from 0G
    const followers: string[] = await inftContract.getAgentFollowers(agentId);

    // Get active follower configs from 0G
    const activeFollowers: Array<{
      address: string;
      maxAmountPerTrade: string;
      totalCopied: string;
    }> = [];

    for (const follower of followers) {
      const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(follower, agentId);
      if (config.isActive) {
        activeFollowers.push({
          address: follower,
          maxAmountPerTrade: ethers.formatEther(config.maxAmountPerTrade),
          totalCopied: ethers.formatEther(config.totalCopied)
        });
      }
    }

    // Check server wallet on Flow (where trades execute)
    const privateKey = getServerPrivateKey();
    let serverWalletStatus = { configured: false, balance: '0', address: '' };

    if (privateKey) {
      const wallet = new ethers.Wallet(privateKey, flowProvider);
      const crownToken = new ethers.Contract(FLOW_CONTRACTS.crownToken, ERC20_ABI, flowProvider);
      const balance = await crownToken.balanceOf(wallet.address);

      serverWalletStatus = {
        configured: true,
        balance: ethers.formatEther(balance),
        address: wallet.address
      };
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: Number(agentId),
        owner: agentOwner,
        tier: Number(agentData.tier),
        isActive: agentData.isActive,
        copyTradingEnabled: agentData.copyTradingEnabled,
        stakedAmount: ethers.formatEther(agentData.stakedAmount)
      },
      copyTrading: {
        totalFollowers: followers.length,
        activeFollowers: activeFollowers.length,
        followers: activeFollowers
      },
      serverWallet: serverWalletStatus,
      chains: {
        agentData: '0G Galileo Testnet (16602)',
        tradeExecution: 'Flow Testnet (545)'
      },
      executionEndpoint: 'POST /api/copy-trade/execute'
    });

  } catch (error: unknown) {
    console.error('Get copy trade status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
