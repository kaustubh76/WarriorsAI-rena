/**
 * Health Check API Endpoint
 * GET /api/health
 *
 * Returns system health status for monitoring
 * Supports ?quick=true for lightweight checks (load balancer probes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, defineChain } from 'viem';
import { flowTestnet } from 'viem/chains';
import { agentINFTService } from '@/services/agentINFTService';
import { getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';
import { handleAPIError, createAPILogger } from '@/lib/api';

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

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();

  try {
    const { searchParams } = new URL(request.url);
    const isQuickCheck = searchParams.get('quick') === 'true';

    // For quick health checks (load balancer probes), skip external dependencies
    if (isQuickCheck) {
      const response = NextResponse.json({
        success: true,
        status: 'healthy',
        services: {
          api: { status: 'up' as const, latency: 0 },
        },
        timestamp: Date.now(),
        uptime: Date.now() - serverStartTime,
      });

      // Add cache headers for quick checks
      response.headers.set('Cache-Control', 'no-store, max-age=0');
      response.headers.set('X-Request-ID', logger.requestId);
      logger.complete(200, 'Quick health check');
      return response;
    }

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

    // Calculate memory usage
    const memoryUsage = process.memoryUsage ? {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    } : undefined;

    const response = NextResponse.json({
      success: status !== 'unhealthy',
      status,
      services,
      timestamp: Date.now(),
      uptime: Date.now() - serverStartTime,
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
      memory: memoryUsage,
    });

    // Add appropriate headers
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('X-Request-ID', logger.requestId);

    logger.complete(status === 'unhealthy' ? 503 : 200);
    return response;
  } catch (error) {
    logger.error('Health check failed', error);
    return handleAPIError(error, 'API:Health:GET');
  }
}
