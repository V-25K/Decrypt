import type { PowerupType } from '../../shared/game';
import { rebalancedScorePenaltyEngine } from '../../shared/rebalanced-score-penalty-engine';
import { rebalancedFastSolveBonusSystem } from '../../shared/rebalanced-fast-solve-bonus-system';
import { rebalancedPowerupPricingEngine } from '../../shared/rebalanced-powerup-pricing-engine';

export const heartsPerRun = 3;
export const heartRefillIntervalMs = 30 * 60 * 1000;
export const minSolveSeconds = 3;
export const sessionTtlSeconds = 60 * 60;
export const sessionInactivityThresholdMs = 10 * 60 * 1000;
export const dailyDataTtlSeconds = 90 * 24 * 60 * 60;

export const defaultCoinsReward = 35;
export const flawlessBonusCoins = 15;
export const fastSolveSeconds = 60; // Legacy - use rebalancedFastSolveBonusSystem for new logic
export const fastSolveBonusCoins = 10; // Legacy - use rebalancedFastSolveBonusSystem for new logic
export const communityJoinRewardCoins = 100;
export const dailyRetryCostFirst = 80;
export const dailyRetryCostSecond = 140;
export const dailyRetryCostCap = 200;
export const coinHeartRefillCost = 350;
export const coinHeartTopUpCost = 150;
export const maxCoinHeartPurchasesPerDay = 2;

export const powerupCosts: Record<PowerupType, number> = {
  hammer: 60, // Legacy - use rebalancedPowerupPricingEngine for new logic
  shield: 110, // Legacy - use rebalancedPowerupPricingEngine for new logic
  wand: 170, // Legacy - use rebalancedPowerupPricingEngine for new logic
  rocket: 240, // Legacy - use rebalancedPowerupPricingEngine for new logic
};

export const getPowerupCost = (
  powerupType: PowerupType,
  difficulty: number = 5,
  remainingLetters: number = 10
): number => {
  return rebalancedPowerupPricingEngine.calculatePowerupCost(powerupType, difficulty, remainingLetters);
};

export const getPowerupValueAnalysis = (
  powerupType: PowerupType,
  difficulty: number = 5,
  remainingLetters: number = 10
) => {
  return rebalancedPowerupPricingEngine
    .getPricingBreakdown(difficulty, remainingLetters)
    .find((item) => item.powerupType === powerupType) ?? null;
};

export const allPowerups: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];

export const getDailyRetryCost = (retryCount: number): number => {
  if (retryCount <= 0) {
    return dailyRetryCostFirst;
  }
  if (retryCount === 1) {
    return dailyRetryCostSecond;
  }
  return dailyRetryCostCap;
};

export const getDailyRetryScoreFactor = (retryCount: number): number => {
  return rebalancedScorePenaltyEngine.calculatePenaltyFactor(retryCount);
};

export const applyDailyRetryPenalty = (
  score: number,
  retryCount: number
): number => {
  return rebalancedScorePenaltyEngine.applyPenalty(score, retryCount);
};

export const getFastSolveBonus = (
  solveSeconds: number,
  baseScore: number,
  difficulty: number = 5
): number => {
  return rebalancedFastSolveBonusSystem.calculateBonus(solveSeconds, baseScore, difficulty);
};

export const getFastSolveThreshold = (difficulty: number = 5): number => {
  return rebalancedFastSolveBonusSystem.getThresholdForDifficulty(difficulty);
};

export const qualifiesForFastSolveBonus = (
  solveSeconds: number,
  difficulty: number = 5
): boolean => {
  return rebalancedFastSolveBonusSystem.qualifiesForBonus(solveSeconds, difficulty);
};

export const logicalCipherDefaultPercent = 10;

export const defaultSubredditSettings = {
  publishHourUtc: 0,
  timezone: 'UTC',
  logicalCipherPercent: logicalCipherDefaultPercent,
  aiMaxRetries: 3,
  contentSafetyMode: 'strict',
};
