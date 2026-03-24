import { redis } from '@devvit/web/server';
import {
  keyLevelPlayers,
  keyLevelQualifiedPlayers,
  keyLevelQualifiedWins,
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
  await redis.zAdd(keyLevelPlayers(levelId), {
    member: userId,
    score: Date.now(),
  });
};

export const recordLevelWin = async (
  levelId: string,
  userId: string
): Promise<void> => {
  await redis.zAdd(keyLevelWinners(levelId), {
    member: userId,
    score: Date.now(),
  });
};

export const getLevelEngagement = async (
  levelId: string
): Promise<LevelEngagement> => {
  const [plays, wins] = await Promise.all([
    redis.zCard(keyLevelPlayers(levelId)),
    redis.zCard(keyLevelWinners(levelId)),
  ]);
  return {
    plays,
    wins,
    winRatePct: computeWinRatePct(plays, wins),
  };
};

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
