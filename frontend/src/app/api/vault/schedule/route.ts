/**
 * POST /api/vault/schedule
 *
 * Updates a vault's scheduledTxId after the user schedules it on Cadence.
 * Called by useVaultCreate after successful cadenceClient.scheduleVault().
 */

import { NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { ErrorResponses } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'vault-schedule', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body = await req.json();
    const { nftId, scheduledTxId } = body;

    if (typeof nftId !== 'number' || nftId < 1) {
      throw ErrorResponses.badRequest('nftId is required and must be a positive number');
    }

    if (!scheduledTxId || typeof scheduledTxId !== 'string') {
      throw ErrorResponses.badRequest('scheduledTxId is required and must be a string');
    }

    const vault = await prisma.vault.findUnique({
      where: { nftId },
    });

    if (!vault) {
      throw ErrorResponses.notFound('Vault for this NFT');
    }

    await prisma.vault.update({
      where: { nftId },
      data: { scheduledTxId },
    });

    return NextResponse.json({
      success: true,
      nftId,
      scheduledTxId,
    });
  },
], { errorContext: 'API:Vault:Schedule:POST' });
