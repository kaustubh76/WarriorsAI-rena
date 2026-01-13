/**
 * Health Check API Endpoint
 * GET /api/health
 *
 * Returns system health status for monitoring
 */

import { NextResponse } from 'next/server';
import { createPublicClient, http, defineChain } from 'viem';
import { flowTestnet } from 'viem/chains';
import { agentINFTService } from '@/services/agentINFTService';
import { getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// 0G Galileo chain definition
const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
});

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
  blockNumber?: string;
  chainId?: number;
  address?: string;
}

/**
 * Check 0G Galileo chain connectivity
 */
async function checkZeroGChain(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const publicClient = createPublicClient({
      chain: zeroGGalileo,
      transport: http(),
    });

    const blockNumber = await publicClient.getBlockNumber();
    const latency = Date.now() - start;

    return {
      status: 'up',
      latency,
      chainId: 16602,
      blockNumber: blockNumber.toString(),
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Flow Testnet chain connectivity with fallback
 */
async function checkFlowChain(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const publicClient = createPublicClient({
      chain: flowTestnet,
      transport: http(getFlowRpcUrl(), { timeout: RPC_TIMEOUT }),
    });

    const blockNumber = await publicClient.getBlockNumber();
    const latency = Date.now() - start;

    return {
      status: 'up',
      latency,
      chainId: flowTestnet.id,
      blockNumber: blockNumber.toString(),
    };
  } catch (error) {
    // Try fallback RPC if primary times out
    const errMsg = (error as Error).message || '';
    if (errMsg.includes('timeout') || errMsg.includes('timed out') || errMsg.includes('took too long')) {
      console.warn('[Health Check] Flow primary RPC timed out, trying fallback...');
      try {
        const fallbackClient = createPublicClient({
          chain: flowTestnet,
          transport: http(getFlowFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
        });
        const blockNumber = await fallbackClient.getBlockNumber();
        const latency = Date.now() - start;
        return {
          status: 'up',
          latency,
          chainId: flowTestnet.id,
          blockNumber: blockNumber.toString(),
        };
      } catch (fallbackError) {
        return {
          status: 'down',
          error: `Primary and fallback failed: ${(error as Error).message}`,
        };
      }
    }
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check iNFT contract deployment status
 */
async function checkContractDeployment(): Promise<ServiceStatus> {
  try {
    const isDeployed = agentINFTService.isContractDeployed();
    const address = agentINFTService.getContractAddress();

    if (!isDeployed) {
      return {
        status: 'down',
        error: 'AIAgentINFT contract not deployed',
        address,
      };
    }

    // Try to read total supply to verify contract is responsive
    const totalSupply = await agentINFTService.getTotalSupply();

    return {
      status: 'up',
      address,
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      address: agentINFTService.getContractAddress(),
    };
  }
}

export async function GET() {
  try {
    // Run all health checks in parallel
    const [zeroGResult, flowResult, contractResult] = await Promise.allSettled([
      checkZeroGChain(),
      checkFlowChain(),
      checkContractDeployment(),
    ]);

    const services: Record<string, ServiceStatus> = {
      api: { status: 'up', latency: 0 },
      zerog_chain:
        zeroGResult.status === 'fulfilled'
          ? zeroGResult.value
          : { status: 'down', error: String(zeroGResult.reason) },
      flow_chain:
        flowResult.status === 'fulfilled'
          ? flowResult.value
          : { status: 'down', error: String(flowResult.reason) },
      contracts:
        contractResult.status === 'fulfilled'
          ? contractResult.value
          : { status: 'down', error: String(contractResult.reason) },
    };

    // Determine overall status
    const downCount = Object.values(services).filter((s) => s.status === 'down').length;
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      downCount === 0 ? 'healthy' : downCount < 3 ? 'degraded' : 'unhealthy';

    return NextResponse.json({
      success: status !== 'unhealthy',
      status,
      services,
      timestamp: Date.now(),
      uptime: Date.now() - serverStartTime,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'unhealthy',
        services: {
          api: { status: 'down', error: String(error) },
        },
        timestamp: Date.now(),
        uptime: Date.now() - serverStartTime,
      },
      { status: 503 }
    );
  }
}
