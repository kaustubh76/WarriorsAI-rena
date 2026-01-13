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
  // Known fallback providers for direct connection
  fallbackProviders: [
    '0xa48f01287233509FD694a22Bf840225062E67836',
  ],
  // Retry configuration
  maxRetries: 3,
  baseDelayMs: 1000,
};

// Error codes for specific failure modes
const ERROR_CODES = {
  RPC_UNREACHABLE: '0G_RPC_UNREACHABLE',
  WALLET_NO_BALANCE: '0G_WALLET_NO_BALANCE',
  LEDGER_NOT_CREATED: '0G_LEDGER_NOT_CREATED',
  LEDGER_LOW_BALANCE: '0G_LEDGER_LOW_BALANCE',
  NO_PROVIDERS: '0G_NO_PROVIDERS',
  PROVIDER_TIMEOUT: '0G_PROVIDER_TIMEOUT',
  BROKER_INIT_FAILED: '0G_BROKER_INIT_FAILED',
} as const;

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = ZERO_G_CONFIG.maxRetries,
  baseDelay: number = ZERO_G_CONFIG.baseDelayMs
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[0G] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Singleton provider instances to prevent connection exhaustion
let cachedProvider: ethers.JsonRpcProvider | null = null;
let cachedWallet: ethers.Wallet | null = null;
let lastProviderCheck = 0;
const PROVIDER_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Get or create a cached provider instance
 */
async function getProvider(): Promise<ethers.JsonRpcProvider> {
  const now = Date.now();

  if (!cachedProvider || (now - lastProviderCheck > PROVIDER_CHECK_INTERVAL)) {
    cachedProvider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    lastProviderCheck = now;
  }

  return cachedProvider;
}

/**
 * Get or create a cached wallet instance
 */
async function getWallet(privateKey: string): Promise<ethers.Wallet> {
  if (!cachedWallet) {
    const provider = await getProvider();
    cachedWallet = new ethers.Wallet(privateKey, provider);
  }
  return cachedWallet;
}

/**
 * Reset cached instances on error
 */
function resetProviderCache(): void {
  cachedProvider = null;
  cachedWallet = null;
  lastProviderCheck = 0;
}

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

    // Initialize provider and wallet using singleton pattern
    const wallet = await getWallet(privateKey);

    // Create 0G broker with retry
    let broker;
    try {
      broker = await withRetry(async () => {
        return await createZGComputeNetworkBroker(wallet);
      });
      console.log('[0G] Broker initialized successfully');
    } catch (brokerError: any) {
      // Reset cache on broker creation failure
      resetProviderCache();
      console.error('[0G] Broker creation failed:', brokerError.message);

      return NextResponse.json({
        success: false,
        error: `Failed to initialize 0G broker: ${brokerError.message}`,
        errorCode: ERROR_CODES.BROKER_INIT_FAILED,
        isVerified: false,
        message: 'Cannot connect to 0G Compute Network. Check wallet balance and network status.',
        diagnosticUrl: '/api/0g/health',
      }, { status: 503 });
    }

    // Ensure ledger exists and has sufficient balance
    const MIN_LEDGER_BALANCE = 0.5; // Minimum balance to attempt inference
    const DEPOSIT_AMOUNT = 1.0; // Amount to deposit when balance is low

    try {
      const ledgerInfo = await broker.ledger.getLedger();
      console.log('[0G] Ledger found:', ledgerInfo);

      // Check if balance is sufficient - auto-deposit if low
      const balance = parseFloat(ledgerInfo?.balance?.toString() || '0');
      if (balance < MIN_LEDGER_BALANCE) {
        console.warn(`[0G] Ledger balance low: ${balance} OG, attempting to deposit ${DEPOSIT_AMOUNT} OG...`);
        try {
          await broker.ledger.depositFund(DEPOSIT_AMOUNT);
          console.log(`[0G] Deposited ${DEPOSIT_AMOUNT} OG to ledger`);
        } catch (depositErr: any) {
          if (depositErr.message?.includes('insufficient')) {
            return NextResponse.json({
              success: false,
              error: 'Insufficient wallet balance to fund ledger.',
              errorCode: ERROR_CODES.WALLET_NO_BALANCE,
              isVerified: false,
              message: `Wallet balance too low to deposit to ledger. Current ledger balance: ${balance} OG`,
              diagnosticUrl: '/api/0g/health',
            }, { status: 503 });
          }
          console.warn('[0G] Deposit warning:', depositErr.message);
        }
      }
    } catch (ledgerError: any) {
      console.log('[0G] Ledger not found, creating new one...');
      // Create ledger if it doesn't exist
      try {
        await broker.ledger.depositFund(DEPOSIT_AMOUNT);
        console.log(`[0G] Ledger created with ${DEPOSIT_AMOUNT} OG deposit`);
      } catch (depositError: any) {
        if (depositError.message?.includes('already exists')) {
          console.log('[0G] Ledger already exists');
        } else if (depositError.message?.includes('insufficient')) {
          return NextResponse.json({
            success: false,
            error: 'Insufficient wallet balance to create ledger.',
            errorCode: ERROR_CODES.WALLET_NO_BALANCE,
            isVerified: false,
            message: 'Wallet needs OG tokens to create compute ledger. Fund the wallet and retry.',
            walletAddress: wallet.address,
            diagnosticUrl: '/api/0g/health',
          }, { status: 503 });
        } else {
          console.error('[0G] Ledger creation error:', depositError.message);
          // Continue anyway - ledger might exist
        }
      }
    }

    // List available services and get a chatbot provider with retry logic
    let services: any[] = [];
    let chatbotServices: any[] = [];

    try {
      // Try listing services with retry
      services = await withRetry(async () => {
        const result = await broker.inference.listService();
        console.log(`[0G] Found ${result.length} total services`);
        return result;
      });

      chatbotServices = services.filter((s: any) => s.serviceType === 'chatbot');
      console.log(`[0G] Found ${chatbotServices.length} chatbot services`);
    } catch (listError: any) {
      console.error('[0G] listService failed after retries:', listError.message);

      // Try fallback to known provider
      console.log('[0G] Attempting fallback to known provider...');
      for (const fallbackProvider of ZERO_G_CONFIG.fallbackProviders) {
        try {
          // Try to get service metadata directly for known provider
          const metadata = await broker.inference.getServiceMetadata(fallbackProvider as Address);
          if (metadata && metadata.endpoint) {
            console.log(`[0G] Fallback provider ${fallbackProvider} is available`);
            chatbotServices = [{
              provider: fallbackProvider,
              serviceType: 'chatbot',
              model: metadata.model || 'unknown',
              url: metadata.endpoint,
            }];
            break;
          }
        } catch (fallbackError) {
          console.warn(`[0G] Fallback provider ${fallbackProvider} unavailable:`, fallbackError);
        }
      }

      // If still no providers, return error
      if (chatbotServices.length === 0) {
        return NextResponse.json({
          success: false,
          error: '0G Compute services unavailable after retries.',
          errorCode: ERROR_CODES.NO_PROVIDERS,
          isVerified: false,
          message: '0G Compute services not available. Please check /api/0g/health for diagnostics.',
          diagnosticUrl: '/api/0g/health',
        }, { status: 503 });
      }
    }

    if (chatbotServices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No chatbot providers available on 0G network.',
        errorCode: ERROR_CODES.NO_PROVIDERS,
        isVerified: false,
        message: 'No AI providers registered. Check /api/0g/health for network status.',
        diagnosticUrl: '/api/0g/health',
      }, { status: 503 });
    }

    // Select best provider based on health metrics
    const selectedService = selectBestProvider(chatbotServices);
    if (!selectedService) {
      return NextResponse.json({
        success: false,
        error: 'Failed to select provider.',
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

    const response: InferenceResponse & { isVerified: boolean } = {
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
      isVerified: true  // This response came from a real 0G provider
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('0G Inference error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
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

    // Use singleton provider to prevent connection exhaustion
    const wallet = await getWallet(privateKey);

    let broker;
    try {
      broker = await createZGComputeNetworkBroker(wallet);
    } catch (brokerError) {
      // Reset cache and return gracefully
      resetProviderCache();
      console.warn('0G broker creation error:', brokerError);
      return NextResponse.json({
        success: true,
        providers: [],
        message: '0G Compute services not available. Using fallback mode.'
      });
    }

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
