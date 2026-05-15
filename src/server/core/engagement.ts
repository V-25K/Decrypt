import { redis } from '@devvit/web/server';
import { sessionTtlSeconds } from './constants';
import {
  keyLevelPlayCount,
  keyLevelPlayers,
  keyLevelQualifiedFailures,
  keyLevelQualifiedOutcomes,
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

export type LevelQualifiedOutcomeSummary = {
  status: 'win' | 'failure';
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
  retryCount: number;
  targetTimeSeconds: number | null;
  recordedAt: number;
};

export type LevelQualifiedTelemetry = {
  plays: number;
  wins: number;
  failures: number;
  abandons: number;
  averageSolveSeconds: number;
  averageMistakes: number;
  averageUsedPowerups: number;
  averageRetryCount: number;
  fastSolveRate: number;
};

const qualifiedAbandonWindowMs = sessionTtlSeconds * 1000;

const computeWinRatePct = (plays: number, wins: number): number => {
  if (plays <= 0) {
    return 0;
  }
  return Math.round((wins / plays) * 100);
};

const normalizeOutcomeSummary = (
  status: LevelQualifiedOutcomeSummary['status'],
  summary?: Partial<Omit<LevelQualifiedOutcomeSummary, 'status' | 'recordedAt'>>
): LevelQualifiedOutcomeSummary => ({
  status,
  solveSeconds: Math.max(0, Math.floor(summary?.solveSeconds ?? 0)),
  mistakes: Math.max(0, Math.floor(summary?.mistakes ?? 0)),
  usedPowerups: Math.max(0, Math.floor(summary?.usedPowerups ?? 0)),
  retryCount: Math.max(0, Math.floor(summary?.retryCount ?? 0)),
  targetTimeSeconds:
    typeof summary?.targetTimeSeconds === 'number' && Number.isFinite(summary.targetTimeSeconds)
      ? Math.max(0, Math.floor(summary.targetTimeSeconds))
      : null,
  recordedAt: Date.now(),
});

const parseOutcomeSummary = (raw: string | undefined): LevelQualifiedOutcomeSummary | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LevelQualifiedOutcomeSummary>;
    if (parsed.status !== 'win' && parsed.status !== 'failure') {
      return null;
    }
    return normalizeOutcomeSummary(parsed.status, parsed);
  } catch {
    return null;
  }
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

export const recordQualifiedLevelPlay = async (
  levelId: string,
  userId: string,
  lastActivityAt = Date.now()
): Promise<void> => {
  await redis.zAdd(keyLevelQualifiedPlayers(levelId), {
    member: userId,
    score: lastActivityAt,
  });
};

export const touchQualifiedLevelPlay = async (
  levelId: string,
  userId: string,
  lastActivityAt = Date.now()
): Promise<void> => {
  await recordQualifiedLevelPlay(levelId, userId, lastActivityAt);
};

export const recordQualifiedLevelWin = async (
  levelId: string,
  userId: string,
  summary?: Partial<Omit<LevelQualifiedOutcomeSummary, 'status' | 'recordedAt'>>
): Promise<void> => {
  await Promise.all([
    redis.zAdd(keyLevelQualifiedWins(levelId), {
      member: userId,
      score: Date.now(),
    }),
    redis.hSet(keyLevelQualifiedOutcomes(levelId), {
      [userId]: JSON.stringify(normalizeOutcomeSummary('win', summary)),
    }),
  ]);
};

export const recordQualifiedLevelFailure = async (
  levelId: string,
  userId: string,
  summary?: Partial<Omit<LevelQualifiedOutcomeSummary, 'status' | 'recordedAt'>>
): Promise<void> => {
  await Promise.all([
    redis.zAdd(keyLevelQualifiedFailures(levelId), {
      member: userId,
      score: Date.now(),
    }),
    redis.hSet(keyLevelQualifiedOutcomes(levelId), {
      [userId]: JSON.stringify(normalizeOutcomeSummary('failure', summary)),
    }),
  ]);
};

export const getQualifiedLevelTelemetry = async (
  levelId: string,
  nowMs = Date.now()
): Promise<LevelQualifiedTelemetry> => {
  const [players, outcomeHash] = await Promise.all([
    redis.zRange(keyLevelQualifiedPlayers(levelId), 0, -1, { by: 'rank' }),
    redis.hGetAll(keyLevelQualifiedOutcomes(levelId)),
  ]);

  let wins = 0;
  let failures = 0;
  let totalSolveSeconds = 0;
  let totalMistakes = 0;
  let totalUsedPowerups = 0;
  let totalRetryCount = 0;
  let fastWins = 0;
  const outcomeByUser = new Map<string, LevelQualifiedOutcomeSummary>();

  for (const [userId, raw] of Object.entries(outcomeHash)) {
    const parsed = parseOutcomeSummary(raw);
    if (!parsed) {
      continue;
    }
    outcomeByUser.set(userId, parsed);
    totalMistakes += parsed.mistakes;
    totalUsedPowerups += parsed.usedPowerups;
    totalRetryCount += parsed.retryCount;
    if (parsed.status === 'win') {
      wins += 1;
      totalSolveSeconds += parsed.solveSeconds;
      if (
        typeof parsed.targetTimeSeconds === 'number' &&
        parsed.targetTimeSeconds > 0 &&
        parsed.solveSeconds <= parsed.targetTimeSeconds
      ) {
        fastWins += 1;
      }
    } else {
      failures += 1;
    }
  }

  let abandons = 0;
  const staleCutoff = nowMs - qualifiedAbandonWindowMs;
  for (const player of players) {
    if (outcomeByUser.has(player.member)) {
      continue;
    }
    if (player.score <= staleCutoff) {
      abandons += 1;
    }
  }

  const resolvedOutcomes = wins + failures;
  return {
    plays: players.length,
    wins,
    failures,
    abandons,
    averageSolveSeconds: wins > 0 ? totalSolveSeconds / wins : 0,
    averageMistakes: resolvedOutcomes > 0 ? totalMistakes / resolvedOutcomes : 0,
    averageUsedPowerups: resolvedOutcomes > 0 ? totalUsedPowerups / resolvedOutcomes : 0,
    averageRetryCount: resolvedOutcomes > 0 ? totalRetryCount / resolvedOutcomes : 0,
    fastSolveRate: wins > 0 ? fastWins / wins : 0,
  };
};
