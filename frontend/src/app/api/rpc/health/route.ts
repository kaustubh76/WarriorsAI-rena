/**
 * API Route: RPC Health Check
 * Monitor the health and performance of RPC endpoints
 *
 * GET /api/rpc/health
 *
 * Returns:
 * - Primary RPC status, latency, block number
 * - Fallback RPC status, latency, block number
 * - Overall health status
 * - Recommendations
 */

import { NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { FLOW_RPC_URLS } from '@/constants';

interface RPCHealthResult {
  url: string;
  status: 'healthy' | 'unhealthy' | 'slow';
  latency?: number;
  blockNumber?: string;
  chainId?: string;
  error?: string;
}

/**
 * Test a single RPC endpoint
 */
async function testRPCEndpoint(url: string): Promise<RPCHealthResult> {
  const timeout = 10000; // 10 second timeout

  try {
    const start = Date.now();

    // Test eth_chainId
    const chainIdResponse = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    const chainIdData = await (chainIdResponse as Response).json();
    const chainId = chainIdData.result;

    // Test eth_blockNumber
    const blockResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 2,
      }),
    });

    const blockData = await blockResponse.json();
    const blockNumber = blockData.result;

    const latency = Date.now() - start;

    // Verify it's Flow testnet (chain ID 545 = 0x221)
    const isCorrectChain = chainId === '0x221';

    if (!isCorrectChain) {
      return {
        url,
        status: 'unhealthy',
        error: `Wrong chain ID: ${chainId} (expected 0x221 for Flow testnet)`,
        latency,
      };
    }

    // Determine health based on latency
    const status = latency > 5000 ? 'slow' : 'healthy';

    return {
      url,
      status,
      latency,
      blockNumber: parseInt(blockNumber, 16).toString(),
      chainId: `${parseInt(chainId, 16)} (0x${parseInt(chainId, 16).toString(16)})`,
    };

  } catch (error: any) {
    return {
      url,
      status: 'unhealthy',
      error: error.message || 'Unknown error',
    };
  }
}

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'rpc-health', ...RateLimitPresets.moderateReads }),
  async (req, ctx) => {
    // Get RPC URLs
    const primaryUrl = FLOW_RPC_URLS.testnet.primary;
    const fallbackUrl = FLOW_RPC_URLS.testnet.fallback;

    console.log('[RPC:Health] Testing RPC endpoints...');

    // Test both endpoints in parallel
    const [primaryHealth, fallbackHealth] = await Promise.all([
      testRPCEndpoint(primaryUrl),
      testRPCEndpoint(fallbackUrl),
    ]);

    // Determine overall health
    const isPrimaryHealthy = primaryHealth.status === 'healthy';
    const isFallbackHealthy = fallbackHealth.status === 'healthy';

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;
    let recommendations: string[] = [];

    if (isPrimaryHealthy && isFallbackHealthy) {
      overallStatus = 'healthy';
      message = 'All RPC endpoints are healthy';
    } else if (isPrimaryHealthy || isFallbackHealthy) {
      overallStatus = 'degraded';
      message = 'Some RPC endpoints are unhealthy';

      if (!isPrimaryHealthy) {
        recommendations.push('Primary RPC is down - system will use fallback automatically');
        recommendations.push('Consider investigating primary RPC endpoint: ' + primaryUrl);
      }
      if (!isFallbackHealthy) {
        recommendations.push('Fallback RPC is down - failover mechanism compromised');
        recommendations.push('Consider adding additional fallback RPC endpoints');
      }
    } else {
      overallStatus = 'unhealthy';
      message = 'All RPC endpoints are unhealthy - system may not function correctly';
      recommendations.push('CRITICAL: Both RPC endpoints are down');
      recommendations.push('Check network connectivity and RPC provider status');
      recommendations.push('Consider using alternative RPC endpoints');
    }

    // Add latency warnings
    if (primaryHealth.latency && primaryHealth.latency > 3000) {
      recommendations.push(`Primary RPC is slow (${primaryHealth.latency}ms) - performance may be degraded`);
    }
    if (fallbackHealth.latency && fallbackHealth.latency > 3000) {
      recommendations.push(`Fallback RPC is slow (${fallbackHealth.latency}ms) - failover may be slow`);
    }

    return NextResponse.json({
      success: true,
      overall: {
        status: overallStatus,
        message,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      },
      endpoints: {
        primary: primaryHealth,
        fallback: fallbackHealth,
      },
      timestamp: new Date().toISOString(),
    });
  },
], { errorContext: 'API:RPC:Health' });
