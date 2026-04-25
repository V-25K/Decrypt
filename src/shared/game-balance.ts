import type { PowerupType } from './game';
import { rebalancedPowerupPricingEngine } from './rebalanced-powerup-pricing-engine';
import { rebalancedRetryCostCalculator } from './rebalanced-retry-cost-calculator';
import { rebalancedScorePenaltyEngine } from './rebalanced-score-penalty-engine';

export type PowerupPricingContext = {
  difficulty: number;
  remainingLetters: number;
};

export type DailyRetryQuote = {
  retryScoreFactor: number;
  nextRetryCost: number;
  nextRetryScoreFactor: number;
};

const clampDifficulty = (difficulty: number | null | undefined): number => {
  if (typeof difficulty !== 'number' || !Number.isFinite(difficulty)) {
    return 5;
  }
  return Math.max(1, Math.min(10, Math.round(difficulty)));
};

const clampRemainingLetters = (remainingLetters: number | null | undefined): number => {
  if (typeof remainingLetters !== 'number' || !Number.isFinite(remainingLetters)) {
    return 10;
  }
  return Math.max(0, Math.round(remainingLetters));
};

export const normalizePowerupPricingContext = (
  context: Partial<PowerupPricingContext> | null | undefined
): PowerupPricingContext => ({
  difficulty: clampDifficulty(context?.difficulty),
  remainingLetters: clampRemainingLetters(context?.remainingLetters),
});

export const getPowerupPrice = (
  powerupType: PowerupType,
  context: Partial<PowerupPricingContext> | null | undefined
): number => {
  const normalized = normalizePowerupPricingContext(context);
  return rebalancedPowerupPricingEngine.calculatePowerupCost(
    powerupType,
    normalized.difficulty,
    normalized.remainingLetters
  );
};

export const getDailyRetryQuote = (params: {
  retryCount: number;
  difficulty: number | null | undefined;
}): DailyRetryQuote => {
  const safeRetryCount = Math.max(0, Math.floor(params.retryCount));
  const difficulty = clampDifficulty(params.difficulty);
  return {
    retryScoreFactor: rebalancedScorePenaltyEngine.calculatePenaltyFactor(
      safeRetryCount
    ),
    nextRetryCost: rebalancedRetryCostCalculator.calculateRetryCost(
      safeRetryCount,
      difficulty
    ),
    nextRetryScoreFactor: rebalancedScorePenaltyEngine.calculatePenaltyFactor(
      safeRetryCount + 1
    ),
  };
};
