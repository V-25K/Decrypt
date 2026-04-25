/**
 * Balance A/B Testing Integration
 * 
 * Integrates A/B testing with existing balance systems
 */

import { balanceABTestingConfig } from './balance-ab-testing-config';
import { RebalancedRetryCostCalculator } from '../../shared/rebalanced-retry-cost-calculator';
import { RebalancedScorePenaltyEngine } from '../../shared/rebalanced-score-penalty-engine';
import { RebalancedFastSolveBonusSystem } from '../../shared/rebalanced-fast-solve-bonus-system';
import { RebalancedPowerupPricingEngine } from '../../shared/rebalanced-powerup-pricing-engine';

/**
 * Balance System Factory with A/B Testing Integration
 * 
 * Creates balance system instances based on user's A/B test assignment
 */
export class BalanceSystemFactory {
  private static instance: BalanceSystemFactory;

  static getInstance(): BalanceSystemFactory {
    if (!BalanceSystemFactory.instance) {
      BalanceSystemFactory.instance = new BalanceSystemFactory();
    }
    return BalanceSystemFactory.instance;
  }

  /**
   * Get retry cost calculator for user based on A/B test
   */
  getRetryCostCalculator(userId: string): RebalancedRetryCostCalculator {
    const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
    
    if (config?.retry) {
      return new RebalancedRetryCostCalculator({
        maxCostCoins: config.retry.maxCostCoins,
        scalingType: config.retry.scalingType,
        difficultyMultiplier: config.retry.difficultyMultiplier
      });
    }

    // Default configuration
    return new RebalancedRetryCostCalculator();
  }

  /**
   * Get score penalty engine for user based on A/B test
   */
  getScorePenaltyEngine(userId: string): RebalancedScorePenaltyEngine {
    const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
    
    if (config?.scoring) {
      return new RebalancedScorePenaltyEngine({
        maxPenaltyPercent: config.scoring.maxPenaltyPercent,
        penaltyType: config.scoring.penaltyType,
        firstRetryFree: config.scoring.firstRetryFree
      });
    }

    // Default configuration
    return new RebalancedScorePenaltyEngine();
  }

  /**
   * Get fast solve bonus system for user based on A/B test
   */
  getFastSolveBonusSystem(userId: string): RebalancedFastSolveBonusSystem {
    const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
    
    if (config?.fastSolve) {
      return new RebalancedFastSolveBonusSystem({
        thresholdSeconds: config.fastSolve.thresholdSeconds,
        bonusPercent: config.fastSolve.bonusPercent,
        difficultyScaling: config.fastSolve.difficultyScaling
      });
    }

    // Default configuration
    return new RebalancedFastSolveBonusSystem();
  }

  /**
   * Get powerup pricing engine for user based on A/B test
   */
  getPowerupPricingEngine(userId: string): RebalancedPowerupPricingEngine {
    const { config, variant } = balanceABTestingConfig.getBalanceConfigForUser(userId);
    
    if (config?.powerups) {
      return new RebalancedPowerupPricingEngine({
        rocketCostMultiplier: config.powerups.rocketCostMultiplier,
        valuePerCoinRatios: config.powerups.valuePerCoinRatios
      });
    }

    // Default configuration
    return new RebalancedPowerupPricingEngine();
  }

  /**
   * Get user's A/B test variant information
   */
  getUserTestInfo(userId: string): {
    variant: string | null;
    testName: string;
    isControl: boolean;
    isTreatment: boolean;
  } {
    const { variant, testName } = balanceABTestingConfig.getBalanceConfigForUser(userId);
    
    const isControl = variant === 'control' || 
                     variant?.includes('high') || 
                     variant?.includes('expensive') || 
                     variant?.includes('conservative') || 
                     false;
    
    const isTreatment = variant !== null && !isControl;

    return {
      variant,
      testName,
      isControl,
      isTreatment
    };
  }
}

/**
 * Balance Metrics Collector
 * 
 * Collects and records balance-related metrics for A/B test analysis
 */
export class BalanceMetricsCollector {
  private static instance: BalanceMetricsCollector;

  static getInstance(): BalanceMetricsCollector {
    if (!BalanceMetricsCollector.instance) {
      BalanceMetricsCollector.instance = new BalanceMetricsCollector();
    }
    return BalanceMetricsCollector.instance;
  }

  /**
   * Record retry attempt metrics
   */
  recordRetryAttempt(userId: string, data: {
    levelId: string;
    retryNumber: number;
    coinCost: number;
    difficulty: number;
    successful: boolean;
  }): void {
    balanceABTestingConfig.recordBalanceMetrics(userId, {
      retryCount: data.retryNumber,
      totalCoinsSpent: data.coinCost,
      scoreAchieved: 0, // Will be updated on completion
      solveTimeSeconds: 0, // Will be updated on completion
      powerupsUsed: 0,
      levelCompleted: data.successful,
      fastSolveBonus: false
    });
  }

  /**
   * Record level completion metrics
   */
  recordLevelCompletion(userId: string, data: {
    levelId: string;
    totalRetries: number;
    totalCoinsSpent: number;
    finalScore: number;
    solveTimeSeconds: number;
    powerupsUsed: number;
    fastSolveBonus: boolean;
  }): void {
    balanceABTestingConfig.recordBalanceMetrics(userId, {
      retryCount: data.totalRetries,
      totalCoinsSpent: data.totalCoinsSpent,
      scoreAchieved: data.finalScore,
      solveTimeSeconds: data.solveTimeSeconds,
      powerupsUsed: data.powerupsUsed,
      levelCompleted: true,
      fastSolveBonus: data.fastSolveBonus
    });
  }

  /**
   * Record powerup purchase metrics
   */
  recordPowerupPurchase(userId: string, data: {
    powerupType: string;
    coinCost: number;
    valueRatio: number;
    levelId: string;
  }): void {
    // Record as a separate metric for powerup-specific analysis
    balanceABTestingConfig.recordBalanceMetrics(userId, {
      retryCount: 0,
      totalCoinsSpent: data.coinCost,
      scoreAchieved: 0,
      solveTimeSeconds: 0,
      powerupsUsed: 1,
      levelCompleted: false,
      fastSolveBonus: false
    });
  }

  /**
   * Record score penalty application
   */
  recordScorePenalty(userId: string, data: {
    levelId: string;
    retryNumber: number;
    originalScore: number;
    penaltyPercent: number;
    finalScore: number;
  }): void {
    // This will be aggregated with other metrics
    const penaltyAmount = data.originalScore - data.finalScore;
    
    balanceABTestingConfig.recordBalanceMetrics(userId, {
      retryCount: data.retryNumber,
      totalCoinsSpent: 0,
      scoreAchieved: data.finalScore,
      solveTimeSeconds: 0,
      powerupsUsed: 0,
      levelCompleted: false,
      fastSolveBonus: false
    });
  }
}

/**
 * Global instances
 */
export const balanceSystemFactory = BalanceSystemFactory.getInstance();
export const balanceMetricsCollector = BalanceMetricsCollector.getInstance();

/**
 * Convenience functions
 */
export const getBalanceSystemsForUser = (userId: string) => ({
  retryCostCalculator: balanceSystemFactory.getRetryCostCalculator(userId),
  scorePenaltyEngine: balanceSystemFactory.getScorePenaltyEngine(userId),
  fastSolveBonusSystem: balanceSystemFactory.getFastSolveBonusSystem(userId),
  powerupPricingEngine: balanceSystemFactory.getPowerupPricingEngine(userId),
  testInfo: balanceSystemFactory.getUserTestInfo(userId)
});

export const recordUserBalanceMetrics = (userId: string, type: string, data: any) => {
  switch (type) {
    case 'retry':
      balanceMetricsCollector.recordRetryAttempt(userId, data);
      break;
    case 'completion':
      balanceMetricsCollector.recordLevelCompletion(userId, data);
      break;
    case 'powerup':
      balanceMetricsCollector.recordPowerupPurchase(userId, data);
      break;
    case 'penalty':
      balanceMetricsCollector.recordScorePenalty(userId, data);
      break;
    default:
      console.warn(`[BalanceMetrics] Unknown metric type: ${type}`);
  }
};