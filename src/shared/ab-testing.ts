/**
 * A/B Testing Infrastructure for Balance Changes
 * Provides feature flags and metrics collection for gradual balance rollout
 */

export interface ABTestConfig {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  variants: ABTestVariant[];
  startDate?: Date;
  endDate?: Date;
}

export interface ABTestVariant {
  name: string;
  weight: number; // 0-100, should sum to 100 across all variants
  config: Record<string, any>;
}

export interface ABTestResult {
  testName: string;
  variant: string;
  userId: string;
  timestamp: number;
  metrics: Record<string, number>;
}

export interface BalanceConfig {
  retry: {
    maxCostCoins: number;
    scalingType: 'linear' | 'exponential';
    difficultyMultiplier: number;
  };
  scoring: {
    maxPenaltyPercent: number;
    penaltyType: 'logarithmic' | 'linear';
    firstRetryFree: boolean;
  };
  fastSolve: {
    thresholdSeconds: number;
    bonusPercent: number;
    difficultyScaling: boolean;
  };
  powerups: {
    rocketCostMultiplier: number;
    valuePerCoinRatios: Record<string, number>;
  };
}

export class ABTestManager {
  private tests: Map<string, ABTestConfig> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map(); // userId -> testName -> variant
  private results: ABTestResult[] = [];
  private static instance: ABTestManager;

  static getInstance(): ABTestManager {
    if (!ABTestManager.instance) {
      ABTestManager.instance = new ABTestManager();
    }
    return ABTestManager.instance;
  }

  /**
   * Register an A/B test configuration
   */
  registerTest(config: ABTestConfig): void {
    // Validate variant weights sum to 100
    const totalWeight = config.variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error(`Variant weights must sum to 100, got ${totalWeight}`);
    }

    this.tests.set(config.name, config);
  }

  /**
   * Get variant for a user in a specific test
   */
  getVariant(testName: string, userId: string): string | null {
    const test = this.tests.get(testName);
    if (!test || !test.enabled) {
      return null;
    }

    // Check if user is in rollout percentage
    if (!this.isUserInRollout(userId, test.rolloutPercentage)) {
      return null;
    }

    // Check if user already has an assignment
    const userTests = this.userAssignments.get(userId);
    if (userTests?.has(testName)) {
      return userTests.get(testName)!;
    }

    // Assign user to variant based on deterministic hash
    const variant = this.assignUserToVariant(userId, test);
    
    // Store assignment
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Map());
    }
    this.userAssignments.get(userId)!.set(testName, variant);

    return variant;
  }

  /**
   * Get configuration for a user's variant
   */
  getVariantConfig(testName: string, userId: string): Record<string, any> | null {
    const variant = this.getVariant(testName, userId);
    if (!variant) {
      return null;
    }

    const test = this.tests.get(testName);
    const variantConfig = test?.variants.find(v => v.name === variant);
    return variantConfig?.config || null;
  }

  /**
   * Record A/B test result
   */
  recordResult(testName: string, userId: string, metrics: Record<string, number>): void {
    const variant = this.getVariant(testName, userId);
    if (!variant) {
      return;
    }

    this.results.push({
      testName,
      variant,
      userId,
      timestamp: Date.now(),
      metrics
    });
  }

  /**
   * Get results for a specific test
   */
  getResults(testName: string): ABTestResult[] {
    return this.results.filter(result => result.testName === testName);
  }

  /**
   * Calculate statistical significance of test results
   */
  calculateSignificance(testName: string, metricName: string): {
    variants: Record<string, { mean: number; count: number; stdDev: number }>;
    pValue: number;
    significant: boolean;
  } {
    const results = this.getResults(testName);
    const variantData: Record<string, number[]> = {};

	    // Group results by variant
	    for (const result of results) {
	      const metricValue = result.metrics[metricName];
	      if (metricValue !== undefined) {
	        if (!variantData[result.variant]) {
	          variantData[result.variant] = [];
	        }
	        variantData[result.variant]?.push(metricValue);
	      }
	    }

    // Calculate statistics for each variant
    const variants: Record<string, { mean: number; count: number; stdDev: number }> = {};
    for (const [variant, values] of Object.entries(variantData)) {
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      variants[variant] = {
        mean,
        count: values.length,
        stdDev
      };
    }

    // Simple t-test for two variants (can be extended for multiple variants)
    const variantNames = Object.keys(variants);
    let pValue = 1.0;
    let significant = false;

	    if (variantNames.length === 2) {
	      const variant1 = variantNames[0];
	      const variant2 = variantNames[1];
	      if (!variant1 || !variant2) {
	        return { variants, pValue, significant };
	      }
	      const data1 = variantData[variant1];
	      const data2 = variantData[variant2];
	      const stats1 = variants[variant1];
	      const stats2 = variants[variant2];
	      if (!data1 || !data2 || !stats1 || !stats2) {
	        return { variants, pValue, significant };
	      }
	      
	      // Simplified t-test calculation
	      const mean1 = stats1.mean;
	      const mean2 = stats2.mean;
	      const n1 = data1.length;
	      const n2 = data2.length;
	      
	      if (n1 > 1 && n2 > 1) {
	        const pooledStdDev = Math.sqrt(
	          ((n1 - 1) * Math.pow(stats1.stdDev, 2) + 
	           (n2 - 1) * Math.pow(stats2.stdDev, 2)) / 
	          (n1 + n2 - 2)
	        );
        
        const standardError = pooledStdDev * Math.sqrt(1/n1 + 1/n2);
        const tStat = Math.abs(mean1 - mean2) / standardError;
        
        // Approximate p-value (simplified)
        pValue = Math.max(0.001, 2 * (1 - this.normalCDF(tStat)));
        significant = pValue < 0.05;
      }
    }

    return {
      variants,
      pValue,
      significant
    };
  }

  /**
   * Get balance configuration based on A/B test assignment
   */
  getBalanceConfig(userId: string): BalanceConfig {
    // Default configuration
    const defaultConfig: BalanceConfig = {
      retry: {
        maxCostCoins: 140, // 4 puzzles worth
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
        rocketCostMultiplier: 2.0, // 2x hammer cost instead of 4x
        valuePerCoinRatios: {
          hammer: 1.0,
          wand: 0.35,
          shield: 0.27,
          rocket: 0.5
        }
      }
    };

    // Check for balance test assignments
    const balanceVariant = this.getVariantConfig('balance-improvements', userId);
    if (balanceVariant) {
      return { ...defaultConfig, ...balanceVariant };
    }

    return defaultConfig;
  }

  private isUserInRollout(userId: string, rolloutPercentage: number): boolean {
    // Use deterministic hash of userId to determine rollout
    const hash = this.hashString(userId);
    const userPercentile = (hash % 100) + 1;
    return userPercentile <= rolloutPercentage;
  }

  private assignUserToVariant(userId: string, test: ABTestConfig): string {
    const hash = this.hashString(userId + test.name);
    const randomValue = hash % 100;
    
    let cumulativeWeight = 0;
    for (const variant of test.variants) {
      cumulativeWeight += variant.weight;
      if (randomValue < cumulativeWeight) {
        return variant.name;
      }
	    }
	    
	    // Fallback to first variant
	    const fallbackVariant = test.variants[0];
	    if (!fallbackVariant) {
	      throw new Error(`A/B test ${test.name} must define at least one variant`);
	    }
	    return fallbackVariant.name;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private normalCDF(x: number): number {
    // Approximation of normal cumulative distribution function
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }
}

/**
 * Default A/B test configurations for balance improvements
 */
export const defaultABTests: ABTestConfig[] = [
  {
    name: 'balance-improvements',
    description: 'Test new balance changes for retry costs, scoring, and powerup pricing',
    enabled: true,
    rolloutPercentage: 50, // 50% of users
    variants: [
      {
        name: 'control',
        weight: 50,
        config: {} // Use default configuration
      },
      {
        name: 'new-balance',
        weight: 50,
        config: {
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
  }
];
