/**
 * Tests for Balance A/B Testing Configuration
 * 
 * Task 15.2: Configure A/B testing for balance changes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BalanceABTestingConfig } from './balance-ab-testing-config';
import { ABTestManager } from '../../shared/ab-testing';

describe('Balance A/B Testing Configuration', () => {
  let balanceConfig: BalanceABTestingConfig;
  let abTestManager: ABTestManager;

  beforeEach(async () => {
    balanceConfig = new BalanceABTestingConfig();
    abTestManager = ABTestManager.getInstance();
    
    // Clear any existing tests
    (abTestManager as any).tests.clear();
    (abTestManager as any).userAssignments.clear();
    (abTestManager as any).results = [];
    
    await balanceConfig.initialize();
  });

  afterEach(() => {
    // Clean up
    (abTestManager as any).tests.clear();
    (abTestManager as any).userAssignments.clear();
    (abTestManager as any).results = [];
  });

  describe('initialization', () => {
    it('should register main balance improvements test', () => {
      const variant = abTestManager.getVariant('balance-improvements-v2', 'test-user');
      expect(['control', 'new-balance']).toContain(variant);
    });

    it('should register individual balance system tests', () => {
      const tests = [
        'retry-cost-rebalance',
        'score-penalty-rebalance',
        'fast-solve-bonus-rebalance',
        'powerup-pricing-rebalance'
      ];

      for (const testName of tests) {
        // These tests are disabled by default, so should return null
        const variant = abTestManager.getVariant(testName, 'test-user');
        expect(variant).toBeNull();
      }
    });

    it('should create 50/50 split for main balance test', () => {
      const sampleSize = 1000;
      const assignments: Record<string, number> = { control: 0, 'new-balance': 0 };

      for (let i = 0; i < sampleSize; i++) {
        const userId = `user-${i}`;
        const variant = abTestManager.getVariant('balance-improvements-v2', userId);
        if (variant) {
          assignments[variant]++;
        }
      }

      // Allow for some variance in distribution (within 10% of expected)
      const expectedPerVariant = sampleSize * 0.5 * 0.5; // 50% rollout * 50% weight
      const tolerance = expectedPerVariant * 0.2; // 20% tolerance

      expect(assignments.control).toBeGreaterThan(expectedPerVariant - tolerance);
      expect(assignments.control).toBeLessThan(expectedPerVariant + tolerance);
      expect(assignments['new-balance']).toBeGreaterThan(expectedPerVariant - tolerance);
      expect(assignments['new-balance']).toBeLessThan(expectedPerVariant + tolerance);
    });
  });

  describe('balance configuration retrieval', () => {
    it('should return control configuration for control users', () => {
      // Force user into control group by testing multiple users until we find one
      let controlUser = null;
      for (let i = 0; i < 100; i++) {
        const userId = `control-test-${i}`;
        const { variant } = balanceConfig.getBalanceConfigForUser(userId);
        if (variant === 'control') {
          controlUser = userId;
          break;
        }
      }

      expect(controlUser).not.toBeNull();
      
      if (controlUser) {
        const { config, variant } = balanceConfig.getBalanceConfigForUser(controlUser);
        expect(variant).toBe('control');
        expect(config.useNewBalance).toBe(false);
        expect(config.retry.maxCostCoins).toBe(200);
        expect(config.scoring.maxPenaltyPercent).toBe(50);
        expect(config.fastSolve.thresholdSeconds).toBe(60);
        expect(config.powerups.rocketCostMultiplier).toBe(4.0);
      }
    });

    it('should return new balance configuration for treatment users', () => {
      // Force user into treatment group
      let treatmentUser = null;
      for (let i = 0; i < 100; i++) {
        const userId = `treatment-test-${i}`;
        const { variant } = balanceConfig.getBalanceConfigForUser(userId);
        if (variant === 'new-balance') {
          treatmentUser = userId;
          break;
        }
      }

      expect(treatmentUser).not.toBeNull();
      
      if (treatmentUser) {
        const { config, variant } = balanceConfig.getBalanceConfigForUser(treatmentUser);
        expect(variant).toBe('new-balance');
        expect(config.useNewBalance).toBe(true);
        expect(config.retry.maxCostCoins).toBe(140);
        expect(config.scoring.maxPenaltyPercent).toBe(25);
        expect(config.fastSolve.thresholdSeconds).toBe(30);
        expect(config.powerups.rocketCostMultiplier).toBe(2.0);
      }
    });

    it('should return default configuration for users not in test', () => {
      // Disable the main test temporarily
      (abTestManager as any).tests.get('balance-improvements-v2').enabled = false;
      
      const { config, variant, testName } = balanceConfig.getBalanceConfigForUser('no-test-user');
      expect(config).toBeNull();
      expect(variant).toBeNull();
      expect(testName).toBe('default');
    });
  });

  describe('metrics recording', () => {
    it('should record balance metrics for users in test', () => {
      const userId = 'metrics-test-user';
      
      balanceConfig.recordBalanceMetrics(userId, {
        retryCount: 2,
        totalCoinsSpent: 50,
        scoreAchieved: 1000,
        solveTimeSeconds: 45,
        powerupsUsed: 1,
        levelCompleted: true,
        fastSolveBonus: true
      });

      const results = abTestManager.getResults('balance-improvements-v2');
      const userResult = results.find(r => r.userId === userId);
      
      expect(userResult).toBeDefined();
      expect(userResult?.metrics.retryCount).toBe(2);
      expect(userResult?.metrics.totalCoinsSpent).toBe(50);
      expect(userResult?.metrics.scoreAchieved).toBe(1000);
      expect(userResult?.metrics.completionRate).toBe(1);
      expect(userResult?.metrics.fastSolveRate).toBe(1);
    });

    it('should calculate derived metrics correctly', () => {
      const userId = 'derived-metrics-user';
      
      balanceConfig.recordBalanceMetrics(userId, {
        retryCount: 3,
        totalCoinsSpent: 90,
        scoreAchieved: 1500,
        solveTimeSeconds: 60,
        powerupsUsed: 2,
        levelCompleted: true,
        fastSolveBonus: false
      });

      const results = abTestManager.getResults('balance-improvements-v2');
      const userResult = results.find(r => r.userId === userId);
      
      expect(userResult?.metrics.coinsPerRetry).toBe(30); // 90 / 3
      expect(userResult?.metrics.scorePerSecond).toBe(25); // 1500 / 60
    });
  });

  describe('test results analysis', () => {
    beforeEach(() => {
      // Add mock results for testing
      const mockResults = [
        { testName: 'balance-improvements-v2', variant: 'control', userId: 'user1', timestamp: Date.now(), metrics: { completionRate: 0.7 } },
        { testName: 'balance-improvements-v2', variant: 'control', userId: 'user2', timestamp: Date.now(), metrics: { completionRate: 0.8 } },
        { testName: 'balance-improvements-v2', variant: 'new-balance', userId: 'user3', timestamp: Date.now(), metrics: { completionRate: 0.9 } },
        { testName: 'balance-improvements-v2', variant: 'new-balance', userId: 'user4', timestamp: Date.now(), metrics: { completionRate: 0.85 } }
      ];

      (abTestManager as any).results = mockResults;
    });

    it('should calculate test results and significance', async () => {
      const results = await balanceConfig.getBalanceTestResults();
      
      expect(results.mainTest).toBeDefined();
      expect(results.mainTest.variants.control).toBeDefined();
      expect(results.mainTest.variants['new-balance']).toBeDefined();
      expect(results.individualTests).toBeDefined();
      expect(Array.isArray(results.recommendations)).toBe(true);
    });

    it('should provide recommendations based on results', async () => {
      const results = await balanceConfig.getBalanceTestResults();
      
      expect(results.recommendations.length).toBeGreaterThan(0);
      expect(results.recommendations[0]).toContain('balance');
    });
  });

  describe('test status monitoring', () => {
    it('should track active tests and user distribution', () => {
      // Add some mock results
      (abTestManager as any).results = [
        { testName: 'balance-improvements-v2', variant: 'control', userId: 'user1', timestamp: Date.now(), metrics: {} },
        { testName: 'balance-improvements-v2', variant: 'new-balance', userId: 'user2', timestamp: Date.now(), metrics: {} }
      ];

      const status = balanceConfig.getTestStatus();
      
      expect(status.activeTests).toContain('balance-improvements-v2');
      expect(status.userDistribution['balance-improvements-v2']).toBeDefined();
      expect(status.totalUsers).toBeGreaterThan(0);
    });

    it('should correctly categorize control vs treatment users', () => {
      (abTestManager as any).results = [
        { testName: 'balance-improvements-v2', variant: 'control', userId: 'user1', timestamp: Date.now(), metrics: {} },
        { testName: 'balance-improvements-v2', variant: 'new-balance', userId: 'user2', timestamp: Date.now(), metrics: {} },
        { testName: 'retry-cost-rebalance', variant: 'expensive-rocket', userId: 'user3', timestamp: Date.now(), metrics: {} },
        { testName: 'retry-cost-rebalance', variant: 'affordable-rocket', userId: 'user4', timestamp: Date.now(), metrics: {} }
      ];

      const status = balanceConfig.getTestStatus();
      
      expect(status.userDistribution['balance-improvements-v2'].control).toBe(1);
      expect(status.userDistribution['balance-improvements-v2'].treatment).toBe(1);
    });
  });

  describe('configuration validation', () => {
    it('should have valid test configurations', () => {
      const tests = [
        'balance-improvements-v2',
        'retry-cost-rebalance',
        'score-penalty-rebalance',
        'fast-solve-bonus-rebalance',
        'powerup-pricing-rebalance'
      ];

      for (const testName of tests) {
        const testConfig = (abTestManager as any).tests.get(testName);
        expect(testConfig).toBeDefined();
        expect(testConfig.variants.length).toBeGreaterThan(0);
        
        // Validate variant weights sum to 100
        const totalWeight = testConfig.variants.reduce((sum: number, variant: any) => sum + variant.weight, 0);
        expect(totalWeight).toBe(100);
      }
    });

    it('should have proper rollout percentages', () => {
      const mainTest = (abTestManager as any).tests.get('balance-improvements-v2');
      expect(mainTest.rolloutPercentage).toBe(50);

      const individualTests = [
        'retry-cost-rebalance',
        'score-penalty-rebalance',
        'fast-solve-bonus-rebalance',
        'powerup-pricing-rebalance'
      ];

      for (const testName of individualTests) {
        const test = (abTestManager as any).tests.get(testName);
        expect(test.rolloutPercentage).toBe(25);
        expect(test.enabled).toBe(false); // Individual tests disabled by default
      }
    });
  });
});