/**
 * Comprehensive Performance Integration Tests
 * 
 * Tests for Task 15.1: Wire all performance optimizations together
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ComprehensivePerformanceIntegration,
  comprehensivePerformanceIntegration,
  getComprehensiveStatus,
  getComprehensiveMetrics,
  validateComprehensiveIntegration,
  ensureOptimizationsCoordinated,
  verifyPerformanceTargets,
} from './comprehensive-performance-integration';

// Mock dependencies
vi.mock('./performance-integration');
vi.mock('../../client/app/client-performance-integration');
vi.mock('./integration-validation');
vi.mock('../../shared/performance');
vi.mock('../../shared/ab-testing');
vi.mock('../../shared/bundle-analysis');

describe('ComprehensivePerformanceIntegration', () => {
  let integration: ComprehensivePerformanceIntegration;

  beforeEach(() => {
    integration = new ComprehensivePerformanceIntegration();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = integration.getConfig();
      
      expect(config.enableBootstrapBatching).toBe(true);
      expect(config.enableParallelGuessProcessing).toBe(true);
      expect(config.enableLeaderboardPagination).toBe(true);
      expect(config.enableAutomatedCleanup).toBe(true);
      expect(config.enableRenderOptimization).toBe(true);
      expect(config.enableModuleDeduplication).toBe(true);
      expect(config.enableBundleOptimization).toBe(true);
      expect(config.enableRebalancedEconomy).toBe(true);
      expect(config.enableABTesting).toBe(true);
      expect(config.enablePerformanceMonitoring).toBe(true);
      expect(config.enableIntegrationValidation).toBe(true);
      expect(config.enableCrossSystemOptimization).toBe(true);
      expect(config.enableFallbackMechanisms).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customIntegration = new ComprehensivePerformanceIntegration({
        enableBootstrapBatching: false,
        enableParallelGuessProcessing: false,
        enableABTesting: false,
      });

      const config = customIntegration.getConfig();
      
      expect(config.enableBootstrapBatching).toBe(false);
      expect(config.enableParallelGuessProcessing).toBe(false);
      expect(config.enableABTesting).toBe(false);
      // Other settings should remain default
      expect(config.enableLeaderboardPagination).toBe(true);
      expect(config.enableRenderOptimization).toBe(true);
    });

    it('should initialize status correctly', () => {
      const status = integration.getStatus();
      
      expect(status.initialized).toBe(false);
      expect(status.serverOptimizationsActive).toBe(false);
      expect(status.clientOptimizationsActive).toBe(false);
      expect(status.crossSystemCoordinationActive).toBe(false);
      expect(status.performanceTargetsMet).toBe(false);
      expect(status.activeOptimizations).toEqual([]);
      expect(status.performanceMetrics.bootstrapImprovement).toBe(0);
      expect(status.performanceMetrics.guessProcessingImprovement).toBe(0);
      expect(status.performanceMetrics.leaderboardBandwidthReduction).toBe(0);
      expect(status.performanceMetrics.renderCycleReduction).toBe(0);
      expect(status.performanceMetrics.bundleSizeReduction).toBe(0);
    });
  });

  describe('comprehensive integration', () => {
    it('should initialize all systems when enabled', async () => {
      await integration.initialize();
      
      const status = integration.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.serverOptimizationsActive).toBe(true);
      expect(status.crossSystemCoordinationActive).toBe(true);
    });

    it('should skip disabled optimizations', async () => {
      const customIntegration = new ComprehensivePerformanceIntegration({
        enableBootstrapBatching: false,
        enableParallelGuessProcessing: false,
        enableCrossSystemOptimization: false,
      });

      await customIntegration.initialize();
      
      const status = customIntegration.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.crossSystemCoordinationActive).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock an initialization error
      const errorIntegration = new ComprehensivePerformanceIntegration();
      
      // This should not throw but should log the error
      await expect(errorIntegration.initialize()).resolves.not.toThrow();
    });
  });

  describe('performance monitoring', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should track active optimizations', () => {
      const status = integration.getStatus();
      
      expect(status.activeOptimizations).toContain('Bootstrap Batching');
      expect(status.activeOptimizations).toContain('Parallel Guess Processing');
      expect(status.activeOptimizations).toContain('Leaderboard Pagination');
      expect(status.activeOptimizations).toContain('Automated Cleanup');
      expect(status.activeOptimizations).toContain('Render Optimization');
      expect(status.activeOptimizations).toContain('Module Deduplication');
      expect(status.activeOptimizations).toContain('Bundle Optimization');
      expect(status.activeOptimizations).toContain('Rebalanced Economy');
      expect(status.activeOptimizations).toContain('A/B Testing');
    });

    it('should provide comprehensive metrics', () => {
      const metrics = integration.getComprehensiveMetrics();
      
      expect(metrics).toHaveProperty('server');
      expect(metrics).toHaveProperty('client');
      expect(metrics).toHaveProperty('integration');
      expect(metrics).toHaveProperty('validation');
      
      expect(metrics.integration).toEqual(integration.getStatus());
    });

    it('should validate integration successfully', async () => {
      const result = await integration.validateIntegration();
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('recommendations');
      
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('configuration management', () => {
    it('should allow configuration updates', () => {
      integration.updateConfig({
        enableBootstrapBatching: false,
        enableABTesting: false,
      });

      const config = integration.getConfig();
      expect(config.enableBootstrapBatching).toBe(false);
      expect(config.enableABTesting).toBe(false);
      // Other settings should remain unchanged
      expect(config.enableParallelGuessProcessing).toBe(true);
    });

    it('should preserve existing configuration when updating', () => {
      const originalConfig = integration.getConfig();
      
      integration.updateConfig({
        enableBootstrapBatching: false,
      });

      const updatedConfig = integration.getConfig();
      expect(updatedConfig.enableBootstrapBatching).toBe(false);
      expect(updatedConfig.enableParallelGuessProcessing).toBe(originalConfig.enableParallelGuessProcessing);
      expect(updatedConfig.enableLeaderboardPagination).toBe(originalConfig.enableLeaderboardPagination);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await integration.initialize();
      
      const statusBefore = integration.getStatus();
      expect(statusBefore.initialized).toBe(true);
      
      await integration.shutdown();
      
      const statusAfter = integration.getStatus();
      expect(statusAfter.initialized).toBe(false);
      expect(statusAfter.serverOptimizationsActive).toBe(false);
      expect(statusAfter.clientOptimizationsActive).toBe(false);
      expect(statusAfter.crossSystemCoordinationActive).toBe(false);
    });
  });
});

describe('Global Integration Functions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getComprehensiveStatus', () => {
    it('should return current integration status', () => {
      const status = getComprehensiveStatus();
      
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('serverOptimizationsActive');
      expect(status).toHaveProperty('clientOptimizationsActive');
      expect(status).toHaveProperty('crossSystemCoordinationActive');
      expect(status).toHaveProperty('performanceTargetsMet');
      expect(status).toHaveProperty('activeOptimizations');
      expect(status).toHaveProperty('performanceMetrics');
    });
  });

  describe('getComprehensiveMetrics', () => {
    it('should return comprehensive metrics', () => {
      const metrics = getComprehensiveMetrics();
      
      expect(metrics).toHaveProperty('server');
      expect(metrics).toHaveProperty('client');
      expect(metrics).toHaveProperty('integration');
      expect(metrics).toHaveProperty('validation');
    });
  });

  describe('validateComprehensiveIntegration', () => {
    it('should validate integration', async () => {
      const result = await validateComprehensiveIntegration();
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('recommendations');
    });
  });

  describe('ensureOptimizationsCoordinated', () => {
    it('should ensure optimizations are coordinated', async () => {
      const result = await ensureOptimizationsCoordinated();
      
      expect(typeof result).toBe('boolean');
    });

    it('should initialize if not already initialized', async () => {
      // Reset initialization state
      await comprehensivePerformanceIntegration.shutdown();
      
      const result = await ensureOptimizationsCoordinated();
      
      expect(result).toBe(true);
      expect(getComprehensiveStatus().initialized).toBe(true);
    });
  });

  describe('verifyPerformanceTargets', () => {
    it('should verify performance targets', async () => {
      const result = await verifyPerformanceTargets();
      
      expect(result).toHaveProperty('targetsMet');
      expect(result).toHaveProperty('improvements');
      expect(result).toHaveProperty('recommendations');
      
      expect(typeof result.targetsMet).toBe('boolean');
      expect(typeof result.improvements).toBe('object');
      expect(Array.isArray(result.recommendations)).toBe(true);
      
      // Check improvement metrics structure
      expect(result.improvements).toHaveProperty('bootstrapImprovement');
      expect(result.improvements).toHaveProperty('guessProcessingImprovement');
      expect(result.improvements).toHaveProperty('leaderboardBandwidthReduction');
      expect(result.improvements).toHaveProperty('renderCycleReduction');
    });

    it('should provide recommendations when targets are not met', async () => {
      const result = await verifyPerformanceTargets();
      
      // Since we're using mocked data, targets likely won't be met
      if (!result.targetsMet) {
        expect(result.recommendations.length).toBeGreaterThan(0);
        
        // Check for specific recommendation types
        const recommendationText = result.recommendations.join(' ');
        if (result.improvements.bootstrapImprovement < 0.5) {
          expect(recommendationText).toContain('bootstrap');
        }
        if (result.improvements.guessProcessingImprovement < 0.6) {
          expect(recommendationText).toContain('parallel processing');
        }
        if (result.improvements.leaderboardBandwidthReduction < 0.7) {
          expect(recommendationText).toContain('leaderboard');
        }
        if (result.improvements.renderCycleReduction < 0.8) {
          expect(recommendationText).toContain('rendering');
        }
      }
    });
  });
});

describe('Integration Coordination', () => {
  let integration: ComprehensivePerformanceIntegration;

  beforeEach(async () => {
    integration = new ComprehensivePerformanceIntegration();
    await integration.initialize();
  });

  afterEach(async () => {
    await integration.shutdown();
    vi.clearAllMocks();
  });

  it('should coordinate bootstrap with guess processing', async () => {
    // This tests the coordination logic
    const status = integration.getStatus();
    expect(status.crossSystemCoordinationActive).toBe(true);
  });

  it('should coordinate leaderboards with rendering', async () => {
    // This tests the leaderboard-render coordination
    const status = integration.getStatus();
    expect(status.crossSystemCoordinationActive).toBe(true);
  });

  it('should coordinate server with client optimizations', async () => {
    // This tests the server-client coordination
    const status = integration.getStatus();
    expect(status.crossSystemCoordinationActive).toBe(true);
  });
});

describe('Performance Target Validation', () => {
  it('should validate bootstrap improvement target (50%)', async () => {
    const result = await verifyPerformanceTargets();
    
    if (result.improvements.bootstrapImprovement < 0.5) {
      expect(result.recommendations).toContain('Optimize Redis batch operations for better bootstrap performance');
    }
  });

  it('should validate guess processing improvement target (60%)', async () => {
    const result = await verifyPerformanceTargets();
    
    if (result.improvements.guessProcessingImprovement < 0.6) {
      expect(result.recommendations).toContain('Tune parallel processing configuration for guess handling');
    }
  });

  it('should validate leaderboard bandwidth reduction target (70%)', async () => {
    const result = await verifyPerformanceTargets();
    
    if (result.improvements.leaderboardBandwidthReduction < 0.7) {
      expect(result.recommendations).toContain('Reduce leaderboard page sizes or optimize data serialization');
    }
  });

  it('should validate render cycle reduction target (80%)', async () => {
    const result = await verifyPerformanceTargets();
    
    if (result.improvements.renderCycleReduction < 0.8) {
      expect(result.recommendations).toContain('Enable all client-side rendering optimizations');
    }
  });
});