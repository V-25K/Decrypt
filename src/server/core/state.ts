import { redis } from '@devvit/web/server';
import {
  type Inventory,
  inventorySchema,
  type QuestProgress,
  questProgressSchema,
  type UserProfile,
  userProfileSchema,
} from '../../shared/game';
import {
  keyKnownUsersIndex,
  keyUserCompleted,
  keyUserDailyRetryCounts,
  keyUserEndlessCursor,
  keyUserFailedLevels,
  keyUserInventory,
  keyUserPurchases,
  keyUserProfile,
  keyUserQuestDaily,
  keyUserQuestLifetime,
} from './keys';
import { normalizeHearts } from './hearts';
import { dailyDataTtlSeconds } from './constants';

const numberFromHash = (
  hash: Record<string, string>,
  field: string,
  fallback: number
): number => {
  const raw = hash[field];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const stringFromHash = (
  hash: Record<string, string>,
  field: string,
  fallback: string
): string => {
  const raw = hash[field];
  return raw === undefined ? fallback : raw;
};

const stringArrayFromHash = (
  hash: Record<string, string>,
  field: string
): string[] => {
  const raw = hash[field];
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch (_error) {
    return [];
  }
};

const normalizeUnlockedFlairs = (profile: UserProfile): UserProfile => {
  const nextUnlockedFlairs = Array.from(
    new Set(
      [
        ...profile.unlockedFlairs,
        profile.activeFlair.trim().length > 0 ? profile.activeFlair : null,
      ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    )
  );
  const nextActiveFlair =
    profile.activeFlair.trim().length === 0 ||
    nextUnlockedFlairs.includes(profile.activeFlair)
      ? profile.activeFlair
      : '';
  return {
    ...profile,
    unlockedFlairs: nextUnlockedFlairs,
    activeFlair: nextActiveFlair,
  };
};

export const defaultUserProfile = (): UserProfile =>
  userProfileSchema.parse({
    coins: 0,
    hearts: 3,
    lastHeartRefillTs: Date.now(),
    infiniteHeartsExpiryTs: 0,
    currentStreak: 0,
    dailyCurrentStreak: 0,
    endlessCurrentStreak: 0,
    lastPlayedDateKey: '',
    totalWordsSolved: 0,
    logicTasksCompleted: 0,
    totalLevelsCompleted: 0,
    flawlessWins: 0,
    speedWins: 0,
    dailyFlawlessWins: 0,
    endlessFlawlessWins: 0,
    dailySpeedWins: 0,
    endlessSpeedWins: 0,
    dailyChallengesPlayed: 0,
    endlessChallengesPlayed: 0,
    dailyFirstTryWins: 0,
    endlessFirstTryWins: 0,
    questsCompleted: 0,
    dailyModeClears: 0,
    endlessModeClears: 0,
    dailySolveTimeTotalSec: 0,
    endlessSolveTimeTotalSec: 0,
    bestOverallRank: 0,
    audioEnabled: true,
    communityJoinRecorded: false,
    communityJoinRewardClaimed: false,
    unlockedFlairs: [],
    activeFlair: '',
  });

export const defaultInventory = (): Inventory =>
  inventorySchema.parse({
    hammer: 0,
    wand: 0,
    shield: 0,
    rocket: 0,
  });

const defaultQuestProgress = (): QuestProgress =>
  questProgressSchema.parse({
    dailyPlayCount: 0,
    dailyFastWin: false,
    dailyNoPowerup: false,
    dailyNoMistake: false,
    dailyShareCount: 0,
    socialShareCount: 0,
    lifetimeWordsmith: 0,
    lifetimeLogicalSolved: 0,
    lifetimeFlawless: 0,
    lifetimeCoinsSpent: 0,
    lifetimePurchases: 0,
    lifetimeDailyTopRanks: 0,
    lifetimeEndlessClears: 0,
  });

type DailyQuestProgress = Pick<
  QuestProgress,
  | 'dailyPlayCount'
  | 'dailyFastWin'
  | 'dailyNoPowerup'
  | 'dailyNoMistake'
  | 'dailyShareCount'
  | 'socialShareCount'
>;

const dailyQuestProgressSchema = questProgressSchema.pick({
  dailyPlayCount: true,
  dailyFastWin: true,
  dailyNoPowerup: true,
  dailyNoMistake: true,
  dailyShareCount: true,
  socialShareCount: true,
});

export const registerKnownUser = async (userId: string): Promise<void> => {
  await redis.hSet(keyKnownUsersIndex, {
    [userId]: '1',
  });
};

export const getKnownUserIds = async (): Promise<string[]> =>
  await redis.hKeys(keyKnownUsersIndex);

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const profileKey = keyUserProfile(userId);
  let hash = await redis.hGetAll(profileKey);
  if (Object.keys(hash).length === 0) {
    const profile = defaultUserProfile();
    const created = await redis.hSetNX(profileKey, 'coins', `${profile.coins}`);
    if (created === 1) {
      await saveUserProfile(userId, profile);
      return profile;
    }
    hash = await redis.hGetAll(profileKey);
    if (Object.keys(hash).length === 0) {
      return profile;
    }
  }

  const parsedResult = userProfileSchema.safeParse({
    coins: numberFromHash(hash, 'coins', 0),
    hearts: numberFromHash(hash, 'hearts', 3),
    lastHeartRefillTs: numberFromHash(hash, 'lastHeartRefillTs', Date.now()),
    infiniteHeartsExpiryTs: numberFromHash(hash, 'infiniteHeartsExpiryTs', 0),
    currentStreak: numberFromHash(hash, 'currentStreak', 0),
    dailyCurrentStreak: numberFromHash(hash, 'dailyCurrentStreak', 0),
    endlessCurrentStreak: numberFromHash(hash, 'endlessCurrentStreak', 0),
    lastPlayedDateKey: stringFromHash(hash, 'lastPlayedDateKey', ''),
    totalWordsSolved: numberFromHash(hash, 'totalWordsSolved', 0),
    logicTasksCompleted: numberFromHash(hash, 'logicTasksCompleted', 0),
    totalLevelsCompleted: numberFromHash(hash, 'totalLevelsCompleted', 0),
    flawlessWins: numberFromHash(hash, 'flawlessWins', 0),
    speedWins: numberFromHash(hash, 'speedWins', 0),
    dailyFlawlessWins: numberFromHash(hash, 'dailyFlawlessWins', 0),
    endlessFlawlessWins: numberFromHash(hash, 'endlessFlawlessWins', 0),
    dailySpeedWins: numberFromHash(hash, 'dailySpeedWins', 0),
    endlessSpeedWins: numberFromHash(hash, 'endlessSpeedWins', 0),
    dailyChallengesPlayed: numberFromHash(hash, 'dailyChallengesPlayed', 0),
    endlessChallengesPlayed: numberFromHash(hash, 'endlessChallengesPlayed', 0),
    dailyFirstTryWins: numberFromHash(hash, 'dailyFirstTryWins', 0),
    endlessFirstTryWins: numberFromHash(hash, 'endlessFirstTryWins', 0),
    questsCompleted: numberFromHash(hash, 'questsCompleted', 0),
    dailyModeClears: numberFromHash(hash, 'dailyModeClears', 0),
    endlessModeClears: numberFromHash(hash, 'endlessModeClears', 0),
    dailySolveTimeTotalSec: numberFromHash(hash, 'dailySolveTimeTotalSec', 0),
    endlessSolveTimeTotalSec: numberFromHash(hash, 'endlessSolveTimeTotalSec', 0),
    bestOverallRank: numberFromHash(hash, 'bestOverallRank', 0),
    audioEnabled: stringFromHash(hash, 'audioEnabled', '1') === '1',
    communityJoinRecorded: stringFromHash(hash, 'communityJoinRecorded', '0') === '1',
    communityJoinRewardClaimed:
      stringFromHash(hash, 'communityJoinRewardClaimed', '0') === '1',
    unlockedFlairs: stringArrayFromHash(hash, 'unlockedFlairs'),
    activeFlair: stringFromHash(hash, 'activeFlair', ''),
  });
  if (!parsedResult.success) {
    const fallback = defaultUserProfile();
    await saveUserProfile(userId, fallback);
    return fallback;
  }
  const parsed = parsedResult.data;
  const normalized = normalizeUnlockedFlairs(normalizeHearts(parsed));
  if (
    JSON.stringify(normalized.unlockedFlairs) !== JSON.stringify(parsed.unlockedFlairs) ||
    normalized.activeFlair !== parsed.activeFlair ||
    normalized.hearts !== parsed.hearts ||
    normalized.lastHeartRefillTs !== parsed.lastHeartRefillTs
  ) {
    await saveUserProfile(userId, normalized);
  }
  return normalized;
};

export const saveUserProfile = async (
  userId: string,
  profile: UserProfile
): Promise<void> => {
  const normalizedProfile = normalizeUnlockedFlairs(profile);
  await redis.hSet(keyUserProfile(userId), {
    coins: `${normalizedProfile.coins}`,
    hearts: `${normalizedProfile.hearts}`,
    lastHeartRefillTs: `${normalizedProfile.lastHeartRefillTs}`,
    infiniteHeartsExpiryTs: `${normalizedProfile.infiniteHeartsExpiryTs}`,
    currentStreak: `${normalizedProfile.currentStreak}`,
    dailyCurrentStreak: `${normalizedProfile.dailyCurrentStreak}`,
    endlessCurrentStreak: `${normalizedProfile.endlessCurrentStreak}`,
    lastPlayedDateKey: normalizedProfile.lastPlayedDateKey,
    totalWordsSolved: `${normalizedProfile.totalWordsSolved}`,
    logicTasksCompleted: `${normalizedProfile.logicTasksCompleted}`,
    totalLevelsCompleted: `${normalizedProfile.totalLevelsCompleted}`,
    flawlessWins: `${normalizedProfile.flawlessWins}`,
    speedWins: `${normalizedProfile.speedWins}`,
    dailyFlawlessWins: `${normalizedProfile.dailyFlawlessWins}`,
    endlessFlawlessWins: `${normalizedProfile.endlessFlawlessWins}`,
    dailySpeedWins: `${normalizedProfile.dailySpeedWins}`,
    endlessSpeedWins: `${normalizedProfile.endlessSpeedWins}`,
    dailyChallengesPlayed: `${normalizedProfile.dailyChallengesPlayed}`,
    endlessChallengesPlayed: `${normalizedProfile.endlessChallengesPlayed}`,
    dailyFirstTryWins: `${normalizedProfile.dailyFirstTryWins}`,
    endlessFirstTryWins: `${normalizedProfile.endlessFirstTryWins}`,
    questsCompleted: `${normalizedProfile.questsCompleted}`,
    dailyModeClears: `${normalizedProfile.dailyModeClears}`,
    endlessModeClears: `${normalizedProfile.endlessModeClears}`,
    dailySolveTimeTotalSec: `${normalizedProfile.dailySolveTimeTotalSec}`,
    endlessSolveTimeTotalSec: `${normalizedProfile.endlessSolveTimeTotalSec}`,
    bestOverallRank: `${normalizedProfile.bestOverallRank}`,
    audioEnabled: normalizedProfile.audioEnabled ? '1' : '0',
    communityJoinRecorded: normalizedProfile.communityJoinRecorded ? '1' : '0',
    communityJoinRewardClaimed: normalizedProfile.communityJoinRewardClaimed
      ? '1'
      : '0',
    unlockedFlairs: JSON.stringify(normalizedProfile.unlockedFlairs),
    activeFlair: normalizedProfile.activeFlair,
  });
};

export const getInventory = async (userId: string): Promise<Inventory> => {
  const inventoryKey = keyUserInventory(userId);
  let hash = await redis.hGetAll(inventoryKey);
  if (Object.keys(hash).length === 0) {
    const inventory = defaultInventory();
    const created = await redis.hSetNX(inventoryKey, 'hammer', `${inventory.hammer}`);
    if (created === 1) {
      await saveInventory(userId, inventory);
      return inventory;
    }
    hash = await redis.hGetAll(inventoryKey);
    if (Object.keys(hash).length === 0) {
      return inventory;
    }
  }

  const parsedResult = inventorySchema.safeParse({
    hammer: numberFromHash(hash, 'hammer', 0),
    wand: numberFromHash(hash, 'wand', 0),
    shield: numberFromHash(hash, 'shield', 0),
    rocket: numberFromHash(hash, 'rocket', 0),
  });
  if (!parsedResult.success) {
    const fallback = defaultInventory();
    await saveInventory(userId, fallback);
    return fallback;
  }
  return parsedResult.data;
};

export const saveInventory = async (
  userId: string,
  inventory: Inventory
): Promise<void> => {
  await redis.hSet(keyUserInventory(userId), {
    hammer: `${inventory.hammer}`,
    wand: `${inventory.wand}`,
    shield: `${inventory.shield}`,
    rocket: `${inventory.rocket}`,
  });
};

export const getPurchasedSkus = async (userId: string): Promise<Set<string>> => {
  const fields = await redis.hKeys(keyUserPurchases(userId));
  return new Set(fields);
};

export const hasPurchasedSku = async (
  userId: string,
  sku: string
): Promise<boolean> => {
  const raw = await redis.hGet(keyUserPurchases(userId), sku);
  return raw !== undefined && raw !== null;
};

export const markSkuPurchased = async (
  userId: string,
  sku: string
): Promise<void> => {
  await redis.hSet(keyUserPurchases(userId), {
    [sku]: `${Date.now()}`,
  });
};

export const unmarkSkuPurchased = async (
  userId: string,
  sku: string
): Promise<void> => {
  await redis.hDel(keyUserPurchases(userId), [sku]);
};

export const getCompletedLevels = async (userId: string): Promise<Set<string>> => {
  const fields = await redis.hKeys(keyUserCompleted(userId));
  return new Set(fields);
};

export const getFailedLevels = async (userId: string): Promise<Set<string>> => {
  const fields = await redis.hKeys(keyUserFailedLevels(userId));
  return new Set(fields);
};

export const markLevelCompleted = async (
  userId: string,
  levelId: string
): Promise<void> => {
  await redis.hSet(keyUserCompleted(userId), {
    [levelId]: `${Date.now()}`,
  });
};

export const hasFailedLevel = async (
  userId: string,
  levelId: string
): Promise<boolean> => {
  const raw = await redis.hGet(keyUserFailedLevels(userId), levelId);
  return raw !== undefined && raw !== null;
};

export const markLevelFailed = async (
  userId: string,
  levelId: string
): Promise<void> => {
  await redis.hSet(keyUserFailedLevels(userId), {
    [levelId]: `${Date.now()}`,
  });
};

export const getDailyRetryCount = async (
  userId: string,
  levelId: string
): Promise<number> => {
  const raw = await redis.hGet(keyUserDailyRetryCounts(userId), levelId);
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const incrementDailyRetryCount = async (
  userId: string,
  levelId: string
): Promise<number> => {
  const next = await redis.hIncrBy(keyUserDailyRetryCounts(userId), levelId, 1);
  return Math.max(0, Math.floor(next));
};

export const getDailyQuestProgress = async (
  userId: string,
  dateKey: string
): Promise<QuestProgress> => {
  const dailyKey = keyUserQuestDaily(userId, dateKey);
  const hash = await redis.hGetAll(dailyKey);
  if (Object.keys(hash).length === 0) {
    const progress = defaultQuestProgress();
    await redis.hSet(dailyKey, {
      dailyPlayCount: '0',
      dailyFastWin: '0',
      dailyNoPowerup: '0',
      dailyNoMistake: '0',
      dailyShareCount: '0',
      socialShareCount: '0',
    });
    await redis.expire(dailyKey, dailyDataTtlSeconds);
    return progress;
  }

  const dailyProgress: DailyQuestProgress = dailyQuestProgressSchema.parse({
    dailyPlayCount: numberFromHash(hash, 'dailyPlayCount', 0),
    dailyFastWin: numberFromHash(hash, 'dailyFastWin', 0) === 1,
    dailyNoPowerup: numberFromHash(hash, 'dailyNoPowerup', 0) === 1,
    dailyNoMistake: numberFromHash(hash, 'dailyNoMistake', 0) === 1,
    dailyShareCount: numberFromHash(hash, 'dailyShareCount', 0),
    socialShareCount: numberFromHash(hash, 'socialShareCount', 0),
  });
  return questProgressSchema.parse({
    ...defaultQuestProgress(),
    ...dailyProgress,
  });
};

export const getLifetimeQuestProgress = async (
  userId: string
): Promise<QuestProgress> => {
  const hash = await redis.hGetAll(keyUserQuestLifetime(userId));
  if (Object.keys(hash).length === 0) {
    const progress = defaultQuestProgress();
    // Only initialize lifetime-specific fields. Daily fields live in
    // keyUserQuestDaily and must not be stored in the lifetime hash.
    await redis.hSet(keyUserQuestLifetime(userId), {
      lifetimeWordsmith: '0',
      lifetimeLogicalSolved: '0',
      lifetimeFlawless: '0',
      lifetimeCoinsSpent: '0',
      lifetimePurchases: '0',
      lifetimeDailyTopRanks: '0',
      lifetimeEndlessClears: '0',
    });
    return progress;
  }

  return questProgressSchema.parse({
    dailyPlayCount: numberFromHash(hash, 'dailyPlayCount', 0),
    dailyFastWin: numberFromHash(hash, 'dailyFastWin', 0) === 1,
    dailyNoPowerup: numberFromHash(hash, 'dailyNoPowerup', 0) === 1,
    dailyNoMistake: numberFromHash(hash, 'dailyNoMistake', 0) === 1,
    dailyShareCount: numberFromHash(hash, 'dailyShareCount', 0),
    socialShareCount: numberFromHash(hash, 'socialShareCount', 0),
    lifetimeWordsmith: numberFromHash(hash, 'lifetimeWordsmith', 0),
    lifetimeLogicalSolved: numberFromHash(hash, 'lifetimeLogicalSolved', 0),
    lifetimeFlawless: numberFromHash(hash, 'lifetimeFlawless', 0),
    lifetimeCoinsSpent: numberFromHash(hash, 'lifetimeCoinsSpent', 0),
    lifetimePurchases: numberFromHash(hash, 'lifetimePurchases', 0),
    lifetimeDailyTopRanks: numberFromHash(hash, 'lifetimeDailyTopRanks', 0),
    lifetimeEndlessClears: numberFromHash(hash, 'lifetimeEndlessClears', 0),
  });
};

export const saveDailyQuestProgress = async (
  userId: string,
  dateKey: string,
  progress: QuestProgress
): Promise<void> => {
  const dailyKey = keyUserQuestDaily(userId, dateKey);
  await redis.hSet(dailyKey, {
    dailyPlayCount: `${progress.dailyPlayCount}`,
    dailyFastWin: progress.dailyFastWin ? '1' : '0',
    dailyNoPowerup: progress.dailyNoPowerup ? '1' : '0',
    dailyNoMistake: progress.dailyNoMistake ? '1' : '0',
    dailyShareCount: `${progress.dailyShareCount}`,
    socialShareCount: `${progress.socialShareCount}`,
  });
  await redis.expire(dailyKey, dailyDataTtlSeconds);
};

export const saveLifetimeQuestProgress = async (
  userId: string,
  progress: QuestProgress
): Promise<void> => {
  // Only persist lifetime-specific counters. Daily fields are managed
  // exclusively by saveDailyQuestProgress / keyUserQuestDaily.
  await redis.hSet(keyUserQuestLifetime(userId), {
    lifetimeWordsmith: `${progress.lifetimeWordsmith}`,
    lifetimeLogicalSolved: `${progress.lifetimeLogicalSolved}`,
    lifetimeFlawless: `${progress.lifetimeFlawless}`,
    lifetimeCoinsSpent: `${progress.lifetimeCoinsSpent}`,
    lifetimePurchases: `${progress.lifetimePurchases}`,
    lifetimeDailyTopRanks: `${progress.lifetimeDailyTopRanks}`,
    lifetimeEndlessClears: `${progress.lifetimeEndlessClears}`,
  });
};

export const getUserEndlessCursor = async (userId: string): Promise<number> => {
  const raw = await redis.get(keyUserEndlessCursor(userId));
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const incrementUserEndlessCursor = async (userId: string): Promise<number> => {
  const current = await getUserEndlessCursor(userId);
  const next = current + 1;
  await redis.set(keyUserEndlessCursor(userId), next.toString());
  return next;
};

export const initializeUserEndlessCursor = async (
  userId: string,
  catalogVersion: string,
  keyEndlessCatalogSequence: (version: string) => string
): Promise<number> => {
  const completed = await getCompletedLevels(userId);
  const catalogEntries = await redis.zRange(
    keyEndlessCatalogSequence(catalogVersion),
    0,
    -1,
    { by: 'rank' }
  );
  
  let cursor = 0;
  for (const entry of catalogEntries) {
    if (!completed.has(entry.member)) {
      break;
    }
    cursor++;
  }
  
  await redis.set(keyUserEndlessCursor(userId), cursor.toString());
  return cursor;
};
