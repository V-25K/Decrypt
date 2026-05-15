/**
 * Property-Based Test: Retry Cost Calculation Correctness
 * 
 * **Feature: game-performance-and-balance-improvements, Property 5: Retry Cost Calculation Correctness**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 * 
 * Property 5: For any puzzle retry scenario, the cost calculation system SHALL enforce 
 * a maximum cost of 4 puzzles worth of coins using linear scaling AND ensure 3 retries 
 * on any puzzle cost no more than 6 puzzle completions AND scale costs appropriately 
 * based on puzzle difficulty.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RetryCostCalculator, type RetryCostConfig } from '../../shared/retry-cost-calculator';
import { propertyTestConfig } from '../../shared/property-testing';

describe('Property 5: Retry Cost Calculation Correctness', () => {
  /**
   * Property Test: Maximum Cost Enforcement (Requirement 5.1)
   * 
   * For any retry scenario, the system SHALL enforce maximum cost of 4 puzzles worth of coins
   */
  it('Property 5.1: SHALL enforce maximum cost of 4 puzzles worth of coins', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          retryCount: fc.integer({ min: 0, max: 100 }),
          difficulty: fc.integer({ min: 1, max: 10 }),
          maxRetryCoins: fc.integer({ min: 100, max: 200 })
        }),
        ({ retryCount, difficulty, maxRetryCoins }) => {
          const calculator = new RetryCostCalculator({ maxRetryCoins });
          const cost = calculator.calculateRetryCost(retryCount, difficulty);
          
          // Property: Cost never exceeds configured maximum
          if (cost > maxRetryCoins) return false;
          
          // Property: Cost is always positive
          if (cost <= 0) return false;
          
          // Property: For default config, max cost is 140 coins (4 * 35)
          if (maxRetryCoins === 140 && cost > 140) return false;
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Linear Scaling Formula (Requirement 5.2)
   * 
   * The system SHALL use linear scaling instead of exponential
   */
  it('Property 5.2: SHALL use linear scaling formula instead of exponential', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          maxRetries: fc.integer({ min: 1, max: 5 })
        }),
        ({ difficulty, maxRetries }) => {
          const calculator = new RetryCostCalculator();
          
          // Test linear progression for first few retries
          const costs = [];
          for (let i = 0; i < Math.min(maxRetries, 3); i++) {
            costs.push(calculator.calculateRetryCost(i, difficulty));
          }
          
          if (costs.length < 2) return true; // Need at least 2 costs to test linearity
          
          // Property: Linear scaling means cost[n] = baseCost * (n + 1) * difficultyFactor
          // The ratio between consecutive costs should be consistent with linear scaling
          const baseCost = costs[0];
          
          for (let i = 1; i < costs.length; i++) {
            const expectedRatio = (i + 1) / 1; // Linear ratio
            const actualRatio = costs[i] / baseCost;
            
            // Allow for difficulty adjustments and rounding, but should be roughly linear
            const tolerance = 0.5; // Allow some variance due to difficulty multiplier
            const lowerBound = expectedRatio - tolerance;
            const upperBound = expectedRatio + tolerance;
            
            if (actualRatio < lowerBound || actualRatio > upperBound) {
              // Check if this is due to hitting the maximum cost cap
              const maxCost = calculator.getConfig().maxRetryCoins;
              if (costs[i] < maxCost) {
                return false; // Not capped, so should follow linear scaling
              }
            }
          }
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Three Retries Cost Limit (Requirement 5.3)
   * 
   * 3 retries on any puzzle SHALL cost no more than 6 puzzle completions
   */
  it('Property 5.3: SHALL ensure 3 retries cost no more than 6 puzzle completions', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          customConfig: fc.record({
            maxRetryCoins: fc.integer({ min: 100, max: 300 }),
            difficultyMultiplier: fc.float({ min: 1.0, max: 2.0 })
          })
        }),
        ({ difficulty, customConfig }) => {
          const calculator = new RetryCostCalculator(customConfig);
          const totalCost = calculator.getMaxCostForRetries(3, difficulty);
          
          // Property: 3 retries never exceed 6 puzzle completions (210 coins)
          if (totalCost > 210) return false;
          
          // Property: Total cost is always positive
          if (totalCost <= 0) return false;
          
          // Property: Total cost should be at least the cost of the first retry
          const firstRetryCost = calculator.calculateRetryCost(0, difficulty);
          if (totalCost < firstRetryCost) return false;
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Difficulty-Based Cost Scaling (Requirement 5.4)
   * 
   * Costs SHALL scale appropriately based on puzzle difficulty
   */
  it('Property 5.4: SHALL scale costs appropriately based on puzzle difficulty', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          retryCount: fc.integer({ min: 0, max: 5 }),
          easyDifficulty: fc.integer({ min: 1, max: 3 }),
          hardDifficulty: fc.integer({ min: 7, max: 10 }),
          difficultyMultiplier: fc.float({ min: 1.1, max: 2.0 })
        }),
        ({ retryCount, easyDifficulty, hardDifficulty, difficultyMultiplier }) => {
          const calculator = new RetryCostCalculator({ difficultyMultiplier });
          
          const easyCost = calculator.calculateRetryCost(retryCount, easyDifficulty);
          const normalCost = calculator.calculateRetryCost(retryCount, 5); // Baseline difficulty
          const hardCost = calculator.calculateRetryCost(retryCount, hardDifficulty);
          
          // Property: Harder puzzles should cost more (unless capped)
          const maxCost = calculator.getConfig().maxRetryCoins;
          
          // If not hitting the cap, difficulty should affect cost
          if (hardCost < maxCost && normalCost < maxCost) {
            if (hardCost <= normalCost) return false;
          }
          
          if (easyCost < maxCost && normalCost < maxCost) {
            if (easyCost >= normalCost) return false;
          }
          
          // Property: All costs are positive
          if (easyCost <= 0 || normalCost <= 0 || hardCost <= 0) return false;
          
          // Property: All costs respect the maximum
          if (easyCost > maxCost || normalCost > maxCost || hardCost > maxCost) return false;
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Cost Consistency and Monotonicity
   * 
   * Costs should be consistent and generally increase with retry count
   */
  it('Property 5: Cost calculations should be consistent and monotonic', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          maxRetries: fc.integer({ min: 2, max: 8 })
        }),
        ({ difficulty, maxRetries }) => {
          const calculator = new RetryCostCalculator();
          
          let previousCost = 0;
          for (let retry = 0; retry < maxRetries; retry++) {
            const currentCost = calculator.calculateRetryCost(retry, difficulty);
            
            // Property: Costs are consistent (same inputs = same outputs)
            const duplicateCost = calculator.calculateRetryCost(retry, difficulty);
            if (currentCost !== duplicateCost) return false;
            
            // Property: Costs generally increase or stay same (due to cap)
            if (currentCost < previousCost) return false;
            
            // Property: Costs are positive
            if (currentCost <= 0) return false;
            
            previousCost = currentCost;
          }
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Affordability Logic
   * 
   * The affordability check should be consistent with cost calculations
   */
  it('Property 5: Affordability logic should be consistent with cost calculations', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          coins: fc.integer({ min: 0, max: 500 }),
          retryCount: fc.integer({ min: 0, max: 10 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ coins, retryCount, difficulty }) => {
          const calculator = new RetryCostCalculator();
          
          const cost = calculator.calculateRetryCost(retryCount, difficulty);
          const canAfford = calculator.canAffordRetry(coins, retryCount, difficulty);
          
          // Property: Affordability should match cost comparison
          const expectedAffordability = coins >= cost;
          if (canAfford !== expectedAffordability) return false;
          
          // Property: If can afford, coins should be >= cost
          if (canAfford && coins < cost) return false;
          
          // Property: If cannot afford, coins should be < cost
          if (!canAfford && coins >= cost) return false;
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Cost Breakdown Accuracy
   * 
   * Cost breakdown should accurately reflect individual retry costs
   */
  it('Property 5: Cost breakdown should accurately reflect individual retry costs', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 6 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ maxRetries, difficulty }) => {
          const calculator = new RetryCostCalculator();
          const breakdown = calculator.getCostBreakdown(maxRetries, difficulty);
          
          // Property: Breakdown should have correct length
          if (breakdown.length !== maxRetries + 1) return false;
          
          let expectedCumulative = 0;
          for (let i = 0; i <= maxRetries; i++) {
            const entry = breakdown[i];
            
            // Property: Retry number should match index
            if (entry.retryNumber !== i) return false;
            
            // Property: Individual cost should match calculator
            const expectedCost = calculator.calculateRetryCost(i, difficulty);
            if (entry.cost !== expectedCost) return false;
            
            // Property: Cumulative cost should be accurate
            expectedCumulative += expectedCost;
            if (entry.cumulativeCost !== expectedCumulative) return false;
            
            // Property: Cumulative should be >= individual cost
            if (entry.cumulativeCost < entry.cost) return false;
          }
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Edge Cases and Boundary Conditions
   * 
   * System should handle edge cases gracefully
   */
  it('Property 5: Should handle edge cases and boundary conditions correctly', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          extremeDifficulty: fc.oneof(
            fc.constant(1), // Minimum difficulty
            fc.constant(10), // Maximum difficulty
            fc.integer({ min: 1, max: 10 }) // Random difficulty
          ),
          extremeRetry: fc.oneof(
            fc.constant(0), // First retry
            fc.constant(100), // Very high retry count
            fc.integer({ min: 0, max: 20 }) // Random retry count
          )
        }),
        ({ extremeDifficulty, extremeRetry }) => {
          const calculator = new RetryCostCalculator();
          
          try {
            const cost = calculator.calculateRetryCost(extremeRetry, extremeDifficulty);
            
            // Property: Should always return a valid cost
            if (cost <= 0) return false;
            if (!Number.isFinite(cost)) return false;
            if (cost > calculator.getConfig().maxRetryCoins) return false;
            
            // Property: Should be able to check affordability
            const canAfford = calculator.canAffordRetry(1000, extremeRetry, extremeDifficulty);
            if (typeof canAfford !== 'boolean') return false;
            
            return true;
          } catch (error) {
            // Only acceptable error is negative retry count
            if (extremeRetry < 0 && error instanceof Error && error.message.includes('negative')) {
              return true;
            }
            return false; // Unexpected error
          }
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });
});
