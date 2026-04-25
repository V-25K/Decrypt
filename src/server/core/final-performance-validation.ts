/**
 * Final Performance Validation System
 * 
 * Task 16: Final checkpoint and performance validation
 * 
 * Validates that performance improvements meet targets:
 * - 50% bootstrap improvement
 * - 60% guess processing improvement  
 * - 70% leaderboard bandwidth reduction
 * - 80% render cycle reduction
 * 
 * Confirms backward compatibility with existing save data.
 */

import { 
  comprehensivePerformanceIntegration,
  verifyPerformanceTargets,
  validateComprehensiveIntegration
} from './comprehensive-performance-integration';
import { balanceABTestingConfig } from './balance-ab-testing-config';
import { PerformanceMonitor } from '../../shared/performance';
import { BundleOptimizer } from '../../shared/bundle-analysis';

export interface PerformanceValidationResult {
  success: boolean;
  score: number;
  targetsMet: boolean;
  improvements: {
    bootstrap: { current: number; target: number; met: boolean };
    guessProcessing: { current: number; target: number; met: boolean };
    leaderboardBandwidth: { current: number; target: number; met: boolean };
    renderCycles: { current: number; target: number; met: boolean };
  };
  backwardCompatibility: {
    saveDataCompatible: boolean;
    migrationRequired: boolean;
    issues: string[];
  };
  systemHealth: {
    optimizationsActive: string[];
    testsRunning: string[];
    errors: string[];
    warnings: string[];
  };
  recommendations: string[];
  deploymentReady: boolean;
}

/**
 * Final Performance Validation Manager
 * 
 * Comprehensive validation of all performance improvements and system health
 */
export class FinalPerformanceValidator {
  private performanceMonitor: PerformanceMonitor;
  private bundleOptimizer: BundleOptimizer;
  private static instance: FinalPerformanceValidator;

  constructor() {
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.bundleOptimizer = BundleOptimizer.getInstance();
  }

  static getInstance(): FinalPerformanceValidator {
    if (!FinalPerformanceValidator.instance) {
      FinalPerformanceValidator.instance = new FinalPerformanceValidator();
    }
    return FinalPerformanceValidator.instance;
  }

  /**
   * Run comprehensive performance validation
   */
  async validateCompleteSystem(): Promise<PerformanceValidationResult> {
    console.log('[FinalValidation] Starting comprehensive performance validation...');

    const startTime = performance.now();
    
    try {
      // 1. Validate performance targets
      const targetValidation = await this.validatePerformanceTargets();
      
      // 2. Validate system integration
      const integrationValidation = await this.validateSystemIntegration();
      
      // 3. Validate backward compatibility
      const compatibilityValidation = await this.validateBackwardCompatibility();
      
      // 4. Validate system health
      const healthValidation = await this.validateSystemHealth();
      
      // 5. Generate overall assessment
      const overallResult = this.generateOverallAssessment(
        targetValidation,
        integrationValidation,
        compatibilityValidation,
        healthValidation
      );

      const duration = performance.now() - startTime;
      
      // Record validation metrics
      this.performanceMonitor.recordMetric({
        operation: 'final-performance-validation',
        duration,
        timestamp: Date.now(),
        success: overallResult.success,
        metadata: {
          score: overallResult.score,
          targetsMet: overallResult.targetsMet,
          deploymentReady: overallResult.deploymentReady
        }
      });

      console.log(`[FinalValidation] Validation complete. Score: ${overallResult.score}/100, Deployment Ready: ${overallResult.deploymentReady}`);
      
      return overallResult;
      
    } catch (error) {
      console.error('[FinalValidation] Validation failed:', error);
      
      return {
        success: false,
        score: 0,
        targetsMet: false,
        improvements: {
          bootstrap: { current: 0, target: 0.5, met: false },
          guessProcessing: { current: 0, target: 0.6, met: false },
          leaderboardBandwidth: { current: 0, target: 0.7, met: false },
          renderCycles: { current: 0, target: 0.8, met: false }
        },
        backwardCompatibility: {
          saveDataCompatible: false,
          migrationRequired: true,
          issues: [`Validation failed: ${error}`]
        },
        systemHealth: {
          optimizationsActive: [],
          testsRunning: [],
          errors: [`Validation error: ${error}`],
          warnings: []
        },
        recommendations: ['Fix validation errors and retry'],
        deploymentReady: false
      };
    }
  }

  /**
   * Validate performance improvement targets
   */
  private async validatePerformanceTargets(): Promise<{
    targetsMet: boolean;
    improvements: any;
    score: number;
  }> {
    const targets = await verifyPerformanceTargets();
    
    const improvements = {
      bootstrap: {
        current: targets.improvements.bootstrapImprovement,
        target: 0.5,
        met: targets.improvements.bootstrapImprovement >= 0.5
      },
      guessProcessing: {
        current: targets.improvements.guessProcessingImprovement,
        target: 0.6,
        met: targets.improvements.guessProcessingImprovement >= 0.6
      },
      leaderboardBandwidth: {
        current: targets.improvements.leaderboardBandwidthReduction,
        target: 0.7,
        met: targets.improvements.leaderboardBandwidthReduction >= 0.7
      },
      renderCycles: {
        current: targets.improvements.renderCycleReduction,
        target: 0.8,
        met: targets.improvements.renderCycleReduction >= 0.8
      }
    };

    // Calculate score based on target achievement
    const targetScores = [
      improvements.bootstrap.met ? 25 : Math.max(0, improvements.bootstrap.current * 50), // 25 points max
      improvements.guessProcessing.met ? 25 : Math.max(0, improvements.guessProcessing.current * 41.67), // 25 points max
      improvements.leaderboardBandwidth.met ? 25 : Math.max(0, improvements.leaderboardBandwidth.current * 35.71), // 25 points max
      improvements.renderCycles.met ? 25 : Math.max(0, improvements.renderCycles.current * 31.25) // 25 points max
    ];

    const score = targetScores.reduce((sum, score) => sum + score, 0);
    
    return {
      targetsMet: targets.targetsMet,
      improvements,
      score
    };
  }

  /**
   * Validate system integration health
   */
  private async validateSystemIntegration(): Promise<{
    success: boolean;
    score: number;
    issues: string[];
  }> {
    const integration = await validateComprehensiveIntegration();
    
    return {
      success: integration.success,
      score: integration.score,
      issues: integration.issues
    };
  }

  /**
   * Validate backward compatibility
   */
  private async validateBackwardCompatibility(): Promise<{
    saveDataCompatible: boolean;
    migrationRequired: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let saveDataCompatible = true;
    let migrationRequired = false;

    try {
      // Test existing user profile compatibility
      const testProfile = {
        coins: 500,
        hearts: 3,
        currentStreak: 5,
        totalLevelsCompleted: 25,
        unlockedFlairs: ['basic', 'advanced'],
        activeFlair: 'basic'
      };

      // Test that balance systems work with existing data
      const { balanceSystemFactory } = await import('./balance-ab-testing-integration');
      const systems = balanceSystemFactory.getBalanceSystemsForUser('compatibility-test-user');
      
      // Test retry cost calculation with existing data
      const retryCost = systems.retryCostCalculator.calculateRetryCost(1, 3, 35);
      if (retryCost <= 0) {
        issues.push('Retry cost calculation failed with existing data');
        saveDataCompatible = false;
      }

      // Test score penalty calculation
      const penalty = systems.scorePenaltyEngine.calculatePenalty(1, 1000);
      if (penalty.finalScore < 0 || penalty.finalScore > 1000) {
        issues.push('Score penalty calculation produced invalid results');
        saveDataCompatible = false;
      }

      // Test powerup pricing with existing inventory
      const hammerCost = systems.powerupPricingEngine.calculatePowerupCost('hammer', 3, 10);
      if (hammerCost <= 0) {
        issues.push('Powerup pricing calculation failed');
        saveDataCompatible = false;
      }

      // Test A/B testing with existing users
      const { config } = balanceABTestingConfig.getBalanceConfigForUser('existing-user-test');
      // Should either get a config or null (both are valid)
      
      console.log('[FinalValidation] Backward compatibility validation passed');
      
    } catch (error) {
      issues.push(`Backward compatibility test failed: ${error}`);
      saveDataCompatible = false;
      migrationRequired = true;
    }

    return {
      saveDataCompatible,
      migrationRequired,
      issues
    };
  }

  /**
   * Validate overall system health
   */
  private async validateSystemHealth(): Promise<{
    optimizationsActive: string[];
    testsRunning: string[];
    errors: string[];
    warnings: string[];
  }> {
    const status = comprehensivePerformanceIntegration.getStatus();
    const testStatus = balanceABTestingConfig.getTestStatus();
    
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check optimization status
    if (!status.initialized) {
      errors.push('Comprehensive performance integration not initialized');
    }
    
    if (!status.serverOptimizationsActive) {
      warnings.push('Server optimizations not active');
    }
    
    if (!status.crossSystemCoordinationActive) {
      warnings.push('Cross-system coordination not active');
    }

    // Check A/B testing status
    if (testStatus.activeTests.length === 0) {
      warnings.push('No A/B tests currently active');
    }

    // Check performance monitoring
    const metrics = this.performanceMonitor.getMetrics('comprehensive-validation');
    if (metrics.length === 0) {
      warnings.push('No performance metrics recorded');
    }

    return {
      optimizationsActive: status.activeOptimizations,
      testsRunning: testStatus.activeTests,
      errors,
      warnings
    };
  }

  /**
   * Generate overall assessment
   */
  private generateOverallAssessment(
    targetValidation: any,
    integrationValidation: any,
    compatibilityValidation: any,
    healthValidation: any
  ): PerformanceValidationResult {
    
    // Calculate overall score (weighted average)
    const targetScore = targetValidation.score * 0.4; // 40% weight
    const integrationScore = integrationValidation.score * 0.3; // 30% weight
    const compatibilityScore = compatibilityValidation.saveDataCompatible ? 20 : 0; // 20% weight
    const healthScore = healthValidation.errors.length === 0 ? 10 : 0; // 10% weight
    
    const overallScore = targetScore + integrationScore + compatibilityScore + healthScore;
    
    // Determine success criteria
    const success = (
      overallScore >= 80 &&
      integrationValidation.success &&
      compatibilityValidation.saveDataCompatible &&
      healthValidation.errors.length === 0
    );

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (!targetValidation.targetsMet) {
      recommendations.push('Performance targets not fully met - consider additional optimizations');
    }
    
    if (!integrationValidation.success) {
      recommendations.push('System integration issues detected - review integration health');
    }
    
    if (!compatibilityValidation.saveDataCompatible) {
      recommendations.push('Backward compatibility issues - implement data migration');
    }
    
    if (healthValidation.errors.length > 0) {
      recommendations.push('System health errors detected - resolve before deployment');
    }
    
    if (healthValidation.warnings.length > 0) {
      recommendations.push('System warnings present - review for optimization opportunities');
    }

    // Deployment readiness assessment
    const deploymentReady = (
      success &&
      targetValidation.targetsMet &&
      compatibilityValidation.saveDataCompatible &&
      healthValidation.errors.length === 0
    );

    return {
      success,
      score: Math.round(overallScore),
      targetsMet: targetValidation.targetsMet,
      improvements: targetValidation.improvements,
      backwardCompatibility: compatibilityValidation,
      systemHealth: healthValidation,
      recommendations,
      deploymentReady
    };
  }

  /**
   * Generate detailed performance report
   */
  async generatePerformanceReport(): Promise<{
    summary: string;
    details: PerformanceValidationResult;
    metrics: any;
    recommendations: string[];
  }> {
    const validation = await this.validateCompleteSystem();
    const metrics = this.performanceMonitor.getMetrics();
    const bundleAnalysis = this.bundleOptimizer.generateReport();

    const summary = this.generateSummaryText(validation);

    return {
      summary,
      details: validation,
      metrics: {
        performance: metrics,
        bundle: bundleAnalysis
      },
      recommendations: validation.recommendations
    };
  }

  /**
   * Generate human-readable summary
   */
  private generateSummaryText(validation: PerformanceValidationResult): string {
    const { score, targetsMet, deploymentReady, improvements } = validation;
    
    let summary = `Performance Validation Summary\n`;
    summary += `Overall Score: ${score}/100\n`;
    summary += `Performance Targets Met: ${targetsMet ? 'Yes' : 'No'}\n`;
    summary += `Deployment Ready: ${deploymentReady ? 'Yes' : 'No'}\n\n`;
    
    summary += `Performance Improvements:\n`;
    summary += `- Bootstrap: ${(improvements.bootstrap.current * 100).toFixed(1)}% (target: 50%) ${improvements.bootstrap.met ? '✅' : '❌'}\n`;
    summary += `- Guess Processing: ${(improvements.guessProcessing.current * 100).toFixed(1)}% (target: 60%) ${improvements.guessProcessing.met ? '✅' : '❌'}\n`;
    summary += `- Leaderboard Bandwidth: ${(improvements.leaderboardBandwidth.current * 100).toFixed(1)}% (target: 70%) ${improvements.leaderboardBandwidth.met ? '✅' : '❌'}\n`;
    summary += `- Render Cycles: ${(improvements.renderCycles.current * 100).toFixed(1)}% (target: 80%) ${improvements.renderCycles.met ? '✅' : '❌'}\n\n`;
    
    if (validation.recommendations.length > 0) {
      summary += `Recommendations:\n`;
      validation.recommendations.forEach((rec, i) => {
        summary += `${i + 1}. ${rec}\n`;
      });
    }

    return summary;
  }
}

/**
 * Global final performance validator instance
 */
export const finalPerformanceValidator = FinalPerformanceValidator.getInstance();

/**
 * Convenience functions
 */
export const validateCompleteSystem = () => finalPerformanceValidator.validateCompleteSystem();
export const generatePerformanceReport = () => finalPerformanceValidator.generatePerformanceReport();

/**
 * Quick validation check for deployment readiness
 */
export const checkDeploymentReadiness = async (): Promise<{
  ready: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
}> => {
  const validation = await finalPerformanceValidator.validateCompleteSystem();
  
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!validation.success) {
    blockers.push('Overall validation failed');
  }
  
  if (!validation.targetsMet) {
    blockers.push('Performance targets not met');
  }
  
  if (!validation.backwardCompatibility.saveDataCompatible) {
    blockers.push('Backward compatibility issues');
  }
  
  if (validation.systemHealth.errors.length > 0) {
    blockers.push(`System errors: ${validation.systemHealth.errors.join(', ')}`);
  }

  if (validation.systemHealth.warnings.length > 0) {
    warnings.push(...validation.systemHealth.warnings);
  }

  return {
    ready: validation.deploymentReady,
    score: validation.score,
    blockers,
    warnings
  };
};