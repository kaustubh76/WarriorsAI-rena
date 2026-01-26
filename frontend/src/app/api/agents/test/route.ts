/**
 * Test API Route for debugging iNFT agent fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'agents-test',
      maxRequests: 30,
      windowMs: 60000,
    });
    console.log('=== Testing iNFT Service ===');

    // Check service configuration
    const isDeployed = agentINFTService.isContractDeployed();
    const contractAddress = agentINFTService.getContractAddress();
    const chainId = agentINFTService.getChainId();

    console.log('Service config:', { isDeployed, contractAddress, chainId });

    if (!isDeployed) {
      return NextResponse.json({
        success: false,
        error: 'Contract not deployed',
        config: { isDeployed, contractAddress, chainId },
      });
    }

    // Test totalSupply
    const totalSupply = await agentINFTService.getTotalSupply();
    console.log('Total supply:', totalSupply.toString());

    // Test getINFT for token 1 if supply > 0
    let token1Data = null;
    if (totalSupply > BigInt(0)) {
      token1Data = await agentINFTService.getINFT(BigInt(1));
      console.log('Token 1 data:', token1Data);
    }

    // Test getAllActiveINFTs
    const allINFTs = await agentINFTService.getAllActiveINFTs();
    console.log('All active iNFTs:', allINFTs.length);

    return NextResponse.json({
      success: true,
      config: { isDeployed, contractAddress, chainId },
      totalSupply: totalSupply.toString(),
      token1Data: token1Data
        ? {
            tokenId: token1Data.tokenId.toString(),
            owner: token1Data.owner,
            encryptedMetadataRef: token1Data.encryptedMetadataRef,
            onChainData: {
              tier: token1Data.onChainData.tier,
              stakedAmount: token1Data.onChainData.stakedAmount.toString(),
              isActive: token1Data.onChainData.isActive,
              copyTradingEnabled: token1Data.onChainData.copyTradingEnabled,
            },
          }
        : null,
      totalActiveINFTs: allINFTs.length,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:Test:GET');
  }
}
