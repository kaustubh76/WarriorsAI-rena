/**
 * POST /api/arena/strategy/create
 *
 * Create a Strategy-vs-Strategy arena battle.
 * Both warriors must have active vaults.
 * Accepts optional txHash + onChainBattleId when client already created on-chain.
 */

import { NextResponse } from 'next/server';
import { parseEther } from 'viem';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { strategyArenaService } from '@/services/arena/strategyArenaService';

const MIN_STAKES = parseEther('5'); // 5 CRwN minimum — matches vault balance floor

interface CreateRequest {
  warrior1Id: number;
  warrior1Owner: string;
  warrior2Id: number;
  warrior2Owner: string;
  stakes: string;
  scheduledStartAt?: string; // ISO 8601 — betting window before cycles begin
  txHash?: string;           // On-chain createBattle tx hash (from client)
  onChainBattleId?: string;  // On-chain battle ID (from BattleCreated event)
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-create', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body: CreateRequest = await req.json();
    const { warrior1Id, warrior1Owner, warrior2Id, warrior2Owner, stakes } = body;

    if (!warrior1Id || !warrior1Owner || !warrior2Id || !warrior2Owner) {
      throw ErrorResponses.badRequest('warrior1Id, warrior1Owner, warrior2Id, warrior2Owner are required');
    }

    // Validate EVM address format
    const evmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
    if (!evmAddressRegex.test(warrior1Owner) || !evmAddressRegex.test(warrior2Owner)) {
      throw ErrorResponses.badRequest('warrior1Owner and warrior2Owner must be valid EVM addresses (0x + 40 hex chars)');
    }

    // Prevent self-battles
    if (warrior1Owner.toLowerCase() === warrior2Owner.toLowerCase()) {
      throw ErrorResponses.badRequest('Cannot create a battle between warriors owned by the same address');
    }

    if (!stakes || isNaN(Number(stakes)) || Number(stakes) <= 0) {
      throw ErrorResponses.badRequest('stakes must be a positive number');
    }
    try {
      if (BigInt(stakes) < MIN_STAKES) {
        throw ErrorResponses.badRequest('Stakes must be at least 5 CRwN');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e) throw e; // re-throw ErrorResponses
      throw ErrorResponses.badRequest('stakes must be a valid wei amount');
    }

    // Validate optional scheduled start time
    let scheduledStartAt: Date | undefined;
    if (body.scheduledStartAt) {
      scheduledStartAt = new Date(body.scheduledStartAt);
      if (isNaN(scheduledStartAt.getTime())) {
        throw ErrorResponses.badRequest('scheduledStartAt must be a valid ISO 8601 datetime');
      }
      if (scheduledStartAt.getTime() < Date.now()) {
        throw ErrorResponses.badRequest('scheduledStartAt must be in the future');
      }
      const MAX_SCHEDULE_DAYS = 30;
      if (scheduledStartAt.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
        throw ErrorResponses.badRequest(`scheduledStartAt cannot be more than ${MAX_SCHEDULE_DAYS} days in the future`);
      }
    }

    // Validate txHash format if provided
    if (body.txHash && !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
      throw ErrorResponses.badRequest('txHash must be a valid transaction hash (0x + 64 hex chars)');
    }

    const result = await strategyArenaService.createStrategyBattle({
      warrior1Id: Number(warrior1Id),
      warrior1Owner,
      warrior2Id: Number(warrior2Id),
      warrior2Owner,
      stakes,
      scheduledStartAt,
      txHash: body.txHash,
      onChainBattleId: body.onChainBattleId,
    });

    return NextResponse.json({
      success: true,
      battle: result.battle,
      bettingPoolId: result.bettingPoolId,
      message: `Strategy battle created: NFT#${warrior1Id} vs NFT#${warrior2Id}`,
    });
  },
], { errorContext: 'API:Arena:Strategy:Create:POST' });
