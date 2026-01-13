/**
 * API Route: Automatic Agent Prediction via 0G AI Compute
 *
 * This endpoint triggers an iNFT agent to automatically:
 * 1. Fetch its encrypted strategy from 0G Storage
 * 2. Analyze market data using 0G AI Compute
 * 3. Generate a verified prediction
 * 4. Optionally execute the trade
 *
 * The iNFT's strategy (stored in encrypted metadata) defines:
 * - Trading strategy type (trend, momentum, contrarian, etc.)
 * - Risk profile and position sizing
 * - Confidence thresholds
 * - Trait weights for analysis
 */

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
  getApiBaseUrl,
  getServerPrivateKey,
  TRADING_LIMITS,
} from '@/lib/apiConfig';

// Strategy type mapping
const STRATEGY_NAMES: Record<number, string> = {
  0: 'TREND_FOLLOWING',
  1: 'MOMENTUM',
  2: 'MEAN_REVERSION',
  3: 'CONTRARIAN',
  4: 'SENTIMENT'
};

const RISK_PROFILES: Record<number, string> = {
  0: 'CONSERVATIVE',
  1: 'MODERATE',
  2: 'AGGRESSIVE'
};

interface AgentMetadata {
  version: string;
  name: string;
  description: string;
  strategy: {
    type: number;
    parameters: {
      minConfidence: number;
      lookbackPeriod: number;
      marketFocus: string;
    };
    weights: Array<{
      factor: string;
      weight: number;
    }>;
  };
  traits: {
    patience: number;
    conviction: number;
    contrarian: number;
    momentum: number;
  };
  riskProfile: number;
  specialization: number;
  executionConfig?: {
    tradingLimits?: {
      maxPositionSize: string;
      maxDailyTrades: number;
      maxDailyExposure: string;
    };
  };
}

interface PredictionResult {
  marketId: number;
  agentId: number;
  prediction: 'YES' | 'NO';
  confidence: number;
  reasoning: string;
  isVerified: boolean;
  proof?: {
    inputHash: string;
    outputHash: string;
    providerAddress: string;
  };
}

/**
 * POST /api/agents/auto-predict
 * Trigger automatic prediction for an iNFT agent
 *
 * Body: {
 *   agentId: number,
 *   marketId: number,
 *   autoExecute?: boolean (default: false)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { agentId, marketId, autoExecute = false, minConfidenceOverride } = body;

    if (!agentId || marketId === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentId, marketId' },
        { status: 400 }
      );
    }

    console.log(`🤖 [Auto-Predict] Starting prediction for Agent #${agentId} on Market #${marketId}`);

    // Get private key for 0G operations
    const privateKey = getServerPrivateKey();
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server not configured for agent operations' },
        { status: 500 }
      );
    }

    // Setup providers
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
    const flowProvider = new ethers.JsonRpcProvider(FLOW_RPC);
    const wallet = new ethers.Wallet(privateKey, flowProvider);

    // Get agent data from 0G
    const inftContract = new ethers.Contract(ZEROG_CONTRACTS.aiAgentINFT, AI_AGENT_INFT_ABI, zeroGProvider);

    let agentData;
    let encryptedMetadataRef: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      encryptedMetadataRef = await inftContract.getEncryptedMetadataRef(agentId);
    } catch (err) {
      console.error('Error fetching agent data:', err);
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} not found on 0G chain` },
        { status: 404 }
      );
    }

    if (!agentData.isActive) {
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} is not active` },
        { status: 400 }
      );
    }

    console.log(`📦 [Auto-Predict] Agent metadata ref: ${encryptedMetadataRef}`);

    // Get market data from Flow
    const marketContract = new ethers.Contract(FLOW_CONTRACTS.predictionMarketAMM, PREDICTION_MARKET_ABI, flowProvider);

    let market;
    let prices;
    try {
      market = await marketContract.getMarket(marketId);
      prices = await marketContract.getPrice(marketId);
    } catch (err) {
      console.error('Error fetching market data:', err);
      return NextResponse.json(
        { success: false, error: `Market #${marketId} not found` },
        { status: 404 }
      );
    }

    // Check if market is active
    if (market.status !== BigInt(0)) {
      return NextResponse.json(
        { success: false, error: `Market #${marketId} is not active (status: ${market.status})` },
        { status: 400 }
      );
    }

    // Check if market hasn't expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (Number(market.endTime) <= currentTime) {
      return NextResponse.json(
        { success: false, error: `Market #${marketId} has expired` },
        { status: 400 }
      );
    }

    // Fetch agent metadata from 0G Storage
    let agentMetadata: AgentMetadata | null = null;
    try {
      // The metadata ref format is "0g://0x..." - extract the hash
      const metadataHash = encryptedMetadataRef.replace('0g://', '');

      // Try to fetch from 0G Storage API
      const storageResponse = await fetch(`${getApiBaseUrl()}/api/0g/query?hash=${metadataHash}`);
      if (storageResponse.ok) {
        const storageData = await storageResponse.json();
        if (storageData.success && storageData.data) {
          agentMetadata = storageData.data;
        }
      }
    } catch (err) {
      console.warn('Could not fetch agent metadata from 0G Storage:', err);
    }

    // Use default metadata if fetch failed
    if (!agentMetadata) {
      console.log('📋 [Auto-Predict] Using default agent strategy');
      agentMetadata = {
        version: '1.0',
        name: `Agent #${agentId}`,
        description: 'AI Trading Agent',
        strategy: {
          type: 0, // TREND_FOLLOWING
          parameters: {
            minConfidence: 60,
            lookbackPeriod: 5,
            marketFocus: 'all'
          },
          weights: [
            { factor: 'traitAnalysis', weight: 40 },
            { factor: 'historicalData', weight: 30 },
            { factor: 'marketSentiment', weight: 20 },
            { factor: 'randomVariance', weight: 10 }
          ]
        },
        traits: {
          patience: 50,
          conviction: 50,
          contrarian: 50,
          momentum: 50
        },
        riskProfile: 1, // MODERATE
        specialization: 0
      };
    }

    // Build prompt for 0G AI Compute
    const prompt = buildPredictionPrompt(
      agentMetadata,
      market,
      prices,
      Number(agentData.tier)
    );

    console.log(`🧠 [Auto-Predict] Sending to 0G AI Compute...`);

    // Call 0G AI Compute for prediction
    const inferenceResponse = await fetch(
      `${getApiBaseUrl()}/api/0g/inference`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 500,
          temperature: 0.3, // Lower temperature for more consistent predictions
          battleData: {
            marketId,
            question: market.question,
            yesPrice: ethers.formatEther(prices.yesPrice),
            noPrice: ethers.formatEther(prices.noPrice),
            warrior1Id: Number(market.warrior1Id),
            warrior2Id: Number(market.warrior2Id)
          }
        })
      }
    );

    const inferenceData = await inferenceResponse.json();

    if (!inferenceData.success) {
      return NextResponse.json({
        success: false,
        error: `0G AI Compute failed: ${inferenceData.error}`
      }, { status: 503 });
    }

    // Parse prediction from AI response
    const prediction = parsePredictionResponse(inferenceData.response, agentMetadata);

    console.log(`📊 [Auto-Predict] Prediction: ${prediction.prediction} (${prediction.confidence}% confidence)`);

    // Check confidence threshold (allow override for testing)
    const minConfidence = minConfidenceOverride ?? agentMetadata.strategy.parameters.minConfidence ?? 60;
    if (prediction.confidence < minConfidence) {
      return NextResponse.json({
        success: true,
        prediction: {
          ...prediction,
          marketId,
          agentId,
          isVerified: inferenceData.isVerified || false,
          proof: inferenceData.proof
        },
        executed: false,
        reason: `Confidence ${prediction.confidence}% below threshold ${minConfidence}%`,
        timing: {
          totalMs: Date.now() - startTime
        }
      });
    }

    // If autoExecute is enabled, execute the trade
    let executionResult = null;
    if (autoExecute) {
      console.log(`💰 [Auto-Predict] Auto-executing trade...`);

      try {
        const executeResponse = await fetch(
          `${getApiBaseUrl()}/api/agents/execute-trade`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: String(agentId),
              marketId: String(marketId),
              isYes: prediction.prediction === 'YES',
              amount: ethers.parseEther(agentMetadata.executionConfig?.tradingLimits?.maxPositionSize || '10').toString(),
              minConfidenceOverride: minConfidenceOverride,
              prediction: {
                marketId: String(marketId),
                agentId: String(agentId),
                isYes: prediction.prediction === 'YES',
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                isVerified: inferenceData.isVerified || false,
                chatId: inferenceData.chatId || '',
                proof: inferenceData.proof || {
                  inputHash: '',
                  outputHash: '',
                  providerAddress: '',
                  modelHash: ''
                },
                timestamp: Date.now()
              }
            })
          }
        );

        executionResult = await executeResponse.json();
        console.log(`✅ [Auto-Predict] Trade executed:`, executionResult.success ? executionResult.txHash : executionResult.error);
      } catch (err) {
        console.error('Trade execution failed:', err);
        executionResult = { success: false, error: String(err) };
      }
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agentId,
        tier: Number(agentData.tier),
        strategy: STRATEGY_NAMES[agentMetadata.strategy.type] || 'UNKNOWN',
        riskProfile: RISK_PROFILES[agentMetadata.riskProfile] || 'UNKNOWN'
      },
      market: {
        id: marketId,
        question: market.question,
        yesPrice: ethers.formatEther(prices.yesPrice),
        noPrice: ethers.formatEther(prices.noPrice)
      },
      prediction: {
        decision: prediction.prediction,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        isVerified: inferenceData.isVerified || false,
        proof: inferenceData.proof
      },
      execution: executionResult,
      timing: {
        totalMs: Date.now() - startTime
      }
    });

  } catch (error: unknown) {
    console.error('Auto-predict error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/auto-predict?agentId=1
 * Get agent's prediction capabilities and current status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);
    const inftContract = new ethers.Contract(ZEROG_CONTRACTS.aiAgentINFT, AI_AGENT_INFT_ABI, zeroGProvider);

    let agentData;
    let encryptedMetadataRef: string;
    try {
      agentData = await inftContract.getAgentData(agentId);
      encryptedMetadataRef = await inftContract.getEncryptedMetadataRef(agentId);
    } catch {
      return NextResponse.json(
        { success: false, error: `Agent #${agentId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: Number(agentId),
        tier: Number(agentData.tier),
        isActive: agentData.isActive,
        copyTradingEnabled: agentData.copyTradingEnabled,
        stakedAmount: ethers.formatEther(agentData.stakedAmount),
        metadataRef: encryptedMetadataRef
      },
      capabilities: {
        canPredict: agentData.isActive,
        canAutoExecute: agentData.isActive,
        canCopyTrade: agentData.copyTradingEnabled
      },
      endpoints: {
        predict: 'POST /api/agents/auto-predict',
        execute: 'POST /api/agents/execute-trade'
      }
    });

  } catch (error: unknown) {
    console.error('Get agent capabilities error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Build the prediction prompt based on agent's strategy and market data
 */
function buildPredictionPrompt(
  metadata: AgentMetadata,
  market: any,
  prices: any,
  tier: number
): string {
  const strategyName = STRATEGY_NAMES[metadata.strategy.type] || 'TREND_FOLLOWING';
  const riskProfile = RISK_PROFILES[metadata.riskProfile] || 'MODERATE';

  return `You are an AI trading agent with the following characteristics:

## Agent Profile
- Name: ${metadata.name}
- Strategy: ${strategyName}
- Risk Profile: ${riskProfile}
- Tier: ${['NOVICE', 'SKILLED', 'EXPERT', 'ORACLE'][tier] || 'NOVICE'}

## Personality Traits (0-100)
- Patience: ${metadata.traits.patience} (higher = waits for better opportunities)
- Conviction: ${metadata.traits.conviction} (higher = stronger position sizing)
- Contrarian: ${metadata.traits.contrarian} (higher = goes against crowd)
- Momentum: ${metadata.traits.momentum} (higher = follows trends)

## Analysis Weights
${metadata.strategy.weights.map(w => `- ${w.factor}: ${w.weight}%`).join('\n')}

## Market Data
- Question: ${market.question}
- Current YES Price: ${ethers.formatEther(prices.yesPrice)} (${(Number(ethers.formatEther(prices.yesPrice)) * 100).toFixed(1)}% implied probability)
- Current NO Price: ${ethers.formatEther(prices.noPrice)} (${(Number(ethers.formatEther(prices.noPrice)) * 100).toFixed(1)}% implied probability)
- Total Volume: ${ethers.formatEther(market.totalVolume)} CRwN
- Liquidity: ${ethers.formatEther(market.liquidity)} CRwN
- Warrior 1 ID: ${market.warrior1Id}
- Warrior 2 ID: ${market.warrior2Id}

## Your Task
Based on your trading strategy and the market data above, provide your prediction.

Respond ONLY in this exact JSON format:
{
  "prediction": "YES" or "NO",
  "confidence": <number 0-100>,
  "reasoning": "<brief explanation of your analysis>"
}

Important:
- Your confidence should reflect how certain you are (higher = more certain)
- Consider your strategy type when making decisions
- A ${strategyName} strategy ${getStrategyHint(metadata.strategy.type)}
- Your ${riskProfile} risk profile means you ${getRiskHint(metadata.riskProfile)}`;
}

function getStrategyHint(strategyType: number): string {
  switch (strategyType) {
    case 0: return 'follows established trends and patterns';
    case 1: return 'focuses on price momentum and velocity';
    case 2: return 'bets on prices returning to average';
    case 3: return 'goes against the crowd when sentiment is extreme';
    case 4: return 'analyzes market sentiment and social signals';
    default: return 'analyzes multiple factors';
  }
}

function getRiskHint(riskProfile: number): string {
  switch (riskProfile) {
    case 0: return 'should only take high-confidence positions';
    case 1: return 'balance risk and reward moderately';
    case 2: return 'can take larger positions on good opportunities';
    default: return 'should manage risk appropriately';
  }
}

/**
 * Parse the AI response to extract prediction data
 */
function parsePredictionResponse(
  response: string,
  metadata: AgentMetadata
): { prediction: 'YES' | 'NO'; confidence: number; reasoning: string } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        prediction: parsed.prediction?.toUpperCase() === 'YES' ? 'YES' : 'NO',
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
    }
  } catch (err) {
    console.warn('Failed to parse JSON response, using fallback parsing');
  }

  // Fallback: Try to extract from text
  const isYes = response.toLowerCase().includes('yes') &&
    !response.toLowerCase().includes('no prediction');

  const confidenceMatch = response.match(/confidence[:\s]*(\d+)/i);
  const confidence = confidenceMatch ? Number(confidenceMatch[1]) : 50;

  return {
    prediction: isYes ? 'YES' : 'NO',
    confidence: Math.min(100, Math.max(0, confidence)),
    reasoning: response.slice(0, 200) + '...'
  };
}
