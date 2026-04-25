/**
 * Property-Based Test: Powerup Pricing Calculation Correctness
 * 
 * **Feature: game-performance-and-balance-improvements, Property 8: Powerup Pricing Calculation Correctness**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 * 
 * Property 8: For any powerup purchase scenario, the pricing system SHALL price 
 * Rocket powerups at 2x Hammer cost (down from 4x) AND base all costs on letters 
 * revealed per coin spent AND ensure Rocket provides 50% better value than Hammer.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RebalancedPowerupPricingEngine, type PowerupPricingConfig } from '../../shared/rebalanced-powerup-pricing-engine';
import { propertyTestConfig } from '../../shared/property-testing';

describe('Property 8: Powerup Pricing Calculation Correctness', () => {
  /**
   * Property Test: Rocket 2x Hammer Cost (Requirement 8.1)
   * 
   * For any pricing scenario, Rocket powerups SHALL be priced at 2x Hammer cost
   */
  it('Property 8.1: SHALL price Rocket at 2x Hammer cost', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 1, max: 50 }),
          rocketMultiplier: fc.float({ min: 1.5, max: 3.0 })
        }),
        ({ difficulty, remainingLetters, rocketMultiplier }) => {
          const engine = new RebalancedPowerupPricingEngine({ 
            rocketCostMultiplier: rocketMultiplier 
          });
          
          const hammerCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const rocketCost = engine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          
          // Property: Rocket cost should be multiplier times hammer cost
          const expectedRocketCost = Math.round(hammerCost * rocketMultiplier);
          if (Math.abs(rocketCost - expectedRocketCost) > 1) return false; // Allow rounding tolerance
          
          // Property: For default config, rocket should be 2x hammer
          const defaultEngine = new RebalancedPowerupPricingEngine();
          const defaultHammerCost = defaultEngine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const defaultRocketCost = defaultEngine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          const actualMultiplier = defaultRocketCost / defaultHammerCost;
          
          if (Math.abs(actualMultiplier - 2.0) > 0.1) return false; // Should be close to 2x
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Letters Revealed Per Coin Basis (Requirement 8.2)
   * 
   * All costs SHALL be based on letters revealed per coin spent
   */
  it('Property 8.2: SHALL base costs on letters revealed per coin', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 5, max: 30 }),
          baseLettersPerCoin: fc.float({ min: 0.5, max: 3.0 })
        }),
        ({ difficulty, remainingLetters, baseLettersPerCoin }) => {
          const engine = new RebalancedPowerupPricingEngine({ 
            baseLettersPerCoin 
          });
          
          // Test different powerup types
          const hammerCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const wandCost = engine.calculatePowerupCost('wand', difficulty, remainingLetters);
          const rocketCost = engine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          
          // Property: All costs should be positive
          if (hammerCost <= 0 || wandCost <= 0 || rocketCost <= 0) return false;
          
          // Property: Cost should scale with remaining letters (more letters = higher cost)
          if (remainingLetters > 10) {
            const fewerLettersCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters - 5);
            if (fewerLettersCost >= hammerCost) return false; // Fewer letters should cost less
          }
          
          // Property: Cost should scale with difficulty
          if (difficulty > 3) {
            const easierCost = engine.calculatePowerupCost('hammer', difficulty - 2, remainingLetters);
            if (easierCost >= hammerCost) return false; // Easier should cost less
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Rocket 50% Better Value (Requirement 8.3)
   * 
   * Rocket SHALL provide 50% better value than Hammer per coin spent
   */
  it('Property 8.3: SHALL ensure Rocket provides 50% better value than Hammer', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 10, max: 40 })
        }),
        ({ difficulty, remainingLetters }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const hammerCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const rocketCost = engine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          
          // Get value analysis
          const hammerValue = engine.getValueAnalysis('hammer', difficulty, remainingLetters);
          const rocketValue = engine.getValueAnalysis('rocket', difficulty, remainingLetters);
          
          // Property: Rocket should reveal more letters per coin
          if (rocketValue.lettersPerCoin <= hammerValue.lettersPerCoin) return false;
          
          // Property: Rocket should provide at least 50% better value
          const valueImprovement = (rocketValue.lettersPerCoin - hammerValue.lettersPerCoin) / hammerValue.lettersPerCoin;
          if (valueImprovement < 0.45) return false; // At least 45% (allowing some tolerance)
          
          // Property: Cost ratio should be reasonable (around 2x)
          const costRatio = rocketCost / hammerCost;
          if (costRatio < 1.8 || costRatio > 2.2) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Pricing Consistency (Requirement 8.4)
   * 
   * Pricing calculations should be consistent and deterministic
   */
  it('Property 8.4: SHALL provide consistent pricing calculations', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 1, max: 50 }),
          powerupType: fc.constantFrom('hammer', 'wand', 'rocket', 'shield')
        }),
        ({ difficulty, remainingLetters, powerupType }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const cost1 = engine.calculatePowerupCost(powerupType, difficulty, remainingLetters);
          const cost2 = engine.calculatePowerupCost(powerupType, difficulty, remainingLetters);
          
          // Property: Same inputs should produce same outputs
          if (cost1 !== cost2) return false;
          
          // Property: Cost should be reasonable (not too high or too low)
          if (cost1 < 1 || cost1 > 1000) return false;
          
          // Property: Cost should be finite
          if (!Number.isFinite(cost1)) return false;
          
          // Property: Value analysis should be consistent
          const value1 = engine.getValueAnalysis(powerupType, difficulty, remainingLetters);
          const value2 = engine.getValueAnalysis(powerupType, difficulty, remainingLetters);
          
          if (Math.abs(value1.lettersPerCoin - value2.lettersPerCoin) > 0.001) return false;
          if (value1.cost !== value2.cost) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Powerup Type Relationships
   * 
   * Different powerup types should have logical cost relationships
   */
  it('Property 8: Powerup types should have logical cost relationships', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 5, max: 30 })
        }),
        ({ difficulty, remainingLetters }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const hammerCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const wandCost = engine.calculatePowerupCost('wand', difficulty, remainingLetters);
          const rocketCost = engine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          const shieldCost = engine.calculatePowerupCost('shield', difficulty, remainingLetters);
          
          // Property: Rocket should be most expensive (highest value)
          if (rocketCost <= hammerCost) return false;
          if (rocketCost <= wandCost) return false;
          
          // Property: All costs should be positive
          if (hammerCost <= 0 || wandCost <= 0 || rocketCost <= 0 || shieldCost <= 0) return false;
          
          // Property: Cost ordering should make sense based on value
          const hammerValue = engine.getValueAnalysis('hammer', difficulty, remainingLetters);
          const rocketValue = engine.getValueAnalysis('rocket', difficulty, remainingLetters);
          
          // Higher value per coin should justify higher cost
          if (rocketValue.lettersPerCoin > hammerValue.lettersPerCoin && rocketCost <= hammerCost) {
            return false;
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Difficulty Scaling
   * 
   * Costs should scale appropriately with difficulty
   */
  it('Property 8: Costs should scale appropriately with difficulty', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          easyDifficulty: fc.integer({ min: 1, max: 3 }),
          hardDifficulty: fc.integer({ min: 7, max: 10 }),
          remainingLetters: fc.integer({ min: 10, max: 30 }),
          powerupType: fc.constantFrom('hammer', 'wand', 'rocket', 'shield')
        }),
        ({ easyDifficulty, hardDifficulty, remainingLetters, powerupType }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const easyCost = engine.calculatePowerupCost(powerupType, easyDifficulty, remainingLetters);
          const hardCost = engine.calculatePowerupCost(powerupType, hardDifficulty, remainingLetters);
          
          // Property: Harder difficulties should cost more
          if (hardCost <= easyCost) return false;
          
          // Property: Scaling should be reasonable (not too extreme)
          const scalingFactor = hardCost / easyCost;
          if (scalingFactor > 5.0) return false; // Not more than 5x increase
          if (scalingFactor < 1.1) return false; // At least 10% increase
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property Test: Remaining Letters Scaling
   * 
   * Costs should scale appropriately with remaining letters
   */
  it('Property 8: Costs should scale appropriately with remaining letters', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          fewLetters: fc.integer({ min: 3, max: 8 }),
          manyLetters: fc.integer({ min: 20, max: 40 }),
          powerupType: fc.constantFrom('hammer', 'wand', 'rocket', 'shield')
        }),
        ({ difficulty, fewLetters, manyLetters, powerupType }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const fewLettersCost = engine.calculatePowerupCost(powerupType, difficulty, fewLetters);
          const manyLettersCost = engine.calculatePowerupCost(powerupType, difficulty, manyLetters);
          
          // Property: More remaining letters should cost more
          if (manyLettersCost <= fewLettersCost) return false;
          
          // Property: Scaling should be reasonable
          const scalingFactor = manyLettersCost / fewLettersCost;
          if (scalingFactor > 10.0) return false; // Not more than 10x increase
          if (scalingFactor < 1.2) return false; // At least 20% increase
          
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
  it('Property 8: Different configurations should produce consistent behavior', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          rocketMultiplier: fc.float({ min: 1.5, max: 3.0 }),
          baseLettersPerCoin: fc.float({ min: 0.5, max: 2.0 }),
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 5, max: 25 })
        }),
        ({ rocketMultiplier, baseLettersPerCoin, difficulty, remainingLetters }) => {
          const config: Partial<PowerupPricingConfig> = {
            rocketCostMultiplier: rocketMultiplier,
            baseLettersPerCoin
          };
          
          const engine = new RebalancedPowerupPricingEngine(config);
          const retrievedConfig = engine.getConfig();
          
          // Property: Configuration should be preserved
          if (Math.abs(retrievedConfig.rocketCostMultiplier - rocketMultiplier) > 0.001) return false;
          if (Math.abs(retrievedConfig.baseLettersPerCoin - baseLettersPerCoin) > 0.001) return false;
          
          // Property: Behavior should match configuration
          const hammerCost = engine.calculatePowerupCost('hammer', difficulty, remainingLetters);
          const rocketCost = engine.calculatePowerupCost('rocket', difficulty, remainingLetters);
          
          const actualMultiplier = rocketCost / hammerCost;
          if (Math.abs(actualMultiplier - rocketMultiplier) > 0.2) return false; // Allow some tolerance
          
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
  it('Property 8: Should handle extreme values gracefully', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          extremeDifficulty: fc.integer({ min: 1, max: 100 }),
          extremeLetters: fc.integer({ min: 1, max: 1000 }),
          powerupType: fc.constantFrom('hammer', 'wand', 'rocket', 'shield')
        }),
        ({ extremeDifficulty, extremeLetters, powerupType }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          try {
            const cost = engine.calculatePowerupCost(powerupType, extremeDifficulty, extremeLetters);
            
            // Property: Should always return a valid cost
            if (!Number.isFinite(cost)) return false;
            if (cost <= 0) return false;
            
            // Property: Should not be unreasonably high
            if (cost > 10000) return false;
            
            // Property: Value analysis should work
            const value = engine.getValueAnalysis(powerupType, extremeDifficulty, extremeLetters);
            if (!Number.isFinite(value.lettersPerCoin)) return false;
            if (value.lettersPerCoin <= 0) return false;
            
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
   * Property Test: Value Analysis Accuracy
   * 
   * Value analysis should accurately reflect powerup effectiveness
   */
  it('Property 8: Value analysis should accurately reflect powerup effectiveness', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          difficulty: fc.integer({ min: 1, max: 10 }),
          remainingLetters: fc.integer({ min: 5, max: 30 }),
          powerupType: fc.constantFrom('hammer', 'wand', 'rocket', 'shield')
        }),
        ({ difficulty, remainingLetters, powerupType }) => {
          const engine = new RebalancedPowerupPricingEngine();
          
          const cost = engine.calculatePowerupCost(powerupType, difficulty, remainingLetters);
          const value = engine.getValueAnalysis(powerupType, difficulty, remainingLetters);
          
          // Property: Value analysis cost should match calculated cost
          if (value.cost !== cost) return false;
          
          // Property: Letters per coin should be reasonable
          if (value.lettersPerCoin <= 0) return false;
          if (value.lettersPerCoin > 10) return false; // Not more than 10 letters per coin
          
          // Property: Effectiveness should be consistent with cost
          const costPerLetter = cost / value.lettersRevealed;
          if (!Number.isFinite(costPerLetter)) return false;
          if (costPerLetter <= 0) return false;
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});