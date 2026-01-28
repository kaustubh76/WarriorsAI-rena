/**
 * Event Tracking System Tests
 *
 * Tests for blockchain event listeners and database synchronization
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createFlowPublicClient } from '../src/lib/flowClient';
import {
  handleMirrorMarketCreated,
  handleMirrorTradeExecuted,
  handleMirrorPriceSynced,
  handleMirrorResolved,
  getLastSyncedBlock,
  backfillEvents
} from '../src/lib/eventListeners/externalMarketEvents';
import { prisma } from '../src/lib/prisma';

describe('Event Tracking System', () => {

  // ============================================================================
  // Setup & Teardown
  // ============================================================================

  beforeAll(async () => {
    // Clean test data
    await prisma.mirrorTrade.deleteMany({ where: { mirrorKey: { startsWith: 'test_' } } });
    await prisma.mirrorMarket.deleteMany({ where: { mirrorKey: { startsWith: 'test_' } } });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.mirrorTrade.deleteMany({ where: { mirrorKey: { startsWith: 'test_' } } });
    await prisma.mirrorMarket.deleteMany({ where: { mirrorKey: { startsWith: 'test_' } } });
    await prisma.$disconnect();
  });

  // ============================================================================
  // MirrorMarketCreated Event Tests
  // ============================================================================

  describe('MirrorMarketCreated Event', () => {
    it('should create a new mirror market in database', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_001',
          flowMarketId: 123n,
          externalId: 'polymarket-test-001',
          source: 0, // Polymarket
          adjustedPrice: 5000n,
        },
        transactionHash: '0xtest001',
        blockNumber: 91000000n,
      };

      await handleMirrorMarketCreated(mockLog as any);

      const market = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_001' },
      });

      expect(market).toBeDefined();
      expect(market?.flowMarketId).toBe('123');
      expect(market?.externalId).toBe('polymarket-test-001');
      expect(market?.source).toBe('polymarket');
      expect(market?.initialPrice).toBe(5000);
      expect(market?.lastSyncPrice).toBe(5000);
      expect(market?.isActive).toBe(true);
    });

    it('should update existing market if already exists', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_001',
          flowMarketId: 123n,
          externalId: 'polymarket-test-001',
          source: 0,
          adjustedPrice: 5500n, // Different price
        },
        transactionHash: '0xtest002',
        blockNumber: 91000001n,
      };

      await handleMirrorMarketCreated(mockLog as any);

      const market = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_001' },
      });

      expect(market?.lastSyncPrice).toBe(5500); // Updated price
    });

    it('should handle Kalshi source correctly', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_002',
          flowMarketId: 124n,
          externalId: 'kalshi-test-001',
          source: 1, // Kalshi
          adjustedPrice: 4500n,
        },
        transactionHash: '0xtest003',
        blockNumber: 91000002n,
      };

      await handleMirrorMarketCreated(mockLog as any);

      const market = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_002' },
      });

      expect(market?.source).toBe('kalshi');
    });
  });

  // ============================================================================
  // MirrorTradeExecuted Event Tests
  // ============================================================================

  describe('MirrorTradeExecuted Event', () => {
    beforeAll(async () => {
      // Create a test market first
      await prisma.mirrorMarket.create({
        data: {
          mirrorKey: 'test_market_003',
          flowMarketId: '125',
          externalId: 'test-market',
          source: 'polymarket',
          initialPrice: 5000,
          lastSyncPrice: 5000,
          creator: '0xtest',
        },
      });
    });

    it('should create a trade record', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_003',
          trader: '0xTrader123',
          isYes: true,
          amount: parseEther('100'),
          tokensReceived: parseEther('95'),
        },
        transactionHash: '0xtrade001',
        blockNumber: 91000010n,
      };

      await handleMirrorTradeExecuted(mockLog as any);

      const trade = await prisma.mirrorTrade.findUnique({
        where: { txHash: '0xtrade001' },
      });

      expect(trade).toBeDefined();
      expect(trade?.mirrorKey).toBe('test_market_003');
      expect(trade?.trader).toBe('0xtrader123'); // Lowercase
      expect(trade?.isYes).toBe(true);
      expect(trade?.blockNumber).toBe(91000010);
    });

    it('should update market volume', async () => {
      const marketBefore = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_003' },
      });

      const mockLog = {
        args: {
          mirrorKey: 'test_market_003',
          trader: '0xTrader456',
          isYes: false,
          amount: parseEther('50'),
          tokensReceived: parseEther('48'),
        },
        transactionHash: '0xtrade002',
        blockNumber: 91000011n,
      };

      await handleMirrorTradeExecuted(mockLog as any);

      const marketAfter = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_003' },
      });

      // Volume should increase
      expect(BigInt(marketAfter?.totalVolume || '0')).toBeGreaterThan(
        BigInt(marketBefore?.totalVolume || '0')
      );
    });
  });

  // ============================================================================
  // MirrorPriceSynced Event Tests
  // ============================================================================

  describe('MirrorPriceSynced Event', () => {
    it('should update market price and create history', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_003',
          oldPrice: 5000n,
          newPrice: 5500n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
        transactionHash: '0xsync001',
        blockNumber: 91000020n,
      };

      await handleMirrorPriceSynced(mockLog as any);

      const market = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_003' },
      });

      expect(market?.lastSyncPrice).toBe(5500);

      const history = await prisma.priceSyncHistory.findFirst({
        where: { mirrorKey: 'test_market_003' },
        orderBy: { syncedAt: 'desc' },
      });

      expect(history).toBeDefined();
      expect(history?.oldPrice).toBe(5000);
      expect(history?.newPrice).toBe(5500);
    });
  });

  // ============================================================================
  // MirrorResolved Event Tests
  // ============================================================================

  describe('MirrorResolved Event', () => {
    beforeAll(async () => {
      // Create test trades
      await prisma.mirrorTrade.create({
        data: {
          mirrorKey: 'test_market_003',
          trader: '0xtrader789',
          isYes: true,
          amount: '1000000000000000000',
          sharesReceived: '950000000000000000',
          txHash: '0xtrade003',
          blockNumber: 91000030,
        },
      });
    });

    it('should mark market as resolved', async () => {
      const mockLog = {
        args: {
          mirrorKey: 'test_market_003',
          yesWon: true,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
        transactionHash: '0xresolve001',
        blockNumber: 91000040n,
      };

      await handleMirrorResolved(mockLog as any);

      const market = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey: 'test_market_003' },
      });

      expect(market?.isActive).toBe(false);
      expect(market?.resolved).toBe(true);
      expect(market?.yesWon).toBe(true);
      expect(market?.resolvedAt).toBeDefined();
    });

    it('should mark all trades as resolved', async () => {
      const trades = await prisma.mirrorTrade.findMany({
        where: { mirrorKey: 'test_market_003' },
      });

      trades.forEach(trade => {
        expect(trade.resolved).toBe(true);
        expect(trade.yesWon).toBe(true);
        expect(trade.resolvedAt).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('Helper Functions', () => {
    it('should get last synced block', async () => {
      const lastBlock = await getLastSyncedBlock();

      expect(lastBlock).toBeGreaterThanOrEqual(0n);

      // Should match the highest block number in our test data
      const maxBlockTrade = await prisma.mirrorTrade.findFirst({
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true },
      });

      if (maxBlockTrade) {
        expect(lastBlock).toBe(BigInt(maxBlockTrade.blockNumber));
      }
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    it('should handle complete market lifecycle', async () => {
      const mirrorKey = 'test_market_lifecycle';

      // 1. Market created
      await handleMirrorMarketCreated({
        args: {
          mirrorKey,
          flowMarketId: 999n,
          externalId: 'lifecycle-test',
          source: 0,
          adjustedPrice: 5000n,
        },
        transactionHash: '0xlifecycle001',
        blockNumber: 92000000n,
      } as any);

      let market = await prisma.mirrorMarket.findUnique({ where: { mirrorKey } });
      expect(market?.isActive).toBe(true);
      expect(market?.resolved).toBe(false);

      // 2. Trade executed
      await handleMirrorTradeExecuted({
        args: {
          mirrorKey,
          trader: '0xLifecycleTrader',
          isYes: true,
          amount: parseEther('10'),
          tokensReceived: parseEther('9.5'),
        },
        transactionHash: '0xlifecycle002',
        blockNumber: 92000001n,
      } as any);

      const trade = await prisma.mirrorTrade.findUnique({
        where: { txHash: '0xlifecycle002' },
      });
      expect(trade).toBeDefined();

      // 3. Price synced
      await handleMirrorPriceSynced({
        args: {
          mirrorKey,
          oldPrice: 5000n,
          newPrice: 6000n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
        transactionHash: '0xlifecycle003',
        blockNumber: 92000002n,
      } as any);

      market = await prisma.mirrorMarket.findUnique({ where: { mirrorKey } });
      expect(market?.lastSyncPrice).toBe(6000);

      // 4. Market resolved
      await handleMirrorResolved({
        args: {
          mirrorKey,
          yesWon: true,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
        transactionHash: '0xlifecycle004',
        blockNumber: 92000003n,
      } as any);

      market = await prisma.mirrorMarket.findUnique({ where: { mirrorKey } });
      expect(market?.isActive).toBe(false);
      expect(market?.resolved).toBe(true);
      expect(market?.yesWon).toBe(true);

      // Cleanup
      await prisma.mirrorTrade.deleteMany({ where: { mirrorKey } });
      await prisma.mirrorMarket.delete({ where: { mirrorKey } });
    });
  });
});

// ============================================================================
// RPC Client Tests
// ============================================================================

describe('RPC Client', () => {
  it('should connect to Flow testnet', async () => {
    const client = createFlowPublicClient();
    const chainId = await client.getChainId();

    expect(chainId).toBe(545); // Flow testnet
  });

  it('should get current block number', async () => {
    const client = createFlowPublicClient();
    const blockNumber = await client.getBlockNumber();

    expect(blockNumber).toBeGreaterThan(90000000n); // Reasonable for Flow testnet
  });
});

// Helper function for tests
function parseEther(value: string): bigint {
  return BigInt(value) * 10n ** 18n;
}
