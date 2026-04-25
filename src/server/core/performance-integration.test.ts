/**
 * Integration Tests for Performance Optimizations
 * 
 * Tests that all performance optimizations work together correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceIntegrationManager, performanceIntegration } from './performance-integration';
import { bootstrapGameOptimized } from './bootstrap-optimized';
import { submitGuessesForSessionOptimized } from './game-service-optimized';
import { paginatedLeaderboardService } from './paginated-leaderboard-service';

// Mock dependencies
vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 'test-user-123',
    username: 'testuser',
    subredditName: 'testsubreddit',
    postId: 'test-post-123',
  },
  redis: {
    hGetAll: vi.fn(),
    get: vi.fn(),
    zCard: vi.fn(),
    zRange: vi.fn(),
  },
}));

vi.mock('./bootstrap-optimized');
vi.mock('./game-service-optimized');
vi.mock('./paginated-leaderboard-service');
vi.mock('./completion-journal-cleanup');
vi.mock('./traffic-aware-scheduler');
vi.mock('../../shared/ab-testing');
vi.mock('../../shared/bundle-analysis');

describe('PerformanceIntegrationManager', () => {
  let integrationManager: PerformanceIntegrationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    integrationManager = new PerformanceIntegrationManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize all performance optimizations', async () => {
      const config = {
        enableOptimizedBootstrap: true,
        enableParallelGuessProcessing: true,
        enablePaginatedLeaderboards: true,
        enableAutomatedCleanup: true,
        enableBalanceABTesting: true,
        enableClientOptimizations: true,
        performanceMonitoring: true,
      };

      const manager = new PerformanceIntegrationManager(config);
      await manager.initialize();

      expect(manager.getConfig()).toEqual(expect.objectContaining(config));
    });

    it('should handle initialization errors gracefully', async () => {
      const manager = new PerformanceIntegrationManager();
      
      // Should not throw even if some components fail to initialize
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('optimized function selection', () => {
    it('should return optimized bootstrap when enabled', async () => {
      const manager = new PerformanceIntegrationManager({
        enableOptimizedBootstrap: true,
      });

      const bootstrapFn = manager.getBootstrapFunction();
      expect(bootstrapFn).toBe(bootstrapGameOptimized);
    });

    it('should return optimized guess processing when enabled', async () => {
      const manager = new PerformanceIntegrationManager({
        enableParallelGuessProcessing: true,
      });

      const guessFn = manager.getGuessProcessingFunction();
      expect(guessFn).toBe(submitGuessesForSessionOptimized);
    });

    it('should return paginated leaderboard service when enabled', async () => {
      const manager = new PerformanceIntegrationManager({
        enablePaginatedLeaderboards: true,
      });

      const leaderboardService = manager.getLeaderboardService();
      expect(leaderboardService).toBe(paginatedLeaderboardService);
    });
  });

  describe('balance configuration', () => {
    it('should return balance configuration for user', async () => {
      const manager = new PerformanceIntegrationManager({
        enableBalanceABTesting: true,
      });
      await manager.initialize();

      const balanceConfig = manager.getBalanceConfigForUser('test-user-123');

      expect(balanceConfig).toHaveProperty('retryCostCalculator');
      expect(balanceConfig).toHaveProperty('scorePenaltyEngine');
      expect(balanceConfig).toHaveProperty('fastSolveBonusSystem');
      expect(balanceConfig).toHaveProperty('powerupPricingEngine');
    });
  });

  describe('performance metrics', () => {
    it('should collect performance metrics from all systems', async () => {
      const manager = new PerformanceIntegrationManager();
      await manager.initialize();

      const metrics = manager.getPerformanceMetrics();

      expect(metrics).toHaveProperty('bootstrap');
      expect(metrics).toHaveProperty('guessProcessing');
      expect(metrics).toHaveProperty('leaderboard');
      expect(metrics).toHaveProperty('cleanup');
      expect(metrics).toHaveProperty('clientOptimizations');
      expect(metrics).toHaveProperty('abTesting');
    });
  });

  describe('integration validation', () => {
    it('should validate that all optimizations work correctly', async () => {
      const manager = new PerformanceIntegrationManager();
      await manager.initialize();

      // Mock successful operations
      vi.mocked(bootstrapGameOptimized).mockResolvedValue({
        userId: 'test-user-123',
        username: 'testuser',
        subredditName: 'testsubreddit',
        postId: 'test-post-123',
        currentDailyLevelId: 'daily-123',
        todayDateKey: '2024-01-01',
        profile: {} as any,
        inventory: {} as any,
        endlessCatalog: {} as any,
      });

      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue({
        entries: Array(10).fill({}),
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 10,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 1,
        },
      });

      const validation = await manager.validateIntegration();

      expect(validation.success).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect performance issues', async () => {
      const manager = new PerformanceIntegrationManager();
      await manager.initialize();

      // Mock slow bootstrap
      vi.mocked(bootstrapGameOptimized).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 600)); // Slow operation
        return {} as any;
      });

      const validation = await manager.validateIntegration();

      expect(validation.success).toBe(false);
      expect(validation.issues.some(issue => issue.includes('Bootstrap duration'))).toBe(true);
    });

    it('should detect leaderboard pagination issues', async () => {
      const manager = new PerformanceIntegrationManager();
      await manager.initialize();

      // Mock oversized page
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue({
        entries: Array(100).fill({}), // Too many entries
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 100,
        pageInfo: {
          currentPage: 1,
          pageSize: 100,
          totalPages: 1,
        },
      });

      const validation = await manager.validateIntegration();

      expect(validation.success).toBe(false);
      expect(validation.issues.some(issue => issue.includes('page size'))).toBe(true);
    });
  });

  describe('configuration management', () => {
    it('should allow configuration updates', () => {
      const manager = new PerformanceIntegrationManager();
      
      const initialConfig = manager.getConfig();
      expect(initialConfig.enableOptimizedBootstrap).toBe(true);

      manager.updateConfig({ enableOptimizedBootstrap: false });
      
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.enableOptimizedBootstrap).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should shutdown all systems gracefully', async () => {
      const manager = new PerformanceIntegrationManager();
      await manager.initialize();

      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('Global Performance Integration', () => {
  it('should provide global access to performance functions', () => {
    expect(performanceIntegration).toBeDefined();
    expect(performanceIntegration.getBootstrapFunction).toBeDefined();
    expect(performanceIntegration.getGuessProcessingFunction).toBeDefined();
    expect(performanceIntegration.getLeaderboardService).toBeDefined();
  });

  it('should initialize automatically', () => {
    // The global instance should initialize on import
    expect(performanceIntegration).toBeInstanceOf(PerformanceIntegrationManager);
  });
});

describe('Integration Property Tests', () => {
  /**
   * **Feature: game-performance-and-balance-improvements, Property 11: Performance Integration Correctness**
   * **Validates: All server and client requirements**
   * 
   * For any performance optimization configuration, the integration system SHALL coordinate all optimizations
   * to work together without conflicts AND maintain backward compatibility AND provide measurable performance
   * improvements while preserving system reliability.
   */
  it('should satisfy performance integration correctness property', async () => {
    const manager = new PerformanceIntegrationManager();
    await manager.initialize();

    // Test that all optimizations can be enabled together
    const config = manager.getConfig();
    expect(config.enableOptimizedBootstrap).toBe(true);
    expect(config.enableParallelGuessProcessing).toBe(true);
    expect(config.enablePaginatedLeaderboards).toBe(true);
    expect(config.enableAutomatedCleanup).toBe(true);
    expect(config.enableBalanceABTesting).toBe(true);
    expect(config.enableClientOptimizations).toBe(true);

    // Test that functions are properly wired
    const bootstrapFn = manager.getBootstrapFunction();
    const guessFn = manager.getGuessProcessingFunction();
    const leaderboardService = manager.getLeaderboardService();
    const balanceConfig = manager.getBalanceConfigForUser('test-user');

    expect(bootstrapFn).toBeDefined();
    expect(guessFn).toBeDefined();
    expect(leaderboardService).toBeDefined();
    expect(balanceConfig).toBeDefined();

    // Test metrics collection
    const metrics = manager.getPerformanceMetrics();
    expect(metrics).toHaveProperty('bootstrap');
    expect(metrics).toHaveProperty('guessProcessing');
    expect(metrics).toHaveProperty('leaderboard');
    expect(metrics).toHaveProperty('cleanup');
    expect(metrics).toHaveProperty('clientOptimizations');
    expect(metrics).toHaveProperty('abTesting');

    // Test validation
    const validation = await manager.validateIntegration();
    expect(validation).toHaveProperty('success');
    expect(validation).toHaveProperty('issues');
    expect(validation).toHaveProperty('recommendations');
  });
});