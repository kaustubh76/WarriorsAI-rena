/**
 * API Route: CRwN Staking
 * Server-side reads of on-chain staking state for fast UI rendering.
 *
 * GET /api/staking?userAddress=0x...
 * Returns: exchangeRate, totalStaked, user balance, unstake request, warrior boost.
 */

import { NextResponse } from 'next/server';
import { type Address } from 'viem';
import { createFlowPublicClientForKey } from '@/lib/flowClient';
import { STAKING_ABI, STCRWN_ABI } from '@/constants/abis/stakingAbi';
import { FLOW_TESTNET_CONTRACTS } from '@/constants/index';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { validateAddress } from '@/lib/api/validation';

const STAKING_ADDRESS = FLOW_TESTNET_CONTRACTS.STAKING as Address;
const STCRWN_ADDRESS = FLOW_TESTNET_CONTRACTS.STCRWN_TOKEN as Address;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const isDeployed = STAKING_ADDRESS !== ZERO_ADDR && STCRWN_ADDRESS !== ZERO_ADDR;

/**
 * GET /api/staking?userAddress=0x...
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'staking-get', ...RateLimitPresets.readOperations }),
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('userAddress');

    if (userAddress) {
      validateAddress(userAddress, 'userAddress');
    }

    // Return zeros when staking contract not deployed
    if (!isDeployed) {
      return NextResponse.json({
        deployed: false,
        exchangeRate: '1000000000000000000', // 1e18 = 1:1
        totalStaked: '0',
        user: userAddress ? {
          stCrwnBalance: '0',
          stakedValue: '0',
          unstakeRequest: null,
          warriorBoost: null,
        } : null,
      });
    }

    const routingKey = `staking-${userAddress || 'global'}`;
    const publicClient = createFlowPublicClientForKey(routingKey);

    // Global reads
    const [exchangeRate, totalStaked] = await Promise.all([
      publicClient.readContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'getExchangeRate',
      }),
      publicClient.readContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'getTotalStaked',
      }),
    ]);

    let userData = null;

    if (userAddress) {
      const addr = userAddress as Address;

      const [stCrwnBalance, stakedBalance, unstakeReq, boost] = await Promise.all([
        publicClient.readContract({
          address: STCRWN_ADDRESS,
          abi: STCRWN_ABI,
          functionName: 'balanceOf',
          args: [addr],
        }),
        publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'getStakedBalance',
          args: [addr],
        }),
        publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'unstakeRequests',
          args: [addr],
        }),
        publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'getWarriorBoost',
          args: [addr],
        }),
      ]);

      const reqArr = unstakeReq as [bigint, bigint];
      const boostArr = boost as [bigint, bigint];

      userData = {
        stCrwnBalance: (stCrwnBalance as bigint).toString(),
        stakedValue: (stakedBalance as bigint).toString(),
        unstakeRequest: reqArr[0] > 0n ? {
          crwnAmount: reqArr[0].toString(),
          unlockTime: Number(reqArr[1]),
        } : null,
        warriorBoost: boostArr[1] > 0n ? {
          nftId: Number(boostArr[0]),
          boostBps: Number(boostArr[1]),
        } : null,
      };
    }

    return NextResponse.json({
      deployed: true,
      exchangeRate: (exchangeRate as bigint).toString(),
      totalStaked: (totalStaked as bigint).toString(),
      user: userData,
    });
  },
]);
