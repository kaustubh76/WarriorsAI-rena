/**
 * Resolution Orchestrator
 * Coordinates full market resolution flow across Flow and mirror markets
 */

import { prisma } from '@/lib/prisma';
import {
  resolveMarket,
  waitForSealed,
} from '@/lib/flow/marketResolutionClient';
import { polymarketService } from './externalMarkets/polymarketService';
import { kalshiService } from './externalMarkets/kalshiService';

export interface ResolutionParams {
  externalMarketId: string;
  scheduledResolutionId: string;
}

export interface ResolutionResult {
  success: boolean;
  flowTxHash?: string;
  mirrorTxHash?: string;
  outcome?: boolean;
  error?: string;
}

/**
 * Execute full market resolution
 * Resolves on Flow ScheduledMarketResolver and mirror market if applicable
 */
export async function executeFullResolution(
  params: ResolutionParams
): Promise<ResolutionResult> {
  const { scheduledResolutionId } = params;

  try {
    // Get scheduled resolution
    const resolution = await prisma.scheduledResolution.findUnique({
      where: { id: scheduledResolutionId },
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
    });

    if (!resolution) {
      throw new Error('Scheduled resolution not found');
    }

    // Verify resolution is ready
    if (resolution.status !== 'pending') {
      throw new Error(`Resolution status is ${resolution.status}, not pending`);
    }

    if (new Date(resolution.scheduledTime) > new Date()) {
      throw new Error('Scheduled time has not arrived yet');
    }

    // Update status to executing
    await prisma.scheduledResolution.update({
      where: { id: scheduledResolutionId },
      data: { status: 'executing' },
    });

    // Fetch outcome from external market
    let outcome: boolean | null = null;

    // Check if outcome is already in the resolution
    if (resolution.outcome !== null) {
      outcome = resolution.outcome;
    }
    // Check if outcome is in external market record
    else if (resolution.externalMarket.outcome) {
      outcome = resolution.externalMarket.outcome === 'yes';
    }
    // Fetch from external API
    else {
      if (resolution.oracleSource === 'polymarket') {
        const outcomeData = await polymarketService.getMarketOutcome(
          resolution.externalMarket.externalId
        );

        if (outcomeData.resolved && outcomeData.outcome) {
          outcome = outcomeData.outcome === 'yes';
        }
      } else if (resolution.oracleSource === 'kalshi') {
        const marketData = await kalshiService.getMarketWithOutcome(
          resolution.externalMarket.externalId
        );

        if (marketData.outcome) {
          outcome = marketData.outcome === 'yes';
        }
      }
    }

    if (outcome === null) {
      throw new Error('Outcome not available from external market');
    }

    // 1. Resolve on Flow ScheduledMarketResolver
    if (!resolution.flowResolutionId) {
      throw new Error('Flow resolution ID not found');
    }

    const flowTxHash = await resolveMarket(
      Number(resolution.flowResolutionId),
      outcome
    );

    // Wait for transaction to be sealed
    await waitForSealed(flowTxHash);

    console.log(`[ResolutionOrchestrator] Flow resolution sealed: ${flowTxHash}`);

    // 2. If mirrored, resolve ExternalMarketMirror contract
    let mirrorTxHash: string | undefined;

    if (resolution.mirrorMarket && resolution.mirrorKey) {
      try {
        const mirrorResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/flow/execute`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'resolve',
              mirrorKey: resolution.mirrorKey,
              yesWon: outcome,
            }),
          }
        );

        if (!mirrorResponse.ok) {
          const errorText = await mirrorResponse.text();
          throw new Error(`Mirror resolution failed: ${errorText}`);
        }

        const mirrorResult = await mirrorResponse.json();
        mirrorTxHash = mirrorResult.transactionId;

        console.log(`[ResolutionOrchestrator] Mirror market resolved: ${mirrorTxHash}`);
      } catch (error) {
        console.error('[ResolutionOrchestrator] Mirror market resolution failed:', error);
        // Continue even if mirror resolution fails
      }
    }

    // 3. Update database records
    await updateResolutionComplete(scheduledResolutionId, flowTxHash, outcome);

    return {
      success: true,
      flowTxHash,
      mirrorTxHash,
      outcome,
    };
  } catch (error) {
    console.error('[ResolutionOrchestrator] Execution failed:', error);

    // Update resolution to failed
    try {
      const existingResolution = await prisma.scheduledResolution.findUnique({
        where: { id: scheduledResolutionId },
      });

      if (existingResolution) {
        await prisma.scheduledResolution.update({
          where: { id: scheduledResolutionId },
          data: {
            status: 'failed',
            lastError: error instanceof Error ? error.message : 'Unknown error',
            attempts: existingResolution.attempts + 1,
          },
        });
      }
    } catch (updateError) {
      console.error('[ResolutionOrchestrator] Failed to update error status:', updateError);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update database to mark resolution as complete
 */
async function updateResolutionComplete(
  resolutionId: string,
  txHash: string,
  outcome: boolean
): Promise<void> {
  await prisma.scheduledResolution.update({
    where: { id: resolutionId },
    data: {
      status: 'completed',
      outcome,
      executedAt: new Date(),
      executeTransactionHash: txHash,
    },
  });

  console.log(`[ResolutionOrchestrator] Updated resolution ${resolutionId} as completed`);
}

/**
 * Batch execute multiple resolutions
 */
export async function executeBatchResolutions(
  resolutionIds: string[]
): Promise<Map<string, ResolutionResult>> {
  const results = new Map<string, ResolutionResult>();

  for (const resolutionId of resolutionIds) {
    try {
      // Get external market ID
      const resolution = await prisma.scheduledResolution.findUnique({
        where: { id: resolutionId },
        select: { externalMarketId: true },
      });

      if (!resolution) {
        results.set(resolutionId, {
          success: false,
          error: 'Resolution not found',
        });
        continue;
      }

      const result = await executeFullResolution({
        externalMarketId: resolution.externalMarketId,
        scheduledResolutionId: resolutionId,
      });

      results.set(resolutionId, result);
    } catch (error) {
      results.set(resolutionId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Get resolution status
 */
export async function getResolutionStatus(
  resolutionId: string
): Promise<{
  status: string;
  outcome?: boolean;
  flowTxHash?: string;
  mirrorTxHash?: string;
  error?: string;
}> {
  const resolution = await prisma.scheduledResolution.findUnique({
    where: { id: resolutionId },
  });

  if (!resolution) {
    throw new Error('Resolution not found');
  }

  return {
    status: resolution.status,
    outcome: resolution.outcome ?? undefined,
    flowTxHash: resolution.executeTransactionHash ?? undefined,
    error: resolution.lastError ?? undefined,
  };
}
