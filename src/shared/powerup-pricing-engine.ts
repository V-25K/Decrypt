export type PowerupType = 'hammer' | 'wand' | 'shield' | 'rocket';

export interface PowerupPricingConfig {
  baseValues: Record<PowerupType, number>; // Letters revealed per coin
  rocketMultiplier: number; // 2x hammer cost instead of 4x
}

/**
 * PowerupPricingEngine implements the new powerup pricing system
 * with Rocket powerups at 2x Hammer cost (down from 4x).
 * 
 * Features:
 * - Rocket powerups priced at 2x Hammer cost (down from 4x)
 * - All costs based on letters revealed per coin spent
 * - Rocket provides 50% better value than Hammer
 * - Difficulty and remaining letter adjustments
 */
export class PowerupPricingEngine {
  private readonly config: PowerupPricingConfig;

  constructor(config?: Partial<PowerupPricingConfig>) {
    this.config = {
      baseValues: {
        hammer: 1.0, // 1 letter per 60 coins
        wand: 0.35,  // ~3 letters per 170 coins  
        shield: 0.27, // Protection per 110 coins
        rocket: 0.5   // ~2 letters per 120 coins (was 240)
      },
      rocketMultiplier: 2.0,
      ...config
    };
  }

  /**
   * Calculate powerup cost based on difficulty and remaining letters
   */
  calculatePowerupCost(powerupType: PowerupType, difficulty: number = 5, remainingLetters: number = 10): number {
    if (difficulty < 1 || difficulty > 10) {
      throw new Error('Difficulty must be between 1 and 10');
    }
    if (remainingLetters < 0) {
      throw new Error('Remaining letters cannot be negative');
    }

    const baseCosts = {
      hammer: 60,
      wand: 170,
      shield: 110,
      rocket: 120 // Reduced from 240 to 2x hammer cost
    };
    
    const baseCost = baseCosts[powerupType];
    const difficultyMultiplier = 1 + (difficulty - 5) * 0.1;
    const scarcityMultiplier = remainingLetters < 5 ? 1.2 : 1.0;
    const rawCost = baseCost * difficultyMultiplier * scarcityMultiplier;

    return this.roundDisplayedCost(rawCost);
  }

  private roundDisplayedCost(cost: number): number {
    return Math.max(10, Math.round(cost / 10) * 10);
  }

  /**
   * Get value per coin for a powerup type
   */
  getValuePerCoin(powerupType: PowerupType): number {
    return this.config.baseValues[powerupType];
  }

  /**
   * Compare value between two powerup types
   */
  compareValue(powerupA: PowerupType, powerupB: PowerupType): number {
    return this.getValuePerCoin(powerupA) - this.getValuePerCoin(powerupB);
  }

  /**
   * Get the most cost-effective powerup for a scenario
   */
  getMostCostEffective(difficulty: number = 5, remainingLetters: number = 10): {
    powerupType: PowerupType;
    cost: number;
    valuePerCoin: number;
    efficiency: number;
  } {
    const powerups: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];
    let bestPowerup: PowerupType = 'hammer';
    let bestEfficiency = 0;
    
    for (const powerup of powerups) {
      const cost = this.calculatePowerupCost(powerup, difficulty, remainingLetters);
      const valuePerCoin = this.getValuePerCoin(powerup);
      const efficiency = valuePerCoin / (cost / 100); // Normalize to per-100-coins
      
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestPowerup = powerup;
      }
    }
    
    return {
      powerupType: bestPowerup,
      cost: this.calculatePowerupCost(bestPowerup, difficulty, remainingLetters),
      valuePerCoin: this.getValuePerCoin(bestPowerup),
      efficiency: bestEfficiency
    };
  }

  /**
   * Get pricing breakdown for all powerups
   */
  getPricingBreakdown(difficulty: number = 5, remainingLetters: number = 10): Array<{
    powerupType: PowerupType;
    cost: number;
    valuePerCoin: number;
    lettersPerCoin: number;
    efficiency: number;
    recommendationRank: number;
  }> {
    const powerups: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];
    const breakdown = powerups.map(powerup => {
      const cost = this.calculatePowerupCost(powerup, difficulty, remainingLetters);
      const valuePerCoin = this.getValuePerCoin(powerup);
      const lettersPerCoin = valuePerCoin;
      const efficiency = valuePerCoin / (cost / 100);
      
      return {
        powerupType: powerup,
        cost,
        valuePerCoin,
        lettersPerCoin,
        efficiency,
        recommendationRank: 0 // Will be set below
      };
    });
    
    // Sort by efficiency and assign ranks
    breakdown.sort((a, b) => b.efficiency - a.efficiency);
    breakdown.forEach((item, index) => {
      item.recommendationRank = index + 1;
    });
    
    return breakdown;
  }

  /**
   * Validate that Rocket provides 50% better value than Hammer
   */
  validateRocketValue(): {
    isValid: boolean;
    hammerValue: number;
    rocketValue: number;
    actualImprovement: number;
    expectedImprovement: number;
  } {
    const hammerValue = this.getValuePerCoin('hammer');
    const rocketValue = this.getValuePerCoin('rocket');
    const actualImprovement = (rocketValue - hammerValue) / hammerValue;
    const expectedImprovement = 0.5; // 50%
    
    return {
      isValid: actualImprovement >= expectedImprovement,
      hammerValue,
      rocketValue,
      actualImprovement,
      expectedImprovement
    };
  }

  /**
   * Get cost comparison between old and new Rocket pricing
   */
  getRocketPriceComparison(difficulty: number = 5, remainingLetters: number = 10): {
    oldCost: number;
    newCost: number;
    savings: number;
    savingsPercentage: number;
  } {
    const newCost = this.calculatePowerupCost('rocket', difficulty, remainingLetters);
    const oldBaseCost = 240; // Old rocket cost was 4x hammer
    const difficultyMultiplier = 1 + (difficulty - 5) * 0.1;
    const scarcityMultiplier = remainingLetters < 5 ? 1.2 : 1.0;
    const oldCost = this.roundDisplayedCost(oldBaseCost * difficultyMultiplier * scarcityMultiplier);
    
    const savings = oldCost - newCost;
    const savingsPercentage = Math.round((savings / oldCost) * 100);
    
    return {
      oldCost,
      newCost,
      savings,
      savingsPercentage
    };
  }

  /**
   * Get powerup recommendations based on player situation
   */
  getRecommendations(
    playerCoins: number, 
    difficulty: number = 5, 
    remainingLetters: number = 10,
    playerPreference?: PowerupType
  ): Array<{
    powerupType: PowerupType;
    cost: number;
    affordable: boolean;
    efficiency: number;
    recommendation: 'best-value' | 'affordable' | 'preferred' | 'not-recommended';
    reason: string;
  }> {
    const breakdown = this.getPricingBreakdown(difficulty, remainingLetters);
    
    return breakdown.map(item => {
      const affordable = playerCoins >= item.cost;
      let recommendation: 'best-value' | 'affordable' | 'preferred' | 'not-recommended';
      let reason: string;
      
      if (item.powerupType === playerPreference && affordable) {
        recommendation = 'preferred';
        reason = 'Player preference and affordable';
      } else if (item.recommendationRank === 1 && affordable) {
        recommendation = 'best-value';
        reason = 'Best value for coins and affordable';
      } else if (affordable) {
        recommendation = 'affordable';
        reason = 'Within budget';
      } else {
        recommendation = 'not-recommended';
        reason = 'Not affordable';
      }
      
      return {
        powerupType: item.powerupType,
        cost: item.cost,
        affordable,
        efficiency: item.efficiency,
        recommendation,
        reason
      };
    });
  }

  /**
   * Get the current configuration
   */
  getConfig(): PowerupPricingConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance of the powerup pricing engine
 */
export const powerupPricingEngine = new PowerupPricingEngine();
