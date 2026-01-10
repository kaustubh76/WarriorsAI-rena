import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Flow Testnet Configuration
const FLOW_RPC = 'https://testnet.evm.nodes.onflow.org';
const PREDICTION_MARKET = '0x1b26203A2752557ecD4763a9A8A26119AC5e18e4';
const AI_AGENT_REGISTRY = '0xdc2b123Ec17c36E10c2Ca4628473E879194153D0';
const CROWN_TOKEN = '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';

// ABIs
const AI_AGENT_REGISTRY_ABI = [
  'function getAgentFollowers(uint256 agentId) view returns (address[])',
  'function getCopyTradeConfig(address user, uint256 agentId) view returns (tuple(bool isActive, uint256 maxAmountPerTrade, uint256 totalCopied, uint256 totalPnL))',
  'function getAgent(uint256 agentId) view returns (tuple(uint256 id, address owner, string name, string strategy, uint256 totalPnL, uint256 winCount, uint256 lossCount, uint256 totalTrades, uint256 followersCount, uint256 stake, uint8 tier, bool isActive, bool isOfficial, uint256 createdAt))'
];

const PREDICTION_MARKET_ABI = [
  'function executeCopyTrade(uint256 agentId, uint256 marketId, bool isYes, uint256 collateralAmount) returns (uint256)',
  'function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, uint256 endTime, uint256 resolutionTime, uint8 status, uint8 outcome, uint256 yesTokens, uint256 noTokens, uint256 liquidity, uint256 totalVolume, address creator, uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 createdAt))'
];

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

interface CopyTradeConfig {
  isActive: boolean;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  totalPnL: bigint;
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
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server not configured for copy trade execution' },
        { status: 500 }
      );
    }

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create contract instances
    const registryContract = new ethers.Contract(
      AI_AGENT_REGISTRY,
      AI_AGENT_REGISTRY_ABI,
      provider
    );

    const marketContract = new ethers.Contract(
      PREDICTION_MARKET,
      PREDICTION_MARKET_ABI,
      wallet
    );

    const crownToken = new ethers.Contract(
      CROWN_TOKEN,
      ERC20_ABI,
      wallet
    );

    // Get agent info and followers
    const agent = await registryContract.getAgent(agentId);
    if (!agent.isActive) {
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} is not active` },
        { status: 400 }
      );
    }

    // Get all followers of this agent
    const followers: string[] = await registryContract.getAgentFollowers(agentId);

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
    if (market.status !== 0) { // ACTIVE = 0
      return NextResponse.json(
        { success: false, error: `Market #${marketId} is not active` },
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
    const currentAllowance = await crownToken.allowance(wallet.address, PREDICTION_MARKET);
    const neededAmount = ethers.parseEther(agentTradeAmount) * BigInt(followers.length);

    if (currentAllowance < neededAmount) {
      console.log('Approving CRwN for copy trades...');
      const approveTx = await crownToken.approve(
        PREDICTION_MARKET,
        ethers.MaxUint256 // Infinite approval for convenience
      );
      await approveTx.wait();
      console.log('Approval confirmed');
    }

    // For each follower, check their config and execute copy trade
    for (const follower of followers) {
      try {
        // Get follower's copy trade config
        const config: CopyTradeConfig = await registryContract.getCopyTradeConfig(follower, agentId);

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
        agentName: agent.name,
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

    const provider = new ethers.JsonRpcProvider(FLOW_RPC);

    const registryContract = new ethers.Contract(
      AI_AGENT_REGISTRY,
      AI_AGENT_REGISTRY_ABI,
      provider
    );

    // Get agent info
    const agent = await registryContract.getAgent(agentId);

    // Get followers
    const followers: string[] = await registryContract.getAgentFollowers(agentId);

    // Get active follower configs
    const activeFollowers: Array<{
      address: string;
      maxAmountPerTrade: string;
      totalCopied: string;
    }> = [];

    for (const follower of followers) {
      const config: CopyTradeConfig = await registryContract.getCopyTradeConfig(follower, agentId);
      if (config.isActive) {
        activeFollowers.push({
          address: follower,
          maxAmountPerTrade: ethers.formatEther(config.maxAmountPerTrade),
          totalCopied: ethers.formatEther(config.totalCopied)
        });
      }
    }

    // Check server wallet
    const privateKey = process.env.PRIVATE_KEY;
    let serverWalletStatus = { configured: false, balance: '0', address: '' };

    if (privateKey) {
      const wallet = new ethers.Wallet(privateKey, provider);
      const crownToken = new ethers.Contract(CROWN_TOKEN, ERC20_ABI, provider);
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
        id: Number(agent.id),
        name: agent.name,
        strategy: agent.strategy,
        isActive: agent.isActive,
        totalTrades: Number(agent.totalTrades),
        followersCount: Number(agent.followersCount)
      },
      copyTrading: {
        totalFollowers: followers.length,
        activeFollowers: activeFollowers.length,
        followers: activeFollowers
      },
      serverWallet: serverWalletStatus,
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
