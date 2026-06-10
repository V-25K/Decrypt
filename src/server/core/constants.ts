import { scorePenaltyEngine } from '../../shared/score-penalty-engine';
import { fastSolveBonusSystem } from '../../shared/fast-solve-bonus-system';

export const heartsPerRun = 3;
export const heartRefillIntervalMs = 30 * 60 * 1000;
export const minSolveSeconds = 3;
export const sessionTtlSeconds = 60 * 60;
export const sessionInactivityThresholdMs = 10 * 60 * 1000;
export const dailyDataTtlSeconds = 90 * 24 * 60 * 60;

export const defaultCoinsReward = 35;
export const flawlessBonusCoins = 15;
export const communityJoinRewardCoins = 100;
export const coinHeartRefillCost = 350;
export const coinHeartTopUpCost = 150;
export const maxCoinHeartPurchasesPerDay = 2;

export const getDailyRetryScoreFactor = (retryCount: number): number => {
  return scorePenaltyEngine.calculatePenaltyFactor(retryCount);
};

export const applyDailyRetryPenalty = (
  score: number,
  retryCount: number
): number => {
  return scorePenaltyEngine.applyPenalty(score, retryCount);
};

export const getFastSolveBonus = (
  solveSeconds: number,
  baseScore: number,
  difficulty: number = 5
): number => {
  return fastSolveBonusSystem.calculateBonus(solveSeconds, baseScore, difficulty);
};

export const qualifiesForFastSolveBonus = (
  solveSeconds: number,
  difficulty: number = 5
): boolean => {
  return fastSolveBonusSystem.qualifiesForBonus(solveSeconds, difficulty);
};

export const logicalCipherDefaultPercent = 10;

export const defaultSubredditSettings = {
  timezone: 'UTC',
  logicalCipherPercent: logicalCipherDefaultPercent,
  aiMaxRetries: 3,
  contentSafetyMode: 'strict',
};
