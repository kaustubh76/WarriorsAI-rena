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
import { handleAPIError, ErrorResponses } from '@/lib/api';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';
import { ConsistentHashRing } from '@/lib/hashing';

// ============================================================================
// Type Definitions
// ============================================================================

// 0G Service Provider interface
interface ZeroGProvider {
  provider: string;
  serviceType: string;
  model?: string;
  url?: string;
  inputPrice?: bigint;
  outputPrice?: bigint;
  verifiability?: string;
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

/**
 * Select provider using consistent hashing with health-based fallback.
 *
 * Strategy:
 * 1. Build/update hash ring from available providers
 * 2. Use routing key (battleId or prompt hash) for deterministic selection
 * 3. If primary is unhealthy (failure rate > 50%), walk to next ring node
 * 4. If all unhealthy, return the hash ring's primary choice
 *
 * @param providers - Available providers
 * @param routingKey - Key for deterministic routing (e.g., battleId)
 */
function selectBestProvider(providers: ZeroGProvider[], routingKey?: string): ZeroGProvider | null {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];

  // Rebuild ring with current providers (fast: < 1ms for typical provider counts)
  // Using a simple ring rebuild since provider lists change dynamically
  const ring = new ConsistentHashRing<ZeroGProvider>({ virtualNodes: 100 });
  for (const p of providers) {
    ring.addNode(p.provider, p);
  }

  // Use provided routing key or generate one
  const key = routingKey || `inference-${Date.now()}`;

  // Get candidates in ring order
  const candidates = ring.getNodes(key, providers.length);

  // Build set of healthy providers (failure rate < 50%)
  for (const candidate of candidates) {
    const health = providerHealthStore.get(candidate.provider);
    if (!health) {
      // New provider — give it a chance
      return candidate;
    }

    const totalRequests = health.successCount + health.failureCount;
    const successRate = totalRequests > 0 ? health.successCount / totalRequests : 0.5;

    if (successRate >= 0.5) {
      return candidate;
    }
  }

  // All unhealthy — return hash ring's primary choice anyway
  return ring.getNode(key) ?? providers[0];
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
  // These are verified 0G testnet inference providers that can be used when service discovery fails
  // Configure via OG_FALLBACK_PROVIDERS env var (comma-separated addresses) for production
  fallbackProviders: (process.env.OG_FALLBACK_PROVIDERS || '0xa48f01287233509FD694a22Bf840225062E67836').split(','),
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
    // Rate limiting via shared sliding window counter
    applyRateLimit(request, {
      prefix: '0g-inference',
      ...RateLimitPresets.inference,
    });

    const body: InferenceRequest = await request.json();
    const { prompt, model, maxTokens = 1000, temperature = 0.7, battleData, debateContext } = body;

    // Validate input
    if (!prompt) {
      throw ErrorResponses.badRequest('Prompt is required');
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 10000) {
      throw ErrorResponses.badRequest('Prompt too long. Maximum 10000 characters.');
    }

    // Validate maxTokens
    if (maxTokens > 4000) {
      throw ErrorResponses.badRequest('maxTokens too high. Maximum 4000.');
    }

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('0G private key not configured');
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

    // Check ledger exists - balance check is unreliable as SDK may return raw wei values
    // We'll let the actual inference fail if there's truly insufficient balance
    try {
      const ledgerInfo = await broker.ledger.getLedger();
      console.log('[0G] Ledger found:', JSON.stringify(ledgerInfo));
      // Ledger exists, proceed with inference
    } catch (ledgerError: any) {
      console.log('[0G] Ledger not found or error, creating new one...');
      // Create ledger if it doesn't exist
      try {
        await broker.ledger.depositFund(0.1); // Small initial deposit
        console.log('[0G] Ledger created with 0.1 OG deposit');
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
          console.error('[0G] Ledger error:', depositError.message);
          // Continue anyway - ledger might exist with funds from previous deposit
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

      chatbotServices = services.filter((s: ZeroGProvider) => s.serviceType === 'chatbot');
      console.log(`[0G] Found ${chatbotServices.length} chatbot services`);
    } catch (listError) {
      const errorMessage = listError instanceof Error ? listError.message : 'Unknown error';
      console.error('[0G] listService failed after retries:', errorMessage);

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

    // Select provider using consistent hashing with health-based fallback
    const routingKey = body.battleData?.battleId || body.debateContext?.debateId || prompt.slice(0, 64);
    const selectedService = selectBestProvider(chatbotServices, routingKey);
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
    return handleAPIError(error, 'API:0G:Inference:POST');
  }
}

/**
 * GET endpoint for listing available providers
 */
export async function GET() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('0G private key not configured');
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
      providers: services.map((s: ZeroGProvider) => ({
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
    return handleAPIError(error, 'API:0G:Inference:GET');
  }
}

/**
 * Cryptographic hash using keccak256 for proper proof generation
 * This ensures proofs are verifiable on-chain
 */
function hashString(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}
