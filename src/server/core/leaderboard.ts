import { redis, reddit } from '@devvit/web/server';
import {
  keyAllTimeLevelsLeaderboard,
  keyAllTimeLogicLeaderboard,
  keyDailyLeaderboard,
  keyDailyLeaderboardStats,
  keyDailyRankAwarded,
  keyLevelWinners,
  keyUserQuestDaily,
  keyUserCompleted,
  keyUserEndlessLevelScores,
  keyUserProfile,
} from './keys';
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

const resolveLeaderboardUserMeta = async (
  userId: string
): Promise<LeaderboardUserMeta> => {
  try {
    const user = await reddit.getUserById(normalizeUserId(userId));
    if (!user) {
      return {
        username: null,
        snoovatarUrl: null,
      };
    }
    const snoovatarUrl = await reddit.getSnoovatarUrl(user.username);
    return {
      username: user.username,
      snoovatarUrl: snoovatarUrl ?? null,
    };
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
  const safeSolveSeconds = Math.max(0, Math.floor(params.solveSeconds));
  const safeMistakes = Math.max(0, Math.floor(params.mistakes));
  const safePowerups = Math.max(0, Math.floor(params.usedPowerups));
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
}): number =>
  computeScore({
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
      [params.userId]: JSON.stringify(totals),
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
  const [
    _dailyScore,
    nextSolveSeconds,
    nextMistakes,
    nextUsedPowerups,
    nextRuns,
  ] = await Promise.all([
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
  await redis.hSet(statsKey, {
    [params.userId]: JSON.stringify({
      solveSeconds: nextSolveSeconds,
      mistakes: nextMistakes,
      usedPowerups: nextUsedPowerups,
      runs: nextRuns,
    }),
  });
  await expireDailyLeaderboardKeys(params.dateKey, statsKey);
};

export const incrementAllTimeLevels = async (
  userId: string,
  amount: number
): Promise<void> => {
  await redis.zIncrBy(keyAllTimeLevelsLeaderboard, userId, amount);
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

export const incrementAllTimeLogic = async (
  userId: string,
  amount: number
): Promise<void> => {
  await redis.zIncrBy(keyAllTimeLogicLeaderboard, userId, amount);
};

export const getDailyTop = async (
  dateKey: string,
  limit: number
): Promise<{
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
  solveSeconds: number | null;
  mistakes: number | null;
  usedPowerups: number | null;
}[]> => {
  const fetchLimit = Math.max(limit * 3, limit);
  const entries = await redis.zRange(
    keyDailyLeaderboard(dateKey),
    0,
    fetchLimit - 1,
    {
      by: 'rank',
      reverse: true,
    }
  );
  const entriesWithSnoovatar = await Promise.all(
    entries.map(async (entry) => {
      const rawStats = await redis.hGet(
        keyDailyLeaderboardStats(dateKey),
        entry.member
      );
      let solveSeconds: number | null = null;
      let mistakes: number | null = null;
      let usedPowerups: number | null = null;
      let runs: number | null = null;
      const [
        solveField,
        mistakesField,
        powerupsField,
        runsField,
      ] = await Promise.all([
        redis.hGet(
          keyDailyLeaderboardStats(dateKey),
          dailyStatsField(entry.member, 'solveSeconds')
        ),
        redis.hGet(
          keyDailyLeaderboardStats(dateKey),
          dailyStatsField(entry.member, 'mistakes')
        ),
        redis.hGet(
          keyDailyLeaderboardStats(dateKey),
          dailyStatsField(entry.member, 'usedPowerups')
        ),
        redis.hGet(
          keyDailyLeaderboardStats(dateKey),
          dailyStatsField(entry.member, 'runs')
        ),
      ]);
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
            typeof parsed === 'number'
              ? { solveSeconds: parsed }
              : parsed;
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
      const averageSolveSeconds = averageDailyStat(
        solveSeconds,
        normalizedRuns
      );
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
    })
  );
  return entriesWithSnoovatar
    .filter(
      (
        entry
      ): entry is {
        userId: string;
        username: string | null;
        score: number;
        snoovatarUrl: string | null;
        solveSeconds: number | null;
        mistakes: number | null;
        usedPowerups: number | null;
      } => entry !== null
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
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
}[]> => {
  const winners = await redis.zRange(keyLevelWinners(levelId), 0, -1, {
    by: 'rank',
  });

  const resolved = await Promise.all(
    winners.map(async (entry) => {
      const receipt = await getShareCompletionReceipt(entry.member, levelId);
      if (!receipt) {
        return null;
      }

      const userMeta = await resolveLeaderboardUserMeta(entry.member);
      const levelScore = scoreFromReceipt(receipt);

      return {
        userId: entry.member,
        username: userMeta.username,
        score: levelScore,
        snoovatarUrl: userMeta.snoovatarUrl,
        solveSeconds: receipt.solveSeconds,
        mistakes: receipt.mistakes,
        usedPowerups: receipt.usedPowerups,
        completedAtTs: receipt.completedAtTs,
      };
    })
  );

  return resolved
    .filter(
      (
        entry
      ): entry is {
        userId: string;
        username: string | null;
        score: number;
        snoovatarUrl: string | null;
        solveSeconds: number;
        mistakes: number;
        usedPowerups: number;
        completedAtTs: number;
      } => entry !== null
    )
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
    .slice(0, limit)
    .map(({ completedAtTs: _completedAtTs, ...entry }) => entry);
};

export const getAllTimeTopLevels = async (
  limit: number
): Promise<{
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
  levelsCompleted: number;
}[]> => {
  const fetchLimit = Math.max(limit * 4, limit);
  const entries = await redis.zRange(keyAllTimeLevelsLeaderboard, 0, fetchLimit - 1, {
    by: 'rank',
    reverse: true,
  });
  const resolved = await Promise.all(
    entries.map(async (entry) => {
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
    })
  );
  const filtered = resolved.filter(
    (
      entry
    ): entry is {
      userId: string;
      username: string | null;
      score: number;
      snoovatarUrl: string | null;
      levelsCompleted: number;
    } => entry !== null
  );
  return filtered.slice(0, limit);
};

export const getAllTimeTopLogic = async (
  limit: number
): Promise<{
  userId: string;
  username: string | null;
  score: number;
  snoovatarUrl: string | null;
}[]> => {
  const entries = await redis.zRange(keyAllTimeLogicLeaderboard, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
  return Promise.all(
    entries.map(async (entry) => {
      const userMeta = await resolveLeaderboardUserMeta(entry.member);
      return {
        userId: entry.member,
        username: userMeta.username,
        score: entry.score,
        snoovatarUrl: userMeta.snoovatarUrl,
      };
    })
  );
};

export const getUserRankSummary = async (params: {
  userId: string;
  dateKey: string;
}): Promise<{
  dailyRank: number | null;
  endlessRank: number | null;
  currentRank: number | null;
}> => {
  const [dailyEntries, allTimeEntries] = await Promise.all([
    redis.zRange(keyDailyLeaderboard(params.dateKey), 0, -1, {
      by: 'rank',
      reverse: true,
    }),
    redis.zRange(keyAllTimeLevelsLeaderboard, 0, -1, {
      by: 'rank',
      reverse: true,
    }),
  ]);
  const dailyIndex = dailyEntries.findIndex(
    (entry) => entry.member === params.userId
  );
  const endlessEligibility = await Promise.all(
    allTimeEntries.map(async (entry) => ({
      entry,
      clears: await readEndlessClears(entry.member),
    }))
  );
  const endlessEntries = endlessEligibility
    .filter((item) => item.clears > 0)
    .map((item) => item.entry);
  const endlessIndex = endlessEntries.findIndex(
    (entry) => entry.member === params.userId
  );
  const dailyRank = dailyIndex >= 0 ? dailyIndex + 1 : null;
  const endlessRank = endlessIndex >= 0 ? endlessIndex + 1 : null;
  const currentRank =
    dailyRank === null
      ? endlessRank
      : endlessRank === null
        ? dailyRank
        : Math.min(dailyRank, endlessRank);
  return {
    dailyRank,
    endlessRank,
    currentRank,
  };
};

export const awardDailyTopRank = async (
  dateKey: string
): Promise<{ awarded: boolean; userId: string | null }> => {
  const awardedKey = keyDailyRankAwarded(dateKey);
  const alreadyAwarded = await redis.get(awardedKey);
  if (alreadyAwarded) {
    return {
      awarded: false,
      userId: alreadyAwarded === 'none' ? null : alreadyAwarded,
    };
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
  await updateQuestProgressOnDailyTopRank({ userId: topUserId });
  await redis.set(awardedKey, topUserId, {
    expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  });
  return { awarded: true, userId: topUserId };
};
