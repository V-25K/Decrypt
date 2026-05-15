export interface FastSolveBonusConfig {
  thresholdSeconds: number; // 30 seconds
  bonusPercentage: number; // 50%
  difficultyScaling: boolean;
}

/**
 * FastSolveBonusSystem implements the new fast solve bonus system
 * with 30-second threshold and 50% bonus (down from 60 seconds).
 * 
 * Features:
 * - 30-second bonus threshold (down from 60 seconds)
 * - 50% score bonus for fast solves
 * - Difficulty-based threshold scaling
 * - Personal best tracking support
 */
export class FastSolveBonusSystem {
  private readonly config: FastSolveBonusConfig;

  constructor(config?: Partial<FastSolveBonusConfig>) {
    this.config = {
      thresholdSeconds: 30,
      bonusPercentage: 0.5,
      difficultyScaling: true,
      ...config
    };
  }

  /**
   * Calculate bonus for a solve time
   */
  calculateBonus(solveSeconds: number, baseScore: number, difficulty: number = 5): number {
    if (solveSeconds < 0 || baseScore < 0) {
      throw new Error('Solve time and base score must be non-negative');
    }

    const threshold = this.getThresholdForDifficulty(difficulty);
    
    if (solveSeconds > threshold) {
      return 0; // No bonus if over threshold
    }

    // Bonus scales with how much faster than threshold
    const speedRatio = Math.max(0, (threshold - solveSeconds) / threshold);
    const bonus = baseScore * this.config.bonusPercentage * speedRatio;
    
    return Math.round(bonus);
  }

  /**
   * Get threshold for a specific difficulty level
   */
  getThresholdForDifficulty(difficulty: number): number {
    if (!this.config.difficultyScaling) {
      return this.config.thresholdSeconds;
    }

    // Scale threshold based on difficulty (harder puzzles get more time)
    const difficultyFactor = 1 + (difficulty - 5) * 0.1;
    return Math.round(this.config.thresholdSeconds * difficultyFactor);
  }

  /**
   * Check if a solve time qualifies for bonus
   */
  qualifiesForBonus(solveSeconds: number, difficulty: number = 5): boolean {
    const threshold = this.getThresholdForDifficulty(difficulty);
    return solveSeconds <= threshold;
  }

  /**
   * Calculate final score with bonus applied
   */
  calculateFinalScore(baseScore: number, solveSeconds: number, difficulty: number = 5): {
    finalScore: number;
    bonusApplied: number;
    bonusPercentage: number;
    qualifiedForBonus: boolean;
    threshold: number;
  } {
    const bonus = this.calculateBonus(solveSeconds, baseScore, difficulty);
    const finalScore = baseScore + bonus;
    const bonusPercentage = bonus > 0 ? Math.round((bonus / baseScore) * 100) : 0;
    const threshold = this.getThresholdForDifficulty(difficulty);
    
    return {
      finalScore,
      bonusApplied: bonus,
      bonusPercentage,
      qualifiedForBonus: bonus > 0,
      threshold
    };
  }

  /**
   * Get bonus preview for a potential solve time
   */
  getBonusPreview(potentialTime: number, baseScore: number, difficulty: number = 5): {
    wouldQualify: boolean;
    potentialBonus: number;
    potentialBonusPercentage: number;
    threshold: number;
    timeRemaining: number;
  } {
    const threshold = this.getThresholdForDifficulty(difficulty);
    const wouldQualify = potentialTime <= threshold;
    const potentialBonus = wouldQualify ? this.calculateBonus(potentialTime, baseScore, difficulty) : 0;
    const potentialBonusPercentage = potentialBonus > 0 ? Math.round((potentialBonus / baseScore) * 100) : 0;
    const timeRemaining = Math.max(0, threshold - potentialTime);
    
    return {
      wouldQualify,
      potentialBonus,
      potentialBonusPercentage,
      threshold,
      timeRemaining
    };
  }

  /**
   * Track and compare personal best times
   */
  compareWithPersonalBest(currentTime: number, personalBest: number | null, difficulty: number = 5): {
    isNewPersonalBest: boolean;
    improvement: number;
    improvementPercentage: number;
    qualifiesForBonus: boolean;
  } {
    const isNewPersonalBest = personalBest === null || currentTime < personalBest;
    const improvement = personalBest !== null ? Math.max(0, personalBest - currentTime) : 0;
    const improvementPercentage = personalBest !== null && personalBest > 0 
      ? Math.round((improvement / personalBest) * 100) 
      : 0;
    const qualifiesForBonus = this.qualifiesForBonus(currentTime, difficulty);
    
    return {
      isNewPersonalBest,
      improvement,
      improvementPercentage,
      qualifiesForBonus
    };
  }

  /**
   * Get bonus breakdown for different solve times
   */
  getBonusBreakdown(baseScore: number, difficulty: number = 5): Array<{
    solveTime: number;
    bonus: number;
    bonusPercentage: number;
    finalScore: number;
  }> {
    const threshold = this.getThresholdForDifficulty(difficulty);
    const breakdown = [];
    
    // Generate breakdown for different solve times
    const testTimes = [
      Math.round(threshold * 0.5), // Very fast
      Math.round(threshold * 0.7), // Fast
      Math.round(threshold * 0.9), // Just under threshold
      threshold, // Exactly at threshold
      Math.round(threshold * 1.1), // Just over threshold
      Math.round(threshold * 1.5)  // Well over threshold
    ];
    
    for (const time of testTimes) {
      const bonus = this.calculateBonus(time, baseScore, difficulty);
      const bonusPercentage = bonus > 0 ? Math.round((bonus / baseScore) * 100) : 0;
      const finalScore = baseScore + bonus;
      
      breakdown.push({
        solveTime: time,
        bonus,
        bonusPercentage,
        finalScore
      });
    }
    
    return breakdown;
  }

  /**
   * Get difficulty-scaled thresholds for all difficulty levels
   */
  getThresholdBreakdown(): Array<{
    difficulty: number;
    threshold: number;
    scalingFactor: number;
  }> {
    const breakdown = [];
    
    for (let difficulty = 1; difficulty <= 10; difficulty++) {
      const threshold = this.getThresholdForDifficulty(difficulty);
      const scalingFactor = this.config.difficultyScaling 
        ? 1 + (difficulty - 5) * 0.1 
        : 1.0;
      
      breakdown.push({
        difficulty,
        threshold,
        scalingFactor
      });
    }
    
    return breakdown;
  }

  /**
   * Get the current configuration
   */
  getConfig(): FastSolveBonusConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance of the fast solve bonus system
 */
export const fastSolveBonusSystem = new FastSolveBonusSystem();
