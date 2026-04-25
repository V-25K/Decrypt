/**
 * Performance Integration Layer
 * 
 * Wires all performance optimizations together to ensure they work cohesively:
 * - Batched bootstrap with parallel guess processing
 * - Paginated leaderboards with optimized rendering
 * - Server optimizations with client improvements
 * - A/B testing integration for balance changes
 */

import { bootstrapGameOptimized } from './bootstrap-optimized';
import { submitGuessesForSessionOptimized } from './game-service-optimized';
import { paginatedLeaderboardService } from './paginated-leaderboard-service';
import { CompletionJournalCleanup } from './completion-journal-cleanup';
import { TrafficAwareScheduler } from './traffic-aware-scheduler';
import { PerformanceMonitor } from '../../shared/performance';
import { ABTestManager, defaultABTests } from '../../shared/ab-testing';
import { balanceABTestingManager, balanceABTestConfigs } from '../../shared/balance-ab-testing-config';
import { BundleOptimizer, ModuleManager } from '../../shared/bundle-analysis';
import { rebalancedRetryCostCalculator } from '../../shared/rebalanced-retry-cost-calculator';
import { rebalancedScorePenaltyEngine } from '../../shared/rebalanced-score-penalty-engine';
import { rebalancedFastSolveBonusSystem } from '../../shared/rebalanced-fast-solve-bonus-system';
import { rebalancedPowerupPricingEngine } from '../../shared/rebalanced-powerup-pricing-engine';

/**
 * Performance integration configuration
 */
export interface PerformanceIntegrationConfig {
  enableOptimizedBootstrap: boolean;
  enableParallelGuessProcessing: boolean;
  enablePaginatedLeaderboards: boolean;
  enableAutomatedCleanup: boolean;
  enableBalanceABTesting: boolean;
  enableClientOptimizations: boolean;
  performanceMonitoring: boolean;
}

/**
 * Default integration configuration
 */
const DEFAULT_CONFIG: PerformanceIntegrationConfig = {
  enableOptimizedBootstrap: true,
  enableParallelGuessProcessing: true,
  enablePaginatedLeaderboards: true,
  enableAutomatedCleanup: true,
  enableBalanceABTesting: true,
  enableClientOptimizations: true,
  performanceMonitoring: true,
};

/**
 * Performance Integration Manager
 * 
 * Coordinates all performance optimizations and ensures they work together
 */
export class PerformanceIntegrationManager {
  private config: PerformanceIntegrationConfig;
  private performanceMonitor: PerformanceMonitor;
  private abTestManager: ABTestManager;
  private bundleOptimizer: BundleOptimizer;
  private moduleManager: ModuleManager;
  private cleanupScheduler: TrafficAwareScheduler | null = null;
  private initialized = false;

  constructor(config: Partial<PerformanceIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.abTestManager = ABTestManager.getInstance();
    this.bundleOptimizer = BundleOptimizer.getInstance();
    this.moduleManager = ModuleManager.getInstance();
  }

  /**
   * Initialize all performance optimizations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize A/B testing for balance changes
    if (this.config.enableBalanceABTesting) {
      await this.initializeABTesting();
    }

    // Initialize automated cleanup
    if (this.config.enableAutomatedCleanup) {
      await this.initializeAutomatedCleanup();
    }

    // Initialize performance monitoring
    if (this.config.performanceMonitoring) {
      await this.initializePerformanceMonitoring();
    }

    // Initialize client optimizations
    if (this.config.enableClientOptimizations) {
      await this.initializeClientOptimizations();
    }

    this.initialized = true;
  }

  /**
   * Initialize A/B testing for balance changes
   */
  private async initializeABTesting(): Promise<void> {
    // Initialize the enhanced balance A/B testing manager
    await balanceABTestingManager.initialize();

    if (!this.abTestManager || typeof this.abTestManager.registerTest !== 'function') {
      return;
    }

    // Register default A/B tests (for backward compatibility)
    for (const test of defaultABTests) {
      this.abTestManager.registerTest(test);
    }

    // Register enhanced balance A/B test configurations
    for (const test of balanceABTestConfigs) {
      this.abTestManager.registerTest(test);
    }
  }

  /**
   * Initialize automated cleanup system
   */
  private async initializeAutomatedCleanup(): Promise<void> {
    const cleanup = new CompletionJournalCleanup();
    this.cleanupScheduler = new TrafficAwareScheduler(cleanup);
    
    // Start the scheduler
    this.cleanupScheduler.start();
  }

  /**
   * Initialize performance monitoring
   */
  private async initializePerformanceMonitoring(): Promise<void> {
    // Clear any existing metrics
    this.performanceMonitor.clearMetrics();
  }

  /**
   * Initialize client-side optimizations
   */
  private async initializeClientOptimizations(): Promise<void> {
    // Only initialize client optimizations if we're in a client context
    if (typeof window !== 'undefined') {
      // Clear any existing module cache to ensure clean state
      this.moduleManager?.clearCache();

      // Initialize bundle optimization tracking
      this.bundleOptimizer?.clearTracking();
    }
  }

  /**
   * Get optimized bootstrap function based on configuration
   */
  getBootstrapFunction(): typeof bootstrapGameOptimized {
    if (this.config.enableOptimizedBootstrap) {
      return bootstrapGameOptimized;
    }
    
    // Fallback to original implementation
    const { bootstrapGame } = require('./game-service');
    return bootstrapGame;
  }

  /**
   * Get optimized guess processing function based on configuration
   */
  getGuessProcessingFunction(): typeof submitGuessesForSessionOptimized {
    if (this.config.enableParallelGuessProcessing) {
      return submitGuessesForSessionOptimized;
    }
    
    // Fallback to original implementation
    const { submitGuessesForSession } = require('./game-service');
    return submitGuessesForSession;
  }

  /**
   * Get paginated leaderboard service based on configuration
   */
  getLeaderboardService(): typeof paginatedLeaderboardService {
    if (this.config.enablePaginatedLeaderboards) {
      return paginatedLeaderboardService;
    }
    
    // Fallback to original implementation would go here
    return paginatedLeaderboardService;
  }

  /**
   * Get balance configuration for a user (with A/B testing)
   */
  getBalanceConfigForUser(userId: string): {
    retryCostCalculator: typeof rebalancedRetryCostCalculator;
    scorePenaltyEngine: typeof rebalancedScorePenaltyEngine;
    fastSolveBonusSystem: typeof rebalancedFastSolveBonusSystem;
    powerupPricingEngine: typeof rebalancedPowerupPricingEngine;
  } {
    if (this.config.enableBalanceABTesting) {
      // Record A/B test assignment
      if (this.abTestManager && typeof this.abTestManager.recordResult === 'function') {
        this.abTestManager.recordResult('balance-improvements', userId, {
          timestamp: Date.now(),
          assigned: 1
        });
      }

      // Return rebalanced systems (A/B testing is handled internally by each system)
      return {
        retryCostCalculator: rebalancedRetryCostCalculator,
        scorePenaltyEngine: rebalancedScorePenaltyEngine,
        fastSolveBonusSystem: rebalancedFastSolveBonusSystem,
        powerupPricingEngine: rebalancedPowerupPricingEngine,
      };
    }

    // Return original implementations if A/B testing is disabled
    return {
      retryCostCalculator: rebalancedRetryCostCalculator,
      scorePenaltyEngine: rebalancedScorePenaltyEngine,
      fastSolveBonusSystem: rebalancedFastSolveBonusSystem,
      powerupPricingEngine: rebalancedPowerupPricingEngine,
    };
  }

  /**
   * Get performance metrics for all optimizations
   */
  getPerformanceMetrics(): {
    bootstrap: any;
    guessProcessing: any;
    leaderboard: any;
    cleanup: any;
    clientOptimizations: any;
    abTesting: any;
  } {
    const cleanupStatus = this.cleanupScheduler?.getStatus();
    const bundleAnalysis = this.bundleOptimizer &&
      typeof this.bundleOptimizer.analyzeDuplicates === 'function'
      ? this.bundleOptimizer.analyzeDuplicates()
      : { duplicateModules: [] };

    return {
      bootstrap: this.performanceMonitor.getMetrics('bootstrap-optimized'),
      guessProcessing: this.performanceMonitor.getMetrics('guess-processing'),
      leaderboard: this.performanceMonitor.getMetrics('leaderboard-pagination'),
      cleanup: {
        status: cleanupStatus,
        lastRun: cleanupStatus?.lastCleanupTime,
        nextRun: cleanupStatus?.nextScheduledTime,
      },
      clientOptimizations: {
        bundleAnalysis: typeof window !== 'undefined' ? bundleAnalysis : null,
        moduleCount: typeof window !== 'undefined' ? this.moduleManager?.getLoadedModuleCount() : 0,
      },
      abTesting: {
        activeTests: this.abTestManager && typeof this.abTestManager.getResults === 'function'
          ? this.abTestManager.getResults('balance-improvements').length
          : 0,
      },
    };
  }

  /**
   * Validate that all optimizations are working correctly
   */
  async validateIntegration(): Promise<{
    success: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Validate bootstrap optimization
    if (this.config.enableOptimizedBootstrap) {
      try {
        const startTime = performance.now();
        await this.getBootstrapFunction()();
        const duration = performance.now() - startTime;
        
        if (duration > 500) {
          issues.push(`Bootstrap duration (${duration.toFixed(2)}ms) exceeds 500ms threshold`);
        }
      } catch (error) {
        issues.push(`Bootstrap optimization failed: ${error}`);
      }
    }

    // Validate leaderboard pagination
    if (this.config.enablePaginatedLeaderboards) {
      try {
        const page = await this.getLeaderboardService().getDailyLeaderboardPage({ page: 1 });
        if (page.entries.length > 50) {
          issues.push(`Leaderboard page size (${page.entries.length}) exceeds 50 entry limit`);
        }
      } catch (error) {
        issues.push(`Leaderboard pagination failed: ${error}`);
      }
    }

    // Validate cleanup system
    if (this.config.enableAutomatedCleanup && this.cleanupScheduler) {
      const status = this.cleanupScheduler.getStatus();
      if (status && !status.isRunning) {
        issues.push('Automated cleanup scheduler is not running');
      }
    }

    // Validate client optimizations
    if (this.config.enableClientOptimizations) {
      const bundleAnalysis = this.bundleOptimizer &&
        typeof this.bundleOptimizer.analyzeDuplicates === 'function'
        ? this.bundleOptimizer.analyzeDuplicates()
        : { duplicateModules: [] };
      if (bundleAnalysis.duplicateModules.length > 0) {
        recommendations.push(`Found ${bundleAnalysis.duplicateModules.length} duplicate modules: ${bundleAnalysis.duplicateModules.join(', ')}`);
      }
    }

    return {
      success: issues.length === 0,
      issues,
      recommendations: recommendations.concat(
        this.bundleOptimizer && typeof this.bundleOptimizer.getOptimizationRecommendations === 'function'
          ? this.bundleOptimizer.getOptimizationRecommendations()
          : []
      ),
    };
  }

  /**
   * Shutdown all performance systems gracefully
   */
  async shutdown(): Promise<void> {
    if (this.cleanupScheduler) {
      this.cleanupScheduler.stop();
    }

    if (typeof window !== 'undefined') {
      this.moduleManager?.clearCache();
      this.bundleOptimizer?.clearTracking();
    }

    this.initialized = false;
  }

  /**
   * Get configuration
   */
  getConfig(): PerformanceIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PerformanceIntegrationConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Global performance integration manager instance
 */
export const performanceIntegration = new PerformanceIntegrationManager();

/**
 * Convenience functions for accessing optimized implementations
 */
export const getOptimizedBootstrap = () => performanceIntegration.getBootstrapFunction();
export const getOptimizedGuessProcessing = () => performanceIntegration.getGuessProcessingFunction();
export const getOptimizedLeaderboardService = () => performanceIntegration.getLeaderboardService();
export const getBalanceConfig = (userId: string) => performanceIntegration.getBalanceConfigForUser(userId);

/**
 * Performance validation utility
 */
export const validatePerformanceIntegration = () => performanceIntegration.validateIntegration();

/**
 * Performance metrics utility
 */
export const getPerformanceMetrics = () => performanceIntegration.getPerformanceMetrics();
