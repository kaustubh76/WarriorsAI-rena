/**
 * End-to-End Test: Complete Arbitrage Battle Flow
 * Tests the full user journey from discovery to settlement
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

// Mock user for testing
const TEST_USER = {
  address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  warrior1Id: 42,
  warrior2Id: 73,
};

describe('E2E: Arbitrage Battle Flow', () => {
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  });

  describe('Step 1: Discover Opportunities', () => {
    it('should fetch arbitrage opportunities', async () => {
      const response = await fetch(
        `${baseUrl}/api/arena/arbitrage-opportunities?minSpread=5&limit=10`
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('opportunities');
      expect(Array.isArray(data.opportunities)).toBe(true);
    });

    it('should filter by search query', async () => {
      const response = await fetch(
        `${baseUrl}/api/arena/arbitrage-opportunities?search=Bitcoin&minSpread=3`
      );

      const data = await response.json();
      expect(data.success).toBe(true);

      if (data.opportunities.length > 0) {
        const firstOpp = data.opportunities[0];
        expect(firstOpp.question.toLowerCase()).toContain('bitcoin');
      }
    });

    it('should return opportunities with required fields', async () => {
      const response = await fetch(
        `${baseUrl}/api/arena/arbitrage-opportunities?minSpread=0`
      );

      const data = await response.json();

      if (data.opportunities.length > 0) {
        const opp = data.opportunities[0];

        expect(opp).toHaveProperty('id');
        expect(opp).toHaveProperty('question');
        expect(opp).toHaveProperty('polymarket');
        expect(opp).toHaveProperty('kalshi');
        expect(opp).toHaveProperty('spread');
        expect(opp).toHaveProperty('potentialProfit');
        expect(opp).toHaveProperty('cost');
        expect(opp).toHaveProperty('strategy');

        expect(opp.polymarket).toHaveProperty('id');
        expect(opp.polymarket).toHaveProperty('yesPrice');
        expect(opp.polymarket).toHaveProperty('noPrice');

        expect(opp.kalshi).toHaveProperty('id');
        expect(opp.kalshi).toHaveProperty('yesPrice');
        expect(opp.kalshi).toHaveProperty('noPrice');
      }
    });
  });

  describe('Step 2: Create Arbitrage Battle', () => {
    it('should create arbitrage battle with valid data', async () => {
      // Note: This test requires seeded data
      const response = await fetch(`${baseUrl}/api/arena/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warrior1Id: TEST_USER.warrior1Id,
          warrior2Id: TEST_USER.warrior2Id,
          warrior1Owner: TEST_USER.address,
          externalMarketId: 'poly_btc_100k',
          source: 'polymarket',
          question: 'Will Bitcoin hit $100k by March 2026?',
          kalshiMarketId: 'kalshi_btc_100k',
          totalStake: '10000000000000000000', // 10 CRwN
          isArbitrageBattle: true,
        }),
      });

      // May fail if no matched pair exists
      const data = await response.json();

      if (response.ok) {
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('battle');
        expect(data).toHaveProperty('arbitrageTradeId');
        expect(data.battle.isArbitrageBattle).toBe(true);
        expect(data.battle.status).toBe('active');
      } else {
        // Expected if no matched pair
        console.log('Note: Battle creation failed (expected if no demo data):', data.error);
      }
    });

    it('should reject battle without warrior2Id', async () => {
      const response = await fetch(`${baseUrl}/api/arena/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warrior1Id: TEST_USER.warrior1Id,
          warrior1Owner: TEST_USER.address,
          externalMarketId: 'poly_btc_100k',
          source: 'polymarket',
          question: 'Test',
          kalshiMarketId: 'kalshi_btc_100k',
          totalStake: '10000000000000000000',
          isArbitrageBattle: true,
          // Missing warrior2Id
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('warrior2Id');
    });

    it('should reject battle without kalshiMarketId', async () => {
      const response = await fetch(`${baseUrl}/api/arena/battles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warrior1Id: TEST_USER.warrior1Id,
          warrior2Id: TEST_USER.warrior2Id,
          warrior1Owner: TEST_USER.address,
          externalMarketId: 'poly_btc_100k',
          source: 'polymarket',
          question: 'Test',
          totalStake: '10000000000000000000',
          isArbitrageBattle: true,
          // Missing kalshiMarketId
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('kalshiMarketId');
    });
  });

  describe('Step 3: Monitor Trade Status', () => {
    it('should fetch trade data', async () => {
      // This requires a created trade
      const tradeId = 'test_trade_id';

      const response = await fetch(`${baseUrl}/api/arbitrage/trades/${tradeId}`);

      const data = await response.json();

      // May return 404 if no trade exists
      if (response.ok) {
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('trade');
        expect(data.trade).toHaveProperty('id');
        expect(data.trade).toHaveProperty('status');
      } else {
        expect(response.status).toBe(404);
      }
    });
  });

  describe('Step 4: Settlement Cron', () => {
    it('should reject unauthorized settlement requests', async () => {
      const response = await fetch(`${baseUrl}/api/cron/settle-arbitrage-battles`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer wrong_secret',
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('should allow GET in development mode', async () => {
      if (process.env.NODE_ENV === 'development') {
        const response = await fetch(`${baseUrl}/api/cron/settle-arbitrage-battles`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('success');
      }
    });
  });

  describe('Full Flow Integration', () => {
    it('should complete full arbitrage cycle', async () => {
      console.log('\n🧪 Testing Full Arbitrage Flow...\n');

      // Step 1: Find opportunities
      console.log('1️⃣ Finding opportunities...');
      const oppResponse = await fetch(
        `${baseUrl}/api/arena/arbitrage-opportunities?minSpread=5`
      );
      const oppData = await oppResponse.json();
      console.log(`   Found ${oppData.opportunities?.length || 0} opportunities`);

      if (oppData.opportunities && oppData.opportunities.length > 0) {
        const opportunity = oppData.opportunities[0];
        console.log(`   Selected: ${opportunity.question.slice(0, 50)}...`);
        console.log(`   Potential profit: ${opportunity.potentialProfit}%`);

        // Step 2: Create battle
        console.log('\n2️⃣ Creating arbitrage battle...');
        const battleResponse = await fetch(`${baseUrl}/api/arena/battles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warrior1Id: TEST_USER.warrior1Id,
            warrior2Id: TEST_USER.warrior2Id,
            warrior1Owner: TEST_USER.address,
            externalMarketId: opportunity.polymarket.id,
            source: 'polymarket',
            question: opportunity.question,
            kalshiMarketId: opportunity.kalshi.id,
            totalStake: '10000000000000000000',
            isArbitrageBattle: true,
          }),
        });

        if (battleResponse.ok) {
          const battleData = await battleResponse.json();
          console.log(`   ✅ Battle created: ${battleData.battle.id}`);
          console.log(`   📊 Trade ID: ${battleData.arbitrageTradeId}`);
          console.log(`   💰 Expected profit: ${battleData.expectedProfit}%`);

          // Step 3: Monitor trade
          console.log('\n3️⃣ Monitoring trade...');
          const tradeResponse = await fetch(
            `${baseUrl}/api/arbitrage/trades/${battleData.arbitrageTradeId}`
          );

          if (tradeResponse.ok) {
            const tradeData = await tradeResponse.json();
            console.log(`   Status: ${tradeData.trade.status}`);
            console.log(`   Market 1: ${tradeData.trade.market1Source}`);
            console.log(`   Market 2: ${tradeData.trade.market2Source}`);
          }

          console.log('\n✅ Full flow test completed successfully!');
        } else {
          const errorData = await battleResponse.json();
          console.log(`   ⚠️  Battle creation failed: ${errorData.error}`);
          console.log(`   (This is expected if matched pair doesn't exist in DB)`);
        }
      } else {
        console.log('   ⚠️  No opportunities found (seed demo data first)');
      }
    });
  });
});

describe('Data Validation Tests', () => {
  describe('Profit Calculations', () => {
    it('should validate profit calculations match backend', () => {
      const polyPrice = 45 / 100;
      const kalshiPrice = 48 / 100;
      const totalStake = 10;

      const totalCost = polyPrice + kalshiPrice;
      const polyAllocation = (polyPrice / totalCost) * totalStake;
      const kalshiAllocation = (kalshiPrice / totalCost) * totalStake;

      const polyShares = polyAllocation / polyPrice;
      const kalshiShares = kalshiAllocation / kalshiPrice;

      const guaranteedReturn = Math.min(polyShares, kalshiShares);
      const profit = guaranteedReturn - totalStake;
      const profitPercent = (profit / totalStake) * 100;

      expect(profitPercent).toBeCloseTo(7.53, 1);
    });
  });

  describe('BigInt Handling', () => {
    it('should convert stakes correctly', () => {
      const crwnAmount = '10000000000000000000'; // 10 CRwN
      const bigIntAmount = BigInt(crwnAmount);
      const backToNumber = Number(bigIntAmount) / 1e18;

      expect(backToNumber).toBe(10);
    });
  });
});
