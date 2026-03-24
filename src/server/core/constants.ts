import type { PowerupType } from '../../shared/game';

export const heartsPerRun = 3;
export const heartRefillIntervalMs = 30 * 60 * 1000;
export const minSolveSeconds = 3;
export const sessionTtlSeconds = 60 * 60;
export const dailyDataTtlSeconds = 90 * 24 * 60 * 60;

export const defaultCoinsReward = 100;
export const flawlessBonusCoins = 50;
export const fastSolveSeconds = 60;
export const fastSolveBonusCoins = 25;

export const powerupCosts: Record<PowerupType, number> = {
  hammer: 60,
  shield: 110,
  wand: 170,
  rocket: 240,
};

export const allPowerups: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];

export const logicalCipherDefaultPercent = 10;

export const defaultSubredditSettings = {
  publishHourUtc: 0,
  timezone: 'UTC',
  logicalCipherPercent: logicalCipherDefaultPercent,
  aiMaxRetries: 3,
  contentSafetyMode: 'strict',
};
