import { redis, reddit } from '@devvit/web/server';
import { z } from 'zod';
import {
  keyAllTimeLevelsLeaderboard,
  keyAllTimeLogicLeaderboard,
  keyDailyLeaderboard,
  keyDailyLeaderboardStats,
  keyDailyRankAwarded,
  keyGlobalRatingLeaderboard,
  keyGlobalScoreLeaderboard,
  keyLevelWinners,
  keyUserQuestDaily,
  keyUserCompleted,
  keyUserEndlessLevelScores,
  keyUserGlobalLevelScores,
  keyUserProfile,
  keyUserRatingOutcomes,
  keyUserMeta,
} from './keys';
import type { PuzzlePrivate, UserProfile } from '../../shared/game';
import { calculateRating } from '../../shared/rating';
import { dailyDataTtlSeconds } from './constants';
import { updateQuestProgressOnDailyTopRank } from './quests';
import { getShareCompletionReceipt } from './share-receipts';

const normalizeUserId = (userId: string): `t2_${string}` => {
  if (userId.startsWith('t2_')) {
    return `t2_${userId.slice(3)}`;
  }
  return `t2_${userId}`;
};

type LeaderboardUserMeta = {
  username: string | null;
  snoovatarUrl: string | null;
};

type RatingOutcomeReceipt = {
  ratingDelta: number;
  ratingAfter: number;
  ts: number;
  globalScoreAfter?: number;
  ratingGamesAfter?: number;
  ratingWinsAfter?: number;
  ratingLossesAfter?: number;
  globalWinStreakAfter?: number;
};

const ratingOutcomeReceiptSchema = z.object({
  ratingDelta: z.number(),
  ratingAfter: z.number(),
  ts: z.number(),
  globalScoreAfter: z.number().optional(),
  ratingGamesAfter: z.number().optional(),
  ratingWinsAfter: z.number().optional(),
  ratingLossesAfter: z.number().optional(),
  globalWinStreakAfter: z.number().optional(),
});

const normalizeOptionalNonnegativeInteger = (
  value: number | undefined
): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;

const encodeRatingOutcomeReceipt = (
  receipt: RatingOutcomeReceipt
): string => JSON.stringify(receipt);

const parseRatingOutcomeReceipt = (
  raw: string | null | undefined
): RatingOutcomeReceipt | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = ratingOutcomeReceiptSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return {
        ratingDelta: Math.trunc(parsed.data.ratingDelta),
        ratingAfter: Math.max(0, Math.trunc(parsed.data.ratingAfter)),
        ts: Math.max(0, Math.trunc(parsed.data.ts)),
        globalScoreAfter: normalizeOptionalNonnegativeInteger(
          parsed.data.globalScoreAfter
        ),
        ratingGamesAfter: normalizeOptionalNonnegativeInteger(
          parsed.data.ratingGamesAfter
        ),
        ratingWinsAfter: normalizeOptionalNonnegativeInteger(
          parsed.data.ratingWinsAfter
        ),
        ratingLossesAfter: normalizeOptionalNonnegativeInteger(
          parsed.data.ratingLossesAfter
        ),
        globalWinStreakAfter: normalizeOptionalNonnegativeInteger(
          parsed.data.globalWinStreakAfter
        ),
      };
    }
  } catch (_error) {
    return null;
  }
  return null;
};

export const getRatingOutcomeReceipt = async (
  userId: string,
  outcomeKey: string
): Promise<RatingOutcomeReceipt | null> =>
  parseRatingOutcomeReceipt(
    await redis.hGet(keyUserRatingOutcomes(userId), outcomeKey)
  );

const publicLeaderboardCacheTtlSeconds = 12;

const withSharedCache = async <T>(
  _key: string,
  _ttl: number,
  read: () => Promise<T>
): Promise<T> => await read();

// Usernames and snoovatars change rarely, so a multi-hour TTL collapses the
// per-row Reddit API cost of leaderboard reads to ~zero on a warm cache while
// staying fresh enough for display.
const userMetaCacheTtlSeconds = 6 * 60 * 60;

const readUserMetaCache = async (
  userId: string
): Promise<LeaderboardUserMeta | null> => {
  try {
    const raw = await redis.get(keyUserMeta(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LeaderboardUserMeta>;
    if (typeof parsed.username === 'string') {
      return {
        username: parsed.username,
        snoovatarUrl:
          typeof parsed.snoovatarUrl === 'string' ? parsed.snoovatarUrl : null,
      };
    }
  } catch (_error) {
    // Treat any cache read/parse failure as a miss and resolve live.
  }
  return null;
};

const resolveLeaderboardUserMeta = async (
  userId: string
): Promise<LeaderboardUserMeta> => {
  const cached = await readUserMetaCache(userId);
  if (cached) {
    return cached;
  }
  try {
    const user = await reddit.getUserById(normalizeUserId(userId));
    if (!user) {
      return {
        username: null,
        snoovatarUrl: null,
      };
    }
    const snoovatarUrl = await reddit.getSnoovatarUrl(user.username);
    const meta: LeaderboardUserMeta = {
      username: user.username,
      snoovatarUrl: snoovatarUrl ?? null,
    };
    // Only cache successful resolves so a transient Reddit failure isn't pinned
    // for the full TTL. Cache writes are best-effort.
    try {
      await redis.set(keyUserMeta(userId), JSON.stringify(meta), {
        expiration: new Date(Date.now() + userMetaCacheTtlSeconds * 1000),
      });
    } catch (_error) {
      // Ignore cache write failures.
    }
    return meta;
  } catch (_error) {
    return {
      username: null,
      snoovatarUrl: null,
    };
  }
};

export const computeScore = (params: {
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
}): number => {
  const safeSolveSeconds = Number.isFinite(params.solveSeconds)
    ? Math.max(0, Math.floor(params.solveSeconds))
    : 0;
  const safeMistakes = Number.isFinite(params.mistakes)
    ? Math.max(0, Math.floor(params.mistakes))
    : 0;
  const safePowerups = Number.isFinite(params.usedPowerups)
    ? Math.max(0, Math.floor(params.usedPowerups))
    : 0;
  const speedPoints = Math.round(1200 / (1 + safeSolveSeconds / 120));
  const mistakeFactor = Math.pow(0.9, safeMistakes);
  const powerupFactor = Math.pow(0.95, safePowerups);
  const score = Math.round((100 + speedPoints) * mistakeFactor * powerupFactor);
  return Math.max(25, score);
};

const scoreFromReceipt = (receipt: {
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
  score?: number | null;
}): number =>
  typeof receipt.score === 'number' && Number.isFinite(receipt.score)
    ? Math.max(0, Math.round(receipt.score))
    : computeScore({
        solveSeconds: receipt.solveSeconds,
        mistakes: receipt.mistakes,
        usedPowerups: receipt.usedPowerups,
      });

const dailyStatsField = (
  userId: string,
  field: 'solveSeconds' | 'mistakes' | 'usedPowerups' | 'runs'
): string => `${userId}:${field}`;

const readEndlessClears = async (userId: string): Promise<number> => {
  const raw = await redis.hGet(keyUserProfile(userId), 'endlessModeClears');
  if (raw === null || raw === undefined || raw === '') {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

const readProfileNumber = async (
  userId: string,
  field: string,
  fallback: number
): Promise<number> => {
  const raw = await redis.hGet(keyUserProfile(userId), field);
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const dailyRepairScanLimit = 60;
const dailyRepairMaxRuns = 6;

const expireDailyLeaderboardKeys = async (
  dateKey: string,
  statsKey: string
): Promise<void> => {
  await Promise.all([
    redis.expire(keyDailyLeaderboard(dateKey), dailyDataTtlSeconds),
    redis.expire(statsKey, dailyDataTtlSeconds),
  ]);
};

const clearDailyLeaderboardEntry = async (
  dateKey: string,
  userId: string
): Promise<void> => {
  const statsKey = keyDailyLeaderboardStats(dateKey);
  await Promise.all([
    redis.zRem(keyDailyLeaderboard(dateKey), [userId]),
    redis.hDel(statsKey, [
      userId,
      dailyStatsField(userId, 'solveSeconds'),
      dailyStatsField(userId, 'mistakes'),
      dailyStatsField(userId, 'usedPowerups'),
      dailyStatsField(userId, 'runs'),
    ]),
  ]);
  await expireDailyLeaderboardKeys(dateKey, statsKey);
};

const recomputeDailyStatsFromReceipts = async (params: {
  userId: string;
  dateKey: string;
  targetRuns?: number | null;
}): Promise<{
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
  runs: number;
  score: number;
} | null> => {
  const completed = await redis.hGetAll(keyUserCompleted(params.userId));
  const entries = Object.entries(completed)
    .map(([levelId, timestamp]) => ({
      levelId,
      timestamp: Number(timestamp) || 0,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, dailyRepairScanLimit);
  let totals = {
    solveSeconds: 0,
    mistakes: 0,
    usedPowerups: 0,
    runs: 0,
    score: 0,
  };
  const maxRuns =
    typeof params.targetRuns === 'number' && params.targetRuns > 0
      ? Math.min(params.targetRuns, dailyRepairMaxRuns)
      : dailyRepairMaxRuns;
  for (const entry of entries) {
    if (totals.runs >= maxRuns) {
      break;
    }
    const receipt = await getShareCompletionReceipt(
      params.userId,
      entry.levelId
    );
    if (!receipt || receipt.dateKey !== params.dateKey) {
      continue;
    }
    totals = {
      solveSeconds: totals.solveSeconds + receipt.solveSeconds,
      mistakes: totals.mistakes + receipt.mistakes,
      usedPowerups: totals.usedPowerups + receipt.usedPowerups,
      runs: totals.runs + 1,
      score: totals.score + scoreFromReceipt(receipt),
    };
  }
  if (totals.runs === 0) {
    await clearDailyLeaderboardEntry(params.dateKey, params.userId);
    return null;
  }
  const statsKey = keyDailyLeaderboardStats(params.dateKey);
  await Promise.all([
    redis.zAdd(keyDailyLeaderboard(params.dateKey), {
      member: params.userId,
      score: totals.score,
    }),
    redis.hSet(statsKey, {
      [dailyStatsField(params.userId, 'solveSeconds')]: String(
        totals.solveSeconds
      ),
      [dailyStatsField(params.userId, 'mistakes')]: String(totals.mistakes),
      [dailyStatsField(params.userId, 'usedPowerups')]: String(
        totals.usedPowerups
      ),
      [dailyStatsField(params.userId, 'runs')]: String(totals.runs),
    }),
  ]);
  await expireDailyLeaderboardKeys(params.dateKey, statsKey);
  return totals;
};

const readDailyPlayCount = async (
  userId: string,
  dateKey: string
): Promise<number | null> => {
  const raw = await redis.hGet(
    keyUserQuestDaily(userId, dateKey),
    'dailyPlayCount'
  );
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
};

const numberFromHashField = (
  raw: string | null | undefined
): number | null => {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const normalizeDailyRuns = (
  runs: number | null,
  hasLegacyStats: boolean
): number | null => {
  if (typeof runs !== 'number' || !Number.isFinite(runs)) {
    return hasLegacyStats ? 1 : null;
  }
  const normalized = Math.floor(runs);
  if (normalized > 0) {
    return normalized;
  }
  return hasLegacyStats ? 1 : null;
};

const averageDailyStat = (
  total: number | null,
  runs: number | null
): number | null => {
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    return null;
  }
  if (typeof runs !== 'number' || !Number.isFinite(runs) || runs <= 0) {
    return Math.round(total);
  }
  return Math.round(total / runs);
};

export const recordDailyScore = async (params: {
  dateKey: string;
  userId: string;
  score: number;
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
}): Promise<void> => {
  const roundScore = Number.isFinite(params.score)
    ? Math.max(0, Math.round(params.score))
    : 0;
  const statsKey = keyDailyLeaderboardStats(params.dateKey);
  const runsField = dailyStatsField(params.userId, 'runs');
  const existingRuns = await redis.hGet(statsKey, runsField);
  if (!existingRuns) {
    const rawStats = await redis.hGet(statsKey, params.userId);
    if (rawStats) {
      try {
        const parsed = JSON.parse(rawStats) as
          | {
              solveSeconds?: unknown;
              mistakes?: unknown;
              usedPowerups?: unknown;
              runs?: unknown;
            }
          | number;
        const legacyParsed =
          typeof parsed === 'number'
            ? { solveSeconds: parsed }
            : parsed;
        const hasLegacyValues =
          typeof legacyParsed.solveSeconds === 'number' ||
          typeof legacyParsed.mistakes === 'number' ||
          typeof legacyParsed.usedPowerups === 'number';
        const seedSolveSeconds =
          typeof legacyParsed.solveSeconds === 'number'
            ? legacyParsed.solveSeconds
            : 0;
        const seedMistakes =
          typeof legacyParsed.mistakes === 'number' ? legacyParsed.mistakes : 0;
        const seedUsedPowerups =
          typeof legacyParsed.usedPowerups === 'number'
            ? legacyParsed.usedPowerups
            : 0;
        const seedRuns =
          typeof legacyParsed.runs === 'number'
            ? legacyParsed.runs
            : hasLegacyValues
              ? 1
              : 0;
        await redis.hSet(statsKey, {
          [dailyStatsField(params.userId, 'solveSeconds')]:
            String(seedSolveSeconds),
          [dailyStatsField(params.userId, 'mistakes')]: String(seedMistakes),
          [dailyStatsField(params.userId, 'usedPowerups')]:
            String(seedUsedPowerups),
          [dailyStatsField(params.userId, 'runs')]: String(seedRuns),
        });
      } catch (_error) {
        // Ignore malformed legacy stats entries.
      }
    }
  }
  await Promise.all([
    redis.zIncrBy(keyDailyLeaderboard(params.dateKey), params.userId, roundScore),
    redis.hIncrBy(
      statsKey,
      dailyStatsField(params.userId, 'solveSeconds'),
      params.solveSeconds
    ),
    redis.hIncrBy(
      statsKey,
      dailyStatsField(params.userId, 'mistakes'),
      params.mistakes
    ),
    redis.hIncrBy(
      statsKey,
      dailyStatsField(params.userId, 'usedPowerups'),
      params.usedPowerups
    ),
    redis.hIncrBy(statsKey, runsField, 1),
  ]);
  await expireDailyLeaderboardKeys(params.dateKey, statsKey);
};

export const recordAllTimeLevelScore = async (params: {
  userId: string;
  levelId: string;
  solveScore: number;
}): Promise<void> => {
  const levelScore = Number.isFinite(params.solveScore)
    ? Math.max(0, Math.round(params.solveScore))
    : 0;
  const scoreKey = keyUserEndlessLevelScores(params.userId);
  const initFlag = await redis.hGet(scoreKey, '__initialized');
  if (!initFlag) {
    await Promise.all([
      redis.hSet(scoreKey, { __initialized: '1' }),
      redis.zAdd(keyAllTimeLevelsLeaderboard, {
        member: params.userId,
        score: 0,
      }),
    ]);
  }
  const existingRaw = await redis.hGet(scoreKey, params.levelId);
  const existingScore =
    existingRaw !== null && existingRaw !== undefined && existingRaw !== ''
      ? Number(existingRaw)
      : null;
  if (existingScore !== null && Number.isFinite(existingScore)) {
    if (existingScore >= levelScore) {
      return;
    }
  }
  const safeExisting =
    existingScore !== null && Number.isFinite(existingScore) ? existingScore : 0;
  const delta = levelScore - safeExisting;
  await Promise.all([
    redis.hSet(scoreKey, {
      [params.levelId]: String(levelScore),
    }),
    redis.zIncrBy(keyAllTimeLevelsLeaderboard, params.userId, delta),
  ]);
};

/**
 * Global rating-leaderboard ties break by total points. A Redis sorted set
 * orders by a single numeric score (and falls back to member id on ties), so
 * we pack both signals into one score: the rating as the integer part and a
 * saturating fraction of total points (always < 1) as the tiebreaker. Thus
 * `floor(score)` is always the exact rating, and among players on the same
 * rating the one with more total points sorts higher. Points past the cap
 * saturate the fraction (rare); entries written before this packing existed
 * have a fraction of 0, so they simply sit at the bottom of their rating band
 * until that player next plays.
 */
const globalTiebreakCap = 10_000_000;
export const combinedGlobalRatingScore = (
  rating: number,
  globalScore: number
): number => {
  const safeRating = Math.max(0, Math.trunc(rating));
  const safePoints = Math.min(
    Math.max(0, Math.trunc(globalScore)),
    globalTiebreakCap
  );
  return safeRating + safePoints / (globalTiebreakCap + 1);
};

export const recordGlobalWin = async (params: {
  userId: string;
  levelId: string;
  solveScore: number;
  profile: UserProfile;
  puzzle: PuzzlePrivate;
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
  isRecoveryRun: boolean;
  /**
   * When false, the win still updates rating but awards zero global points
   * (the challenge is below the leaderboard points cutoff). Defaults to true.
   * See points-eligibility.ts (Bug 4: leaderboard fairness).
   */
  awardPoints?: boolean;
}): Promise<{
  profile: UserProfile;
  ratingDelta: number;
  ratingAfter: number;
  globalScoreDelta: number;
}> => {
  const awardPoints = params.awardPoints !== false;
  const levelScore = Number.isFinite(params.solveScore)
    ? Math.max(0, Math.round(params.solveScore))
    : 0;
  const scoreKey = keyUserGlobalLevelScores(params.userId);
  const existingRaw = await redis.hGet(scoreKey, params.levelId);
  const existingScore =
    existingRaw !== null && existingRaw !== undefined && existingRaw !== ''
      ? Number(existingRaw)
      : null;
  const safeExisting =
    existingScore !== null && Number.isFinite(existingScore)
      ? Math.max(0, Math.round(existingScore))
      : 0;
  const globalScoreDelta = awardPoints ? Math.max(0, levelScore - safeExisting) : 0;
  if (globalScoreDelta > 0) {
    await Promise.all([
      redis.hSet(scoreKey, {
        [params.levelId]: String(levelScore),
      }),
      redis.zIncrBy(keyGlobalScoreLeaderboard, params.userId, globalScoreDelta),
    ]);
  }

  const result = calculateRating({
    playerRating: params.profile.globalRating,
    ratingGames: params.profile.ratingGames,
    outcome: 'win',
    difficulty: params.puzzle.difficulty,
    cryptoHardness: params.puzzle.cryptoHardness ?? null,
    isLogical: params.puzzle.isLogical,
    solveSeconds: params.solveSeconds,
    targetTimeSeconds: params.puzzle.targetTimeSeconds ?? null,
    mistakes: params.mistakes,
    usedPowerups: params.usedPowerups,
    currentWinStreak: params.profile.globalWinStreak,
    isRecoveryRun: params.isRecoveryRun,
  });
  const ratedProfile: UserProfile = {
    ...params.profile,
    globalRating: result.nextRating,
    globalScore: params.profile.globalScore + globalScoreDelta,
    ratingGames: params.profile.ratingGames + 1,
    ratingWins: params.profile.ratingWins + 1,
    globalWinStreak: params.profile.globalWinStreak + 1,
  };
  const outcomeInserted = await redis.hSetNX(
    keyUserRatingOutcomes(params.userId),
    `win:${params.levelId}`,
    encodeRatingOutcomeReceipt({
      ratingDelta: result.ratingDelta,
      ratingAfter: ratedProfile.globalRating,
      ts: Date.now(),
      globalScoreAfter: ratedProfile.globalScore,
      ratingGamesAfter: ratedProfile.ratingGames,
      ratingWinsAfter: ratedProfile.ratingWins,
      ratingLossesAfter: ratedProfile.ratingLosses,
      globalWinStreakAfter: ratedProfile.globalWinStreak,
    })
  );
  if (outcomeInserted !== 1) {
    const existingReceipt = await getRatingOutcomeReceipt(
      params.userId,
      `win:${params.levelId}`
    );
    const existingRatingGamesAfter = existingReceipt?.ratingGamesAfter;
    const existingGlobalScoreAfter = existingReceipt?.globalScoreAfter;
    const shouldHydrateRating =
      existingReceipt !== null &&
      typeof existingRatingGamesAfter === 'number' &&
      params.profile.ratingGames < existingRatingGamesAfter;
    const shouldHydrateScore =
      existingReceipt !== null &&
      typeof existingGlobalScoreAfter === 'number' &&
      params.profile.globalScore < existingGlobalScoreAfter;
    const nextProfile: UserProfile = {
      ...params.profile,
      globalRating: shouldHydrateRating
        ? existingReceipt.ratingAfter
        : params.profile.globalRating,
      globalScore: shouldHydrateScore
        ? existingGlobalScoreAfter
        : params.profile.globalScore + globalScoreDelta,
      ratingGames: shouldHydrateRating
        ? existingRatingGamesAfter
        : params.profile.ratingGames,
      ratingWins:
        shouldHydrateRating && typeof existingReceipt.ratingWinsAfter === 'number'
        ? existingReceipt.ratingWinsAfter
        : params.profile.ratingWins,
      ratingLosses:
        shouldHydrateRating && typeof existingReceipt.ratingLossesAfter === 'number'
        ? existingReceipt.ratingLossesAfter
        : params.profile.ratingLosses,
      globalWinStreak:
        shouldHydrateRating &&
        typeof existingReceipt.globalWinStreakAfter === 'number'
        ? existingReceipt.globalWinStreakAfter
        : params.profile.globalWinStreak,
    };
    await redis.zAdd(keyGlobalRatingLeaderboard, {
      member: params.userId,
      score: combinedGlobalRatingScore(
        nextProfile.globalRating,
        nextProfile.globalScore
      ),
    });
    return {
      profile: nextProfile,
      ratingDelta: shouldHydrateRating ? existingReceipt.ratingDelta : 0,
      ratingAfter: nextProfile.globalRating,
      globalScoreDelta,
    };
  }

  await redis.zAdd(keyGlobalRatingLeaderboard, {
    member: params.userId,
    score: combinedGlobalRatingScore(
      ratedProfile.globalRating,
      ratedProfile.globalScore
    ),
  });
  return {
    profile: ratedProfile,
    ratingDelta: result.ratingDelta,
    ratingAfter: ratedProfile.globalRating,
    globalScoreDelta,
  };
};

export const recordGlobalLoss = async (params: {
  userId: string;
  levelId: string;
  profile: UserProfile;
  puzzle: PuzzlePrivate;
}): Promise<{ profile: UserProfile; ratingDelta: number; ratingAfter: number }> => {
  const result = calculateRating({
    playerRating: params.profile.globalRating,
    ratingGames: params.profile.ratingGames,
    outcome: 'loss',
    difficulty: params.puzzle.difficulty,
    cryptoHardness: params.puzzle.cryptoHardness ?? null,
    isLogical: params.puzzle.isLogical,
  });
  const nextRating = result.nextRating;
  const outcomeKey = `loss:${params.levelId}`;
  const outcomeInserted = await redis.hSetNX(
    keyUserRatingOutcomes(params.userId),
    outcomeKey,
    encodeRatingOutcomeReceipt({
      ratingDelta: result.ratingDelta,
      ratingAfter: nextRating,
      ts: Date.now(),
    })
  );
  if (outcomeInserted !== 1) {
    const existingReceipt = await getRatingOutcomeReceipt(
      params.userId,
      outcomeKey
    );
    return {
      profile: {
        ...params.profile,
        globalWinStreak: 0,
      },
      ratingDelta: existingReceipt?.ratingDelta ?? 0,
      ratingAfter: existingReceipt?.ratingAfter ?? params.profile.globalRating,
    };
  }
  const nextProfile: UserProfile = {
    ...params.profile,
    globalRating: nextRating,
    ratingGames: params.profile.ratingGames + 1,
    ratingLosses: params.profile.ratingLosses + 1,
    globalWinStreak: 0,
  };
  await redis.zAdd(keyGlobalRatingLeaderboard, {
    member: params.userId,
    score: combinedGlobalRatingScore(
      nextProfile.globalRating,
      nextProfile.globalScore
    ),
  });
  return {
    profile: nextProfile,
    ratingDelta: result.ratingDelta,
    ratingAfter: nextProfile.globalRating,
  };
};

export const incrementAllTimeLogic = async (
  userId: string,
  amount: number
): Promise<void> => {
  await redis.zIncrBy(keyAllTimeLogicLeaderboard, userId, amount);
};

type DailyLeaderboardEntry = {
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
  solveSeconds: number | null;
  mistakes: number | null;
  usedPowerups: number | null;
};

const resolveDailyEntry = async (
  entry: { member: string; score: number },
  dateKey: string,
  dailyStats: Record<string, string>
): Promise<DailyLeaderboardEntry | null> => {
  const rawStats = dailyStats[entry.member];
  let solveSeconds: number | null = null;
  let mistakes: number | null = null;
  let usedPowerups: number | null = null;
  let runs: number | null = null;
  const solveField = dailyStats[dailyStatsField(entry.member, 'solveSeconds')];
  const mistakesField = dailyStats[dailyStatsField(entry.member, 'mistakes')];
  const powerupsField = dailyStats[dailyStatsField(entry.member, 'usedPowerups')];
  const runsField = dailyStats[dailyStatsField(entry.member, 'runs')];
  const parsedSolveField = numberFromHashField(solveField);
  const parsedMistakesField = numberFromHashField(mistakesField);
  const parsedPowerupsField = numberFromHashField(powerupsField);
  const parsedRunsField = numberFromHashField(runsField);
  if (parsedSolveField !== null) {
    solveSeconds = parsedSolveField;
  }
  if (parsedMistakesField !== null) {
    mistakes = parsedMistakesField;
  }
  if (parsedPowerupsField !== null) {
    usedPowerups = parsedPowerupsField;
  }
  if (parsedRunsField !== null) {
    runs = parsedRunsField;
  }
  if (rawStats) {
    try {
      const parsed = JSON.parse(rawStats) as
        | {
            solveSeconds?: unknown;
            mistakes?: unknown;
            usedPowerups?: unknown;
            runs?: unknown;
          }
        | number;
      const legacyParsed =
        typeof parsed === 'number' ? { solveSeconds: parsed } : parsed;
      if (solveSeconds === null) {
        solveSeconds =
          typeof legacyParsed.solveSeconds === 'number'
            ? legacyParsed.solveSeconds
            : null;
      }
      if (mistakes === null) {
        mistakes =
          typeof legacyParsed.mistakes === 'number'
            ? legacyParsed.mistakes
            : null;
      }
      if (usedPowerups === null) {
        usedPowerups =
          typeof legacyParsed.usedPowerups === 'number'
            ? legacyParsed.usedPowerups
            : null;
      }
      if (runs === null) {
        runs = typeof legacyParsed.runs === 'number' ? legacyParsed.runs : null;
      }
    } catch (_error) {
      // Ignore malformed legacy stats entries.
    }
  }
  const hasLegacyStats =
    typeof solveSeconds === 'number' ||
    typeof mistakes === 'number' ||
    typeof usedPowerups === 'number';
  let normalizedRuns = normalizeDailyRuns(runs, hasLegacyStats);
  const needsRepair =
    normalizedRuns === null ||
    solveSeconds === null ||
    mistakes === null ||
    usedPowerups === null;
  let repaired:
    | {
        solveSeconds: number;
        mistakes: number;
        usedPowerups: number;
        runs: number;
        score: number;
      }
    | null = null;
  if (needsRepair) {
    const dailyPlayCount = await readDailyPlayCount(entry.member, dateKey);
    repaired = await recomputeDailyStatsFromReceipts({
      userId: entry.member,
      dateKey,
      targetRuns: dailyPlayCount,
    });
    if (repaired) {
      solveSeconds = repaired.solveSeconds;
      mistakes = repaired.mistakes;
      usedPowerups = repaired.usedPowerups;
      runs = repaired.runs;
      normalizedRuns = repaired.runs;
    }
  }
  if (normalizedRuns === null) {
    return null;
  }
  const averageSolveSeconds = averageDailyStat(solveSeconds, normalizedRuns);
  const averageMistakes = averageDailyStat(mistakes, normalizedRuns);
  const averagePowerups = averageDailyStat(usedPowerups, normalizedRuns);
  const userMeta = await resolveLeaderboardUserMeta(entry.member);
  return {
    userId: entry.member,
    username: userMeta.username,
    score: repaired?.score ?? entry.score,
    snoovatarUrl: userMeta.snoovatarUrl,
    solveSeconds: averageSolveSeconds,
    mistakes: averageMistakes,
    usedPowerups: averagePowerups,
  };
};

export const getDailyTop = async (
  dateKey: string,
  limit: number
): Promise<DailyLeaderboardEntry[]> =>
  await withSharedCache(
    `leaderboard:daily:${dateKey}:limit:${limit}`,
    publicLeaderboardCacheTtlSeconds,
    async () => {
      const statsKey = keyDailyLeaderboardStats(dateKey);
      const fetchLimit = Math.max(limit * 3, limit);
      const [entries, dailyStats] = await Promise.all([
        redis.zRange(keyDailyLeaderboard(dateKey), 0, fetchLimit - 1, {
          by: 'rank',
          reverse: true,
        }),
        redis.hGetAll(statsKey),
      ]);
      const resolved = await Promise.all(
        entries.map((entry) => resolveDailyEntry(entry, dateKey, dailyStats))
      );
      return resolved
        .filter((entry): entry is DailyLeaderboardEntry => entry !== null)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    }
  );

/**
 * Window read for paginated daily leaderboard. The daily zset is score-ordered
 * (recordDailyScore uses zIncrBy by score), so a reverse rank window is already
 * in display order; null-filtered repair entries can make a page shorter than
 * pageSize, same as the other windowed boards. See getAllTimeLevelsWindow.
 */
export const getDailyWindow = async (
  dateKey: string,
  offset: number,
  limit: number
): Promise<DailyLeaderboardEntry[]> => {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }
  const statsKey = keyDailyLeaderboardStats(dateKey);
  const [entries, dailyStats] = await Promise.all([
    redis.zRange(
      keyDailyLeaderboard(dateKey),
      safeOffset,
      safeOffset + safeLimit - 1,
      { by: 'rank', reverse: true }
    ),
    redis.hGetAll(statsKey),
  ]);
  const resolved = await Promise.all(
    entries.map((entry) => resolveDailyEntry(entry, dateKey, dailyStats))
  );
  return resolved
    .filter((entry): entry is DailyLeaderboardEntry => entry !== null)
    .sort((left, right) => right.score - left.score);
};

export const getLevelTop = async (
  levelId: string,
  limit: number
): Promise<{
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
  solveSeconds: number | null;
  mistakes: number | null;
  usedPowerups: number | null;
}[]> =>
  await withSharedCache(
    `leaderboard:level:${levelId}:limit:${limit}`,
    publicLeaderboardCacheTtlSeconds,
    async () => {
      // The winners zset is scored by completion timestamp, not by challenge
      // score, so we cannot read the score-ranked top-N off a single window.
      // The old code fetched only the first window and stopped once it had
      // `limit` rows — which silently dropped the true top scorers (and the
      // player who *just* finished, since they're the newest entry) on any
      // level with more than a window's worth of winners. Instead, scan the
      // whole winners set (cheap Redis receipt reads, deduped, with a safety
      // cap), rank globally by score, then resolve the expensive per-user
      // Reddit metadata only for the final top-N. This keeps the result-page
      // crowd an accurate, always-current top-N of the challenge.
      const winnerScanWindow = 200;
      const maxWinnerScan = 2000;
      const seen = new Set<string>();
      const scored: Array<{
        userId: string;
        score: number;
        solveSeconds: number;
        mistakes: number;
        usedPowerups: number;
        completedAtTs: number;
      }> = [];
      let start = 0;

      while (start < maxWinnerScan) {
        const winners = await redis.zRange(
          keyLevelWinners(levelId),
          start,
          start + winnerScanWindow - 1,
          {
            by: 'rank',
          }
        );
        if (winners.length === 0) {
          break;
        }

        const batch = await Promise.all(
          winners.map(async (entry) => {
            if (seen.has(entry.member)) {
              return null;
            }
            const receipt = await getShareCompletionReceipt(entry.member, levelId);
            if (!receipt) {
              return null;
            }
            return {
              userId: entry.member,
              score: scoreFromReceipt(receipt),
              solveSeconds: receipt.solveSeconds,
              mistakes: receipt.mistakes,
              usedPowerups: receipt.usedPowerups,
              completedAtTs: receipt.completedAtTs,
            };
          })
        );

        for (const entry of batch) {
          if (entry && !seen.has(entry.userId)) {
            seen.add(entry.userId);
            scored.push(entry);
          }
        }

        if (winners.length < winnerScanWindow) {
          break;
        }
        start += winnerScanWindow;
      }

      const ranked = scored
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          if (left.solveSeconds !== right.solveSeconds) {
            return left.solveSeconds - right.solveSeconds;
          }
          if (left.mistakes !== right.mistakes) {
            return left.mistakes - right.mistakes;
          }
          if (left.usedPowerups !== right.usedPowerups) {
            return left.usedPowerups - right.usedPowerups;
          }
          return left.completedAtTs - right.completedAtTs;
        })
        .slice(0, limit);

      return await Promise.all(
        ranked.map(async (entry) => {
          const userMeta = await resolveLeaderboardUserMeta(entry.userId);
          return {
            userId: entry.userId,
            username: userMeta.username,
            score: entry.score,
            snoovatarUrl: userMeta.snoovatarUrl,
            solveSeconds: entry.solveSeconds,
            mistakes: entry.mistakes,
            usedPowerups: entry.usedPowerups,
          };
        })
      );
    }
  );

type AllTimeLevelEntry = {
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
  levelsCompleted: number;
};

const resolveAllTimeLevelEntry = async (entry: {
  member: string;
  score: number;
}): Promise<AllTimeLevelEntry | null> => {
  const levelsCompleted = await readEndlessClears(entry.member);
  if (levelsCompleted <= 0) {
    return null;
  }
  const userMeta = await resolveLeaderboardUserMeta(entry.member);
  return {
    userId: entry.member,
    username: userMeta.username,
    score: entry.score,
    snoovatarUrl: userMeta.snoovatarUrl,
    levelsCompleted,
  };
};

export const getAllTimeTopLevels = async (
  limit: number
): Promise<AllTimeLevelEntry[]> =>
  await withSharedCache(
    `leaderboard:all-time-levels:limit:${limit}`,
    publicLeaderboardCacheTtlSeconds,
    async () => {
      const fetchLimit = Math.max(limit * 4, limit);
      const entries = await redis.zRange(
        keyAllTimeLevelsLeaderboard,
        0,
        fetchLimit - 1,
        {
          by: 'rank',
          reverse: true,
        }
      );
      const resolved = await Promise.all(entries.map(resolveAllTimeLevelEntry));
      const filtered = resolved.filter(
        (entry): entry is AllTimeLevelEntry => entry !== null
      );
      return filtered.slice(0, limit);
    }
  );

/**
 * Window read for paginated all-time-levels: resolves only the requested
 * rank window [offset, offset+limit) instead of fetching from the top and
 * slicing, so deep pages stay O(pageSize) rather than O(offset).
 */
export const getAllTimeLevelsWindow = async (
  offset: number,
  limit: number
): Promise<AllTimeLevelEntry[]> => {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }
  const entries = await redis.zRange(
    keyAllTimeLevelsLeaderboard,
    safeOffset,
    safeOffset + safeLimit - 1,
    { by: 'rank', reverse: true }
  );
  const resolved = await Promise.all(entries.map(resolveAllTimeLevelEntry));
  return resolved.filter((entry): entry is AllTimeLevelEntry => entry !== null);
};

type AllTimeLogicEntry = {
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
};

const resolveAllTimeLogicEntry = async (entry: {
  member: string;
  score: number;
}): Promise<AllTimeLogicEntry> => {
  const userMeta = await resolveLeaderboardUserMeta(entry.member);
  return {
    userId: entry.member,
    username: userMeta.username,
    score: entry.score,
    snoovatarUrl: userMeta.snoovatarUrl,
  };
};

export const getAllTimeTopLogic = async (
  limit: number
): Promise<AllTimeLogicEntry[]> =>
  await withSharedCache(
    `leaderboard:all-time-logic:limit:${limit}`,
    publicLeaderboardCacheTtlSeconds,
    async () => {
      const entries = await redis.zRange(keyAllTimeLogicLeaderboard, 0, limit - 1, {
        by: 'rank',
        reverse: true,
      });
      return await Promise.all(entries.map(resolveAllTimeLogicEntry));
    }
  );

/** Window read for paginated all-time-logic. See getAllTimeLevelsWindow. */
export const getAllTimeLogicWindow = async (
  offset: number,
  limit: number
): Promise<AllTimeLogicEntry[]> => {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }
  const entries = await redis.zRange(
    keyAllTimeLogicLeaderboard,
    safeOffset,
    safeOffset + safeLimit - 1,
    { by: 'rank', reverse: true }
  );
  return await Promise.all(entries.map(resolveAllTimeLogicEntry));
};

type GlobalLeaderboardEntry = {
  userId: string;
  username: string | null;
  score: number;
  rating: number;
  snoovatarUrl: string | null;
  globalScore: number;
  challengesCompleted: number;
};

const resolveGlobalEntry = async (entry: {
  member: string;
  score: number;
}): Promise<GlobalLeaderboardEntry> => {
  const [globalScore, challengesCompleted, userMeta] = await Promise.all([
    readProfileNumber(entry.member, 'globalScore', 0),
    readProfileNumber(entry.member, 'totalLevelsCompleted', 0),
    resolveLeaderboardUserMeta(entry.member),
  ]);
  return {
    userId: entry.member,
    username: userMeta.username,
    // The zset score packs the rating (integer part) with a
    // total-points tiebreak fraction; floor recovers the exact rating.
    score: Math.floor(entry.score),
    rating: Math.floor(entry.score),
    snoovatarUrl: userMeta.snoovatarUrl,
    globalScore,
    challengesCompleted,
  };
};

export const getGlobalTop = async (
  limit: number
): Promise<GlobalLeaderboardEntry[]> =>
  await withSharedCache(
    `leaderboard:global:rating:limit:${limit}`,
    publicLeaderboardCacheTtlSeconds,
    async () => {
      const fetchLimit = Math.max(limit * 4, limit);
      const entries = await redis.zRange(
        keyGlobalRatingLeaderboard,
        0,
        fetchLimit - 1,
        {
          by: 'rank',
          reverse: true,
        }
      );
      const resolved = await Promise.all(entries.map(resolveGlobalEntry));
      return resolved.slice(0, limit);
    }
  );

/**
 * Window read for paginated global leaderboard: resolves only the requested
 * rank window [offset, offset+limit). The global zset has one entry per member
 * (no post-filtering), so the window is exact. See getAllTimeLevelsWindow.
 */
export const getGlobalWindow = async (
  offset: number,
  limit: number
): Promise<GlobalLeaderboardEntry[]> => {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }
  const entries = await redis.zRange(
    keyGlobalRatingLeaderboard,
    safeOffset,
    safeOffset + safeLimit - 1,
    { by: 'rank', reverse: true }
  );
  return await Promise.all(entries.map(resolveGlobalEntry));
};

export const getUserRankSummary = async (params: {
  userId: string;
  dateKey: string;
}): Promise<{
  dailyRank: number | null;
  globalRank: number | null;
  currentRank: number | null;
}> => {
  const dailyKey = keyDailyLeaderboard(params.dateKey);
  const globalKey = keyGlobalRatingLeaderboard;
  const [dailyRankIndex, dailyCount, globalRankIndex, globalCount] =
    await Promise.all([
      redis.zRank(dailyKey, params.userId),
      redis.zCard(dailyKey),
      redis.zRank(globalKey, params.userId),
      redis.zCard(globalKey),
    ]);
  const dailyRank =
    typeof dailyRankIndex === 'number'
      ? Math.max(1, Math.floor(dailyCount) - Math.floor(dailyRankIndex))
      : null;
  const globalRank =
    typeof globalRankIndex === 'number'
      ? Math.max(1, Math.floor(globalCount) - Math.floor(globalRankIndex))
      : null;
  const currentRank =
    dailyRank === null
      ? globalRank
      : globalRank === null
        ? dailyRank
        : Math.min(dailyRank, globalRank);
  return {
    dailyRank,
    globalRank,
    currentRank,
  };
};

export const awardDailyTopRank = async (
  dateKey: string
): Promise<{ awarded: boolean; userId: string | null }> => {
  const awardedKey = keyDailyRankAwarded(dateKey);
  // Fast path: if a finalized record already exists, return it.
  // 'pending' is the transient in-flight state held by the NX claim below
  // between read and finalize; for non-claimant callers we treat it as
  // "not yet awarded" (i.e. don't double-award and don't race the writer).
  const existing = await redis.get(awardedKey);
  if (existing && existing !== 'pending') {
    return {
      awarded: false,
      userId: existing === 'none' ? null : existing,
    };
  }
  // NX-claim the slot. If two scheduler invocations (cron + manual reroll,
  // for example) reach this point concurrently, only one acquires; the other
  // bails out without re-awarding the quest progress.
  const claimed = await redis.set(awardedKey, 'pending', {
    nx: true,
    expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  });
  if (!claimed) {
    return { awarded: false, userId: null };
  }
  const topEntries = await redis.zRange(keyDailyLeaderboard(dateKey), 0, 0, {
    by: 'rank',
    reverse: true,
  });
  const [topEntry] = topEntries;
  if (!topEntry) {
    await redis.set(awardedKey, 'none', {
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { awarded: false, userId: null };
  }
  const topUserId = topEntry.member;
  // Finalize the slot BEFORE the quest update so that even if the quest call
  // throws, a retry sees the finalized record and does not re-award.
  await redis.set(awardedKey, topUserId, {
    expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  });
  await updateQuestProgressOnDailyTopRank({ userId: topUserId });
  return { awarded: true, userId: topUserId };
};
