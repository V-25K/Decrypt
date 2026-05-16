export interface RetryCostConfig {
  maxRetryCoins: number; // 4 puzzles worth (140 coins)
  scalingType: 'linear' | 'exponential';
  difficultyMultiplier: number;
}

/**
 * RetryCostCalculator implements the new retry cost system
 * with linear scaling and 4-puzzle maximum cost (down from 12).
 * 
 * Features:
 * - Linear scaling formula instead of exponential
 * - Maximum cost of 4 puzzles worth of coins (140 coins)
 * - Difficulty-based cost adjustments
 * - 3 retries never exceed 6 puzzle completions cost
 */
export class RetryCostCalculator {
  private readonly config: RetryCostConfig;

  constructor(config?: Partial<RetryCostConfig>) {
    this.config = {
      maxRetryCoins: 140, // 4 * 35 coins per puzzle
      scalingType: 'linear',
      difficultyMultiplier: 1.2,
      ...config
    };
  }

  /**
   * Calculate retry cost for a specific retry attempt
   * Uses linear scaling with difficulty adjustments
   */
  calculateRetryCost(retryCount: number, difficulty: number = 5): number {
    const safeRetryCount = Number.isFinite(retryCount)
      ? Math.max(0, Math.floor(retryCount))
      : 0;
    const safeDifficulty = Number.isFinite(difficulty)
      ? Math.max(1, Math.min(10, Math.round(difficulty)))
      : 5;

    const baseCost = 35; // One puzzle worth
    const linearCost = baseCost * (safeRetryCount + 1);
    
    // Apply difficulty multiplier (normalized around difficulty 5)
    const difficultyAdjustment = Math.pow(this.config.difficultyMultiplier, (safeDifficulty - 5) / 5);
    const adjustedCost = linearCost * difficultyAdjustment;
    
    // Cap at maximum retry cost
    return Math.min(Math.round(adjustedCost), this.config.maxRetryCoins);
  }

  /**
   * Get the maximum total cost for a given number of retries
   * Ensures 3 retries never exceed 6 puzzle completions (210 coins)
   */
  getMaxCostForRetries(retryCount: number, difficulty: number = 5): number {
    const maxTotal = 210; // 6 puzzle completions
    let total = 0;
    
    for (let i = 0; i <= retryCount; i++) {
      total += this.calculateRetryCost(i, difficulty);
    }
    
    return Math.min(total, maxTotal);
  }

  /**
   * Get cost preview for the next retry
   */
  getNextRetryCost(currentRetryCount: number, difficulty: number = 5): number {
    return this.calculateRetryCost(currentRetryCount + 1, difficulty);
  }

  /**
   * Check if a retry is affordable given current coins
   */
  canAffordRetry(currentCoins: number, retryCount: number, difficulty: number = 5): boolean {
    const cost = this.calculateRetryCost(retryCount, difficulty);
    return currentCoins >= cost;
  }

  /**
   * Get cost breakdown for multiple retries
   */
  getCostBreakdown(maxRetries: number, difficulty: number = 5): Array<{
    retryNumber: number;
    cost: number;
    cumulativeCost: number;
  }> {
    const breakdown = [];
    let cumulativeCost = 0;
    
    for (let i = 0; i <= maxRetries; i++) {
      const cost = this.calculateRetryCost(i, difficulty);
      cumulativeCost += cost;
      
      breakdown.push({
        retryNumber: i,
        cost,
        cumulativeCost
      });
    }
    
    return breakdown;
  }

  /**
   * Get the current configuration
   */
  getConfig(): RetryCostConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance of the retry cost calculator
 */
export const retryCostCalculator = new RetryCostCalculator();
