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
    const safeDifficulty = Number.isFinite(difficulty)
      ? Math.max(1, Math.min(10, Math.round(difficulty)))
      : 5;
    const safeRemainingLetters = Number.isFinite(remainingLetters)
      ? Math.max(0, Math.round(remainingLetters))
      : 10;

    const baseCosts = {
      hammer: 60,
      wand: 170,
      shield: 110,
      rocket: 120 // Reduced from 240 to 2x hammer cost
    };
    
    const baseCost = baseCosts[powerupType];
    const difficultyMultiplier = 1 + (safeDifficulty - 5) * 0.1;
    const scarcityMultiplier = safeRemainingLetters < 5 ? 1.2 : 1.0;
    const rawCost = baseCost * difficultyMultiplier * scarcityMultiplier;

    return this.roundDisplayedCost(rawCost);
  }

  private roundDisplayedCost(cost: number): number {
    return Math.max(10, Math.round(cost / 10) * 10);
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
