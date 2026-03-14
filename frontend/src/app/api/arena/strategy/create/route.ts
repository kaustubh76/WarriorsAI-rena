/**
 * POST /api/arena/strategy/create
 *
 * Create a Strategy-vs-Strategy arena battle.
 * Both warriors must have active vaults.
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
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-create', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body: CreateRequest = await req.json();
    const { warrior1Id, warrior1Owner, warrior2Id, warrior2Owner, stakes } = body;

    if (!warrior1Id || !warrior1Owner || !warrior2Id || !warrior2Owner) {
      throw ErrorResponses.badRequest('warrior1Id, warrior1Owner, warrior2Id, warrior2Owner are required');
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
    }

    const result = await strategyArenaService.createStrategyBattle({
      warrior1Id: Number(warrior1Id),
      warrior1Owner,
      warrior2Id: Number(warrior2Id),
      warrior2Owner,
      stakes,
      scheduledStartAt,
    });

    return NextResponse.json({
      success: true,
      battle: result.battle,
      bettingPoolId: result.bettingPoolId,
      message: `Strategy battle created: NFT#${warrior1Id} vs NFT#${warrior2Id}`,
    });
  },
], { errorContext: 'API:Arena:Strategy:Create:POST' });
