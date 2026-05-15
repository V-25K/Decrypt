/**
 * Property-Based Test: Score Penalty Calculation Correctness
 * 
 * **Feature: game-performance-and-balance-improvements, Property 6: Score Penalty Calculation Correctness**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 * 
 * Property 6: For any puzzle retry scenario, the score penalty system SHALL enforce 
 * a maximum penalty of 25% using logarithmic scaling AND apply penalties only to 
 * current puzzle (not cumulative) AND implement first-retry-free policy.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ScorePenaltyEngine, type ScorePenaltyConfig } from '../../shared/score-penalty-engine';
import { propertyTestConfig } from '../../shared/property-testing';

describe('Property 6: Score Penalty Calculation Correctness', () => {
  /**
   * Property Test: Maximum Penalty Enforcement (Requirement 6.1)
   * 
   * For any retry scenario, the system SHALL enforce maximum penalty of 25%
   */
  it('Property 6.1: SHALL enforce maximum penalty of 25%', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          retryCount: fc.integer({ min: 0, max: 20 }),
          originalScore: fc.integer({ min: 1, max: 10000 }),
          maxPenalty: fc.float({ min: 0.1, max: 0.5 })
        }),
        ({ retryCount, originalScore, maxPenalty }) => {
          const engine = new ScorePenaltyEngine({ maxPenalty });
          const penaltyFactor = engine.calculatePenaltyFactor(retryCount);
          
          // Property: Penalty factor should never go below (1 - maxPenalty)
          const minFactor = 1.0 - maxPenalty;
          if (penaltyFactor < minFactor) return false;
          
          // Property: For default config, penalty never exceeds 25%
          if (maxPenalty === 0.25 && penaltyFactor < 0.75) return false;
          
          // Property: Applied penalty should respect the factor
          const finalScore = engine.applyPenalty(originalScore, retryCount);
          const expectedMinScore = Math.round(originalScore * minFactor);
          if (finalScore < expectedMinScore) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Logarithmic Scaling (Requirement 6.2)
   * 
   * The system SHALL use logarithmic penalty curve instead of linear compounding
   */
  it('Property 6.2: SHALL use logarithmic penalty curve', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          maxRetries: fc.integer({ min: 2, max: 10 }),
          originalScore: fc.integer({ min: 100, max: 5000 })
        }),
        ({ maxRetries, originalScore }) => {
          const engine = new ScorePenaltyEngine();
          
          // Test logarithmic progression for retries
          const penalties = [];
          for (let i = 0; i < Math.min(maxRetries, 5); i++) {
            const factor = engine.calculatePenaltyFactor(i);
            const penalty = 1.0 - factor;
            penalties.push(penalty);
          }
          
          // Property: Penalties should increase but at decreasing rate (logarithmic)
          for (let i = 2; i < penalties.length - 1; i++) {
            const diff1 = penalties[i] - penalties[i - 1];
            const diff2 = penalties[i + 1] - penalties[i];
            
            // Logarithmic: rate of increase should decrease
            if (diff2 > diff1 * 1.1) return false; // Allow small tolerance
          }
          
          // Property: Should not be linear (constant differences)
          if (penalties.length >= 4) {
            const diff1 = penalties[2] - penalties[1];
            const diff2 = penalties[3] - penalties[2];
            
            // Should not be exactly linear (with tolerance)
            if (Math.abs(diff1 - diff2) < 0.001) return false;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Current Puzzle Only (Requirement 6.3)
   * 
   * Penalties SHALL apply only to current puzzle, not cumulative across puzzles
   */
  it('Property 6.3: SHALL apply penalties only to current puzzle', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          retryCount: fc.integer({ min: 0, max: 8 }),
          score1: fc.integer({ min: 100, max: 2000 }),
          score2: fc.integer({ min: 100, max: 2000 }),
          score3: fc.integer({ min: 100, max: 2000 })
        }),
        ({ retryCount, score1, score2, score3 }) => {
          const engine = new ScorePenaltyEngine();
          
          // Simulate three separate puzzles with same retry count
          const finalScore1 = engine.applyPenalty(score1, retryCount);
          const finalScore2 = engine.applyPenalty(score2, retryCount);
          const finalScore3 = engine.applyPenalty(score3, retryCount);
          
          // Property: Penalty factor should be same for all puzzles
          const factor1 = finalScore1 / score1;
          const factor2 = finalScore2 / score2;
          const factor3 = finalScore3 / score3;
          
          // Allow for rounding differences
          const tolerance = 0.01;
          if (Math.abs(factor1 - factor2) > tolerance) return false;
          if (Math.abs(factor2 - factor3) > tolerance) return false;
          
          // Property: Each puzzle is penalized independently
          const expectedFactor = engine.calculatePenaltyFactor(retryCount);
          if (Math.abs(factor1 - expectedFactor) > tolerance) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: First Retry Free Policy (Requirement 6.4)
   * 
   * The system SHALL implement first-retry-free policy
   */
  it('Property 6.4: SHALL implement first-retry-free policy', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          originalScore: fc.integer({ min: 50, max: 5000 }),
          firstRetryFree: fc.boolean()
        }),
        ({ originalScore, firstRetryFree }) => {
          const engine = new ScorePenaltyEngine({ firstRetryFree });
          
          // Property: No retries should have no penalty
          const noRetryFactor = engine.calculatePenaltyFactor(0);
          if (noRetryFactor !== 1.0) return false;
          
          // Property: First retry behavior depends on config
          const firstRetryFactor = engine.calculatePenaltyFactor(1);
          if (firstRetryFree) {
            if (firstRetryFactor !== 1.0) return false;
          }
          
          // Property: Second retry should have penalty if first retry is free
          if (firstRetryFree) {
            const secondRetryFactor = engine.calculatePenaltyFactor(2);
            if (secondRetryFactor >= 1.0) return false;
          }
          
          // Property: Applied scores should match factors
          const noRetryScore = engine.applyPenalty(originalScore, 0);
          if (noRetryScore !== originalScore) return false;
          
          if (firstRetryFree) {
            const firstRetryScore = engine.applyPenalty(originalScore, 1);
            if (firstRetryScore !== originalScore) return false;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Penalty Consistency and Monotonicity
   * 
   * Penalty factors should be consistent and penalties should increase monotonically
   */
  it('Property 6: Penalty factors should be consistent and monotonic', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 15 }),
          originalScore: fc.integer({ min: 10, max: 8000 })
        }),
        ({ maxRetries, originalScore }) => {
          const engine = new ScorePenaltyEngine();
          
          let previousFactor = 1.0;
          for (let retry = 0; retry < maxRetries; retry++) {
            const currentFactor = engine.calculatePenaltyFactor(retry);
            
            // Property: Factors are consistent (same inputs = same outputs)
            const duplicateFactor = engine.calculatePenaltyFactor(retry);
            if (currentFactor !== duplicateFactor) return false;
            
            // Property: Factors should be between 0.75 and 1.0
            if (currentFactor < 0.75 || currentFactor > 1.0) return false;
            
            // Property: Factors should decrease or stay same (penalties increase)
            if (currentFactor > previousFactor) return false;
            
            // Property: Applied penalty should match factor
            const penalizedScore = engine.applyPenalty(originalScore, retry);
            const expectedScore = Math.round(originalScore * currentFactor);
            if (Math.abs(penalizedScore - expectedScore) > 1) return false; // Allow rounding
            
            previousFactor = currentFactor;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Penalty Preview Accuracy
   * 
   * Penalty preview should accurately predict next retry penalties
   */
  it('Property 6: Penalty preview should accurately predict next retry penalties', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          currentRetries: fc.integer({ min: 0, max: 10 }),
          originalScore: fc.integer({ min: 100, max: 3000 })
        }),
        ({ currentRetries, originalScore }) => {
          const engine = new ScorePenaltyEngine();
          
          const preview = engine.getNextRetryPenalty(currentRetries);
          const actualFactor = engine.calculatePenaltyFactor(currentRetries + 1);
          const actualPercentage = engine.getPenaltyPercentage(currentRetries + 1);
          
          // Property: Preview factor should match actual factor
          if (Math.abs(preview.penaltyFactor - actualFactor) > 0.001) return false;
          
          // Property: Preview percentage should match actual percentage
          if (preview.penaltyPercentage !== actualPercentage) return false;
          
          // Property: Will have penalty flag should be accurate
          const expectedWillHavePenalty = actualFactor < 1.0;
          if (preview.willHavePenalty !== expectedWillHavePenalty) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Extreme Values Handling
   * 
   * System should handle extreme values gracefully
   */
  it('Property 6: Should handle extreme values gracefully', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          extremeRetries: fc.integer({ min: 50, max: 1000 }),
          extremeScore: fc.integer({ min: 1, max: 1000000 })
        }),
        ({ extremeRetries, extremeScore }) => {
          const engine = new ScorePenaltyEngine();
          
          try {
            const factor = engine.calculatePenaltyFactor(extremeRetries);
            
            // Property: Should always return a valid factor
            if (!Number.isFinite(factor)) return false;
            if (factor < 0.75 || factor > 1.0) return false;
            
            // Property: Should handle extreme scores
            const penalizedScore = engine.applyPenalty(extremeScore, extremeRetries);
            if (!Number.isFinite(penalizedScore)) return false;
            if (penalizedScore < 0) return false;
            if (penalizedScore > extremeScore) return false;
            
            return true;
          } catch (error) {
            // Should not throw for valid inputs
            return false;
          }
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Configuration Validation
   * 
   * Different configurations should produce consistent behavior
   */
  it('Property 6: Different configurations should produce consistent behavior', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          retryCount: fc.integer({ min: 0, max: 8 }),
          maxPenalty: fc.float({ min: 0.1, max: 0.4 }),
          firstRetryFree: fc.boolean()
        }),
        ({ retryCount, maxPenalty, firstRetryFree }) => {
          const config: Partial<ScorePenaltyConfig> = {
            maxPenalty,
            firstRetryFree,
            penaltyType: 'logarithmic'
          };
          
          const engine = new ScorePenaltyEngine(config);
          const retrievedConfig = engine.getConfig();
          
          // Property: Configuration should be preserved
          if (retrievedConfig.maxPenalty !== maxPenalty) return false;
          if (retrievedConfig.firstRetryFree !== firstRetryFree) return false;
          if (retrievedConfig.penaltyType !== 'logarithmic') return false;
          
          // Property: Behavior should match configuration
          const factor = engine.calculatePenaltyFactor(retryCount);
          const minExpectedFactor = 1.0 - maxPenalty;
          
          if (factor < minExpectedFactor - 0.001) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
