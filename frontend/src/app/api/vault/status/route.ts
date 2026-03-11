/**
 * API Route: GET /api/vault/status?nftId=247
 *
 * Returns vault status from both DB and on-chain.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { vaultService } from '@/services/vaultService';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'vault-status', ...RateLimitPresets.apiQueries }),
  async (req) => {
    const { searchParams } = new URL(req.url);
    const nftIdParam = searchParams.get('nftId');

    if (!nftIdParam) {
      throw ErrorResponses.badRequest('nftId query parameter is required');
    }

    const nftId = parseInt(nftIdParam, 10);
    if (isNaN(nftId)) {
      throw ErrorResponses.badRequest('nftId must be a number');
    }

    // Read from DB
    const dbVault = await prisma.vault.findUnique({
      where: { nftId },
      include: {
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    // Read from chain
    let onChainState = null;
    try {
      onChainState = await vaultService.getVaultState(nftId);
    } catch (error) {
      console.warn('[vault/status] Failed to read on-chain state:', error);
    }

    // Read pool APYs
    let poolAPYs = null;
    try {
      const apys = await vaultService.getPoolAPYs();
      poolAPYs = {
        highYield: apys.highYield / 100,
        stable: apys.stable / 100,
        lp: apys.lp / 100,
      };
    } catch {
      // Non-critical
    }

    if (!dbVault && !onChainState) {
      return NextResponse.json({
        success: true,
        exists: false,
        nftId,
      });
    }

    // Read Cadence schedule data if vault has scheduledTxId
    let cadenceSchedule = null;
    if (dbVault?.scheduledTxId) {
      try {
        const { queryVaultStatusFromCadence } = await import('@/lib/flow/vaultSchedulerClient');
        cadenceSchedule = await queryVaultStatusFromCadence(nftId);
      } catch (cadenceError) {
        console.warn('[vault/status] Failed to read Cadence schedule:', cadenceError);
      }
    }

    return NextResponse.json({
      success: true,
      exists: true,
      nftId,
      vault: dbVault
        ? {
            id: dbVault.id,
            status: dbVault.status,
            depositAmount: dbVault.depositAmount,
            allocation: {
              highYield: dbVault.allocationHighYield,
              stable: dbVault.allocationStable,
              lp: dbVault.allocationLP,
            },
            scheduledTxId: dbVault.scheduledTxId,
            createdAt: dbVault.createdAt,
            deposits: dbVault.deposits,
          }
        : null,
      onChain: onChainState
        ? {
            active: onChainState.active,
            depositAmount: onChainState.depositAmount.toString(),
            allocation: onChainState.allocation.map(String),
          }
        : null,
      cadenceSchedule,
      poolAPYs,
    });
  },
], { errorContext: 'API:Vault:Status:GET' });
