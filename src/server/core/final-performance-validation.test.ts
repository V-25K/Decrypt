/**
 * Tests for Final Performance Validation
 * 
 * Task 16: Final checkpoint and performance validation tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  FinalPerformanceValidator,
  validateCompleteSystem,
  generatePerformanceReport,
  checkDeploymentReadiness
} from './final-performance-validation';

// Mock dependencies
vi.mock('./comprehensive-performance-integration', () => ({
  comprehensivePerformanceIntegration: {
    getStatus: vi.fn(() => ({
      initialized: true,
      serverOptimizationsActive: true,
      clientOptimizationsActive: true,
      crossSystemCoordinationActive: true,
      performanceTargetsMet: true,
      activeOptimizations: [
        'Bootstrap Batching',
        'Parallel Guess Processing',
        'Leaderboard Pagination',
        'Render Optimization'
      ]
    }))
  },
  verifyPerformanceTargets: vi.fn(() => ({
    targetsMet: true,
    improvements: {
      bootstrapImprovement: 0.55, // 55% > 50% target
      guessProcessingImprovement: 0.65, // 65% > 60% target
      leaderboardBandwidthReduction: 0.75, // 75% > 70% target
      renderCycleReduction: 0.85 // 85% > 80% target
    },
    recommendations: []
  })),
  validateComprehensiveIntegration: vi.fn(() => ({
    success: true,
    score: 90,
    issues: [],
    recommendations: []
  }))
}));

vi.mock('./balance-ab-testing-config', () => ({
  balanceABTestingConfig: {
    getBalanceConfigForUser: vi.fn(() => ({
      config: { useNewBalance: true },
      variant: 'new-balance',
      testName: 'balance-improvements-v2'
    })),
    getTestStatus: vi.fn(() => ({
      activeTests: ['balance-improvements-v2'],
      userDistribution: {
        'balance-improvements-v2': { control: 50, treatment: 50 }
      },
      totalUsers: 100
    }))
  }
}));

vi.mock('./balance-ab-testing-integration', () => ({
  balanceSystemFactory: {
    getBalanceSystemsForUser: vi.fn(() => ({
      retryCostCalculator: {
        calculateRetryCost: vi.fn(() => 35)
      },
      scorePenaltyEngine: {
        calculatePenalty: vi.fn(() => ({
          penaltyPercent: 10,
          penaltyAmount: 100,
          finalScore: 900
        }))
      },
      powerupPricingEngine: {
        calculatePowerupCost: vi.fn(() => 25)
      }
    }))
  }
}));

vi.mock('../../shared/performance', () => ({
  PerformanceMonitor: {
    getInstance: vi.fn(() => ({
      recordMetric: vi.fn(),
      getMetrics: vi.fn(() => [
        { operation: 'test-metric', duration: 100, timestamp: Date.now(), success: true }
      ])
    }))
  }
}));

vi.mock('../../shared/bundle-analysis', () => ({
  BundleOptimizer: {
    getInstance: vi.fn(() => ({
      generateReport: vi.fn(() => ({
        bundleAnalysis: {
          duplicateModules: [],
          bundleSize: 500000,
          loadTime: 1500,
          moduleCount: 10
        },
        loadMetrics: {
          totalLoadTime: 1500,
          firstContentfulPaint: 800
        },
        recommendations: [],
        moduleDetails: []
      }))
    }))
  }
}));

describe('Final Performance Validation', () => {
  let validator: FinalPerformanceValidator;

  beforeEach(() => {
    validator = new FinalPerformanceValidator();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete System Validation', () => {
    it('should validate complete system successfully when all targets are met', async () => {
      const result = await validator.validateCompleteSystem();

      expect(result.success).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.targetsMet).toBe(true);
      expect(result.deploymentReady).toBe(true);

      // Check individual performance improvements
      expect(result.improvements.bootstrap.met).toBe(true);
      expect(result.improvements.guessProcessing.met).toBe(true);
      expect(result.improvements.leaderboardBandwidth.met).toBe(true);
      expect(result.improvements.renderCycles.met).toBe(true);

      // Check backward compatibility
      expect(result.backwardCompatibility.saveDataCompatible).toBe(true);
      expect(result.backwardCompatibility.migrationRequired).toBe(false);

      // Check system health
      expect(result.systemHealth.errors).toHaveLength(0);
      expect(result.systemHealth.optimizationsActive.length).toBeGreaterThan(0);
    });

    it('should handle performance targets not being met', async () => {
      // Mock lower performance improvements
      const { verifyPerformanceTargets } = await import('./comprehensive-performance-integration');
      vi.mocked(verifyPerformanceTargets).mockResolvedValueOnce({
        targetsMet: false,
        improvements: {
          bootstrapImprovement: 0.4, // 40% < 50% target
          guessProcessingImprovement: 0.5, // 50% < 60% target
          leaderboardBandwidthReduction: 0.6, // 60% < 70% target
          renderCycleReduction: 0.7 // 70% < 80% target
        },
        recommendations: ['Optimize Redis batch operations', 'Tune parallel processing']
      });

      const result = await validator.validateCompleteSystem();

      expect(result.targetsMet).toBe(false);
      expect(result.improvements.bootstrap.met).toBe(false);
      expect(result.improvements.guessProcessing.met).toBe(false);
      expect(result.improvements.leaderboardBandwidth.met).toBe(false);
      expect(result.improvements.renderCycles.met).toBe(false);
      
      expect(result.recommendations).toContain('Performance targets not fully met - consider additional optimizations');
      expect(result.deploymentReady).toBe(false);
    });

    it('should detect backward compatibility issues', async () => {
      // Mock balance system failure
      const { balanceSystemFactory } = await import('./balance-ab-testing-integration');
      vi.mocked(balanceSystemFactory.getBalanceSystemsForUser).mockReturnValueOnce({
        retryCostCalculator: {
          calculateRetryCost: vi.fn(() => -1) // Invalid result
        },
        scorePenaltyEngine: {
          calculatePenalty: vi.fn(() => ({
            penaltyPercent: 10,
            penaltyAmount: 100,
            finalScore: -100 // Invalid result
          }))
        },
        powerupPricingEngine: {
          calculatePowerupCost: vi.fn(() => 0) // Invalid result
        }
      } as any);

      const result = await validator.validateCompleteSystem();

      expect(result.backwardCompatibility.saveDataCompatible).toBe(false);
      expect(result.backwardCompatibility.issues.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain('Backward compatibility issues - implement data migration');
      expect(result.deploymentReady).toBe(false);
    });

    it('should detect system health issues', async () => {
      // Mock system not initialized
      const { comprehensivePerformanceIntegration } = await import('./comprehensive-performance-integration');
      vi.mocked(comprehensivePerformanceIntegration.getStatus).mockReturnValueOnce({
        initialized: false,
        serverOptimizationsActive: false,
        clientOptimizationsActive: false,
        crossSystemCoordinationActive: false,
        performanceTargetsMet: false,
        activeOptimizations: []
      } as any);

      const result = await validator.validateCompleteSystem();

      expect(result.systemHealth.errors).toContain('Comprehensive performance integration not initialized');
      expect(result.systemHealth.warnings).toContain('Server optimizations not active');
      expect(result.deploymentReady).toBe(false);
    });

    it('should handle validation errors gracefully', async () => {
      // Mock validation failure
      const { verifyPerformanceTargets } = await import('./comprehensive-performance-integration');
      vi.mocked(verifyPerformanceTargets).mockRejectedValueOnce(new Error('Validation failed'));

      const result = await validator.validateCompleteSystem();

      expect(result.success).toBe(false);
      expect(result.score).toBe(0);
      expect(result.deploymentReady).toBe(false);
      expect(result.systemHealth.errors).toContain('Validation error: Error: Validation failed');
    });
  });

  describe('Performance Target Validation', () => {
    it('should correctly calculate scores for performance targets', async () => {
      const result = await validator.validateCompleteSystem();

      // With all targets met (55%, 65%, 75%, 85%), should get high score
      expect(result.score).toBeGreaterThanOrEqual(90);
      
      // Individual improvements should be recorded correctly
      expect(result.improvements.bootstrap.current).toBe(0.55);
      expect(result.improvements.bootstrap.target).toBe(0.5);
      expect(result.improvements.bootstrap.met).toBe(true);

      expect(result.improvements.guessProcessing.current).toBe(0.65);
      expect(result.improvements.guessProcessing.target).toBe(0.6);
      expect(result.improvements.guessProcessing.met).toBe(true);

      expect(result.improvements.leaderboardBandwidth.current).toBe(0.75);
      expect(result.improvements.leaderboardBandwidth.target).toBe(0.7);
      expect(result.improvements.leaderboardBandwidth.met).toBe(true);

      expect(result.improvements.renderCycles.current).toBe(0.85);
      expect(result.improvements.renderCycles.target).toBe(0.8);
      expect(result.improvements.renderCycles.met).toBe(true);
    });

    it('should calculate partial scores for partially met targets', async () => {
      // Mock partial performance improvements
      const { verifyPerformanceTargets } = await import('./comprehensive-performance-integration');
      vi.mocked(verifyPerformanceTargets).mockResolvedValueOnce({
        targetsMet: false,
        improvements: {
          bootstrapImprovement: 0.25, // 25% of 50% target = 50% achievement
          guessProcessingImprovement: 0.3, // 30% of 60% target = 50% achievement
          leaderboardBandwidthReduction: 0.35, // 35% of 70% target = 50% achievement
          renderCycleReduction: 0.4 // 40% of 80% target = 50% achievement
        },
        recommendations: []
      });

      const result = await validator.validateCompleteSystem();

      // Should get partial credit for each target (roughly 50% of max points each)
      expect(result.score).toBeGreaterThan(40);
      expect(result.score).toBeLessThan(80);
      expect(result.targetsMet).toBe(false);
    });
  });

  describe('Performance Report Generation', () => {
    it('should generate comprehensive performance report', async () => {
      const report = await validator.generatePerformanceReport();

      expect(report.summary).toContain('Performance Validation Summary');
      expect(report.summary).toContain('Overall Score:');
      expect(report.summary).toContain('Performance Targets Met:');
      expect(report.summary).toContain('Deployment Ready:');

      expect(report.details).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.metrics.performance).toBeDefined();
      expect(report.metrics.bundle).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should include performance improvement details in summary', async () => {
      const report = await validator.generatePerformanceReport();

      expect(report.summary).toContain('Bootstrap: 55.0% (target: 50%) ✅');
      expect(report.summary).toContain('Guess Processing: 65.0% (target: 60%) ✅');
      expect(report.summary).toContain('Leaderboard Bandwidth: 75.0% (target: 70%) ✅');
      expect(report.summary).toContain('Render Cycles: 85.0% (target: 80%) ✅');
    });
  });

  describe('Deployment Readiness Check', () => {
    it('should confirm deployment readiness when all criteria are met', async () => {
      const readiness = await checkDeploymentReadiness();

      expect(readiness.ready).toBe(true);
      expect(readiness.score).toBeGreaterThanOrEqual(80);
      expect(readiness.blockers).toHaveLength(0);
    });

    it('should identify deployment blockers', async () => {
      // Mock system with issues
      const { verifyPerformanceTargets } = await import('./comprehensive-performance-integration');
      vi.mocked(verifyPerformanceTargets).mockResolvedValueOnce({
        targetsMet: false,
        improvements: {
          bootstrapImprovement: 0.3,
          guessProcessingImprovement: 0.4,
          leaderboardBandwidthReduction: 0.5,
          renderCycleReduction: 0.6
        },
        recommendations: []
      });

      const readiness = await checkDeploymentReadiness();

      expect(readiness.ready).toBe(false);
      expect(readiness.blockers).toContain('Performance targets not met');
      expect(readiness.score).toBeLessThan(80);
    });

    it('should identify system warnings without blocking deployment', async () => {
      // Mock system with warnings but no errors
      const { balanceABTestingConfig } = await import('./balance-ab-testing-config');
      vi.mocked(balanceABTestingConfig.getTestStatus).mockReturnValueOnce({
        activeTests: [], // No active tests
        userDistribution: {},
        totalUsers: 0
      });

      const readiness = await checkDeploymentReadiness();

      // Should still be ready for deployment despite warnings
      expect(readiness.ready).toBe(true);
      expect(readiness.warnings).toContain('No A/B tests currently active');
      expect(readiness.blockers).toHaveLength(0);
    });
  });

  describe('Global Functions', () => {
    it('should provide working global validation function', async () => {
      const result = await validateCompleteSystem();
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(typeof result.deploymentReady).toBe('boolean');
    });

    it('should provide working global report generation function', async () => {
      const report = await generatePerformanceReport();
      
      expect(report).toBeDefined();
      expect(typeof report.summary).toBe('string');
      expect(report.details).toBeDefined();
      expect(report.metrics).toBeDefined();
    });

    it('should provide working deployment readiness check function', async () => {
      const readiness = await checkDeploymentReadiness();
      
      expect(readiness).toBeDefined();
      expect(typeof readiness.ready).toBe('boolean');
      expect(typeof readiness.score).toBe('number');
      expect(Array.isArray(readiness.blockers)).toBe(true);
      expect(Array.isArray(readiness.warnings)).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing performance data gracefully', async () => {
      // Mock missing performance monitor
      const { PerformanceMonitor } = await import('../../shared/performance');
      vi.mocked(PerformanceMonitor.getInstance).mockReturnValueOnce({
        recordMetric: vi.fn(),
        getMetrics: vi.fn(() => []) // No metrics
      } as any);

      const result = await validator.validateCompleteSystem();

      expect(result.systemHealth.warnings).toContain('No performance metrics recorded');
      // Should still complete validation
      expect(result.success).toBe(true);
    });

    it('should handle A/B testing system failures', async () => {
      // Mock A/B testing failure
      const { balanceABTestingConfig } = await import('./balance-ab-testing-config');
      vi.mocked(balanceABTestingConfig.getBalanceConfigForUser).mockImplementationOnce(() => {
        throw new Error('A/B testing system failed');
      });

      const result = await validator.validateCompleteSystem();

      expect(result.backwardCompatibility.issues.some(issue => 
        issue.includes('A/B testing system failed')
      )).toBe(true);
    });

    it('should validate with zero performance improvements', async () => {
      // Mock zero improvements
      const { verifyPerformanceTargets } = await import('./comprehensive-performance-integration');
      vi.mocked(verifyPerformanceTargets).mockResolvedValueOnce({
        targetsMet: false,
        improvements: {
          bootstrapImprovement: 0,
          guessProcessingImprovement: 0,
          leaderboardBandwidthReduction: 0,
          renderCycleReduction: 0
        },
        recommendations: ['No improvements detected']
      });

      const result = await validator.validateCompleteSystem();

      expect(result.targetsMet).toBe(false);
      expect(result.score).toBeLessThan(50); // Should get low score
      expect(result.deploymentReady).toBe(false);
    });
  });
});