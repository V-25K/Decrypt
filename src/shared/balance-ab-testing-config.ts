/**
 * Enhanced A/B Testing Configuration for Balance Changes
 * 
 * Task 15.2: Configure A/B testing for balance changes
 * 
 * This module provides:
 * - Feature flags for each balance system
 * - 50/50 split testing infrastructure
 * - Metrics collection for balance impact analysis
 * - Gradual rollout capability
 */

import { ABTestConfig, ABTestManager, BalanceConfig } from './ab-testing';

/**
 * Individual balance system feature flags
 */
export interface BalanceFeatureFlags {
  enableRetryCostRebalance: boolean;
  enableScorePenaltyRebalance: boolean;
  enableFastSolveBonusRebalance: boolean;
  enablePowerupPricingRebalance: boolean;
}

/**
 * Balance impact metrics for analysis
 */
export interface BalanceImpactMetrics {
  // Retry system metrics
  retryUsageRate: number;
  averageRetryCost: number;
  retryAbandonmentRate: number;
  
  // Scoring system metrics
  averageScorePenalty: number;
  firstRetryUsageRate: number;
  penaltyImpactOnProgression: number;
  
  // Fast solve bonus metrics
  fastSolveAchievementRate: number;
  averageSolveTime: number;
  bonusImpactOnEngagement: number;
  
  // Powerup pricing metrics
  powerupPurchaseRate: Record<string, number>;
  averagePowerupCost: Record<string, number>;
  powerupValuePerception: Record<string, number>;
  
  // Overall player metrics
  playerRetentionRate: number;
  sessionDuration: number;
  coinEarningRate: number;
  progressionRate: number;
}

/**
 * Enhanced A/B test configurations for individual balance systems
 */
export const balanceABTestConfigs: ABTestConfig[] = [
  // Main balance improvements test (existing)
  {
    name: 'balance-improvements',
    description: 'Test new balance changes for retry costs, scoring, and powerup pricing',
    enabled: true,
    rolloutPercentage: 50,
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {
          featureFlags: {
            enableRetryCostRebalance: false,
            enableScorePenaltyRebalance: false,
            enableFastSolveBonusRebalance: false,
            enablePowerupPricingRebalance: false,
          }
        }
      },
      {
        name: 'new-balance',
        weight: 50,
        config: {
          featureFlags: {
            enableRetryCostRebalance: true,
            enableScorePenaltyRebalance: true,
            enableFastSolveBonusRebalance: true,
            enablePowerupPricingRebalance: true,
          },
          retry: {
            maxCostCoins: 140,
            scalingType: 'linear',
            difficultyMultiplier: 1.2
          },
          scoring: {
            maxPenaltyPercent: 25,
            penaltyType: 'logarithmic',
            firstRetryFree: true
          },
          fastSolve: {
            thresholdSeconds: 30,
            bonusPercent: 50,
            difficultyScaling: true
          },
          powerups: {
            rocketCostMultiplier: 2.0,
            valuePerCoinRatios: {
              hammer: 1.0,
              wand: 0.35,
              shield: 0.27,
              rocket: 0.5
            }
          }
        }
      }
    ]
  },

  // Individual system tests for granular control
  {
    name: 'retry-cost-rebalance',
    description: 'Test retry cost scaling changes independently',
    enabled: true,
    rolloutPercentage: 25, // Smaller rollout for individual system
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {
          featureFlags: {
            enableRetryCostRebalance: false,
          }
        }
      },
      {
        name: 'linear-scaling',
        weight: 50,
        config: {
          featureFlags: {
            enableRetryCostRebalance: true,
          },
          retry: {
            maxCostCoins: 140,
            scalingType: 'linear',
            difficultyMultiplier: 1.2
          }
        }
      }
    ]
  },

  {
    name: 'score-penalty-rebalance',
    description: 'Test score penalty reduction independently',
    enabled: true,
    rolloutPercentage: 25,
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {
          featureFlags: {
            enableScorePenaltyRebalance: false,
          }
        }
      },
      {
        name: 'reduced-penalty',
        weight: 50,
        config: {
          featureFlags: {
            enableScorePenaltyRebalance: true,
          },
          scoring: {
            maxPenaltyPercent: 25,
            penaltyType: 'logarithmic',
            firstRetryFree: true
          }
        }
      }
    ]
  },

  {
    name: 'fast-solve-bonus-rebalance',
    description: 'Test fast solve bonus timing adjustment independently',
    enabled: true,
    rolloutPercentage: 25,
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {
          featureFlags: {
            enableFastSolveBonusRebalance: false,
          }
        }
      },
      {
        name: 'faster-threshold',
        weight: 50,
        config: {
          featureFlags: {
            enableFastSolveBonusRebalance: true,
          },
          fastSolve: {
            thresholdSeconds: 30,
            bonusPercent: 50,
            difficultyScaling: true
          }
        }
      }
    ]
  },

  {
    name: 'powerup-pricing-rebalance',
    description: 'Test powerup pricing changes independently',
    enabled: true,
    rolloutPercentage: 25,
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {
          featureFlags: {
            enablePowerupPricingRebalance: false,
          }
        }
      },
      {
        name: 'reduced-rocket-cost',
        weight: 50,
        config: {
          featureFlags: {
            enablePowerupPricingRebalance: true,
          },
          powerups: {
            rocketCostMultiplier: 2.0,
            valuePerCoinRatios: {
              hammer: 1.0,
              wand: 0.35,
              shield: 0.27,
              rocket: 0.5
            }
          }
        }
      }
    ]
  }
];

/**
 * Enhanced Balance A/B Testing Manager
 * 
 * Provides granular control over balance system rollouts
 */
export class BalanceABTestingManager {
  private abTestManager: ABTestManager;
  private metricsCollector: BalanceMetricsCollector;

  constructor() {
    this.abTestManager = ABTestManager.getInstance();
    this.metricsCollector = new BalanceMetricsCollector();
  }

  /**
   * Initialize balance A/B testing with all configurations
   */
  async initialize(): Promise<void> {
    if (!this.abTestManager || typeof this.abTestManager.registerTest !== 'function') {
      return;
    }

    // Register all balance test configurations
    for (const config of balanceABTestConfigs) {
      this.abTestManager.registerTest(config);
    }
  }

  /**
   * Get feature flags for a user based on A/B test assignments
   */
  getFeatureFlags(userId: string): BalanceFeatureFlags {
    const flags: BalanceFeatureFlags = {
      enableRetryCostRebalance: false,
      enableScorePenaltyRebalance: false,
      enableFastSolveBonusRebalance: false,
      enablePowerupPricingRebalance: false,
    };

    // Check main balance test first
    const mainBalanceVariant = this.abTestManager.getVariantConfig('balance-improvements', userId);
    if (mainBalanceVariant?.featureFlags) {
      Object.assign(flags, mainBalanceVariant.featureFlags);
    }

    // Override with individual system tests if assigned
    const retryCostVariant = this.abTestManager.getVariantConfig('retry-cost-rebalance', userId);
    if (retryCostVariant?.featureFlags?.enableRetryCostRebalance !== undefined) {
      flags.enableRetryCostRebalance = retryCostVariant.featureFlags.enableRetryCostRebalance;
    }

    const scorePenaltyVariant = this.abTestManager.getVariantConfig('score-penalty-rebalance', userId);
    if (scorePenaltyVariant?.featureFlags?.enableScorePenaltyRebalance !== undefined) {
      flags.enableScorePenaltyRebalance = scorePenaltyVariant.featureFlags.enableScorePenaltyRebalance;
    }

    const fastSolveVariant = this.abTestManager.getVariantConfig('fast-solve-bonus-rebalance', userId);
    if (fastSolveVariant?.featureFlags?.enableFastSolveBonusRebalance !== undefined) {
      flags.enableFastSolveBonusRebalance = fastSolveVariant.featureFlags.enableFastSolveBonusRebalance;
    }

    const powerupVariant = this.abTestManager.getVariantConfig('powerup-pricing-rebalance', userId);
    if (powerupVariant?.featureFlags?.enablePowerupPricingRebalance !== undefined) {
      flags.enablePowerupPricingRebalance = powerupVariant.featureFlags.enablePowerupPricingRebalance;
    }

    return flags;
  }

  /**
   * Get balance configuration for a user with A/B testing
   */
  getBalanceConfig(userId: string): BalanceConfig & { featureFlags: BalanceFeatureFlags } {
    const baseConfig = this.abTestManager.getBalanceConfig(userId);
    const featureFlags = this.getFeatureFlags(userId);

    return {
      ...baseConfig,
      featureFlags,
    };
  }

  /**
   * Record balance impact metrics for analysis
   */
  recordBalanceMetrics(userId: string, metrics: Partial<BalanceImpactMetrics>): void {
    this.metricsCollector.recordMetrics(userId, metrics);

    // Record metrics for each active A/B test
    const activeTests = ['balance-improvements', 'retry-cost-rebalance', 'score-penalty-rebalance', 
                        'fast-solve-bonus-rebalance', 'powerup-pricing-rebalance'];

    for (const testName of activeTests) {
      const variant = this.abTestManager.getVariant(testName, userId);
      if (variant) {
        this.abTestManager.recordResult(testName, userId, this.convertToABTestMetrics(metrics));
      }
    }
  }

  /**
   * Get balance impact analysis for a specific test
   */
  getBalanceImpactAnalysis(testName: string): {
    variants: Record<string, BalanceImpactMetrics>;
    significance: any;
    recommendations: string[];
  } {
    return this.metricsCollector.analyzeBalanceImpact(testName);
  }

  /**
   * Enable/disable specific balance tests for gradual rollout
   */
  updateTestRollout(_testName: string, _rolloutPercentage: number): void {
    // This would update the test configuration
  }

  /**
   * Convert balance metrics to A/B test metrics format
   */
  private convertToABTestMetrics(metrics: Partial<BalanceImpactMetrics>): Record<string, number> {
    const abTestMetrics: Record<string, number> = {};

    if (metrics.retryUsageRate !== undefined) abTestMetrics.retryUsageRate = metrics.retryUsageRate;
    if (metrics.averageRetryCost !== undefined) abTestMetrics.averageRetryCost = metrics.averageRetryCost;
    if (metrics.retryAbandonmentRate !== undefined) abTestMetrics.retryAbandonmentRate = metrics.retryAbandonmentRate;
    if (metrics.averageScorePenalty !== undefined) abTestMetrics.averageScorePenalty = metrics.averageScorePenalty;
    if (metrics.firstRetryUsageRate !== undefined) abTestMetrics.firstRetryUsageRate = metrics.firstRetryUsageRate;
    if (metrics.fastSolveAchievementRate !== undefined) abTestMetrics.fastSolveAchievementRate = metrics.fastSolveAchievementRate;
    if (metrics.averageSolveTime !== undefined) abTestMetrics.averageSolveTime = metrics.averageSolveTime;
    if (metrics.playerRetentionRate !== undefined) abTestMetrics.playerRetentionRate = metrics.playerRetentionRate;
    if (metrics.sessionDuration !== undefined) abTestMetrics.sessionDuration = metrics.sessionDuration;
    if (metrics.coinEarningRate !== undefined) abTestMetrics.coinEarningRate = metrics.coinEarningRate;
    if (metrics.progressionRate !== undefined) abTestMetrics.progressionRate = metrics.progressionRate;

    return abTestMetrics;
  }
}

/**
 * Balance Metrics Collector
 * 
 * Collects and analyzes balance impact metrics
 */
export class BalanceMetricsCollector {
  private metrics: Map<string, BalanceImpactMetrics[]> = new Map();

  /**
   * Record balance metrics for a user
   */
  recordMetrics(userId: string, metrics: Partial<BalanceImpactMetrics>): void {
    if (!this.metrics.has(userId)) {
      this.metrics.set(userId, []);
    }

    const userMetrics = this.metrics.get(userId)!;

    // Merge with existing metrics or create new entry
    const existingMetrics = userMetrics[userMetrics.length - 1];
    const newMetrics: BalanceImpactMetrics = {
      // Default values
      retryUsageRate: 0,
      averageRetryCost: 0,
      retryAbandonmentRate: 0,
      averageScorePenalty: 0,
      firstRetryUsageRate: 0,
      penaltyImpactOnProgression: 0,
      fastSolveAchievementRate: 0,
      averageSolveTime: 0,
      bonusImpactOnEngagement: 0,
      powerupPurchaseRate: {},
      averagePowerupCost: {},
      powerupValuePerception: {},
      playerRetentionRate: 0,
      sessionDuration: 0,
      coinEarningRate: 0,
      progressionRate: 0,
      
      // Merge existing and new metrics
      ...(existingMetrics || {}),
      ...metrics,
    };

    userMetrics.push(newMetrics);

    // Keep only last 100 entries per user
    if (userMetrics.length > 100) {
      userMetrics.splice(0, userMetrics.length - 100);
    }
  }

  /**
   * Analyze balance impact for a specific A/B test
   */
  analyzeBalanceImpact(testName: string): {
    variants: Record<string, BalanceImpactMetrics>;
    significance: any;
    recommendations: string[];
  } {
    const abTestManager = ABTestManager.getInstance();
    const results = abTestManager.getResults(testName);

    // Group results by variant
    const variantMetrics: Record<string, BalanceImpactMetrics[]> = {};
    
    for (const result of results) {
      if (!variantMetrics[result.variant]) {
        variantMetrics[result.variant] = [];
      }
      
      // Convert A/B test metrics back to balance metrics
      const balanceMetrics: BalanceImpactMetrics = {
        retryUsageRate: result.metrics.retryUsageRate || 0,
        averageRetryCost: result.metrics.averageRetryCost || 0,
        retryAbandonmentRate: result.metrics.retryAbandonmentRate || 0,
        averageScorePenalty: result.metrics.averageScorePenalty || 0,
        firstRetryUsageRate: result.metrics.firstRetryUsageRate || 0,
        penaltyImpactOnProgression: result.metrics.penaltyImpactOnProgression || 0,
        fastSolveAchievementRate: result.metrics.fastSolveAchievementRate || 0,
        averageSolveTime: result.metrics.averageSolveTime || 0,
        bonusImpactOnEngagement: result.metrics.bonusImpactOnEngagement || 0,
        powerupPurchaseRate: {},
        averagePowerupCost: {},
        powerupValuePerception: {},
        playerRetentionRate: result.metrics.playerRetentionRate || 0,
        sessionDuration: result.metrics.sessionDuration || 0,
        coinEarningRate: result.metrics.coinEarningRate || 0,
        progressionRate: result.metrics.progressionRate || 0,
      };
      const metricsForVariant = variantMetrics[result.variant];
      if (metricsForVariant) {
        metricsForVariant.push(balanceMetrics);
      }
    }

    // Calculate average metrics per variant
    const variants: Record<string, BalanceImpactMetrics> = {};
    for (const [variant, metrics] of Object.entries(variantMetrics)) {
      variants[variant] = this.calculateAverageMetrics(metrics);
    }

    // Calculate statistical significance
    const significance = abTestManager.calculateSignificance(testName, 'playerRetentionRate');

    // Generate recommendations
    const recommendations = this.generateRecommendations(variants, significance);

    return {
      variants,
      significance,
      recommendations,
    };
  }

  /**
   * Calculate average metrics from an array of metrics
   */
  private calculateAverageMetrics(metricsArray: BalanceImpactMetrics[]): BalanceImpactMetrics {
    if (metricsArray.length === 0) {
      return {
        retryUsageRate: 0,
        averageRetryCost: 0,
        retryAbandonmentRate: 0,
        averageScorePenalty: 0,
        firstRetryUsageRate: 0,
        penaltyImpactOnProgression: 0,
        fastSolveAchievementRate: 0,
        averageSolveTime: 0,
        bonusImpactOnEngagement: 0,
        powerupPurchaseRate: {},
        averagePowerupCost: {},
        powerupValuePerception: {},
        playerRetentionRate: 0,
        sessionDuration: 0,
        coinEarningRate: 0,
        progressionRate: 0,
      };
    }

    const count = metricsArray.length;
    const sum = metricsArray.reduce((acc, metrics) => ({
      retryUsageRate: acc.retryUsageRate + metrics.retryUsageRate,
      averageRetryCost: acc.averageRetryCost + metrics.averageRetryCost,
      retryAbandonmentRate: acc.retryAbandonmentRate + metrics.retryAbandonmentRate,
      averageScorePenalty: acc.averageScorePenalty + metrics.averageScorePenalty,
      firstRetryUsageRate: acc.firstRetryUsageRate + metrics.firstRetryUsageRate,
      penaltyImpactOnProgression: acc.penaltyImpactOnProgression + metrics.penaltyImpactOnProgression,
      fastSolveAchievementRate: acc.fastSolveAchievementRate + metrics.fastSolveAchievementRate,
      averageSolveTime: acc.averageSolveTime + metrics.averageSolveTime,
      bonusImpactOnEngagement: acc.bonusImpactOnEngagement + metrics.bonusImpactOnEngagement,
      powerupPurchaseRate: {},
      averagePowerupCost: {},
      powerupValuePerception: {},
      playerRetentionRate: acc.playerRetentionRate + metrics.playerRetentionRate,
      sessionDuration: acc.sessionDuration + metrics.sessionDuration,
      coinEarningRate: acc.coinEarningRate + metrics.coinEarningRate,
      progressionRate: acc.progressionRate + metrics.progressionRate,
    }), {
      retryUsageRate: 0,
      averageRetryCost: 0,
      retryAbandonmentRate: 0,
      averageScorePenalty: 0,
      firstRetryUsageRate: 0,
      penaltyImpactOnProgression: 0,
      fastSolveAchievementRate: 0,
      averageSolveTime: 0,
      bonusImpactOnEngagement: 0,
      powerupPurchaseRate: {},
      averagePowerupCost: {},
      powerupValuePerception: {},
      playerRetentionRate: 0,
      sessionDuration: 0,
      coinEarningRate: 0,
      progressionRate: 0,
    });

    return {
      retryUsageRate: sum.retryUsageRate / count,
      averageRetryCost: sum.averageRetryCost / count,
      retryAbandonmentRate: sum.retryAbandonmentRate / count,
      averageScorePenalty: sum.averageScorePenalty / count,
      firstRetryUsageRate: sum.firstRetryUsageRate / count,
      penaltyImpactOnProgression: sum.penaltyImpactOnProgression / count,
      fastSolveAchievementRate: sum.fastSolveAchievementRate / count,
      averageSolveTime: sum.averageSolveTime / count,
      bonusImpactOnEngagement: sum.bonusImpactOnEngagement / count,
      powerupPurchaseRate: {},
      averagePowerupCost: {},
      powerupValuePerception: {},
      playerRetentionRate: sum.playerRetentionRate / count,
      sessionDuration: sum.sessionDuration / count,
      coinEarningRate: sum.coinEarningRate / count,
      progressionRate: sum.progressionRate / count,
    };
  }

  /**
   * Generate recommendations based on A/B test results
   */
  private generateRecommendations(variants: Record<string, BalanceImpactMetrics>, significance: any): string[] {
    const recommendations: string[] = [];

    if (!significance.significant) {
      recommendations.push('Continue test - not enough data for statistical significance');
      return recommendations;
    }

    // Compare variants (assuming control vs treatment)
    const variantNames = Object.keys(variants);
    if (variantNames.length === 2) {
      const control = variantNames[0];
      const treatment = variantNames[1];
      if (!control || !treatment) {
        return recommendations;
      }
      const controlMetrics = variants[control];
      const treatmentMetrics = variants[treatment];
      if (!controlMetrics || !treatmentMetrics) {
        return recommendations;
      }

      // Retention analysis
      if (treatmentMetrics.playerRetentionRate > controlMetrics.playerRetentionRate) {
        recommendations.push('New balance improves player retention - consider full rollout');
      } else {
        recommendations.push('New balance reduces player retention - consider rollback');
      }

      // Engagement analysis
      if (treatmentMetrics.sessionDuration > controlMetrics.sessionDuration) {
        recommendations.push('New balance increases session duration');
      }

      // Economic analysis
      if (treatmentMetrics.coinEarningRate > controlMetrics.coinEarningRate) {
        recommendations.push('New balance improves coin economy');
      }

      // Retry system analysis
      if (treatmentMetrics.retryAbandonmentRate < controlMetrics.retryAbandonmentRate) {
        recommendations.push('Retry cost changes reduce abandonment');
      }
    }

    return recommendations;
  }
}

/**
 * Global balance A/B testing manager instance
 */
export const balanceABTestingManager = new BalanceABTestingManager();
