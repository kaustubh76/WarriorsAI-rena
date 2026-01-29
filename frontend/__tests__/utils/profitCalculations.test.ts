/**
 * Unit Tests for Arbitrage Profit Calculations
 */

import { describe, it, expect } from '@jest/globals';

describe('Arbitrage Profit Calculations', () => {
  describe('Position Allocation', () => {
    it('should allocate investment proportionally to prices', () => {
      const polyPrice = 0.45; // 45¢
      const kalshiPrice = 0.48; // 48¢
      const totalStake = 10; // CRwN

      const totalCost = polyPrice + kalshiPrice; // 0.93
      const polyAllocation = (polyPrice / totalCost) * totalStake;
      const kalshiAllocation = (kalshiPrice / totalCost) * totalStake;

      expect(polyAllocation).toBeCloseTo(4.839, 2);
      expect(kalshiAllocation).toBeCloseTo(5.161, 2);
      expect(polyAllocation + kalshiAllocation).toBeCloseTo(totalStake, 2);
    });

    it('should handle equal prices', () => {
      const polyPrice = 0.50;
      const kalshiPrice = 0.50;
      const totalStake = 10;

      const totalCost = polyPrice + kalshiPrice;
      const polyAllocation = (polyPrice / totalCost) * totalStake;
      const kalshiAllocation = (kalshiPrice / totalCost) * totalStake;

      expect(polyAllocation).toBe(5);
      expect(kalshiAllocation).toBe(5);
    });
  });

  describe('Share Calculations', () => {
    it('should calculate shares correctly', () => {
      const allocation = 4.5; // CRwN
      const price = 0.45; // 45¢

      const shares = allocation / price;

      expect(shares).toBe(10);
    });

    it('should handle decimal shares', () => {
      const allocation = 5.0;
      const price = 0.48;

      const shares = allocation / price;

      expect(shares).toBeCloseTo(10.417, 3);
    });
  });

  describe('Guaranteed Return', () => {
    it('should calculate guaranteed return for arbitrage', () => {
      const polyShares = 10;
      const kalshiShares = 10;

      // Both positions pay $1 per share
      const guaranteedReturn = Math.min(polyShares, kalshiShares);

      expect(guaranteedReturn).toBe(10);
    });

    it('should use minimum shares when unequal', () => {
      const polyShares = 10;
      const kalshiShares = 10.5;

      const guaranteedReturn = Math.min(polyShares, kalshiShares);

      expect(guaranteedReturn).toBe(10);
    });
  });

  describe('Profit Calculations', () => {
    it('should calculate expected profit correctly', () => {
      const investment = 9.3;
      const guaranteedReturn = 10;

      const profit = guaranteedReturn - investment;
      const profitPercentage = (profit / investment) * 100;

      expect(profit).toBeCloseTo(0.7, 2);
      expect(profitPercentage).toBeCloseTo(7.53, 2);
    });

    it('should handle zero profit (break even)', () => {
      const investment = 10;
      const guaranteedReturn = 10;

      const profit = guaranteedReturn - investment;

      expect(profit).toBe(0);
    });

    it('should identify loss scenarios', () => {
      // Prices sum to more than $1 - no arbitrage
      const polyPrice = 0.55;
      const kalshiPrice = 0.50;
      const investment = polyPrice + kalshiPrice; // 1.05

      const guaranteedReturn = 1.0;
      const profit = guaranteedReturn - investment;

      expect(profit).toBeLessThan(0);
    });
  });

  describe('Spread Calculations', () => {
    it('should calculate spread correctly', () => {
      const polyYes = 45;
      const polyNo = 55;
      const kalshiYes = 48;
      const kalshiNo = 52;

      // Buy Poly YES + Kalshi NO
      const cost = (polyYes + kalshiNo) / 100; // 0.97
      const spread = 1.0 - cost;
      const spreadPercent = spread * 100;

      expect(spread).toBeCloseTo(0.03, 2);
      expect(spreadPercent).toBeCloseTo(3, 1);
    });

    it('should identify no-arbitrage scenario', () => {
      const polyYes = 52;
      const kalshiNo = 50;

      const cost = (polyYes + kalshiNo) / 100;
      const spread = 1.0 - cost;

      expect(spread).toBeLessThan(0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should match example from documentation', () => {
      // Example: 10 CRwN investment, 7.5% profit
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

      expect(profit).toBeCloseTo(0.753, 2);
      expect(profitPercent).toBeCloseTo(7.53, 1);
    });

    it('should handle high-profit opportunity', () => {
      // 15% spread
      const polyPrice = 40 / 100;
      const kalshiPrice = 45 / 100;
      const totalStake = 100;

      const totalCost = polyPrice + kalshiPrice; // 0.85
      const polyAllocation = (polyPrice / totalCost) * totalStake;
      const kalshiAllocation = (kalshiPrice / totalCost) * totalStake;

      const polyShares = polyAllocation / polyPrice;
      const kalshiShares = kalshiAllocation / kalshiPrice;

      const guaranteedReturn = Math.min(polyShares, kalshiShares);
      const profit = guaranteedReturn - totalStake;
      const profitPercent = (profit / totalStake) * 100;

      expect(profitPercent).toBeGreaterThan(15);
      expect(profitPercent).toBeCloseTo(17.65, 1);
    });
  });

  describe('BigInt Conversions', () => {
    it('should convert wei to CRwN correctly', () => {
      const weiAmount = BigInt(10 * 10 ** 18);
      const crwnAmount = Number(weiAmount) / 1e18;

      expect(crwnAmount).toBe(10);
    });

    it('should convert CRwN to wei correctly', () => {
      const crwnAmount = 10.5;
      const weiAmount = BigInt(Math.floor(crwnAmount * 1e18));

      expect(weiAmount).toBe(BigInt(105 * 10 ** 17));
    });

    it('should handle fractional CRwN amounts', () => {
      const crwnAmount = 0.7;
      const weiAmount = BigInt(Math.floor(crwnAmount * 1e18));
      const backToCrwn = Number(weiAmount) / 1e18;

      expect(backToCrwn).toBe(0.7);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small stakes', () => {
      const polyPrice = 0.45;
      const kalshiPrice = 0.48;
      const totalStake = 0.1; // 0.1 CRwN

      const totalCost = polyPrice + kalshiPrice;
      const polyAllocation = (polyPrice / totalCost) * totalStake;
      const kalshiAllocation = (kalshiPrice / totalCost) * totalStake;

      expect(polyAllocation + kalshiAllocation).toBeCloseTo(totalStake, 10);
    });

    it('should handle very large stakes', () => {
      const polyPrice = 0.45;
      const kalshiPrice = 0.48;
      const totalStake = 1000000; // 1M CRwN

      const totalCost = polyPrice + kalshiPrice;
      const profit = totalStake * (1 - totalCost);

      expect(profit).toBeCloseTo(75300, 0);
    });

    it('should handle extreme price scenarios', () => {
      // Very cheap YES, very cheap NO
      const polyPrice = 0.01; // 1¢
      const kalshiPrice = 0.02; // 2¢
      const totalStake = 10;

      const totalCost = polyPrice + kalshiPrice; // 0.03
      const profit = totalStake * (1 - totalCost);
      const profitPercent = (profit / totalStake) * 100;

      expect(profitPercent).toBeGreaterThan(900); // 970% profit!
    });
  });
});
