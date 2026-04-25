/**
 * A/B Testing Configuration for Balance Changes
 * 
 * Task 15.2: Configure A/B testing for balance changes
 * 
 * Sets up feature flags for gradual balance rollout with 50/50 split testing
 * and metrics collection for balance impact analysis.
 */

import { ABTestManager, ABTestConfig, defaultABTests } from '../../shared/ab-testing';
import { PerformanceMonitor } from '../../shared/performance';

/**
 * Balance A/B Test Configuration Manager
 * 
 * Manages feature flags and gradual rollout for all balance changes
 */
export class BalanceABTestingConfig {
  private abTestManager: ABTestManager;
  private performanceMonitor: PerformanceMonitor;
  private static instance: BalanceABTestingConfig;

  constructor() {
    this.abTestManager = ABTestManager.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
  }

  static getInstance(): BalanceABTestingConfig {
    if (!BalanceABTestingConfig.instance) {
      BalanceABTestingConfig.instance = new BalanceABTestingConfig();
    }
    return BalanceABTestingConfig.instance;
  }

  /**
   * Initialize all balance A/B tests
   */
  async initialize(): Promise<void> {
    // Register the main balance improvements test
    this.abTestManager.registerTest(this.createBalanceImprovementsTest());

    // Register individual balance system tests for granular control
    this.abTestManager.registerTest(this.createRetryCostTest());
    this.abTestManager.registerTest(this.createScorePenaltyTest());
    this.abTestManager.registerTest(this.createFastSolveBonusTest());
    this.abTestManager.registerTest(this.createPowerupPricingTest());
  }

  /**
   * Create the main balance improvements A/B test (50/50 split)
   */
  private createBalanceImprovementsTest(): ABTestConfig {
    return {
      name: 'balance-improvements-v2',
      description: 'Test comprehensive balance changes for retry costs, scoring, fast solve bonuses, and powerup pricing',
      enabled: true,
      rolloutPercentage: 50, // 50% of users get the test
      variants: [
        {
          name: 'control',
          weight: 50,
          config: {
            useNewBalance: false,
            // Control group uses original balance settings
            retry: {
              maxCostCoins: 200, // Original: higher cost
              scalingType: 'exponential',
              difficultyMultiplier: 1.5
            },
            scoring: {
              maxPenaltyPercent: 50, // Original: higher penalty
              penaltyType: 'linear',
              firstRetryFree: false
            },
            fastSolve: {
              thresholdSeconds: 60, // Original: longer threshold
              bonusPercent: 25, // Original: lower bonus
              difficultyScaling: false
            },
            powerups: {
              rocketCostMultiplier: 4.0, // Original: 4x hammer cost
              valuePerCoinRatios: {
                hammer: 1.0,
                wand: 0.25,
                shield: 0.2,
                rocket: 0.25
              }
            }
          }
        },
        {
          name: 'new-balance',
          weight: 50,
          config: {
            useNewBalance: true,
            // Treatment group uses new balance settings
            retry: {
              maxCostCoins: 140, // New: 4 puzzles worth (35 coins each)
              scalingType: 'linear',
              difficultyMultiplier: 1.2
            },
            scoring: {
              maxPenaltyPercent: 25, // New: reduced penalty
              penaltyType: 'logarithmic',
              firstRetryFree: true
            },
            fastSolve: {
              thresholdSeconds: 30, // New: shorter threshold
              bonusPercent: 50, // New: higher bonus
              difficultyScaling: true
            },
            powerups: {
              rocketCostMultiplier: 2.0, // New: 2x hammer cost
              valuePerCoinRatios: {
                hammer: 1.0,
                wand: 0.35,
                shield: 0.27,
                rocket: 0.5
              }
            }
          }
        }
      ],
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    };
  }

  /**
   * Create retry cost A/B test for granular testing
   */
  private createRetryCostTest(): ABTestConfig {
    return {
      name: 'retry-cost-rebalance',
      description: 'Test new retry cost scaling (linear vs exponential)',
      enabled: false, // Disabled by default, can be enabled for focused testing
      rolloutPercentage: 25,
      variants: [
        {
          name: 'exponential-scaling',
          weight: 50,
          config: {
            retry: {
              maxCostCoins: 200,
              scalingType: 'exponential',
              difficultyMultiplier: 1.5
            }
          }
        },
        {
          name: 'linear-scaling',
          weight: 50,
          config: {
            retry: {
              maxCostCoins: 140,
              scalingType: 'linear',
              difficultyMultiplier: 1.2
            }
          }
        }
      ]
    };
  }

  /**
   * Create score penalty A/B test
   */
  private createScorePenaltyTest(): ABTestConfig {
    return {
      name: 'score-penalty-rebalance',
      description: 'Test reduced score penalties with first retry free',
      enabled: false,
      rolloutPercentage: 25,
      variants: [
        {
          name: 'high-penalty',
          weight: 50,
          config: {
            scoring: {
              maxPenaltyPercent: 50,
              penaltyType: 'linear',
              firstRetryFree: false
            }
          }
        },
        {
          name: 'low-penalty',
          weight: 50,
          config: {
            scoring: {
              maxPenaltyPercent: 25,
              penaltyType: 'logarithmic',
              firstRetryFree: true
            }
          }
        }
      ]
    };
  }

  /**
   * Create fast solve bonus A/B test
   */
  private createFastSolveBonusTest(): ABTestConfig {
    return {
      name: 'fast-solve-bonus-rebalance',
      description: 'Test improved fast solve bonuses with shorter thresholds',
      enabled: false,
      rolloutPercentage: 25,
      variants: [
        {
          name: 'conservative-bonus',
          weight: 50,
          config: {
            fastSolve: {
              thresholdSeconds: 60,
              bonusPercent: 25,
              difficultyScaling: false
            }
          }
        },
        {
          name: 'generous-bonus',
          weight: 50,
          config: {
            fastSolve: {
              thresholdSeconds: 30,
              bonusPercent: 50,
              difficultyScaling: true
            }
          }
        }
      ]
    };
  }

  /**
   * Create powerup pricing A/B test
   */
  private createPowerupPricingTest(): ABTestConfig {
    return {
      name: 'powerup-pricing-rebalance',
      description: 'Test improved powerup value ratios with reduced rocket cost',
      enabled: false,
      rolloutPercentage: 25,
      variants: [
        {
          name: 'expensive-rocket',
          weight: 50,
          config: {
            powerups: {
              rocketCostMultiplier: 4.0,
              valuePerCoinRatios: {
                hammer: 1.0,
                wand: 0.25,
                shield: 0.2,
                rocket: 0.25
              }
            }
          }
        },
        {
          name: 'affordable-rocket',
          weight: 50,
          config: {
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
    };
  }

  /**
   * Get balance configuration for a user based on A/B test assignment
   */
  getBalanceConfigForUser(userId: string): {
    config: any;
    variant: string | null;
    testName: string;
  } {
    // Check main balance improvements test first
    const mainVariant = this.abTestManager.getVariant('balance-improvements-v2', userId);
    if (mainVariant) {
      const config = this.abTestManager.getVariantConfig('balance-improvements-v2', userId);
      return {
        config,
        variant: mainVariant,
        testName: 'balance-improvements-v2'
      };
    }

    // Fall back to individual tests if main test is not active
    const individualTests = [
      'retry-cost-rebalance',
      'score-penalty-rebalance',
      'fast-solve-bonus-rebalance',
      'powerup-pricing-rebalance'
    ];

    for (const testName of individualTests) {
      const variant = this.abTestManager.getVariant(testName, userId);
      if (variant) {
        const config = this.abTestManager.getVariantConfig(testName, userId);
        return {
          config,
          variant,
          testName
        };
      }
    }

    // Default configuration if no tests are active
    return {
      config: null,
      variant: null,
      testName: 'default'
    };
  }

  /**
   * Record balance impact metrics for A/B test analysis
   */
  recordBalanceMetrics(userId: string, metrics: {
    retryCount: number;
    totalCoinsSpent: number;
    scoreAchieved: number;
    solveTimeSeconds: number;
    powerupsUsed: number;
    levelCompleted: boolean;
    fastSolveBonus: boolean;
  }): void {
    // Record metrics for the main balance test
    this.abTestManager.recordResult('balance-improvements-v2', userId, {
      retryCount: metrics.retryCount,
      totalCoinsSpent: metrics.totalCoinsSpent,
      scoreAchieved: metrics.scoreAchieved,
      solveTimeSeconds: metrics.solveTimeSeconds,
      powerupsUsed: metrics.powerupsUsed,
      completionRate: metrics.levelCompleted ? 1 : 0,
      fastSolveRate: metrics.fastSolveBonus ? 1 : 0,
      coinsPerRetry: metrics.retryCount > 0 ? metrics.totalCoinsSpent / metrics.retryCount : 0,
      scorePerSecond: metrics.solveTimeSeconds > 0 ? metrics.scoreAchieved / metrics.solveTimeSeconds : 0
    });

    // Also record for individual tests if they're active
    const individualTests = [
      'retry-cost-rebalance',
      'score-penalty-rebalance', 
      'fast-solve-bonus-rebalance',
      'powerup-pricing-rebalance'
    ];

    for (const testName of individualTests) {
      const variant = this.abTestManager.getVariant(testName, userId);
      if (variant) {
        this.abTestManager.recordResult(testName, userId, {
          retryCount: metrics.retryCount,
          totalCoinsSpent: metrics.totalCoinsSpent,
          scoreAchieved: metrics.scoreAchieved,
          solveTimeSeconds: metrics.solveTimeSeconds,
          powerupsUsed: metrics.powerupsUsed,
          completionRate: metrics.levelCompleted ? 1 : 0,
          fastSolveRate: metrics.fastSolveBonus ? 1 : 0
        });
      }
    }

    // Record performance metrics
    this.performanceMonitor.recordMetric({
      operation: 'balance-ab-test-metrics',
      duration: 0,
      timestamp: Date.now(),
      success: true,
      metadata: {
        userId,
        ...metrics
      }
    });
  }

  /**
   * Get A/B test results and statistical significance
   */
  async getBalanceTestResults(): Promise<{
    mainTest: any;
    individualTests: Record<string, any>;
    recommendations: string[];
  }> {
    const mainTestResults = this.abTestManager.calculateSignificance('balance-improvements-v2', 'completionRate');
    
    const individualTestResults: Record<string, any> = {};
    const individualTests = [
      'retry-cost-rebalance',
      'score-penalty-rebalance',
      'fast-solve-bonus-rebalance', 
      'powerup-pricing-rebalance'
    ];

    for (const testName of individualTests) {
      individualTestResults[testName] = this.abTestManager.calculateSignificance(testName, 'completionRate');
    }

    // Generate recommendations based on results
    const recommendations: string[] = [];
    
    if (mainTestResults.significant) {
      const controlCompletion = mainTestResults.variants.control?.mean || 0;
      const treatmentCompletion = mainTestResults.variants['new-balance']?.mean || 0;
      
      if (treatmentCompletion > controlCompletion) {
        recommendations.push('New balance changes show significant improvement in completion rates - consider full rollout');
      } else {
        recommendations.push('New balance changes show significant decrease in completion rates - consider rollback');
      }
    } else {
      recommendations.push('Main balance test results are not yet statistically significant - continue testing');
    }

    // Check individual test significance
    for (const [testName, results] of Object.entries(individualTestResults)) {
      if (results.significant) {
        recommendations.push(`${testName} shows significant results - consider focused analysis`);
      }
    }

    return {
      mainTest: mainTestResults,
      individualTests: individualTestResults,
      recommendations
    };
  }

  /**
   * Enable/disable specific balance tests
   */
  configureTest(testName: string, _enabled: boolean, _rolloutPercentage?: number): void {
    const existingTests = this.abTestManager.getResults(testName);
    if (existingTests.length === 0) {
      console.warn(`[BalanceABTesting] Test ${testName} not found`);
      return;
    }

    // This would require extending ABTestManager to support runtime configuration changes
  }

  /**
   * Get current test status and user distribution
   */
  getTestStatus(): {
    activeTests: string[];
    userDistribution: Record<string, { control: number; treatment: number }>;
    totalUsers: number;
  } {
    const activeTests: string[] = [];
    const userDistribution: Record<string, { control: number; treatment: number }> = {};
    let totalUsers = 0;

    const allTests = [
      'balance-improvements-v2',
      'retry-cost-rebalance',
      'score-penalty-rebalance',
      'fast-solve-bonus-rebalance',
      'powerup-pricing-rebalance'
    ];

    for (const testName of allTests) {
      const results = this.abTestManager.getResults(testName);
      if (results.length > 0) {
        activeTests.push(testName);
        
        const controlUsers = results.filter(r => r.variant === 'control' || r.variant.includes('high') || r.variant.includes('expensive') || r.variant.includes('conservative')).length;
        const treatmentUsers = results.filter(r => r.variant !== 'control' && !r.variant.includes('high') && !r.variant.includes('expensive') && !r.variant.includes('conservative')).length;
        
        userDistribution[testName] = {
          control: controlUsers,
          treatment: treatmentUsers
        };
        
        totalUsers += controlUsers + treatmentUsers;
      }
    }

    return {
      activeTests,
      userDistribution,
      totalUsers
    };
  }
}

/**
 * Global balance A/B testing configuration instance
 */
export const balanceABTestingConfig = BalanceABTestingConfig.getInstance();

/**
 * Initialize balance A/B testing on module load
 */
balanceABTestingConfig.initialize().catch(error => {
  console.error('[BalanceABTesting] Failed to initialize balance A/B testing:', error);
});

/**
 * Convenience functions for balance A/B testing
 */
export const getBalanceConfigForUser = (userId: string) => balanceABTestingConfig.getBalanceConfigForUser(userId);
export const recordBalanceMetrics = (userId: string, metrics: any) => balanceABTestingConfig.recordBalanceMetrics(userId, metrics);
export const getBalanceTestResults = () => balanceABTestingConfig.getBalanceTestResults();
export const getBalanceTestStatus = () => balanceABTestingConfig.getTestStatus();
