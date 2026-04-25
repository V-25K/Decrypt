import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RebalancedScorePenaltyEngine, type ScorePenaltyConfig } from './rebalanced-score-penalty-engine';

describe('RebalancedScorePenaltyEngine - Property Tests', () => {
  /**
   * Property 6: Score Penalty Calculation Correctness
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   */
  describe('Property 6: Score Penalty Calculation Correctness', () => {
    it('should never exceed 25% maximum penalty', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // retryCount
          fc.integer({ min: 1, max: 10000 }), // originalScore
          (retryCount, originalScore) => {
            const engine = new RebalancedScorePenaltyEngine();
            const penaltyFactor = engine.calculatePenaltyFactor(retryCount);
            
            // Penalty factor should never be less than 0.75 (25% max penalty)
            expect(penaltyFactor).toBeGreaterThanOrEqual(0.75);
            expect(penaltyFactor).toBeLessThanOrEqual(1.0);
            
            // Applied penalty should respect the maximum (with small tolerance for rounding)
            const finalScore = engine.applyPenalty(originalScore, retryCount);
            const actualPenalty = (originalScore - finalScore) / originalScore;
            expect(actualPenalty).toBeLessThanOrEqual(0.25 + 0.001); // Small tolerance for rounding
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should apply penalties only to current puzzle (non-cumulative)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }), // retryCount
          fc.integer({ min: 100, max: 5000 }), // originalScore
          (retryCount, originalScore) => {
            const engine = new RebalancedScorePenaltyEngine();
            
            // Calculate penalty for this retry count
            const penaltyFactor1 = engine.calculatePenaltyFactor(retryCount);
            const finalScore1 = engine.applyPenalty(originalScore, retryCount);
            
            // Calculate penalty for same retry count again (should be identical)
            const penaltyFactor2 = engine.calculatePenaltyFactor(retryCount);
            const finalScore2 = engine.applyPenalty(originalScore, retryCount);
            
            // Results should be identical (non-cumulative)
            expect(penaltyFactor1).toBe(penaltyFactor2);
            expect(finalScore1).toBe(finalScore2);
            
            // Penalty should only depend on retry count, not previous calculations
            const breakdown = engine.getPenaltyBreakdown(retryCount);
            if (retryCount < breakdown.length) {
              expect(breakdown[retryCount].penaltyFactor).toBe(penaltyFactor1);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should implement first-retry-free policy correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 5000 }), // originalScore
          (originalScore) => {
            const engine = new RebalancedScorePenaltyEngine({ firstRetryFree: true });
            
            // Zero retries should have no penalty
            expect(engine.calculatePenaltyFactor(0)).toBe(1.0);
            expect(engine.applyPenalty(originalScore, 0)).toBe(originalScore);
            expect(engine.getPenaltyPercentage(0)).toBe(0);
            expect(engine.willIncurPenalty(0)).toBe(false);
            
            // First retry should have no penalty when firstRetryFree is true
            expect(engine.calculatePenaltyFactor(1)).toBe(1.0);
            expect(engine.applyPenalty(originalScore, 1)).toBe(originalScore);
            expect(engine.getPenaltyPercentage(1)).toBe(0);
            expect(engine.willIncurPenalty(1)).toBe(false);
            
            // Second retry should have some penalty
            if (originalScore > 0) {
              const factor2 = engine.calculatePenaltyFactor(2);
              expect(factor2).toBeLessThan(1.0);
              expect(engine.willIncurPenalty(2)).toBe(true);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should use logarithmic penalty curve', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }), // retryCount (starting from 2 to see penalty)
          (retryCount) => {
            const engine = new RebalancedScorePenaltyEngine({ penaltyType: 'logarithmic' });
            
            // Get penalty factors for consecutive retry counts
            const factor1 = engine.calculatePenaltyFactor(retryCount);
            const factor2 = engine.calculatePenaltyFactor(retryCount + 1);
            
            // Penalty should increase (factor should decrease)
            expect(factor2).toBeLessThanOrEqual(factor1);
            
            // Logarithmic curve should have diminishing returns
            // (difference between consecutive penalties should decrease)
            if (retryCount >= 3) {
              const factor0 = engine.calculatePenaltyFactor(retryCount - 1);
              const diff1 = factor0 - factor1;
              const diff2 = factor1 - factor2;
              
              // For logarithmic curve, differences should generally decrease
              // (allowing some tolerance for rounding)
              expect(diff2).toBeLessThanOrEqual(diff1 + 0.01);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    it('should maintain monotonic penalty increase', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 15 }), // maxRetries
          (maxRetries) => {
            const engine = new RebalancedScorePenaltyEngine();
            
            let previousFactor = 1.0;
            
            for (let retry = 0; retry <= maxRetries; retry++) {
              const currentFactor = engine.calculatePenaltyFactor(retry);
              
              // Penalty factor should never increase (penalty should never decrease)
              expect(currentFactor).toBeLessThanOrEqual(previousFactor);
              
              // Penalty percentage should be monotonic
              const percentage = engine.getPenaltyPercentage(retry);
              expect(percentage).toBeGreaterThanOrEqual(0);
              expect(percentage).toBeLessThanOrEqual(25);
              
              previousFactor = currentFactor;
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should handle edge cases correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }), // originalScore
          (originalScore) => {
            const engine = new RebalancedScorePenaltyEngine();
            
            // Zero score should remain zero
            expect(engine.applyPenalty(0, 5)).toBe(0);
            
            // Negative retry count should throw
            expect(() => engine.calculatePenaltyFactor(-1)).toThrow();
            expect(() => engine.applyPenalty(originalScore, -1)).toThrow();
            
            // Negative original score should throw
            expect(() => engine.applyPenalty(-1, 3)).toThrow();
            
            // Very high retry counts should still respect max penalty
            const highRetryFactor = engine.calculatePenaltyFactor(1000);
            expect(highRetryFactor).toBeGreaterThanOrEqual(0.75);
            
            const highRetryScore = engine.applyPenalty(originalScore, 1000);
            expect(highRetryScore).toBeGreaterThanOrEqual(Math.floor(originalScore * 0.75));
          }
        ),
        { numRuns: 300 }
      );
    });

    it('should provide consistent penalty preview calculations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }), // currentRetryCount
          fc.integer({ min: 100, max: 5000 }), // originalScore
          (currentRetryCount, originalScore) => {
            const engine = new RebalancedScorePenaltyEngine();
            
            // Get next retry penalty preview
            const preview = engine.getNextRetryPenalty(currentRetryCount);
            const nextRetryCount = currentRetryCount + 1;
            
            // Preview should match actual calculation
            const actualFactor = engine.calculatePenaltyFactor(nextRetryCount);
            const actualPercentage = engine.getPenaltyPercentage(nextRetryCount);
            const actualWillHavePenalty = engine.willIncurPenalty(nextRetryCount);
            
            expect(preview.penaltyFactor).toBe(actualFactor);
            expect(preview.penaltyPercentage).toBe(actualPercentage);
            expect(preview.willHavePenalty).toBe(actualWillHavePenalty);
            
            // Final score calculation should be consistent
            const finalScoreData = engine.calculateFinalScore(originalScore, nextRetryCount);
            const expectedFinalScore = engine.applyPenalty(originalScore, nextRetryCount);
            
            expect(finalScoreData.finalScore).toBe(expectedFinalScore);
            expect(finalScoreData.penaltyPercentage).toBe(actualPercentage);
            expect(finalScoreData.penaltyApplied).toBe(originalScore - expectedFinalScore);
          }
        ),
        { numRuns: 400 }
      );
    });

    it('should maintain configuration immutability', () => {
      fc.assert(
        fc.property(
          fc.record({
            maxPenalty: fc.float({ min: Math.fround(0.1), max: Math.fround(0.5) }).filter(x => !isNaN(x) && isFinite(x)),
            penaltyType: fc.constantFrom('logarithmic', 'linear'),
            firstRetryFree: fc.boolean()
          }),
          (config) => {
            const engine = new RebalancedScorePenaltyEngine(config);
            const retrievedConfig = engine.getConfig();
            
            // Configuration should match what was provided
            expect(retrievedConfig.maxPenalty).toBe(config.maxPenalty);
            expect(retrievedConfig.penaltyType).toBe(config.penaltyType);
            expect(retrievedConfig.firstRetryFree).toBe(config.firstRetryFree);
            
            // Modifying retrieved config should not affect engine
            const originalMaxPenalty = retrievedConfig.maxPenalty;
            retrievedConfig.maxPenalty = 0.99;
            
            const newRetrievedConfig = engine.getConfig();
            expect(newRetrievedConfig.maxPenalty).toBe(originalMaxPenalty);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Integration Properties', () => {
    it('should work correctly with different configurations', () => {
      fc.assert(
        fc.property(
          fc.record({
            maxPenalty: fc.float({ min: Math.fround(0.1), max: Math.fround(0.4) }).filter(x => !isNaN(x) && isFinite(x)),
            firstRetryFree: fc.boolean()
          }),
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 100, max: 2000 }),
          (config, retryCount, originalScore) => {
            // Skip invalid configurations
            if (isNaN(config.maxPenalty) || !isFinite(config.maxPenalty)) {
              return true;
            }
            
            const engine = new RebalancedScorePenaltyEngine(config);
            
            const penaltyFactor = engine.calculatePenaltyFactor(retryCount);
            const finalScore = engine.applyPenalty(originalScore, retryCount);
            
            // Penalty should respect configured maximum (with small tolerance for rounding)
            if (originalScore > 0) {
              const actualPenalty = (originalScore - finalScore) / originalScore;
              expect(actualPenalty).toBeLessThanOrEqual(config.maxPenalty + 0.001); // Small tolerance for rounding
            }
            
            // First retry free policy should be respected
            if (config.firstRetryFree && retryCount <= 1) {
              expect(penaltyFactor).toBe(1.0);
              expect(finalScore).toBe(originalScore);
            }
            
            // Minimum score should be respected
            const minScore = Math.ceil(originalScore * (1 - config.maxPenalty));
            expect(finalScore).toBeGreaterThanOrEqual(minScore);
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});