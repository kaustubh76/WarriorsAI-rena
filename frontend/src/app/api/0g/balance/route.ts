import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  ZEROG_RPC,
  ZEROG_CHAIN_ID,
  ZEROG_CONTRACTS,
  ERC20_ABI,
  AI_AGENT_INFT_ABI,
} from '@/lib/apiConfig';
import { validateAddress, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

/**
 * GET /api/0g/balance?address=0x...
 * Fetch CRwN token balance on 0G chain for iNFT staking
 *
 * This endpoint is needed because:
 * - iNFT staking requires CRwN on 0G Galileo (chain 16602)
 * - This is separate from Flow CRwN used for prediction market trading
 * - Browser can't directly call 0G RPC due to CORS
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: '0g-balance', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const addressParam = searchParams.get('address');

    // Validate address using centralized validation
    const userAddress = validateAddress(addressParam || '', 'address');

    const provider = new ethers.JsonRpcProvider(ZEROG_RPC);

    // Get the CRwN token address from the iNFT contract (for verification)
    const inftContract = new ethers.Contract(ZEROG_CONTRACTS.aiAgentINFT, AI_AGENT_INFT_ABI, provider);
    const crwnTokenAddress = await inftContract.crownToken();
    const minStake = await inftContract.MIN_STAKE_NOVICE();

    // Create CRwN token contract
    const crwnContract = new ethers.Contract(crwnTokenAddress, ERC20_ABI, provider);

    // Fetch balance and allowance in parallel
    const [balance, symbol, decimals, allowance] = await Promise.all([
      crwnContract.balanceOf(userAddress),
      crwnContract.symbol(),
      crwnContract.decimals(),
      crwnContract.allowance(userAddress, ZEROG_CONTRACTS.aiAgentINFT)
    ]);

    // Check if user has enough for minimum stake
    const hasEnoughForMinStake = balance >= minStake;

    return NextResponse.json({
      success: true,
      chain: {
        name: '0G Galileo Testnet',
        chainId: ZEROG_CHAIN_ID,
        rpc: ZEROG_RPC
      },
      token: {
        address: crwnTokenAddress,
        symbol: symbol,
        decimals: Number(decimals)
      },
      balance: balance.toString(),
      balanceFormatted: ethers.formatEther(balance),
      allowance: allowance.toString(),
      allowanceFormatted: ethers.formatEther(allowance),
      staking: {
        minStakeNovice: minStake.toString(),
        minStakeFormatted: ethers.formatEther(minStake),
        hasEnoughForMinStake,
        inftContract: ZEROG_CONTRACTS.aiAgentINFT
      },
      note: 'This is CRwN on 0G chain for iNFT staking. Flow CRwN (for trading) is separate.'
    });
  },
], { errorContext: 'API:0G:Balance:GET' });
