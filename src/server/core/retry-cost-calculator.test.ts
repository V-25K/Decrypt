import { describe, it, expect, beforeEach } from 'vitest';
import { RetryCostCalculator, type RetryCostConfig } from '../../shared/retry-cost-calculator';

describe('RetryCostCalculator', () => {
  let calculator: RetryCostCalculator;

  beforeEach(() => {
    calculator = new RetryCostCalculator();
  });

  describe('constructor', () => {
    it('should use default configuration', () => {
      const config = calculator.getConfig();
      expect(config).toEqual({
        maxRetryCoins: 140,
        scalingType: 'linear',
        difficultyMultiplier: 1.2
      });
    });

    it('should allow custom configuration', () => {
      const customConfig: Partial<RetryCostConfig> = {
        maxRetryCoins: 100,
        difficultyMultiplier: 1.5
      };
      
      const customCalculator = new RetryCostCalculator(customConfig);
      const config = customCalculator.getConfig();
      
      expect(config.maxRetryCoins).toBe(100);
      expect(config.difficultyMultiplier).toBe(1.5);
      expect(config.scalingType).toBe('linear'); // Default value
    });
  });

  describe('calculateRetryCost', () => {
    it('should calculate linear retry costs', () => {
      // Base cost is 35 coins per puzzle
      expect(calculator.calculateRetryCost(0, 5)).toBe(35); // First retry: 35 * 1
      expect(calculator.calculateRetryCost(1, 5)).toBe(70); // Second retry: 35 * 2
      expect(calculator.calculateRetryCost(2, 5)).toBe(105); // Third retry: 35 * 3
      expect(calculator.calculateRetryCost(3, 5)).toBe(140); // Fourth retry: 35 * 4 (capped at max)
    });

    it('should apply difficulty adjustments', () => {
      // Difficulty 5 is baseline (no adjustment)
      const baseCost = calculator.calculateRetryCost(0, 5);
      
      // Higher difficulty should cost more
      const hardCost = calculator.calculateRetryCost(0, 10);
      expect(hardCost).toBeGreaterThan(baseCost);
      
      // Lower difficulty should cost less
      const easyCost = calculator.calculateRetryCost(0, 1);
      expect(easyCost).toBeLessThan(baseCost);
    });

    it('should cap costs at maximum retry coins', () => {
      // Even with very high retry counts, should not exceed max
      expect(calculator.calculateRetryCost(10, 5)).toBe(140);
      expect(calculator.calculateRetryCost(100, 5)).toBe(140);
    });

    it('should handle edge cases', () => {
      // Zero retries should still cost something (first retry)
      expect(calculator.calculateRetryCost(0, 5)).toBe(35);
      
      // Negative retry counts clamp to the first retry.
      expect(calculator.calculateRetryCost(-1, 5)).toBe(35);
    });

    it('should handle extreme difficulty values', () => {
      // Very easy puzzle (difficulty 1)
      const veryEasyCost = calculator.calculateRetryCost(0, 1);
      expect(veryEasyCost).toBeGreaterThan(0);
      expect(veryEasyCost).toBeLessThan(35);
      
      // Very hard puzzle (difficulty 10)
      const veryHardCost = calculator.calculateRetryCost(0, 10);
      expect(veryHardCost).toBeGreaterThan(35);
      expect(veryHardCost).toBeLessThanOrEqual(140);
    });
  });

  describe('getMaxCostForRetries', () => {
    it('should ensure 3 retries never exceed 6 puzzle completions', () => {
      const maxCost = calculator.getMaxCostForRetries(3, 5);
      expect(maxCost).toBeLessThanOrEqual(210); // 6 * 35 coins
    });

    it('should calculate cumulative costs correctly', () => {
      const cost0 = calculator.calculateRetryCost(0, 5); // 35
      const cost1 = calculator.calculateRetryCost(1, 5); // 70
      const cost2 = calculator.calculateRetryCost(2, 5); // 105
      
      const totalCost = calculator.getMaxCostForRetries(2, 5);
      expect(totalCost).toBe(cost0 + cost1 + cost2); // 35 + 70 + 105 = 210
    });

    it('should respect the 210 coin cap for multiple retries', () => {
      // Even with many retries, should not exceed 210 coins total
      const manyCost = calculator.getMaxCostForRetries(10, 5);
      expect(manyCost).toBeLessThanOrEqual(210);
    });
  });

  describe('getNextRetryCost', () => {
    it('should calculate next retry cost correctly', () => {
      expect(calculator.getNextRetryCost(0, 5)).toBe(70); // Next after 0 is retry 1
      expect(calculator.getNextRetryCost(1, 5)).toBe(105); // Next after 1 is retry 2
      expect(calculator.getNextRetryCost(2, 5)).toBe(140); // Next after 2 is retry 3
    });
  });

  describe('canAffordRetry', () => {
    it('should correctly determine affordability', () => {
      expect(calculator.canAffordRetry(100, 0, 5)).toBe(true); // 100 coins >= 35 cost
      expect(calculator.canAffordRetry(30, 0, 5)).toBe(false); // 30 coins < 35 cost
      expect(calculator.canAffordRetry(150, 1, 5)).toBe(true); // 150 coins >= 70 cost
      expect(calculator.canAffordRetry(60, 1, 5)).toBe(false); // 60 coins < 70 cost
    });
  });

  describe('getCostBreakdown', () => {
    it('should provide detailed cost breakdown', () => {
      const breakdown = calculator.getCostBreakdown(3, 5);
      
      expect(breakdown).toHaveLength(4); // 0, 1, 2, 3 retries
      expect(breakdown[0]).toEqual({
        retryNumber: 0,
        cost: 35,
        cumulativeCost: 35
      });
      expect(breakdown[1]).toEqual({
        retryNumber: 1,
        cost: 70,
        cumulativeCost: 105
      });
      expect(breakdown[2]).toEqual({
        retryNumber: 2,
        cost: 105,
        cumulativeCost: 210
      });
      expect(breakdown[3]).toEqual({
        retryNumber: 3,
        cost: 140,
        cumulativeCost: 350 // Would be capped in actual usage
      });
    });

    it('should handle single retry breakdown', () => {
      const breakdown = calculator.getCostBreakdown(0, 5);
      
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0]).toEqual({
        retryNumber: 0,
        cost: 35,
        cumulativeCost: 35
      });
    });
  });

  describe('requirement validation', () => {
    it('should satisfy Requirement 5.1: maximum retry cost at 4 puzzles worth', () => {
      // Maximum single retry cost should be 4 * 35 = 140 coins
      const maxSingleCost = calculator.calculateRetryCost(100, 10); // Extreme case
      expect(maxSingleCost).toBe(140);
    });

    it('should satisfy Requirement 5.2: linear scaling formula', () => {
      // Costs should increase linearly, not exponentially
      const cost0 = calculator.calculateRetryCost(0, 5);
      const cost1 = calculator.calculateRetryCost(1, 5);
      const cost2 = calculator.calculateRetryCost(2, 5);
      
      // Linear progression: each retry costs base * (retry + 1)
      expect(cost1).toBe(cost0 * 2);
      expect(cost2).toBe(cost0 * 3);
    });

    it('should satisfy Requirement 5.3: 3 retries cost no more than 6 puzzle completions', () => {
      // 3 retries should cost no more than 6 * 35 = 210 coins
      const totalCost = calculator.getMaxCostForRetries(3, 5);
      expect(totalCost).toBeLessThanOrEqual(210);
    });

    it('should satisfy Requirement 5.4: difficulty consideration in pricing', () => {
      const easyCost = calculator.calculateRetryCost(0, 1);
      const normalCost = calculator.calculateRetryCost(0, 5);
      const hardCost = calculator.calculateRetryCost(0, 10);
      
      // Costs should vary based on difficulty
      expect(easyCost).toBeLessThan(normalCost);
      expect(normalCost).toBeLessThan(hardCost);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical gameplay scenarios', () => {
      // Player with 200 coins trying different retries
      expect(calculator.canAffordRetry(200, 0, 5)).toBe(true); // Can afford first retry (35)
      expect(calculator.canAffordRetry(200, 1, 5)).toBe(true); // Can afford second retry (70)
      expect(calculator.canAffordRetry(200, 2, 5)).toBe(true); // Can afford third retry (105)
      expect(calculator.canAffordRetry(200, 3, 5)).toBe(true); // Can afford fourth retry (140)
    });

    it('should handle edge case with minimal coins', () => {
      // Player with exactly enough coins for one retry
      expect(calculator.canAffordRetry(35, 0, 5)).toBe(true);
      expect(calculator.canAffordRetry(34, 0, 5)).toBe(false);
    });

    it('should provide consistent cost calculations', () => {
      // Same inputs should always produce same outputs
      const cost1 = calculator.calculateRetryCost(2, 7);
      const cost2 = calculator.calculateRetryCost(2, 7);
      expect(cost1).toBe(cost2);
    });
  });
});
