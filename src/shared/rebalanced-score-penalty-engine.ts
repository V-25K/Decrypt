export interface ScorePenaltyConfig {
  maxPenalty: number; // 25% maximum
  penaltyType: 'logarithmic' | 'linear';
  firstRetryFree: boolean;
}

/**
 * RebalancedScorePenaltyEngine implements the new score penalty system
 * with 25% maximum penalty and logarithmic curve (down from 50% linear).
 * 
 * Features:
 * - Maximum 25% penalty (down from 50%)
 * - Logarithmic penalty curve instead of linear compounding
 * - Penalties apply only to current puzzle, not cumulative
 * - First retry is penalty-free
 */
export class RebalancedScorePenaltyEngine {
  private readonly config: ScorePenaltyConfig;

  constructor(config?: Partial<ScorePenaltyConfig>) {
    this.config = {
      maxPenalty: 0.25,
      penaltyType: 'logarithmic',
      firstRetryFree: true,
      ...config
    };
  }

  /**
   * Calculate penalty factor for a given retry count
   * Returns a multiplier (0.75-1.0) to apply to the original score
   */
  calculatePenaltyFactor(retryCount: number): number {
    if (retryCount < 0) {
      throw new Error('Retry count cannot be negative');
    }

    if (retryCount === 0 || (retryCount === 1 && this.config.firstRetryFree)) {
      return 1.0; // No penalty
    }

    const effectiveRetries = this.config.firstRetryFree ? retryCount - 1 : retryCount;

    if (this.config.penaltyType === 'logarithmic') {
      // Logarithmic penalty curve: penalty = maxPenalty * log(retries + 1) / log(5)
      const normalizedRetries = Math.min(effectiveRetries, 4);
      const penaltyRatio = Math.log(normalizedRetries + 1) / Math.log(5);
      const penalty = this.config.maxPenalty * penaltyRatio;
      
      return Math.max(0.75, 1.0 - penalty); // Minimum 75% of original score
    } else {
      // Linear penalty (fallback)
      const penalty = Math.min(this.config.maxPenalty, effectiveRetries * 0.1);
      return Math.max(0.75, 1.0 - penalty);
    }
  }

  /**
   * Apply penalty to a score based on retry count
   */
  applyPenalty(originalScore: number, retryCount: number): number {
    if (originalScore < 0) {
      throw new Error('Original score cannot be negative');
    }

    const factor = this.calculatePenaltyFactor(retryCount);
    const penalizedScore = Math.round(originalScore * factor);
    
    // Ensure we never exceed the maximum penalty due to rounding
    const minAllowedScore = Math.ceil(originalScore * (1 - this.config.maxPenalty));
    return Math.max(penalizedScore, minAllowedScore);
  }

  /**
   * Get penalty percentage for display purposes
   */
  getPenaltyPercentage(retryCount: number): number {
    const factor = this.calculatePenaltyFactor(retryCount);
    return Math.round((1.0 - factor) * 100);
  }

  /**
   * Check if a retry will incur a penalty
   */
  willIncurPenalty(retryCount: number): boolean {
    return this.calculatePenaltyFactor(retryCount) < 1.0;
  }

  /**
   * Get penalty preview for the next retry
   */
  getNextRetryPenalty(currentRetryCount: number): {
    willHavePenalty: boolean;
    penaltyPercentage: number;
    penaltyFactor: number;
  } {
    const nextRetryCount = currentRetryCount + 1;
    const factor = this.calculatePenaltyFactor(nextRetryCount);
    
    return {
      willHavePenalty: factor < 1.0,
      penaltyPercentage: Math.round((1.0 - factor) * 100),
      penaltyFactor: factor
    };
  }

  /**
   * Get penalty breakdown for multiple retries
   */
  getPenaltyBreakdown(maxRetries: number): Array<{
    retryNumber: number;
    penaltyFactor: number;
    penaltyPercentage: number;
    scoreMultiplier: number;
  }> {
    const breakdown = [];
    
    for (let i = 0; i <= maxRetries; i++) {
      const factor = this.calculatePenaltyFactor(i);
      const percentage = Math.round((1.0 - factor) * 100);
      
      breakdown.push({
        retryNumber: i,
        penaltyFactor: factor,
        penaltyPercentage: percentage,
        scoreMultiplier: factor
      });
    }
    
    return breakdown;
  }

  /**
   * Calculate score after multiple retries
   */
  calculateFinalScore(originalScore: number, retryCount: number): {
    finalScore: number;
    penaltyApplied: number;
    penaltyPercentage: number;
  } {
    const finalScore = this.applyPenalty(originalScore, retryCount);
    const penaltyApplied = originalScore - finalScore;
    const penaltyPercentage = this.getPenaltyPercentage(retryCount);
    
    return {
      finalScore,
      penaltyApplied,
      penaltyPercentage
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): ScorePenaltyConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance of the rebalanced score penalty engine
 */
export const rebalancedScorePenaltyEngine = new RebalancedScorePenaltyEngine();