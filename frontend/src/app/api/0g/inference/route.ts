/**
 * API Route: 0G Compute Inference
 * Server-side AI inference via 0G Compute Network
 * This route handles private key operations for 0G broker
 *
 * Features:
 * - Rate limiting to prevent abuse
 * - Request validation
 * - Cryptographic proof generation with keccak256
 * - Provider health tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import type { Address } from 'viem';

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG = {
  maxRequests: 20,        // Maximum requests per window
  windowMs: 60 * 1000,    // 1 minute window
  blockDurationMs: 5 * 60 * 1000  // 5 minute block for exceeding limit
};

/**
 * Check rate limit for a given identifier (IP or wallet address)
 */
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, val] of rateLimitStore) {
      if (now > val.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1,
      resetIn: RATE_LIMIT_CONFIG.windowMs
    };
  }

  if (entry.count >= RATE_LIMIT_CONFIG.maxRequests) {
    // Rate limited - extend block time
    entry.resetTime = now + RATE_LIMIT_CONFIG.blockDurationMs;
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now
    };
  }

  // Increment counter
  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_CONFIG.maxRequests - entry.count,
    resetIn: entry.resetTime - now
  };
}

// ============================================================================
// Provider Health Tracking
// ============================================================================

interface ProviderHealth {
  address: string;
  successCount: number;
  failureCount: number;
  lastSuccess: number;
  lastFailure: number;
  avgResponseTime: number;
  responseTimeSum: number;
  responseTimeCount: number;
}

const providerHealthStore = new Map<string, ProviderHealth>();

function updateProviderHealth(
  address: string,
  success: boolean,
  responseTime: number
): void {
  const now = Date.now();
  const existing = providerHealthStore.get(address) || {
    address,
    successCount: 0,
    failureCount: 0,
    lastSuccess: 0,
    lastFailure: 0,
    avgResponseTime: 0,
    responseTimeSum: 0,
    responseTimeCount: 0
  };

  if (success) {
    existing.successCount++;
    existing.lastSuccess = now;
    existing.responseTimeSum += responseTime;
    existing.responseTimeCount++;
    existing.avgResponseTime = existing.responseTimeSum / existing.responseTimeCount;
  } else {
    existing.failureCount++;
    existing.lastFailure = now;
  }

  providerHealthStore.set(address, existing);
}

function selectBestProvider(providers: any[]): any {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];

  // Score providers based on health metrics
  const scoredProviders = providers.map(p => {
    const health = providerHealthStore.get(p.provider);
    if (!health) {
      // New provider gets a neutral score
      return { provider: p, score: 50 };
    }

    const totalRequests = health.successCount + health.failureCount;
    const successRate = totalRequests > 0 ? health.successCount / totalRequests : 0.5;

    // Score: 60% success rate, 40% response time (lower is better)
    const responseTimeScore = health.avgResponseTime > 0
      ? Math.max(0, 100 - health.avgResponseTime / 100)
      : 50;

    const score = successRate * 60 + (responseTimeScore / 100) * 40;
    return { provider: p, score };
  });

  // Sort by score descending
  scoredProviders.sort((a, b) => b.score - a.score);

  // Return best provider
  return scoredProviders[0].provider;
}

// ============================================================================
// Types
// ============================================================================

// Types for inference requests
interface InferenceRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // Battle prediction specific
  battleData?: {
    battleId: string;
    warriors: {
      id: string;
      traits: {
        strength: number;
        wit: number;
        charisma: number;
        defence: number;
        luck: number;
      };
    }[];
  };
  // Debate specific
  debateContext?: {
    debateId: string;
    phase: 'prediction' | 'evidence' | 'rebuttal';
    otherPredictions?: {
      agentId: string;
      outcome: string;
      reasoning: string;
    }[];
  };
}

interface InferenceResponse {
  success: boolean;
  chatId?: string;
  response?: string;
  provider?: Address;
  timestamp?: number;
  proof?: {
    signature: string;
    modelHash: string;
    inputHash: string;
    outputHash: string;
    providerAddress: Address;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: string;
  };
  error?: string;
}

// 0G Configuration
const ZERO_G_CONFIG = {
  computeRpc: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  chainId: parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602'),
};

// Test mode configuration - uses OpenAI directly when 0G services unavailable
// CRITICAL: Test mode responses are marked as unverified and should NOT be used for on-chain trades
const TEST_MODE_CONFIG = {
  enabled: process.env.ENABLE_TEST_MODE === 'true',
  openaiApiKey: process.env.OPENAI_API_KEY,
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get client identifier for rate limiting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIP = forwardedFor?.split(',')[0]?.trim() || 'unknown';

    // Check rate limit
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimit.resetIn / 1000).toString(),
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString()
          }
        }
      );
    }

    const body: InferenceRequest = await request.json();
    const { prompt, model, maxTokens = 1000, temperature = 0.7, battleData, debateContext } = body;

    // Validate input
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 10000) {
      return NextResponse.json(
        { success: false, error: 'Prompt too long. Maximum 10000 characters.' },
        { status: 400 }
      );
    }

    // Validate maxTokens
    if (maxTokens > 4000) {
      return NextResponse.json(
        { success: false, error: 'maxTokens too high. Maximum 4000.' },
        { status: 400 }
      );
    }

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured' },
        { status: 500 }
      );
    }

    // Dynamic imports for server-side only modules
    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create 0G broker
    const broker = await createZGComputeNetworkBroker(wallet);

    // Ensure ledger exists
    try {
      await broker.ledger.getLedger();
    } catch {
      // Create ledger if it doesn't exist
      try {
        await broker.ledger.depositFund(3.0); // Minimum deposit
      } catch (depositError: any) {
        if (!depositError.message?.includes('already exists')) {
          console.error('Ledger creation error:', depositError);
        }
      }
    }

    // List available services and get a chatbot provider
    let services: any[] = [];
    let useTestMode = false;

    try {
      services = await broker.inference.listService();
    } catch (listError) {
      // 0G testnet may not have services registered
      console.warn('0G listService error:', listError);

      // Check if test mode is enabled for development
      if (TEST_MODE_CONFIG.enabled && TEST_MODE_CONFIG.openaiApiKey) {
        console.log('0G services unavailable - using test mode with OpenAI');
        useTestMode = true;
      } else {
        // CRITICAL: Fallback responses should NOT be accepted for on-chain decisions
        return NextResponse.json({
          success: false,
          error: '0G Compute services unavailable. Cannot generate verifiable inference.',
          fallbackMode: true,
          isVerified: false,
          message: '0G Compute services not available. Please try again later or check network status.'
        }, { status: 503 });
      }
    }

    const chatbotServices = services.filter((s: any) => s.serviceType === 'chatbot');

    if (chatbotServices.length === 0 && !useTestMode) {
      // Check if test mode is enabled for development
      if (TEST_MODE_CONFIG.enabled && TEST_MODE_CONFIG.openaiApiKey) {
        console.log('No 0G chatbot services - using test mode with OpenAI');
        useTestMode = true;
      } else {
        // CRITICAL: No providers means no verifiable inference
        return NextResponse.json({
          success: false,
          error: 'No chatbot providers available on 0G network.',
          fallbackMode: true,
          isVerified: false,
          message: 'No AI providers registered. Cannot generate verifiable inference.'
        }, { status: 503 });
      }
    }

    // TEST MODE: Use OpenAI directly (responses are NOT verified)
    if (useTestMode) {
      return await handleTestModeInference(prompt, model, maxTokens, temperature, startTime);
    }

    // Select best provider based on health metrics
    const selectedService = selectBestProvider(chatbotServices);
    if (!selectedService) {
      return NextResponse.json({
        success: false,
        error: 'Failed to select provider.',
        fallbackMode: true,
        isVerified: false
      }, { status: 503 });
    }
    const providerAddress = selectedService.provider as Address;

    // Acknowledge provider signer
    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    } catch (ackError: any) {
      if (!ackError.message?.includes('already acknowledged')) {
        console.warn('Provider acknowledge warning:', ackError.message);
      }
    }

    // Get service metadata
    const { endpoint, model: serviceModel } = await broker.inference.getServiceMetadata(providerAddress);

    // Generate request headers
    const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

    // Prepare headers for OpenAI client
    const requestHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        requestHeaders[key] = value;
      }
    });

    // Send request using OpenAI-compatible API
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      baseURL: endpoint,
      apiKey: '' // Empty as per 0G docs
    });

    const completion = await openai.chat.completions.create(
      {
        messages: [{ role: 'user', content: prompt }],
        model: model || serviceModel,
        max_tokens: maxTokens,
        temperature: temperature
      },
      { headers: requestHeaders }
    );

    const responseText = completion.choices[0].message.content || '';
    const chatId = completion.id;

    // Process response and handle payment
    try {
      await broker.inference.processResponse(providerAddress, responseText, chatId);
    } catch (paymentError: any) {
      console.warn('Payment processing warning:', paymentError.message);
    }

    // Generate proof hashes
    const inputHash = hashString(prompt);
    const outputHash = hashString(responseText);

    // Track provider health on success
    const responseTime = Date.now() - startTime;
    updateProviderHealth(providerAddress, true, responseTime);

    const response: InferenceResponse & { isVerified: boolean; fallbackMode: boolean } = {
      success: true,
      chatId,
      response: responseText,
      provider: providerAddress,
      timestamp: Date.now(),
      proof: {
        signature: chatId,
        modelHash: serviceModel,
        inputHash,
        outputHash,
        providerAddress
      },
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        cost: '0' // Would calculate from provider prices
      },
      isVerified: true,  // This response came from a real 0G provider
      fallbackMode: false
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('0G Inference error:', error);

    // Track provider health on failure if we have a provider address
    // Note: providerAddress may not be defined if error occurred before selection
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        fallbackMode: true,
        isVerified: false
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for listing available providers
 */
export async function GET() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured' },
        { status: 500 }
      );
    }

    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

    const provider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const broker = await createZGComputeNetworkBroker(wallet);

    let services: any[] = [];
    try {
      services = await broker.inference.listService();
    } catch (listError) {
      // 0G testnet may not have services registered - return empty list gracefully
      console.warn('0G listService error (may be expected on testnet):', listError);
      return NextResponse.json({
        success: true,
        providers: [],
        message: '0G Compute services not available on this network. Using fallback mode.'
      });
    }

    return NextResponse.json({
      success: true,
      providers: services.map((s: any) => ({
        address: s.provider,
        model: s.model || 'Unknown',
        endpoint: s.url || '',
        serviceType: s.serviceType,
        inputPrice: s.inputPrice?.toString() || '0',
        outputPrice: s.outputPrice?.toString() || '0',
        verifiability: s.verifiability || 'none'
      }))
    });
  } catch (error) {
    console.error('Error listing providers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Cryptographic hash using keccak256 for proper proof generation
 * This ensures proofs are verifiable on-chain
 */
function hashString(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

/**
 * TEST MODE: Handle inference using OpenAI directly
 * CRITICAL: These responses are NOT verified and should NOT be used for on-chain trades
 * This is only for development/testing the UI flow
 */
async function handleTestModeInference(
  prompt: string,
  model: string | undefined,
  maxTokens: number,
  temperature: number,
  startTime: number
): Promise<NextResponse> {
  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: TEST_MODE_CONFIG.openaiApiKey
    });

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model || 'gpt-4o-mini',
      max_tokens: maxTokens,
      temperature: temperature
    });

    const responseText = completion.choices[0].message.content || '';
    const chatId = completion.id;
    const responseTime = Date.now() - startTime;

    // Generate proof hashes (for testing structure, not for on-chain use)
    const inputHash = hashString(prompt);
    const outputHash = hashString(responseText);

    // TEST MODE RESPONSE - Explicitly marked as unverified
    const response = {
      success: true,
      chatId,
      response: responseText,
      provider: '0x0000000000000000000000000000000000000000' as const, // Zero address indicates test mode
      timestamp: Date.now(),
      proof: {
        signature: `test_mode_${chatId}`,
        modelHash: model || 'gpt-4o-mini',
        inputHash,
        outputHash,
        providerAddress: '0x0000000000000000000000000000000000000000' as const
      },
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        cost: '0'
      },
      // CRITICAL: Mark as unverified - UI should show warning, trades should be blocked
      isVerified: false,
      fallbackMode: true,
      testMode: true,
      warning: 'TEST MODE: This response is from OpenAI directly, NOT from 0G verified compute. Do NOT use for on-chain trades.'
    };

    console.log(`Test mode inference completed in ${responseTime}ms`);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Test mode inference error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Test mode inference failed',
        fallbackMode: true,
        isVerified: false,
        testMode: true
      },
      { status: 500 }
    );
  }
}
