import { redis, reddit } from '@devvit/web/server';
import { getCompletedLevels, getUserProfile } from '../state';
import {
  keyDailyLeaderboardStats,
  keyUserCompleted,
  keyUserProfile,
} from '../keys';
import { formatDateKey } from '../serde';
import { getShareCompletionReceipt } from '../share-receipts';
import { isEndlessLevelId } from './shared';

export type PlayerTimeStatsDebugResult = {
  username: string;
  userId: string;
  dateKey: string;
  profile: {
    dailyModeClears: number;
    dailySolveTimeTotalSec: number;
    dailyAvgSolveSeconds: number | null;
    endlessModeClears: number;
    endlessSolveTimeTotalSec: number;
    endlessAvgSolveSeconds: number | null;
    dailyChallengesPlayed: number;
    endlessChallengesPlayed: number;
    totalLevelsCompleted: number;
  };
  completed: {
    dailyLevels: number;
    endlessLevels: number;
    totalLevels: number;
  };
  receipts: {
    dailyLevelsWithReceipt: number;
    endlessLevelsWithReceipt: number;
    dailySolveTimeTotalSec: number;
    endlessSolveTimeTotalSec: number;
    dailyAvgSolveSeconds: number | null;
    endlessAvgSolveSeconds: number | null;
    dailyCoveragePct: number;
    endlessCoveragePct: number;
  };
  dailyLeaderboard: {
    solveSecondsTotal: number | null;
    mistakesTotal: number | null;
    usedPowerupsTotal: number | null;
    runs: number | null;
    avgSolveSeconds: number | null;
  };
  levelTimes: {
    levelId: string;
    mode: 'daily' | 'endless';
    dateKey: string | null;
    solveSeconds: number | null;
    completedAtTs: number | null;
  }[];
  analysis: {
    medianSolveSeconds: number | null;
    minSolveSeconds: number | null;
    maxSolveSeconds: number | null;
    levelsOver10Minutes: number;
    levelsOver20Minutes: number;
    levelsOver30Minutes: number;
    slowestLevels: {
      levelId: string;
      mode: 'daily' | 'endless';
      dateKey: string;
      solveSeconds: number;
      completedAtTs: number;
    }[];
  };
  flags: string[];
};

const numberFromNullableString = (raw: string | null | undefined): number | null => {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed);
};

const averageSolveSeconds = (
  totalSolveSeconds: number,
  clears: number
): number | null => {
  if (!Number.isFinite(totalSolveSeconds) || !Number.isFinite(clears)) {
    return null;
  }
  const normalizedClears = Math.floor(clears);
  if (normalizedClears <= 0) {
    return null;
  }
  return Math.round(totalSolveSeconds / normalizedClears);
};

const normalizeUsernameInput = (username: string): string =>
  username.replace(/^u\//i, '').trim();

const medianFromValues = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];
    const right = sorted[middle];
    if (left === undefined || right === undefined) {
      return null;
    }
    return Math.round((left + right) / 2);
  }
  return sorted[middle] ?? null;
};

const resolveStoredUserId = async (redditUserId: string): Promise<string> => {
  const candidates = Array.from(
    new Set([
      redditUserId,
      redditUserId.startsWith('t2_')
        ? redditUserId.slice(3)
        : `t2_${redditUserId}`,
    ])
  );
  const evidence = await Promise.all(
    candidates.map(async (candidate) => {
      const [profileHash, completedHash] = await Promise.all([
        redis.hGetAll(keyUserProfile(candidate)),
        redis.hGetAll(keyUserCompleted(candidate)),
      ]);
      const totalLevelsCompleted =
        numberFromNullableString(profileHash.totalLevelsCompleted) ?? 0;
      const dailyModeClears =
        numberFromNullableString(profileHash.dailyModeClears) ?? 0;
      const endlessModeClears =
        numberFromNullableString(profileHash.endlessModeClears) ?? 0;
      const profileHasAnyData = Object.keys(profileHash).length > 0;
      const completedCount = Object.keys(completedHash).length;
      let score = 0;
      if (profileHasAnyData) {
        score += 1;
      }
      if (completedCount > 0) {
        score += 4;
      }
      if (totalLevelsCompleted > 0) {
        score += 6;
      }
      if (dailyModeClears + endlessModeClears > 0) {
        score += 5;
      }
      return {
        candidate,
        score,
      };
    })
  );
  evidence.sort((left, right) => right.score - left.score);
  return evidence[0]?.candidate ?? redditUserId;
};

export const getPlayerTimeStatsByUsername = async (params: {
  username: string;
  dateKey?: string;
}): Promise<PlayerTimeStatsDebugResult> => {
  const username = normalizeUsernameInput(params.username);
  if (username.length === 0) {
    throw new Error('Username is required.');
  }
  const user = await reddit.getUserByUsername(username);
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }
  const userId = await resolveStoredUserId(user.id);
  const dateKey = params.dateKey ?? formatDateKey(new Date());
  const [profile, completedLevels] = await Promise.all([
    getUserProfile(userId),
    getCompletedLevels(userId),
  ]);
  let dailyLevels = 0;
  let endlessLevels = 0;
  let dailyLevelsWithReceipt = 0;
  let endlessLevelsWithReceipt = 0;
  let dailyReceiptSolveSecondsTotal = 0;
  let endlessReceiptSolveSecondsTotal = 0;
  const allReceiptSolveSeconds: number[] = [];
  const levelTimes: {
    levelId: string;
    mode: 'daily' | 'endless';
    dateKey: string | null;
    solveSeconds: number | null;
    completedAtTs: number | null;
  }[] = [];
  for (const levelId of completedLevels) {
    const endlessLevel = isEndlessLevelId(levelId);
    const mode = endlessLevel ? 'endless' : 'daily';
    if (endlessLevel) {
      endlessLevels += 1;
    } else {
      dailyLevels += 1;
    }
    const receipt = await getShareCompletionReceipt(userId, levelId);
    levelTimes.push({
      levelId,
      mode,
      dateKey: receipt?.dateKey ?? null,
      solveSeconds: receipt?.solveSeconds ?? null,
      completedAtTs: receipt?.completedAtTs ?? null,
    });
    if (!receipt) {
      continue;
    }
    allReceiptSolveSeconds.push(receipt.solveSeconds);
    if (endlessLevel) {
      endlessLevelsWithReceipt += 1;
      endlessReceiptSolveSecondsTotal += receipt.solveSeconds;
    } else {
      dailyLevelsWithReceipt += 1;
      dailyReceiptSolveSecondsTotal += receipt.solveSeconds;
    }
  }

  const statsKey = keyDailyLeaderboardStats(dateKey);
  const [
    solveSecondsTotalRaw,
    mistakesTotalRaw,
    usedPowerupsTotalRaw,
    runsRaw,
  ] = await Promise.all([
    redis.hGet(statsKey, `${userId}:solveSeconds`),
    redis.hGet(statsKey, `${userId}:mistakes`),
    redis.hGet(statsKey, `${userId}:usedPowerups`),
    redis.hGet(statsKey, `${userId}:runs`),
  ]);

  const leaderboardSolveSecondsTotal = numberFromNullableString(solveSecondsTotalRaw);
  const leaderboardMistakesTotal = numberFromNullableString(mistakesTotalRaw);
  const leaderboardUsedPowerupsTotal = numberFromNullableString(usedPowerupsTotalRaw);
  const leaderboardRuns = numberFromNullableString(runsRaw);
  const leaderboardAvgSolveSeconds =
    leaderboardSolveSecondsTotal !== null && leaderboardRuns !== null && leaderboardRuns > 0
      ? Math.round(leaderboardSolveSecondsTotal / leaderboardRuns)
      : leaderboardSolveSecondsTotal;

  const profileDailyAvgSolveSeconds = averageSolveSeconds(
    profile.dailySolveTimeTotalSec,
    profile.dailyModeClears
  );
  const profileEndlessAvgSolveSeconds = averageSolveSeconds(
    profile.endlessSolveTimeTotalSec,
    profile.endlessModeClears
  );
  const receiptDailyAvgSolveSeconds = averageSolveSeconds(
    dailyReceiptSolveSecondsTotal,
    dailyLevelsWithReceipt
  );
  const receiptEndlessAvgSolveSeconds = averageSolveSeconds(
    endlessReceiptSolveSecondsTotal,
    endlessLevelsWithReceipt
  );
  const dailyCoveragePct =
    dailyLevels > 0
      ? Math.round((dailyLevelsWithReceipt / dailyLevels) * 100)
      : 0;
  const endlessCoveragePct =
    endlessLevels > 0
      ? Math.round((endlessLevelsWithReceipt / endlessLevels) * 100)
      : 0;
  const minSolveSeconds =
    allReceiptSolveSeconds.length > 0
      ? Math.min(...allReceiptSolveSeconds)
      : null;
  const maxSolveSeconds =
    allReceiptSolveSeconds.length > 0
      ? Math.max(...allReceiptSolveSeconds)
      : null;
  const levelsOver10Minutes = allReceiptSolveSeconds.filter(
    (seconds) => seconds >= 600
  ).length;
  const levelsOver20Minutes = allReceiptSolveSeconds.filter(
    (seconds) => seconds >= 1200
  ).length;
  const levelsOver30Minutes = allReceiptSolveSeconds.filter(
    (seconds) => seconds >= 1800
  ).length;
  const slowestLevels = levelTimes
    .filter(
      (entry): entry is {
        levelId: string;
        mode: 'daily' | 'endless';
        dateKey: string;
        solveSeconds: number;
        completedAtTs: number;
      } =>
        entry.dateKey !== null &&
        entry.solveSeconds !== null &&
        entry.completedAtTs !== null
    )
    .sort((left, right) => right.solveSeconds - left.solveSeconds)
    .slice(0, 10);

  const flags: string[] = [];
  if (profile.dailyModeClears < dailyLevels) {
    flags.push('daily_clears_lower_than_completed_levels');
  }
  if (profile.endlessModeClears < endlessLevels) {
    flags.push('endless_clears_lower_than_completed_levels');
  }
  if (leaderboardSolveSecondsTotal !== null && (leaderboardRuns === null || leaderboardRuns <= 0)) {
    flags.push('daily_leaderboard_runs_missing_or_non_positive');
  }
  if (profileDailyAvgSolveSeconds !== null && profileDailyAvgSolveSeconds > 900) {
    flags.push('daily_avg_solve_time_above_15_minutes');
  }
  if (profileEndlessAvgSolveSeconds !== null && profileEndlessAvgSolveSeconds > 900) {
    flags.push('endless_avg_solve_time_above_15_minutes');
  }
  if (
    profileDailyAvgSolveSeconds !== null &&
    receiptDailyAvgSolveSeconds !== null &&
    Math.abs(profileDailyAvgSolveSeconds - receiptDailyAvgSolveSeconds) >= 120
  ) {
    flags.push('daily_profile_avg_differs_from_receipt_avg_by_2m_or_more');
  }
  if (
    profileEndlessAvgSolveSeconds !== null &&
    receiptEndlessAvgSolveSeconds !== null &&
    Math.abs(profileEndlessAvgSolveSeconds - receiptEndlessAvgSolveSeconds) >= 120
  ) {
    flags.push('endless_profile_avg_differs_from_receipt_avg_by_2m_or_more');
  }

  return {
    username: user.username,
    userId,
    dateKey,
    profile: {
      dailyModeClears: profile.dailyModeClears,
      dailySolveTimeTotalSec: profile.dailySolveTimeTotalSec,
      dailyAvgSolveSeconds: profileDailyAvgSolveSeconds,
      endlessModeClears: profile.endlessModeClears,
      endlessSolveTimeTotalSec: profile.endlessSolveTimeTotalSec,
      endlessAvgSolveSeconds: profileEndlessAvgSolveSeconds,
      dailyChallengesPlayed: profile.dailyChallengesPlayed,
      endlessChallengesPlayed: profile.endlessChallengesPlayed,
      totalLevelsCompleted: profile.totalLevelsCompleted,
    },
    completed: {
      dailyLevels,
      endlessLevels,
      totalLevels: completedLevels.size,
    },
    receipts: {
      dailyLevelsWithReceipt,
      endlessLevelsWithReceipt,
      dailySolveTimeTotalSec: dailyReceiptSolveSecondsTotal,
      endlessSolveTimeTotalSec: endlessReceiptSolveSecondsTotal,
      dailyAvgSolveSeconds: receiptDailyAvgSolveSeconds,
      endlessAvgSolveSeconds: receiptEndlessAvgSolveSeconds,
      dailyCoveragePct,
      endlessCoveragePct,
    },
    dailyLeaderboard: {
      solveSecondsTotal: leaderboardSolveSecondsTotal,
      mistakesTotal: leaderboardMistakesTotal,
      usedPowerupsTotal: leaderboardUsedPowerupsTotal,
      runs: leaderboardRuns,
      avgSolveSeconds: leaderboardAvgSolveSeconds,
    },
    levelTimes: levelTimes.sort((left, right) => {
      const leftTs = left.completedAtTs ?? -1;
      const rightTs = right.completedAtTs ?? -1;
      return rightTs - leftTs;
    }),
    analysis: {
      medianSolveSeconds: medianFromValues(allReceiptSolveSeconds),
      minSolveSeconds,
      maxSolveSeconds,
      levelsOver10Minutes,
      levelsOver20Minutes,
      levelsOver30Minutes,
      slowestLevels,
    },
    flags,
  };
};
