/**
 * API Route: Fetch AI Agents (iNFTs)
 * Server-side fetching for iNFT agent data from 0G chain
 */

import { NextResponse } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { rpcResponseCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'agents-list', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // When force refresh is requested (after minting), wait for blockchain state to propagate
    if (forceRefresh) {
      console.log('[Agents API] Force refresh requested, waiting for blockchain propagation...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    }

    const isDeployed = agentINFTService.isContractDeployed();

    if (!isDeployed) {
      return NextResponse.json({
        success: true,
        agents: [],
        totalSupply: 0,
      });
    }

    // Check cache for non-refresh requests (30-second TTL for RPC data)
    const cacheKey = 'agents:active-list';
    if (!forceRefresh) {
      const cached = rpcResponseCache.get(cacheKey);
      if (cached) {
        const response = NextResponse.json(cached);
        response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return response;
      }
    }

    const totalSupply = await agentINFTService.getTotalSupply();
    console.log(`[Agents API] Total supply: ${totalSupply}, forceRefresh: ${forceRefresh}`);

    const infts = await agentINFTService.getAllActiveINFTs();

    // Convert to JSON-serializable format (bigint -> string)
    const agents = infts.map((inft) => ({
      tokenId: inft.tokenId.toString(),
      owner: inft.owner,
      encryptedMetadataRef: inft.encryptedMetadataRef,
      metadataHash: inft.metadataHash,
      onChainData: {
        tier: inft.onChainData.tier,
        stakedAmount: inft.onChainData.stakedAmount.toString(),
        isActive: inft.onChainData.isActive,
        copyTradingEnabled: inft.onChainData.copyTradingEnabled,
        createdAt: inft.onChainData.createdAt.toString(),
        lastUpdatedAt: inft.onChainData.lastUpdatedAt.toString(),
      },
      performance: {
        totalTrades: inft.performance.totalTrades.toString(),
        winningTrades: inft.performance.winningTrades.toString(),
        totalPnL: inft.performance.totalPnL.toString(),
        accuracyBps: inft.performance.accuracyBps.toString(),
      },
    }));

    const responseData = {
      success: true,
      agents,
      totalSupply: totalSupply.toString(),
    };

    // Cache for 30 seconds (RPC data)
    rpcResponseCache.set(cacheKey, responseData);

    return NextResponse.json(responseData);
  },
], { errorContext: 'API:Agents:GET' });
