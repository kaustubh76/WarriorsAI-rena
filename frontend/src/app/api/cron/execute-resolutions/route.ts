/**
 * Cron Job: Execute Ready Market Resolutions
 * Runs every 5 minutes to execute scheduled resolutions that are ready
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveMarket, waitForSealed } from '@/lib/flow/marketResolutionClient';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { verifyCronAuth, cronAuthErrorResponse, cronConfig } from '@/lib/api/cronAuth';

export const maxDuration = 300; // 5 minutes max execution time
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Verify cron authorization (only accepts Authorization header)
  const auth = verifyCronAuth(request);
  if (!auth.authorized) {
    return cronAuthErrorResponse(auth);
  }

  console.log('[Cron: Execute Resolutions] Starting execution...');

  const startTime = Date.now();
  const results: any[] = [];

  try {
    // Get resolutions ready to execute
    const readyResolutions = await prisma.scheduledResolution.findMany({
      where: {
        status: 'pending',
        scheduledTime: { lte: new Date() },
      },
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
      orderBy: { scheduledTime: 'asc' },
      take: 20, // Process up to 20 at a time
    });

    console.log(`[Cron: Execute Resolutions] Found ${readyResolutions.length} ready resolutions`);

    for (const resolution of readyResolutions) {
      const resolutionStartTime = Date.now();

      try {
        console.log(`[Cron: Execute Resolutions] Processing resolution ${resolution.id}`);

        // Update status to executing
        await prisma.scheduledResolution.update({
          where: { id: resolution.id },
          data: { status: 'executing' },
        });

        // Fetch outcome from external market
        let outcome: boolean | null = null;

        // First check if outcome is already in external market record
        if (resolution.externalMarket.outcome) {
          outcome = resolution.externalMarket.outcome === 'yes';
        } else {
          // Fetch from API
          if (resolution.oracleSource === 'polymarket') {
            const outcomeData = await polymarketService.getMarketOutcome(
              resolution.externalMarket.externalId
            );

            if (outcomeData.resolved && outcomeData.outcome) {
              outcome = outcomeData.outcome === 'yes';

              // Update external market with outcome
              await prisma.externalMarket.update({
                where: { id: resolution.externalMarketId },
                data: { outcome: outcomeData.outcome },
              });
            }
          } else if (resolution.oracleSource === 'kalshi') {
            const marketData = await kalshiService.getMarketWithOutcome(
              resolution.externalMarket.externalId
            );

            if (marketData.outcome) {
              outcome = marketData.outcome === 'yes';

              // Update external market with outcome
              await prisma.externalMarket.update({
                where: { id: resolution.externalMarketId },
                data: { outcome: marketData.outcome },
              });
            }
          }
        }

        // If outcome not available, mark as failed
        if (outcome === null) {
          await prisma.scheduledResolution.update({
            where: { id: resolution.id },
            data: {
              status: 'failed',
              lastError: 'Outcome not available from external market',
              attempts: resolution.attempts + 1,
            },
          });

          results.push({
            id: resolution.id,
            status: 'failed',
            error: 'Outcome not available',
            duration: Date.now() - resolutionStartTime,
          });

          continue;
        }

        // Execute resolution on Flow blockchain
        if (!resolution.flowResolutionId) {
          throw new Error('Flow resolution ID not found');
        }

        console.log(`[Cron: Execute Resolutions] Executing resolution ${resolution.id} with outcome: ${outcome}`);

        const txId = await resolveMarket(
          Number(resolution.flowResolutionId),
          outcome
        );

        // Wait for transaction to be sealed
        await waitForSealed(txId);

        console.log(`[Cron: Execute Resolutions] Transaction sealed: ${txId}`);

        // Update database
        await prisma.scheduledResolution.update({
          where: { id: resolution.id },
          data: {
            status: 'completed',
            outcome,
            executedAt: new Date(),
            executeTransactionHash: txId,
          },
        });

        // If has mirror market, resolve it too
        if (resolution.mirrorMarket && !resolution.mirrorMarket.resolved) {
          try {
            console.log(`[Cron: Execute Resolutions] Resolving mirror market ${resolution.mirrorKey}`);

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

            if (mirrorResponse.ok) {
              console.log(`[Cron: Execute Resolutions] Mirror market resolved successfully`);
            } else {
              const errorText = await mirrorResponse.text();
              console.error(`[Cron: Execute Resolutions] Mirror market resolution failed: ${errorText}`);
            }
          } catch (error) {
            console.error('[Cron: Execute Resolutions] Failed to resolve mirror market:', error);
          }
        }

        results.push({
          id: resolution.id,
          status: 'success',
          outcome,
          txHash: txId,
          duration: Date.now() - resolutionStartTime,
        });

        console.log(`[Cron: Execute Resolutions] Successfully completed resolution ${resolution.id}`);
      } catch (error) {
        console.error(`[Cron: Execute Resolutions] Error processing resolution ${resolution.id}:`, error);

        // Update resolution to failed
        await prisma.scheduledResolution.update({
          where: { id: resolution.id },
          data: {
            status: 'failed',
            lastError: error instanceof Error ? error.message : 'Unknown error',
            attempts: resolution.attempts + 1,
          },
        });

        results.push({
          id: resolution.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - resolutionStartTime,
        });
      }
    }

    const totalDuration = Date.now() - startTime;

    console.log(`[Cron: Execute Resolutions] Completed in ${totalDuration}ms`);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      duration: totalDuration,
    });
  } catch (error) {
    console.error('[Cron: Execute Resolutions] Fatal error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processed: results.length,
        results,
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// GET handler for health check / manual testing
// NOTE: Removed insecure query param auth - only accepts Authorization header now
export async function GET(request: NextRequest) {
  // Verify cron authorization with dev bypass for health checks
  const auth = verifyCronAuth(request, { allowDevBypass: true });
  if (!auth.authorized) {
    return cronAuthErrorResponse(auth);
  }

  // Forward to POST handler
  return POST(request);
}
