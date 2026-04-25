/**
 * Tests for A/B Testing Infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ABTestManager, defaultABTests } from './ab-testing';
import { propertyTestConfig, gameArbitraries } from './property-testing';

describe('A/B Testing Infrastructure', () => {
  let abTestManager: ABTestManager;

  beforeEach(() => {
    abTestManager = ABTestManager.getInstance();
    // Clear any existing tests
    (abTestManager as any).tests.clear();
    (abTestManager as any).userAssignments.clear();
    (abTestManager as any).results = [];
  });

  describe('ABTestManager', () => {
    it('should register test configurations', () => {
      const testConfig = {
        name: 'test-experiment',
        description: 'Test experiment',
        enabled: true,
        rolloutPercentage: 50,
        variants: [
          { name: 'control', weight: 50, config: {} },
          { name: 'treatment', weight: 50, config: { feature: true } }
        ]
      };

      abTestManager.registerTest(testConfig);
      
      const variant = abTestManager.getVariant('test-experiment', 'user123');
      expect(['control', 'treatment']).toContain(variant);
    });

    it('should reject invalid variant weights', () => {
      const invalidConfig = {
        name: 'invalid-test',
        description: 'Invalid test',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 60, config: {} },
          { name: 'treatment', weight: 50, config: {} } // Total = 110, should fail
        ]
      };

      expect(() => abTestManager.registerTest(invalidConfig)).toThrow();
    });

    it('should assign users consistently to variants', () => {
      const testConfig = {
        name: 'consistency-test',
        description: 'Test consistency',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 50, config: {} },
          { name: 'treatment', weight: 50, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      const userId = 'consistent-user';
      const variant1 = abTestManager.getVariant('consistency-test', userId);
      const variant2 = abTestManager.getVariant('consistency-test', userId);
      
      expect(variant1).toBe(variant2);
    });

    it('should respect rollout percentage', () => {
      const testConfig = {
        name: 'rollout-test',
        description: 'Test rollout',
        enabled: true,
        rolloutPercentage: 0, // No users should be included
        variants: [
          { name: 'control', weight: 100, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      const variant = abTestManager.getVariant('rollout-test', 'any-user');
      expect(variant).toBeNull();
    });

    it('should return null for disabled tests', () => {
      const testConfig = {
        name: 'disabled-test',
        description: 'Disabled test',
        enabled: false,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 100, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      const variant = abTestManager.getVariant('disabled-test', 'user123');
      expect(variant).toBeNull();
    });

    it('should record and retrieve test results', () => {
      const testConfig = {
        name: 'results-test',
        description: 'Test results',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 100, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      const userId = 'test-user';
      abTestManager.recordResult('results-test', userId, { 
        retention: 0.8, 
        engagement: 5.2 
      });

      const results = abTestManager.getResults('results-test');
      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe(userId);
      expect(results[0].metrics.retention).toBe(0.8);
      expect(results[0].metrics.engagement).toBe(5.2);
    });

    it('should calculate statistical significance', () => {
      const testConfig = {
        name: 'significance-test',
        description: 'Test significance',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 50, config: {} },
          { name: 'treatment', weight: 50, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      // Add mock results for both variants
      const results = [
        { testName: 'significance-test', variant: 'control', userId: 'user1', timestamp: Date.now(), metrics: { score: 100 } },
        { testName: 'significance-test', variant: 'control', userId: 'user2', timestamp: Date.now(), metrics: { score: 110 } },
        { testName: 'significance-test', variant: 'treatment', userId: 'user3', timestamp: Date.now(), metrics: { score: 120 } },
        { testName: 'significance-test', variant: 'treatment', userId: 'user4', timestamp: Date.now(), metrics: { score: 130 } }
      ];

      (abTestManager as any).results = results;

      const significance = abTestManager.calculateSignificance('significance-test', 'score');
      
      expect(significance.variants.control).toBeDefined();
      expect(significance.variants.treatment).toBeDefined();
      expect(significance.variants.control.mean).toBe(105);
      expect(significance.variants.treatment.mean).toBe(125);
      expect(typeof significance.pValue).toBe('number');
      expect(typeof significance.significant).toBe('boolean');
    });

    it('should provide balance configuration', () => {
      // Register default balance test
      abTestManager.registerTest(defaultABTests[0]);

      const config = abTestManager.getBalanceConfig('test-user');
      
      expect(config).toBeDefined();
      expect(config.retry).toBeDefined();
      expect(config.scoring).toBeDefined();
      expect(config.fastSolve).toBeDefined();
      expect(config.powerups).toBeDefined();
      
      expect(config.retry.maxCostCoins).toBe(140);
      expect(config.scoring.maxPenaltyPercent).toBe(25);
      expect(config.fastSolve.thresholdSeconds).toBe(30);
      expect(config.powerups.rocketCostMultiplier).toBe(2.0);
    });
  });

  describe('Property-Based A/B Testing', () => {
    it('should maintain consistent user assignments across multiple calls', () => {
      const testConfig = {
        name: 'property-test',
        description: 'Property test',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 50, config: {} },
          { name: 'treatment', weight: 50, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      fc.assert(
        fc.property(
          gameArbitraries.userId(),
          (userId) => {
            const variant1 = abTestManager.getVariant('property-test', userId);
            const variant2 = abTestManager.getVariant('property-test', userId);
            const variant3 = abTestManager.getVariant('property-test', userId);
            
            // Property: User should always get the same variant
            return variant1 === variant2 && variant2 === variant3;
          }
        ),
        propertyTestConfig
      );
    });

    it('should distribute users across variants according to weights', () => {
      const testConfig = {
        name: 'distribution-test',
        description: 'Distribution test',
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { name: 'control', weight: 50, config: {} },
          { name: 'treatment', weight: 50, config: {} }
        ]
      };

      abTestManager.registerTest(testConfig);

      // Test with a large sample to verify distribution
      const sampleSize = 1000;
      const assignments: Record<string, number> = { control: 0, treatment: 0 };

      for (let i = 0; i < sampleSize; i++) {
        const userId = `user-${i}`;
        const variant = abTestManager.getVariant('distribution-test', userId);
        if (variant) {
          assignments[variant]++;
        }
      }

      // Allow for some variance in distribution (within 10% of expected)
      const expectedPerVariant = sampleSize / 2;
      const tolerance = expectedPerVariant * 0.1;

      expect(assignments.control).toBeGreaterThan(expectedPerVariant - tolerance);
      expect(assignments.control).toBeLessThan(expectedPerVariant + tolerance);
      expect(assignments.treatment).toBeGreaterThan(expectedPerVariant - tolerance);
      expect(assignments.treatment).toBeLessThan(expectedPerVariant + tolerance);
    });

    it('should handle edge cases in variant configuration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.array(fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            weight: fc.integer({ min: 1, max: 100 }),
            config: fc.record({})
          }), { minLength: 1, maxLength: 5 }),
          (rolloutPercentage, variants) => {
            // Normalize weights to sum to 100
            const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
            const normalizedVariants = variants.map(v => ({
              ...v,
              weight: Math.round((v.weight / totalWeight) * 100)
            }));

            // Adjust last variant to ensure exact sum of 100
            const currentSum = normalizedVariants.reduce((sum, v) => sum + v.weight, 0);
            if (currentSum !== 100 && normalizedVariants.length > 0) {
              normalizedVariants[normalizedVariants.length - 1].weight += (100 - currentSum);
            }

            const testConfig = {
              name: 'edge-case-test',
              description: 'Edge case test',
              enabled: true,
              rolloutPercentage,
              variants: normalizedVariants
            };

            try {
              abTestManager.registerTest(testConfig);
              const variant = abTestManager.getVariant('edge-case-test', 'test-user');
              
              // Property: Should either return a valid variant or null
              return variant === null || normalizedVariants.some(v => v.name === variant);
            } catch (error) {
              // Expected for invalid configurations
              return true;
            }
          }
        ),
        { ...propertyTestConfig, numRuns: 50 } // Fewer runs for complex test
      );
    });
  });
});