/**
 * API Route: Fetch AI Agents (iNFTs)
 * Server-side fetching for iNFT agent data from 0G chain
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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

    return NextResponse.json({
      success: true,
      agents,
      totalSupply: totalSupply.toString(),
    });
  } catch (error) {
    console.error('[Agents API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agents: [],
      },
      { status: 500 }
    );
  }
}
