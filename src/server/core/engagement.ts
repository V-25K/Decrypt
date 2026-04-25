import { redis } from '@devvit/web/server';
import {
  keyLevelPlayCount,
  keyLevelPlayers,
  keyLevelQualifiedPlayers,
  keyLevelQualifiedWins,
  keyLevelWinCount,
  keyLevelWinners,
} from './keys';

export type LevelEngagement = {
  plays: number;
  wins: number;
  winRatePct: number;
};

export type LevelQualifiedTelemetry = {
  plays: number;
  wins: number;
};

const computeWinRatePct = (plays: number, wins: number): number => {
  if (plays <= 0) {
    return 0;
  }
  return Math.round((wins / plays) * 100);
};

export const recordLevelPlay = async (
  levelId: string,
  userId: string
): Promise<void> => {
  await Promise.all([
    redis.zAdd(keyLevelPlayers(levelId), {
      member: userId,
      score: Date.now(),
    }),
    redis.incrBy(keyLevelPlayCount(levelId), 1),
  ]);
};

export const recordLevelWin = async (
  levelId: string,
  userId: string
): Promise<void> => {
  await Promise.all([
    redis.zAdd(keyLevelWinners(levelId), {
      member: userId,
      score: Date.now(),
    }),
    redis.incrBy(keyLevelWinCount(levelId), 1),
  ]);
};

// Raw engagement counts all plays and wins, regardless of reward eligibility.
export const getLevelEngagement = async (
  levelId: string
): Promise<LevelEngagement> => {
  const [rawPlays, rawWins, uniquePlays, uniqueWins] = await Promise.all([
    redis.get(keyLevelPlayCount(levelId)),
    redis.get(keyLevelWinCount(levelId)),
    redis.zCard(keyLevelPlayers(levelId)),
    redis.zCard(keyLevelWinners(levelId)),
  ]);
  const plays =
    rawPlays === null || rawPlays === undefined || rawPlays === ''
      ? uniquePlays
      : Math.max(0, Math.floor(Number(rawPlays) || 0));
  const wins =
    rawWins === null || rawWins === undefined || rawWins === ''
      ? uniqueWins
      : Math.max(0, Math.floor(Number(rawWins) || 0));
  return {
    plays,
    wins,
    winRatePct: computeWinRatePct(plays, wins),
  };
};

// Qualified telemetry is a stricter subset used by difficulty calibration.
// Callers emit qualified events only for runs that should influence tuning.
export const recordQualifiedLevelPlay = async (
  levelId: string,
  userId: string
): Promise<void> => {
  await redis.zAdd(keyLevelQualifiedPlayers(levelId), {
    member: userId,
    score: Date.now(),
  });
};

export const recordQualifiedLevelWin = async (
  levelId: string,
  userId: string
): Promise<void> => {
  await redis.zAdd(keyLevelQualifiedWins(levelId), {
    member: userId,
    score: Date.now(),
  });
};

export const getQualifiedLevelTelemetry = async (
  levelId: string
): Promise<LevelQualifiedTelemetry> => {
  const [plays, wins] = await Promise.all([
    redis.zCard(keyLevelQualifiedPlayers(levelId)),
    redis.zCard(keyLevelQualifiedWins(levelId)),
  ]);
  return {
    plays,
    wins,
  };
};
