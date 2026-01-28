/**
 * Resolution Monitor Service
 * Monitors external markets for resolutions and triggers Flow resolutions
 */

import { prisma } from '@/lib/prisma';
import { polymarketService } from './externalMarkets/polymarketService';
import { kalshiService } from './externalMarkets/kalshiService';

export class ResolutionMonitorService {
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start monitoring for resolved markets
   */
  start(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.log('[ResolutionMonitor] Already running');
      return;
    }

    console.log(`[ResolutionMonitor] Starting with ${intervalMs}ms interval`);
    this.isRunning = true;

    // Initial check
    this.checkForResolvedMarkets().catch((error) => {
      console.error('[ResolutionMonitor] Initial check failed:', error);
    });

    // Set up periodic checks
    this.pollInterval = setInterval(() => {
      this.checkForResolvedMarkets().catch((error) => {
        console.error('[ResolutionMonitor] Periodic check failed:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('[ResolutionMonitor] Stopped');
  }

  /**
   * Check for markets that have resolved
   */
  private async checkForResolvedMarkets(): Promise<void> {
    console.log('[ResolutionMonitor] Checking for resolved markets...');

    try {
      // Get external markets that are resolved but don't have an outcome yet
      const markets = await prisma.externalMarket.findMany({
        where: {
          status: 'resolved',
          outcome: null,
        },
        take: 50,
      });

      console.log(`[ResolutionMonitor] Found ${markets.length} markets to check`);

      for (const market of markets) {
        try {
          await this.detectAndSchedule(market.id);
        } catch (error) {
          console.error(
            `[ResolutionMonitor] Error processing market ${market.id}:`,
            error
          );
        }
      }

      // Check if any ready resolutions need to be executed
      await this.checkReadyResolutions();
    } catch (error) {
      console.error('[ResolutionMonitor] Error in checkForResolvedMarkets:', error);
    }
  }

  /**
   * Detect outcome for a specific market and schedule resolution
   */
  async detectAndSchedule(marketId: string): Promise<void> {
    const market = await prisma.externalMarket.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      console.error(`[ResolutionMonitor] Market ${marketId} not found`);
      return;
    }

    // Market must be resolved
    if (market.status !== 'resolved') {
      console.log(`[ResolutionMonitor] Market ${marketId} not resolved yet`);
      return;
    }

    // Already has outcome
    if (market.outcome) {
      console.log(`[ResolutionMonitor] Market ${marketId} already has outcome`);
      return;
    }

    console.log(`[ResolutionMonitor] Fetching outcome for ${market.source} market ${market.externalId}`);

    // Fetch outcome from external API
    let outcome: 'yes' | 'no' | null = null;

    try {
      if (market.source === 'polymarket') {
        const outcomeData = await polymarketService.getMarketOutcome(
          market.externalId
        );

        if (outcomeData.resolved && outcomeData.outcome) {
          outcome = outcomeData.outcome;
        }
      } else if (market.source === 'kalshi') {
        const marketData = await kalshiService.getMarketWithOutcome(
          market.externalId
        );

        if (marketData.outcome) {
          outcome = marketData.outcome;
        }
      }
    } catch (error) {
      console.error(
        `[ResolutionMonitor] Error fetching outcome for market ${marketId}:`,
        error
      );
      return;
    }

    if (!outcome) {
      console.log(`[ResolutionMonitor] No outcome available for market ${marketId}`);
      return;
    }

    console.log(`[ResolutionMonitor] Market ${marketId} resolved with outcome: ${outcome}`);

    // Update market with outcome
    await prisma.externalMarket.update({
      where: { id: marketId },
      data: { outcome },
    });

    // Check if this market has a mirror market
    const mirrorMarket = await prisma.mirrorMarket.findFirst({
      where: {
        externalId: market.externalId,
        source: market.source,
        resolved: false,
      },
    });

    if (!mirrorMarket) {
      console.log(`[ResolutionMonitor] No mirror market found for ${marketId}`);
      return;
    }

    // Check if there's already a scheduled resolution
    const existingResolution = await prisma.scheduledResolution.findFirst({
      where: {
        externalMarketId: marketId,
        status: { in: ['pending', 'ready', 'executing'] },
      },
    });

    if (existingResolution) {
      console.log(`[ResolutionMonitor] Resolution already scheduled for ${marketId}`);
      return;
    }

    // Schedule resolution for 5 minutes from now
    // This gives time for verification and allows for manual review if needed
    const scheduledTime = new Date(Date.now() + 5 * 60 * 1000);

    console.log(`[ResolutionMonitor] Scheduling resolution for ${marketId} at ${scheduledTime}`);

    try {
      // Create scheduled resolution via API
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/flow/scheduled-resolutions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalMarketId: marketId,
            mirrorKey: mirrorMarket.mirrorKey,
            scheduledTime: scheduledTime.toISOString(),
            oracleSource: market.source,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to schedule resolution: ${error}`);
      }

      const result = await response.json();
      console.log(
        `[ResolutionMonitor] Successfully scheduled resolution ${result.resolution.id}`
      );
    } catch (error) {
      console.error(
        `[ResolutionMonitor] Failed to schedule resolution for ${marketId}:`,
        error
      );
    }
  }

  /**
   * Check for resolutions that are ready to execute
   */
  private async checkReadyResolutions(): Promise<void> {
    const readyResolutions = await prisma.scheduledResolution.findMany({
      where: {
        status: 'pending',
        scheduledTime: { lte: new Date() },
      },
      take: 10,
    });

    if (readyResolutions.length === 0) {
      return;
    }

    console.log(
      `[ResolutionMonitor] Found ${readyResolutions.length} ready resolutions`
    );

    for (const resolution of readyResolutions) {
      try {
        console.log(`[ResolutionMonitor] Triggering execution for resolution ${resolution.id}`);

        // Execute via API
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/flow/scheduled-resolutions`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resolutionId: resolution.id,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Execution failed: ${error}`);
        }

        console.log(`[ResolutionMonitor] Successfully executed resolution ${resolution.id}`);
      } catch (error) {
        console.error(
          `[ResolutionMonitor] Failed to execute resolution ${resolution.id}:`,
          error
        );
      }
    }
  }

  /**
   * Get service status
   */
  getStatus(): { running: boolean; intervalMs: number | null } {
    return {
      running: this.isRunning,
      intervalMs: this.pollInterval ? 60000 : null,
    };
  }
}

// Singleton instance
export const resolutionMonitor = new ResolutionMonitorService();
