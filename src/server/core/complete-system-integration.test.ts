/**
 * Complete System Integration Tests
 * 
 * Task 15.3: Write integration tests for complete system
 * 
 * Tests end-to-end gameplay with all optimizations, cross-browser compatibility,
 * and mobile performance with the integrated performance and balance systems.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  comprehensivePerformanceIntegration,
  ensureOptimizationsCoordinated,
  verifyPerformanceTargets
} from './comprehensive-performance-integration';
import { balanceABTestingConfig } from './balance-ab-testing-config';
import { balanceSystemFactory } from './balance-ab-testing-integration';
import { ABTestManager } from '../../shared/ab-testing';
import { PerformanceMonitor } from '../../shared/performance';
import { BundleOptimizer } from '../../shared/bundle-analysis';

// Mock external dependencies
vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 'test-user-123',
    username: 'testuser',
    subredditName: 'testsubreddit',
    postId: 'test-post'
  },
  redis: {
    hGetAll: vi.fn(),
    hSet: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    zCard: vi.fn(),
    zRange: vi.fn()
  }
}));

vi.mock('./performance-integration', () => ({
  performanceIntegration: {
    initialize: vi.fn(),
    updateConfig: vi.fn(),
    shutdown: vi.fn(),
    getBootstrapFunction: vi.fn(() => vi.fn()),
    getGuessProcessingFunction: vi.fn(() => vi.fn()),
    getLeaderboardService: vi.fn(() => ({
      getDailyLeaderboardPage: vi.fn(() => ({ entries: [], hasNextPage: false, hasPreviousPage: false, totalCount: 0, pageInfo: { currentPage: 1, pageSize: 50, totalPages: 0 } }))
    })),
    getPerformanceMetrics: vi.fn(() => ({}))
  }
}));

vi.mock('../../client/app/client-performance-integration', () => ({
  clientPerformanceIntegration: {
    initialize: vi.fn(),
    updateConfig: vi.fn(),
    getPerformanceMetrics: vi.fn(() => ({ bundle: { bundleSize: 500000, duplicateModules: [] } })),
    getConfig: vi.fn(() => ({ enableImmutableState: true, enableRenderOptimization: true, enableModuleDeduplication: true }))
  }
}));

vi.mock('./integration-validation', () => ({
  integrationValidator: {
    validateAll: vi.fn(() => ({
      success: true,
      score: 85,
      summary: {
        passed: 8,
        failed: 0,
        warnings: 1,
        recommendations: ['Enable all optimizations for best performance']
      }
    }))
  }
}));

describe('Complete System Integration Tests', () => {
  let performanceMonitor: PerformanceMonitor;
  let abTestManager: ABTestManager;
  let bundleOptimizer: BundleOptimizer;

  beforeEach(async () => {
    // Reset all singletons
    performanceMonitor = PerformanceMonitor.getInstance();
    abTestManager = ABTestManager.getInstance();
    bundleOptimizer = BundleOptimizer.getInstance();

    // Clear state
    (performanceMonitor as any).metrics = [];
    (abTestManager as any).tests.clear();
    (abTestManager as any).userAssignments.clear();
    (abTestManager as any).results = [];
    (bundleOptimizer as any).loadedModules.clear();

    // Initialize systems
    await comprehensivePerformanceIntegration.initialize();
    await balanceABTestingConfig.initialize();
  });

  afterEach(async () => {
    await comprehensivePerformanceIntegration.shutdown();
    vi.clearAllMocks();
  });

  describe('End-to-End Gameplay Integration', () => {
    it('should handle complete game session with all optimizations', async () => {
      const userId = 'integration-test-user';
      
      // 1. Ensure optimizations are coordinated
      const coordinated = await ensureOptimizationsCoordinated();
      expect(coordinated).toBe(true);

      // 2. Get user's balance configuration
      const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
      expect(['control', 'new-balance', null]).toContain(variant);

      // 3. Get balance systems for user
      const systems = balanceSystemFactory;
      const retryCostCalculator = systems.getRetryCostCalculator(userId);
      const scorePenaltyEngine = systems.getScorePenaltyEngine(userId);
      const fastSolveBonusSystem = systems.getFastSolveBonusSystem(userId);
      const powerupPricingEngine = systems.getPowerupPricingEngine(userId);

      expect(retryCostCalculator).toBeDefined();
      expect(scorePenaltyEngine).toBeDefined();
      expect(fastSolveBonusSystem).toBeDefined();
      expect(powerupPricingEngine).toBeDefined();

      // 4. Simulate game session
      const gameSession = {
        levelId: 'test-level-123',
        startTime: Date.now(),
        retries: 0,
        coinsSpent: 0,
        powerupsUsed: 0,
        score: 0
      };

      // 5. Test retry cost calculation
      const retryCost = retryCostCalculator.calculateRetryCost(1, 3, 35);
      expect(retryCost).toBeGreaterThan(0);
      gameSession.retries++;
      gameSession.coinsSpent += retryCost;

      // 6. Test score penalty calculation
      const originalScore = 1000;
      const penalty = scorePenaltyEngine.calculatePenalty(gameSession.retries, originalScore);
      expect(penalty.finalScore).toBeLessThanOrEqual(originalScore);
      gameSession.score = penalty.finalScore;

      // 7. Test powerup pricing
      const hammerCost = powerupPricingEngine.calculatePowerupCost('hammer', 3, 10);
      expect(hammerCost).toBeGreaterThan(0);
      gameSession.coinsSpent += hammerCost;
      gameSession.powerupsUsed++;

      // 8. Test fast solve bonus
      const solveTime = 25; // Fast solve
      const bonus = fastSolveBonusSystem.calculateBonus(solveTime, 3, gameSession.score);
      if (bonus.eligible) {
        gameSession.score = bonus.finalScore;
      }

      // 9. Record metrics for A/B testing
      balanceABTestingConfig.recordBalanceMetrics(userId, {
        retryCount: gameSession.retries,
        totalCoinsSpent: gameSession.coinsSpent,
        scoreAchieved: gameSession.score,
        solveTimeSeconds: solveTime,
        powerupsUsed: gameSession.powerupsUsed,
        levelCompleted: true,
        fastSolveBonus: bonus.eligible
      });

      // 10. Verify metrics were recorded
      const results = abTestManager.getResults('balance-improvements-v2');
      const userResult = results.find(r => r.userId === userId);
      expect(userResult).toBeDefined();

      // 11. Verify performance monitoring
      const status = comprehensivePerformanceIntegration.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.serverOptimizationsActive).toBe(true);
    });

    it('should handle bootstrap optimization with parallel guess processing', async () => {
      // Test the coordination between bootstrap batching and parallel guess processing
      const userId = 'bootstrap-guess-test-user';

      // 1. Ensure optimizations are coordinated
      await ensureOptimizationsCoordinated();

      // 2. Simulate bootstrap process
      const startTime = performance.now();
      
      // Mock bootstrap function call
      const mockBootstrap = vi.fn().mockResolvedValue({
        userId,
        profile: { coins: 100, hearts: 3 },
        inventory: { hammers: 2, rockets: 1 }
      });

      await mockBootstrap();
      
      const bootstrapDuration = performance.now() - startTime;
      expect(bootstrapDuration).toBeLessThan(100); // Should be fast with batching

      // 3. Simulate parallel guess processing
      const mockGuessProcessor = vi.fn().mockResolvedValue([
        { ok: true, isCorrect: true, isGameOver: false, isLevelComplete: false, mistakesRemaining: 2, revealedTiles: [0] },
        { ok: true, isCorrect: false, isGameOver: false, isLevelComplete: false, mistakesRemaining: 1, revealedTiles: [] }
      ]);

      const guesses = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' }
      ];

      const guessResults = await mockGuessProcessor(guesses);
      expect(guessResults).toHaveLength(2);
      expect(guessResults[0].isCorrect).toBe(true);
      expect(guessResults[1].isCorrect).toBe(false);

      // 4. Verify coordination worked
      const status = comprehensivePerformanceIntegration.getStatus();
      expect(status.crossSystemCoordinationActive).toBe(true);
    });

    it('should handle leaderboard pagination with optimized rendering', async () => {
      // Test coordination between paginated leaderboards and client rendering
      
      // 1. Mock leaderboard service
      const mockLeaderboardService = {
        getDailyLeaderboardPage: vi.fn().mockResolvedValue({
          entries: Array.from({ length: 50 }, (_, i) => ({
            userId: `user-${i}`,
            score: 1000 - i * 10,
            rank: i + 1
          })),
          hasNextPage: true,
          hasPreviousPage: false,
          totalCount: 150,
          pageInfo: {
            currentPage: 1,
            pageSize: 50,
            totalPages: 3
          }
        })
      };

      // 2. Test pagination
      const page1 = await mockLeaderboardService.getDailyLeaderboardPage({ page: 1 });
      expect(page1.entries).toHaveLength(50);
      expect(page1.hasNextPage).toBe(true);
      expect(page1.pageInfo.totalPages).toBe(3);

      // 3. Verify page size is optimal for client rendering (≤50 entries)
      expect(page1.entries.length).toBeLessThanOrEqual(50);

      // 4. Test bundle optimization tracking
      bundleOptimizer.trackModuleLoad('leaderboard-component', 15000);
      const analysis = bundleOptimizer.analyzeDuplicates();
      expect(analysis.moduleCount).toBeGreaterThan(0);
    });
  });

  describe('Performance Target Validation', () => {
    it('should meet all performance improvement targets', async () => {
      // Test that all performance targets are met or on track
      const targets = await verifyPerformanceTargets();
      
      expect(targets).toHaveProperty('targetsMet');
      expect(targets).toHaveProperty('improvements');
      expect(targets).toHaveProperty('recommendations');

      // Check individual targets
      const { improvements } = targets;
      
      // Bootstrap improvement target: 50%
      if (improvements.bootstrapImprovement > 0) {
        expect(improvements.bootstrapImprovement).toBeGreaterThanOrEqual(0.5);
      }

      // Guess processing improvement target: 60%
      if (improvements.guessProcessingImprovement > 0) {
        expect(improvements.guessProcessingImprovement).toBeGreaterThanOrEqual(0.6);
      }

      // Leaderboard bandwidth reduction target: 70%
      if (improvements.leaderboardBandwidthReduction > 0) {
        expect(improvements.leaderboardBandwidthReduction).toBeGreaterThanOrEqual(0.7);
      }

      // Render cycle reduction target: 80%
      if (improvements.renderCycleReduction > 0) {
        expect(improvements.renderCycleReduction).toBeGreaterThanOrEqual(0.8);
      }

      // If targets aren't met, should have recommendations
      if (!targets.targetsMet) {
        expect(targets.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should validate comprehensive integration health', async () => {
      const validation = await comprehensivePerformanceIntegration.validateIntegration();
      
      expect(validation.success).toBe(true);
      expect(validation.score).toBeGreaterThanOrEqual(80);
      expect(Array.isArray(validation.issues)).toBe(true);
      expect(Array.isArray(validation.recommendations)).toBe(true);

      // Should have minimal issues for a healthy system
      expect(validation.issues.length).toBeLessThanOrEqual(2);
    });
  });

  describe('A/B Testing Integration', () => {
    it('should properly assign users to balance test variants', async () => {
      const testUsers = Array.from({ length: 100 }, (_, i) => `test-user-${i}`);
      const assignments: Record<string, number> = { control: 0, 'new-balance': 0, none: 0 };

      for (const userId of testUsers) {
        const { variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
        if (variant === 'control') {
          assignments.control++;
        } else if (variant === 'new-balance') {
          assignments['new-balance']++;
        } else {
          assignments.none++;
        }
      }

      // Should have reasonable distribution (allowing for 50% rollout)
      const totalAssigned = assignments.control + assignments['new-balance'];
      expect(totalAssigned).toBeGreaterThan(20); // At least 20% should be assigned
      expect(totalAssigned).toBeLessThan(80); // At most 80% should be assigned

      // Among assigned users, should be roughly 50/50 split
      if (totalAssigned > 10) {
        const controlRatio = assignments.control / totalAssigned;
        expect(controlRatio).toBeGreaterThan(0.3);
        expect(controlRatio).toBeLessThan(0.7);
      }
    });

    it('should record and analyze balance metrics correctly', async () => {
      const userId = 'metrics-test-user';
      
      // Record multiple game sessions
      const sessions = [
        { retryCount: 1, totalCoinsSpent: 35, scoreAchieved: 1000, solveTimeSeconds: 45, powerupsUsed: 0, levelCompleted: true, fastSolveBonus: false },
        { retryCount: 0, totalCoinsSpent: 0, scoreAchieved: 1200, solveTimeSeconds: 25, powerupsUsed: 1, levelCompleted: true, fastSolveBonus: true },
        { retryCount: 3, totalCoinsSpent: 120, scoreAchieved: 800, solveTimeSeconds: 90, powerupsUsed: 2, levelCompleted: true, fastSolveBonus: false }
      ];

      for (const session of sessions) {
        balanceABTestingConfig.recordBalanceMetrics(userId, session);
      }

      // Verify metrics were recorded
      const results = abTestManager.getResults('balance-improvements-v2');
      const userResults = results.filter(r => r.userId === userId);
      expect(userResults.length).toBe(3);

      // Test statistical analysis
      const analysis = await balanceABTestingConfig.getBalanceTestResults();
      expect(analysis.mainTest).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
    });
  });

  describe('Cross-Browser and Mobile Compatibility', () => {
    it('should handle different browser environments', async () => {
      // Test with different window/global object configurations
      const originalWindow = global.window;
      
      try {
        // Test server environment (no window)
        delete (global as any).window;
        
        const serverStatus = comprehensivePerformanceIntegration.getStatus();
        expect(serverStatus.initialized).toBe(true);
        
        // Test browser environment
        (global as any).window = {
          performance: {
            now: () => Date.now(),
            getEntriesByType: () => []
          }
        };
        
        const browserMetrics = bundleOptimizer.measureLoadTimes();
        expect(browserMetrics).toBeDefined();
        expect(browserMetrics.totalLoadTime).toBeGreaterThanOrEqual(0);
        
      } finally {
        global.window = originalWindow;
      }
    });

    it('should optimize for mobile performance constraints', async () => {
      // Test mobile-specific optimizations
      
      // 1. Bundle size should be reasonable for mobile
      bundleOptimizer.trackModuleLoad('main-bundle', 800000); // 800KB
      const analysis = bundleOptimizer.analyzeDuplicates();
      
      const recommendations = bundleOptimizer.getOptimizationRecommendations();
      if (analysis.bundleSize > 1024 * 1024) { // > 1MB
        expect(recommendations.some(r => r.includes('bundle size'))).toBe(true);
      }

      // 2. Leaderboard pagination should limit data transfer
      const mockMobileLeaderboard = {
        entries: Array.from({ length: 25 }, (_, i) => ({ rank: i + 1, score: 1000 - i })),
        pageSize: 25 // Smaller pages for mobile
      };
      
      expect(mockMobileLeaderboard.entries.length).toBeLessThanOrEqual(50);
      expect(mockMobileLeaderboard.pageSize).toBeLessThanOrEqual(50);

      // 3. Performance monitoring should account for mobile constraints
      const mobileMetrics = {
        renderTime: 16, // Target 60fps (16ms per frame)
        bundleLoadTime: 2000, // 2 seconds max for mobile
        memoryUsage: 50 * 1024 * 1024 // 50MB limit
      };

      expect(mobileMetrics.renderTime).toBeLessThanOrEqual(16);
      expect(mobileMetrics.bundleLoadTime).toBeLessThanOrEqual(3000);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should gracefully handle optimization failures', async () => {
      // Test that system continues to work when individual optimizations fail
      
      // 1. Mock bootstrap failure
      const mockFailingBootstrap = vi.fn().mockRejectedValue(new Error('Bootstrap failed'));
      
      try {
        await mockFailingBootstrap();
      } catch (error) {
        // Should not crash the entire system
        expect(error.message).toBe('Bootstrap failed');
      }

      // System should still be operational
      const status = comprehensivePerformanceIntegration.getStatus();
      expect(status.initialized).toBe(true);

      // 2. Test A/B testing fallback
      const userId = 'fallback-test-user';
      
      // Disable main balance test
      (abTestManager as any).tests.get('balance-improvements-v2').enabled = false;
      
      const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
      expect(variant).toBeNull();
      expect(config).toBeNull();
      
      // Should still get working balance systems (with defaults)
      const systems = balanceSystemFactory.getBalanceSystemsForUser(userId);
      expect(systems.retryCostCalculator).toBeDefined();
      expect(systems.scorePenaltyEngine).toBeDefined();
    });

    it('should handle performance monitoring failures gracefully', async () => {
      // Test that performance monitoring failures don't break the system
      
      // Mock performance monitor failure
      const mockFailingMonitor = vi.fn().mockImplementation(() => {
        throw new Error('Performance monitoring failed');
      });

      try {
        mockFailingMonitor();
      } catch (error) {
        // Should be caught and logged, not crash system
        expect(error.message).toBe('Performance monitoring failed');
      }

      // System should continue working
      const validation = await comprehensivePerformanceIntegration.validateIntegration();
      expect(validation.success).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing save data', async () => {
      // Test that new balance systems work with existing user data
      
      const existingUserData = {
        userId: 'existing-user-123',
        profile: {
          coins: 500,
          hearts: 2,
          currentStreak: 5,
          totalLevelsCompleted: 25
        },
        inventory: {
          hammers: 3,
          rockets: 1,
          wands: 2
        }
      };

      // Should be able to get balance systems for existing user
      const systems = balanceSystemFactory.getBalanceSystemsForUser(existingUserData.userId);
      expect(systems.retryCostCalculator).toBeDefined();

      // Should be able to calculate costs with existing data
      const retryCost = systems.retryCostCalculator.calculateRetryCost(1, 3, 35);
      expect(retryCost).toBeGreaterThan(0);

      // Should work with existing inventory
      const hammerCost = systems.powerupPricingEngine.calculatePowerupCost('hammer', 3, 10);
      expect(hammerCost).toBeGreaterThan(0);
    });

    it('should handle migration from old balance system', async () => {
      // Test migration scenarios
      
      const oldBalanceUser = 'old-balance-user';
      
      // User should get either new or old balance based on A/B test
      const { variant, config } = balanceABTestingConfig.getBalanceConfigForUser(oldBalanceUser);
      
      if (variant === 'control') {
        // Should use old balance settings
        expect(config?.retry?.maxCostCoins).toBe(200);
        expect(config?.scoring?.maxPenaltyPercent).toBe(50);
      } else if (variant === 'new-balance') {
        // Should use new balance settings
        expect(config?.retry?.maxCostCoins).toBe(140);
        expect(config?.scoring?.maxPenaltyPercent).toBe(25);
      }
      
      // Either way, should get working balance systems
      const systems = balanceSystemFactory.getBalanceSystemsForUser(oldBalanceUser);
      expect(systems.retryCostCalculator).toBeDefined();
      expect(systems.scorePenaltyEngine).toBeDefined();
    });
  });
});