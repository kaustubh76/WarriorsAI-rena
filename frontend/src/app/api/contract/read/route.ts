import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { Chain } from 'viem';
import { anvil, flowTestnet, flowMainnet } from 'viem/chains';
import {
  executeWithFlowFallbackForKey,
  RPC_TIMEOUT,
} from '@/lib/flowClient';
import { zeroGGalileo } from '@/lib/zeroGClient';
import { handleAPIError, applyRateLimit, ErrorResponses, RateLimitPresets } from '@/lib/api';

// Define supported chains
const SUPPORTED_CHAINS: Record<number, Chain> = {
  [flowTestnet.id]: flowTestnet, // Chain ID 545
  [flowMainnet.id]: flowMainnet, // Chain ID 747
  [anvil.id]: anvil, // Chain ID 31337
  [zeroGGalileo.id]: zeroGGalileo, // Chain ID 16602 - 0G Galileo for iNFTs
};

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'contract-read',
      ...RateLimitPresets.readOperations,
    });

    const { contractAddress, abi, functionName, args, chainId } = await request.json();

    if (!contractAddress || !abi || !functionName) {
      throw ErrorResponses.badRequest('Missing required parameters');
    }

    // Default to chain 545 (Flow testnet) if no chainId provided (for backward compatibility)
    const targetChainId = chainId || 545;

    // Get the chain configuration
    const chain = SUPPORTED_CHAINS[targetChainId];
    if (!chain) {
      throw ErrorResponses.badRequest(`Unsupported chain ID: ${targetChainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
    }

    const isFlowChain = targetChainId === 545 || targetChainId === 747;

    // Convert string arguments back to appropriate types for contract calls
    let processedArgs = args || [];
    if (args && Array.isArray(args)) {
      processedArgs = args.map((arg: string | number | bigint) => {
        // Convert string numbers back to BigInt for contract calls
        if (typeof arg === 'string' && /^\d+$/.test(arg)) {
          return BigInt(arg);
        }
        return arg;
      });
    }

    console.log('Contract call:', { contractAddress, functionName, args: processedArgs });

    // Read from the contract — use hash-ring routing for Flow chains
    let result;
    if (isFlowChain) {
      const routingKey = `${contractAddress}-${functionName}`;
      result = await executeWithFlowFallbackForKey(routingKey, (client) =>
        client.readContract({
          address: contractAddress as `0x${string}`,
          abi: abi,
          functionName: functionName,
          args: processedArgs,
        })
      );
    } else {
      const publicClient = createPublicClient({
        chain: chain,
        transport: http(undefined, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 }),
      });
      result = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: abi,
        functionName: functionName,
        args: processedArgs,
      });
    }

    console.log('Contract result:', result);

    // Convert BigInt results to string for JSON serialization
    const serializedResult = JSON.parse(JSON.stringify(result, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(serializedResult);

  } catch (error) {
    return handleAPIError(error, 'API:Contract:Read:POST');
  }
}