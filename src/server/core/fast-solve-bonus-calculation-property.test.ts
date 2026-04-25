/**
 * Property-Based Test: Fast Solve Bonus Calculation Correctness
 * 
 * **Feature: game-performance-and-balance-improvements, Property 7: Fast Solve Bonus Calculation Correctness**
 * **Validates: Requirements 7.1, 7.2, 7.3**
 * 
 * Property 7: For any puzzle solve scenario, the fast solve bonus system SHALL enforce 
 * a 30-second threshold with 50% maximum bonus AND scale thresholds based on difficulty 
 * AND provide accurate bonus calculations for qualifying solve times.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RebalancedFastSolveBonusSystem, type FastSolveBonusConfig } from '../../shared/rebalanced-fast-solve-bonus-system';
import { propertyTestConfig } from '../../shared/property-testing';

describe('Property 7: Fast Solve Bonus Calculation Correctness', () => {
  /**
   * Property Test: 30-Second Threshold Enforcement (Requirement 7.1)
   * 
   * For any solve scenario, the system SHALL enforce 30-second base threshold
   */
  it('Property 7.1: SHALL enforce 30-second base threshold', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          solveTime: fc.integer({ min: 1, max: 120 }),
          baseScore: fc.integer({ min: 10, max: 5000 }),
          thresholdSeconds: fc.integer({ min: 15, max: 60 })
        }),
        ({ solveTime, baseScore, thresholdSeconds }) => {
          const system = new RebalancedFastSolveBonusSystem({ thresholdSeconds });
          
          // Property: Threshold should be respected
          const qualifies = system.qualifiesForBonus(solveTime, 5); // Difficulty 5 (baseline)
          const expectedQualifies = solveTime <= thresholdSeconds;
          if (qualifies !== expectedQualifies) return false;
          
          // Property: For default config, threshold is 30 seconds
          const defaultSystem = new RebalancedFastSolveBonusSystem();
          const defaultThreshold = defaultSystem.getThresholdForDifficulty(5);
          if (defaultThreshold !== 30) return false;
          
          // Property: Bonus only applies when under threshold
          const bonus = system.calculateBonus(solveTime, baseScore, 5);
          if (solveTime > thresholdSeconds && bonus > 0) return false;
          if (solveTime <= thresholdSeconds && bonus < 0) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: 50% Maximum Bonus (Requirement 7.2)
   * 
   * The system SHALL provide up to 50% score bonus for fast solves
   */
  it('Property 7.2: SHALL provide up to 50% score bonus', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          baseScore: fc.integer({ min: 100, max: 3000 }),
          difficulty: fc.integer({ min: 1, max: 10 }),
          bonusPercentage: fc.float({ min: 0.1, max: 1.0 })
        }),
        ({ baseScore, difficulty, bonusPercentage }) => {
          const system = new RebalancedFastSolveBonusSystem({ bonusPercentage });
          const threshold = system.getThresholdForDifficulty(difficulty);
          
          // Test with very fast solve (should get maximum bonus)
          const veryFastTime = 1; // 1 second
          const maxBonus = system.calculateBonus(veryFastTime, baseScore, difficulty);
          const maxBonusPercentage = maxBonus / baseScore;
          
          // Property: Maximum bonus should not exceed configured percentage
          if (maxBonusPercentage > bonusPercentage + 0.01) return false; // Small tolerance for rounding
          
          // Property: For default config, max bonus is 50%
          const defaultSystem = new RebalancedFastSolveBonusSystem();
          const defaultMaxBonus = defaultSystem.calculateBonus(1, baseScore, difficulty);
          const defaultMaxPercentage = defaultMaxBonus / baseScore;
          if (defaultMaxPercentage > 0.51) return false; // 50% + tolerance
          
          // Property: Bonus should scale with speed
          const halfThresholdTime = Math.round(threshold / 2);
          const halfBonus = system.calculateBonus(halfThresholdTime, baseScore, difficulty);
          const fullBonus = system.calculateBonus(1, baseScore, difficulty);
          
          // Faster solve should get equal or better bonus
          if (halfBonus > fullBonus) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Difficulty-Based Threshold Scaling (Requirement 7.3)
   * 
   * The system SHALL scale thresholds based on puzzle difficulty
   */
  it('Property 7.3: SHALL scale thresholds based on difficulty', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          easyDifficulty: fc.integer({ min: 1, max: 3 }),
          hardDifficulty: fc.integer({ min: 7, max: 10 }),
          baseThreshold: fc.integer({ min: 20, max: 60 })
        }),
        ({ easyDifficulty, hardDifficulty, baseThreshold }) => {
          const system = new RebalancedFastSolveBonusSystem({ 
            thresholdSeconds: baseThreshold,
            difficultyScaling: true 
          });
          
          const easyThreshold = system.getThresholdForDifficulty(easyDifficulty);
          const normalThreshold = system.getThresholdForDifficulty(5); // Baseline
          const hardThreshold = system.getThresholdForDifficulty(hardDifficulty);
          
          // Property: Harder puzzles should have longer thresholds
          if (hardThreshold <= normalThreshold) return false;
          if (easyThreshold >= normalThreshold) return false;
          
          // Property: Normal difficulty should match base threshold
          if (Math.abs(normalThreshold - baseThreshold) > 1) return false; // Allow rounding
          
          // Property: Scaling should be consistent
          const expectedEasyFactor = 1 + (easyDifficulty - 5) * 0.1;
          const expectedHardFactor = 1 + (hardDifficulty - 5) * 0.1;
          const expectedEasyThreshold = Math.round(baseThreshold * expectedEasyFactor);
          const expectedHardThreshold = Math.round(baseThreshold * expectedHardFactor);
          
          if (Math.abs(easyThreshold - expectedEasyThreshold) > 1) return false;
          if (Math.abs(hardThreshold - expectedHardThreshold) > 1) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Bonus Calculation Accuracy
   * 
   * Bonus calculations should be accurate and consistent
   */
  it('Property 7: Bonus calculations should be accurate and consistent', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          baseScore: fc.integer({ min: 50, max: 2000 }),
          solveTime: fc.integer({ min: 1, max: 90 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ baseScore, solveTime, difficulty }) => {
          const system = new RebalancedFastSolveBonusSystem();
          
          const bonus = system.calculateBonus(solveTime, baseScore, difficulty);
          const threshold = system.getThresholdForDifficulty(difficulty);
          
          // Property: Bonus should be non-negative
          if (bonus < 0) return false;
          
          // Property: No bonus if over threshold
          if (solveTime > threshold && bonus > 0) return false;
          
          // Property: Bonus should not exceed base score * 50%
          if (bonus > baseScore * 0.51) return false; // 50% + tolerance
          
          // Property: Faster times should get equal or better bonus
          if (solveTime > 1) {
            const fasterBonus = system.calculateBonus(solveTime - 1, baseScore, difficulty);
            if (fasterBonus < bonus) return false;
          }
          
          // Property: Final score calculation should be consistent
          const result = system.calculateFinalScore(baseScore, solveTime, difficulty);
          if (result.bonusApplied !== bonus) return false;
          if (result.finalScore !== baseScore + bonus) return false;
          if (result.threshold !== threshold) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Bonus Preview Accuracy
   * 
   * Bonus preview should accurately predict actual bonuses
   */
  it('Property 7: Bonus preview should accurately predict actual bonuses', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          potentialTime: fc.integer({ min: 1, max: 80 }),
          baseScore: fc.integer({ min: 100, max: 1500 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ potentialTime, baseScore, difficulty }) => {
          const system = new RebalancedFastSolveBonusSystem();
          
          const preview = system.getBonusPreview(potentialTime, baseScore, difficulty);
          const actualBonus = system.calculateBonus(potentialTime, baseScore, difficulty);
          const actualQualifies = system.qualifiesForBonus(potentialTime, difficulty);
          
          // Property: Preview bonus should match actual bonus
          if (preview.potentialBonus !== actualBonus) return false;
          
          // Property: Preview qualification should match actual qualification
          if (preview.wouldQualify !== actualQualifies) return false;
          
          // Property: Threshold should be consistent
          const expectedThreshold = system.getThresholdForDifficulty(difficulty);
          if (preview.threshold !== expectedThreshold) return false;
          
          // Property: Time remaining should be accurate
          const expectedTimeRemaining = Math.max(0, expectedThreshold - potentialTime);
          if (preview.timeRemaining !== expectedTimeRemaining) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Personal Best Comparison
   * 
   * Personal best tracking should work correctly
   */
  it('Property 7: Personal best tracking should work correctly', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          currentTime: fc.integer({ min: 5, max: 120 }),
          personalBest: fc.option(fc.integer({ min: 5, max: 120 }), { nil: null }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ currentTime, personalBest, difficulty }) => {
          const system = new RebalancedFastSolveBonusSystem();
          
          const comparison = system.compareWithPersonalBest(currentTime, personalBest, difficulty);
          
          // Property: New personal best detection should be accurate
          const expectedIsNewBest = personalBest === null || currentTime < personalBest;
          if (comparison.isNewPersonalBest !== expectedIsNewBest) return false;
          
          // Property: Improvement calculation should be accurate
          const expectedImprovement = personalBest !== null ? Math.max(0, personalBest - currentTime) : 0;
          if (comparison.improvement !== expectedImprovement) return false;
          
          // Property: Bonus qualification should be consistent
          const expectedQualifies = system.qualifiesForBonus(currentTime, difficulty);
          if (comparison.qualifiesForBonus !== expectedQualifies) return false;
          
          // Property: Improvement percentage should be reasonable
          if (personalBest !== null && personalBest > 0) {
            const expectedPercentage = Math.round((expectedImprovement / personalBest) * 100);
            if (comparison.improvementPercentage !== expectedPercentage) return false;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Configuration Consistency
   * 
   * Different configurations should produce consistent behavior
   */
  it('Property 7: Different configurations should produce consistent behavior', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          thresholdSeconds: fc.integer({ min: 15, max: 90 }),
          bonusPercentage: fc.float({ min: 0.1, max: 0.8 }),
          difficultyScaling: fc.boolean(),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ thresholdSeconds, bonusPercentage, difficultyScaling, difficulty }) => {
          const config: Partial<FastSolveBonusConfig> = {
            thresholdSeconds,
            bonusPercentage,
            difficultyScaling
          };
          
          const system = new RebalancedFastSolveBonusSystem(config);
          const retrievedConfig = system.getConfig();
          
          // Property: Configuration should be preserved
          if (retrievedConfig.thresholdSeconds !== thresholdSeconds) return false;
          if (Math.abs(retrievedConfig.bonusPercentage - bonusPercentage) > 0.001) return false;
          if (retrievedConfig.difficultyScaling !== difficultyScaling) return false;
          
          // Property: Threshold calculation should respect scaling setting
          const threshold = system.getThresholdForDifficulty(difficulty);
          if (difficultyScaling) {
            const expectedFactor = 1 + (difficulty - 5) * 0.1;
            const expectedThreshold = Math.round(thresholdSeconds * expectedFactor);
            if (Math.abs(threshold - expectedThreshold) > 1) return false;
          } else {
            if (threshold !== thresholdSeconds) return false;
          }
          
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
  it('Property 7: Should handle extreme values gracefully', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          extremeTime: fc.integer({ min: 1, max: 10000 }),
          extremeScore: fc.integer({ min: 1, max: 1000000 }),
          extremeDifficulty: fc.integer({ min: 1, max: 50 })
        }),
        ({ extremeTime, extremeScore, extremeDifficulty }) => {
          const system = new RebalancedFastSolveBonusSystem();
          
          try {
            const bonus = system.calculateBonus(extremeTime, extremeScore, extremeDifficulty);
            
            // Property: Should always return a valid bonus
            if (!Number.isFinite(bonus)) return false;
            if (bonus < 0) return false;
            
            // Property: Bonus should not exceed reasonable limits
            if (bonus > extremeScore) return false;
            
            // Property: Threshold calculation should work
            const threshold = system.getThresholdForDifficulty(extremeDifficulty);
            if (!Number.isFinite(threshold)) return false;
            if (threshold <= 0) return false;
            
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
   * Property Test: Bonus Breakdown Consistency
   * 
   * Bonus breakdown should provide consistent information
   */
  it('Property 7: Bonus breakdown should provide consistent information', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          baseScore: fc.integer({ min: 100, max: 2000 }),
          difficulty: fc.integer({ min: 1, max: 10 })
        }),
        ({ baseScore, difficulty }) => {
          const system = new RebalancedFastSolveBonusSystem();
          
          const breakdown = system.getBonusBreakdown(baseScore, difficulty);
          const threshold = system.getThresholdForDifficulty(difficulty);
          
          // Property: Breakdown should have reasonable number of entries
          if (breakdown.length < 3 || breakdown.length > 10) return false;
          
          // Property: Each entry should be consistent with individual calculations
          for (const entry of breakdown) {
            const expectedBonus = system.calculateBonus(entry.solveTime, baseScore, difficulty);
            if (entry.bonus !== expectedBonus) return false;
            
            const expectedFinalScore = baseScore + expectedBonus;
            if (entry.finalScore !== expectedFinalScore) return false;
            
            // Property: Times at or under threshold should have bonus
            if (entry.solveTime <= threshold && entry.bonus === 0) return false;
            
            // Property: Times over threshold should have no bonus
            if (entry.solveTime > threshold && entry.bonus > 0) return false;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});