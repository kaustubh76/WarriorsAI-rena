import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';

// Flow Testnet Configuration
const FLOW_RPC = 'https://testnet.evm.nodes.onflow.org';
const PREDICTION_MARKET = '0x1b26203A2752557ecD4763a9A8A26119AC5e18e4';

// 0G Galileo Configuration for updating agent performance
const ZEROG_RPC = 'https://evmrpc-testnet.0g.ai';
const AI_AGENT_INFT = '0x88f3133C6e506Eaa68bB0de1a4765E9B73b15BBC';

// ABI for updating agent trade results
const AI_AGENT_INFT_ABI = [
  'function recordTrade(uint256 tokenId, bool won, int256 pnl)',
];

// Outcome enum matching contract
enum Outcome {
  YES = 0,
  NO = 1,
  INVALID = 2,
  UNDECIDED = 3
}

// Market status enum
enum MarketStatus {
  ACTIVE = 0,
  RESOLVED = 1,
  CANCELLED = 2
}

// ABI for PredictionMarketAMM
const PREDICTION_MARKET_ABI = [
  'function getActiveMarkets() view returns (uint256[])',
  'function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, uint256 endTime, uint256 resolutionTime, uint8 status, uint8 outcome, uint256 yesTokens, uint256 noTokens, uint256 liquidity, uint256 totalVolume, address creator, uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 createdAt))',
  'function resolveMarket(uint256 marketId, uint8 outcome, bytes oracleProof)',
  'function owner() view returns (address)'
];

interface MarketData {
  id: bigint;
  question: string;
  endTime: bigint;
  resolutionTime: bigint;
  status: number;
  outcome: number;
  yesTokens: bigint;
  noTokens: bigint;
  liquidity: bigint;
  totalVolume: bigint;
  creator: string;
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
  createdAt: bigint;
}

interface SettlementResult {
  marketId: number;
  question: string;
  outcome: string;
  txHash?: string;
  error?: string;
}

/**
 * Determine outcome based on token distribution
 */
function determineOutcome(yesTokens: bigint, noTokens: bigint): Outcome {
  if (yesTokens > noTokens) {
    return Outcome.YES;
  } else if (noTokens > yesTokens) {
    return Outcome.NO;
  } else {
    return Outcome.INVALID; // Tied - return as invalid
  }
}

function outcomeToString(outcome: Outcome): string {
  switch (outcome) {
    case Outcome.YES: return 'YES';
    case Outcome.NO: return 'NO';
    case Outcome.INVALID: return 'INVALID';
    case Outcome.UNDECIDED: return 'UNDECIDED';
    default: return 'UNKNOWN';
  }
}

/**
 * Update agent performance on 0G chain when market resolves
 */
async function updateAgentPerformance(marketId: number, outcome: Outcome, privateKey: string) {
  try {
    // Find all agent trades on this market that haven't been recorded yet
    const trades = await prisma.agentTrade.findMany({
      where: {
        marketId: String(marketId),
        recordedOn0G: false,
      }
    });

    if (trades.length === 0) {
      console.log(`   No agent trades to update for market #${marketId}`);
      return;
    }

    console.log(`   📊 Updating ${trades.length} agent trades for market #${marketId}`);

    // Setup 0G provider and wallet
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
    const zeroGWallet = new ethers.Wallet(privateKey, zeroGProvider);
    const aiAgentINFT = new ethers.Contract(AI_AGENT_INFT, AI_AGENT_INFT_ABI, zeroGWallet);

    for (const trade of trades) {
      try {
        // Determine if the trade won based on outcome and position
        const won = (outcome === Outcome.YES && trade.isYes) || (outcome === Outcome.NO && !trade.isYes);

        // Calculate approximate PnL (simplified: win = +90% of stake, lose = -100%)
        const tradeAmount = BigInt(trade.amount);
        const pnl = won
          ? (tradeAmount * BigInt(90)) / BigInt(100)  // 90% profit on win
          : -tradeAmount;  // Full loss on lose

        // Record trade result on 0G chain
        const recordTx = await aiAgentINFT.recordTrade(
          BigInt(trade.agentId),
          won,
          pnl
        );
        const recordReceipt = await recordTx.wait();

        // Update database
        await prisma.agentTrade.update({
          where: { id: trade.id },
          data: {
            outcome: outcome === Outcome.YES ? 'yes' : outcome === Outcome.NO ? 'no' : 'invalid',
            won,
            pnl: pnl.toString(),
            recordedOn0G: true,
            recordTxHash: recordReceipt.hash,
            resolvedAt: new Date(),
          }
        });

        console.log(`   ✅ Agent #${trade.agentId}: ${won ? 'WON' : 'LOST'} (PnL: ${ethers.formatEther(pnl)} CRwN)`);
      } catch (tradeError) {
        console.error(`   ⚠️ Failed to update agent #${trade.agentId}:`, tradeError);
      }
    }
  } catch (error) {
    console.error(`   ⚠️ Failed to update agent performance:`, error);
  }
}

/**
 * POST /api/markets/settle
 * Settles all expired markets
 *
 * Optional body: { marketId?: number, outcome?: number }
 * - If marketId provided, only settle that market
 * - If outcome provided, use that outcome instead of auto-determining
 */
export async function POST(request: NextRequest) {
  try {
    // Get owner private key (AI_SIGNER_PRIVATE_KEY is the contract owner)
    const privateKey = process.env.AI_SIGNER_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server not configured for settlement' },
        { status: 500 }
      );
    }

    // Parse optional request body
    let specificMarketId: number | null = null;
    let specificOutcome: number | null = null;

    try {
      const body = await request.json();
      specificMarketId = body.marketId ?? null;
      specificOutcome = body.outcome ?? null;
    } catch {
      // No body provided, settle all expired markets
    }

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create contract instance
    const marketContract = new ethers.Contract(
      PREDICTION_MARKET,
      PREDICTION_MARKET_ABI,
      wallet
    );

    // Verify ownership
    const owner = await marketContract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Wallet is not contract owner' },
        { status: 403 }
      );
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const results: SettlementResult[] = [];
    let settledCount = 0;
    let skippedCount = 0;

    if (specificMarketId !== null) {
      // Settle specific market
      const market: MarketData = await marketContract.getMarket(specificMarketId);

      if (market.status !== MarketStatus.ACTIVE) {
        return NextResponse.json({
          success: false,
          error: `Market #${specificMarketId} is already resolved or cancelled`
        });
      }

      if (Number(market.endTime) > currentTime) {
        return NextResponse.json({
          success: false,
          error: `Market #${specificMarketId} has not expired yet (ends at ${new Date(Number(market.endTime) * 1000).toISOString()})`
        });
      }

      // Determine or use provided outcome
      const outcome = specificOutcome !== null
        ? specificOutcome
        : determineOutcome(market.yesTokens, market.noTokens);

      try {
        const tx = await marketContract.resolveMarket(
          specificMarketId,
          outcome,
          '0x' // Empty oracle proof (owner can resolve without proof)
        );
        const receipt = await tx.wait();

        results.push({
          marketId: specificMarketId,
          question: market.question,
          outcome: outcomeToString(outcome),
          txHash: receipt.hash
        });
        settledCount = 1;

        // Update agent performance for trades on this market
        await updateAgentPerformance(specificMarketId, outcome, privateKey);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          marketId: specificMarketId,
          question: market.question,
          outcome: outcomeToString(outcome),
          error: errorMessage
        });
      }
    } else {
      // Get all active markets
      const activeMarketIds: bigint[] = await marketContract.getActiveMarkets();

      for (const marketIdBigInt of activeMarketIds) {
        const marketId = Number(marketIdBigInt);

        try {
          const market: MarketData = await marketContract.getMarket(marketId);

          // Check if expired
          if (Number(market.endTime) > currentTime) {
            skippedCount++;
            continue; // Not expired yet
          }

          // Determine outcome based on token distribution
          const outcome = determineOutcome(market.yesTokens, market.noTokens);

          // Resolve market
          const tx = await marketContract.resolveMarket(
            marketId,
            outcome,
            '0x' // Empty oracle proof
          );
          const receipt = await tx.wait();

          results.push({
            marketId,
            question: market.question,
            outcome: outcomeToString(outcome),
            txHash: receipt.hash
          });
          settledCount++;

          // Update agent performance for trades on this market
          await updateAgentPerformance(marketId, outcome, privateKey);

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            marketId,
            question: 'Unknown',
            outcome: 'ERROR',
            error: errorMessage
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        settled: settledCount,
        skipped: skippedCount,
        total: results.length + skippedCount
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Settlement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/markets/settle
 * Returns status of markets that need settlement
 */
export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(FLOW_RPC);
    const marketContract = new ethers.Contract(
      PREDICTION_MARKET,
      PREDICTION_MARKET_ABI,
      provider
    );

    const currentTime = Math.floor(Date.now() / 1000);
    const activeMarketIds: bigint[] = await marketContract.getActiveMarkets();

    const expiredMarkets: Array<{
      id: number;
      question: string;
      endTime: number;
      expiredAgo: string;
      yesTokens: string;
      noTokens: string;
      suggestedOutcome: string;
    }> = [];

    const activeMarkets: Array<{
      id: number;
      question: string;
      endTime: number;
      expiresIn: string;
    }> = [];

    for (const marketIdBigInt of activeMarketIds) {
      const marketId = Number(marketIdBigInt);
      const market: MarketData = await marketContract.getMarket(marketId);
      const endTime = Number(market.endTime);

      if (endTime < currentTime) {
        const expiredSeconds = currentTime - endTime;
        const outcome = determineOutcome(market.yesTokens, market.noTokens);

        expiredMarkets.push({
          id: marketId,
          question: market.question,
          endTime,
          expiredAgo: `${Math.floor(expiredSeconds / 3600)}h ${Math.floor((expiredSeconds % 3600) / 60)}m ago`,
          yesTokens: ethers.formatEther(market.yesTokens),
          noTokens: ethers.formatEther(market.noTokens),
          suggestedOutcome: outcomeToString(outcome)
        });
      } else {
        const expiresIn = endTime - currentTime;
        activeMarkets.push({
          id: marketId,
          question: market.question,
          endTime,
          expiresIn: `${Math.floor(expiresIn / 3600)}h ${Math.floor((expiresIn % 3600) / 60)}m`
        });
      }
    }

    return NextResponse.json({
      success: true,
      currentTime: new Date(currentTime * 1000).toISOString(),
      needsSettlement: expiredMarkets.length,
      stillActive: activeMarkets.length,
      expiredMarkets,
      activeMarkets,
      settlementEndpoint: 'POST /api/markets/settle'
    });

  } catch (error: unknown) {
    console.error('Get settlement status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
