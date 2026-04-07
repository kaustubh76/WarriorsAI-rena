import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { Chain } from 'viem';
import { anvil, flowTestnet, flowMainnet } from 'viem/chains';
import {
  executeWithFlowFallbackForKey,
  RPC_TIMEOUT,
} from '@/lib/flowClient';
import { zeroGGalileo } from '@/lib/zeroGClient';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
const MAX_BATCH_SIZE = 20;

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
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'contract-batch-read', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { requests, chainId } = await req.json() as {
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
      const r = requests[i];
      if (!r.contractAddress || !r.abi || !r.functionName) {
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

    const isFlowChain = targetChainId === 545 || targetChainId === 747;

    // Non-Flow client (only created if needed)
    const nonFlowClient = !isFlowChain ? createPublicClient({
      chain: chain,
      transport: http(undefined, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 }),
    }) : null;

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

    // Execute single read with hash-ring routing for Flow chains
    const executeRead = async (r: BatchReadRequest): Promise<BatchReadResult> => {
      const processedArgs = processArgs(r.args);

      try {
        let result;
        if (isFlowChain) {
          const routingKey = `${r.contractAddress}-${r.functionName}`;
          result = await executeWithFlowFallbackForKey(routingKey, (client) =>
            client.readContract({
              address: r.contractAddress as `0x${string}`,
              abi: r.abi as readonly unknown[],
              functionName: r.functionName,
              args: processedArgs,
            })
          );
        } else {
          result = await nonFlowClient!.readContract({
            address: r.contractAddress as `0x${string}`,
            abi: r.abi as readonly unknown[],
            functionName: r.functionName,
            args: processedArgs,
          });
        }

        // Serialize BigInt values
        const serializedResult = JSON.parse(JSON.stringify(result, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ));

        return {
          id: r.id,
          success: true,
          result: serializedResult,
        };
      } catch (error) {
        console.error(`[Batch Read] Error reading ${r.functionName}:`, error);
        return {
          id: r.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    // Execute all reads in parallel
    const results = await Promise.all(requests.map(executeRead));

    return NextResponse.json({ results });
  },
], { errorContext: 'API:Contract:BatchRead:POST' });
