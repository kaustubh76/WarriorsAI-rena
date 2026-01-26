import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, defineChain } from 'viem';
import { Chain } from 'viem';
import { anvil, flowTestnet, flowMainnet } from 'viem/chains';
import { getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;
const MAX_BATCH_SIZE = 20;

// 0G Galileo Testnet - Used for AI Agent iNFT operations
const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'A0GI',
    symbol: 'A0GI',
  },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

// Define supported chains
const SUPPORTED_CHAINS: Record<number, Chain> = {
  [flowTestnet.id]: flowTestnet, // Chain ID 545
  [flowMainnet.id]: flowMainnet, // Chain ID 747
  [anvil.id]: anvil, // Chain ID 31337
  [zeroGGalileo.id]: zeroGGalileo, // Chain ID 16602 - 0G Galileo for iNFTs
};

interface BatchReadRequest {
  contractAddress: string;
  abi: unknown[];
  functionName: string;
  args?: (string | number | bigint)[];
  id?: string; // Optional identifier to match requests with responses
}

interface BatchReadResult {
  id?: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Batch contract read endpoint
 * Accepts multiple read requests and processes them in parallel
 * This reduces the number of HTTP round-trips for NFT loading
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'contract-batch-read',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { requests, chainId } = await request.json() as {
      requests: BatchReadRequest[];
      chainId?: number;
    };

    if (!requests || !Array.isArray(requests)) {
      throw ErrorResponses.badRequest('Missing or invalid requests array');
    }

    if (requests.length === 0) {
      return NextResponse.json({ results: [] });
    }

    if (requests.length > MAX_BATCH_SIZE) {
      throw ErrorResponses.badRequest(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    // Validate each request
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (!req.contractAddress || !req.abi || !req.functionName) {
        throw ErrorResponses.badRequest(`Request at index ${i} missing required parameters (contractAddress, abi, functionName)`);
      }
    }

    // Default to chain 545 (Flow testnet) if no chainId provided
    const targetChainId = chainId || 545;

    // Get the chain configuration
    const chain = SUPPORTED_CHAINS[targetChainId];
    if (!chain) {
      throw ErrorResponses.badRequest(`Unsupported chain ID: ${targetChainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
    }

    // Get RPC URL based on chain
    const isFlowChain = targetChainId === 545 || targetChainId === 747;
    const rpcUrl = isFlowChain ? getFlowRpcUrl() : undefined;

    // Create public client
    const publicClient = createPublicClient({
      chain: chain,
      transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 }),
    });

    // Create fallback client for Flow chains
    const fallbackClient = isFlowChain ? createPublicClient({
      chain: chain,
      transport: http(getFlowFallbackRpcUrl(), { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 }),
    }) : null;

    // Helper to check if error is timeout
    const isTimeoutError = (error: unknown): boolean => {
      const errMsg = (error as Error).message || '';
      return errMsg.includes('timeout') ||
             errMsg.includes('timed out') ||
             errMsg.includes('took too long') ||
             errMsg.includes('TimeoutError');
    };

    // Process args - convert string numbers to BigInt
    const processArgs = (args?: (string | number | bigint)[]): (string | number | bigint)[] => {
      if (!args || !Array.isArray(args)) return [];
      return args.map((arg) => {
        if (typeof arg === 'string' && /^\d+$/.test(arg)) {
          return BigInt(arg);
        }
        return arg;
      });
    };

    // Execute single read with fallback
    const executeRead = async (req: BatchReadRequest): Promise<BatchReadResult> => {
      const processedArgs = processArgs(req.args);

      try {
        let result;
        try {
          result = await publicClient.readContract({
            address: req.contractAddress as `0x${string}`,
            abi: req.abi as readonly unknown[],
            functionName: req.functionName,
            args: processedArgs,
          });
        } catch (error) {
          if (isTimeoutError(error) && fallbackClient) {
            console.warn(`[Batch Read] Primary RPC timed out for ${req.functionName}, trying fallback...`);
            result = await fallbackClient.readContract({
              address: req.contractAddress as `0x${string}`,
              abi: req.abi as readonly unknown[],
              functionName: req.functionName,
              args: processedArgs,
            });
          } else {
            throw error;
          }
        }

        // Serialize BigInt values
        const serializedResult = JSON.parse(JSON.stringify(result, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ));

        return {
          id: req.id,
          success: true,
          result: serializedResult,
        };
      } catch (error) {
        console.error(`[Batch Read] Error reading ${req.functionName}:`, error);
        return {
          id: req.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    // Execute all reads in parallel
    const results = await Promise.all(requests.map(executeRead));

    return NextResponse.json({ results });

  } catch (error) {
    return handleAPIError(error, 'API:Contract:BatchRead:POST');
  }
}
