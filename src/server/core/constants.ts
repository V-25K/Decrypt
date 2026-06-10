import { scorePenaltyEngine } from '../../shared/score-penalty-engine';
import { fastSolveBonusSystem } from '../../shared/fast-solve-bonus-system';
import { completionRewards } from '../../shared/economy';

export const heartsPerRun = 3;
export const heartRefillIntervalMs = 30 * 60 * 1000;
export const minSolveSeconds = 3;
export const sessionTtlSeconds = 60 * 60;
export const sessionInactivityThresholdMs = 10 * 60 * 1000;
export const dailyDataTtlSeconds = 90 * 24 * 60 * 60;

// Economy knobs live in src/shared/economy.ts; re-exported here so existing
// call sites keep their import paths.
export const defaultCoinsReward: number = completionRewards.baseCoins;
export const flawlessBonusCoins: number = completionRewards.flawlessBonus;
export {
  communityJoinRewardCoins,
  coinHeartRefillCost,
  coinHeartTopUpCost,
  maxCoinHeartPurchasesPerDay,
} from '../../shared/economy';

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
