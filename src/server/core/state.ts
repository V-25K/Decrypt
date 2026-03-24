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
    dailyUnder5Min: false,
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

export const registerKnownUser = async (userId: string): Promise<void> => {
  await redis.hSet(keyKnownUsersIndex, {
    [userId]: '1',
  });
};

export const getKnownUserIds = async (): Promise<string[]> =>
  await redis.hKeys(keyKnownUsersIndex);

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const hash = await redis.hGetAll(keyUserProfile(userId));
  if (Object.keys(hash).length === 0) {
    const profile = defaultUserProfile();
    await redis.hSet(keyUserProfile(userId), {
      coins: `${profile.coins}`,
      hearts: `${profile.hearts}`,
      lastHeartRefillTs: `${profile.lastHeartRefillTs}`,
      infiniteHeartsExpiryTs: `${profile.infiniteHeartsExpiryTs}`,
      currentStreak: `${profile.currentStreak}`,
      dailyCurrentStreak: `${profile.dailyCurrentStreak}`,
      endlessCurrentStreak: `${profile.endlessCurrentStreak}`,
      lastPlayedDateKey: profile.lastPlayedDateKey,
      totalWordsSolved: `${profile.totalWordsSolved}`,
      logicTasksCompleted: `${profile.logicTasksCompleted}`,
      totalLevelsCompleted: `${profile.totalLevelsCompleted}`,
      flawlessWins: `${profile.flawlessWins}`,
      speedWins: `${profile.speedWins}`,
      dailyFlawlessWins: `${profile.dailyFlawlessWins}`,
      endlessFlawlessWins: `${profile.endlessFlawlessWins}`,
      dailySpeedWins: `${profile.dailySpeedWins}`,
      endlessSpeedWins: `${profile.endlessSpeedWins}`,
      dailyChallengesPlayed: `${profile.dailyChallengesPlayed}`,
      endlessChallengesPlayed: `${profile.endlessChallengesPlayed}`,
      dailyFirstTryWins: `${profile.dailyFirstTryWins}`,
      endlessFirstTryWins: `${profile.endlessFirstTryWins}`,
      questsCompleted: `${profile.questsCompleted}`,
      dailyModeClears: `${profile.dailyModeClears}`,
      endlessModeClears: `${profile.endlessModeClears}`,
      dailySolveTimeTotalSec: `${profile.dailySolveTimeTotalSec}`,
      endlessSolveTimeTotalSec: `${profile.endlessSolveTimeTotalSec}`,
      bestOverallRank: `${profile.bestOverallRank}`,
      unlockedFlairs: JSON.stringify(profile.unlockedFlairs),
      activeFlair: profile.activeFlair,
    });
    return profile;
  }

  const parsed = userProfileSchema.parse({
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
    unlockedFlairs: stringArrayFromHash(hash, 'unlockedFlairs'),
    activeFlair: stringFromHash(hash, 'activeFlair', ''),
  });
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
    unlockedFlairs: JSON.stringify(normalizedProfile.unlockedFlairs),
    activeFlair: normalizedProfile.activeFlair,
  });
};

export const getInventory = async (userId: string): Promise<Inventory> => {
  const hash = await redis.hGetAll(keyUserInventory(userId));
  if (Object.keys(hash).length === 0) {
    const inventory = defaultInventory();
    await redis.hSet(keyUserInventory(userId), {
      hammer: `${inventory.hammer}`,
      wand: `${inventory.wand}`,
      shield: `${inventory.shield}`,
      rocket: `${inventory.rocket}`,
    });
    return inventory;
  }

  return inventorySchema.parse({
    hammer: numberFromHash(hash, 'hammer', 0),
    wand: numberFromHash(hash, 'wand', 0),
    shield: numberFromHash(hash, 'shield', 0),
    rocket: numberFromHash(hash, 'rocket', 0),
  });
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

export const getCompletedLevels = async (userId: string): Promise<Set<string>> => {
  const fields = await redis.hKeys(keyUserCompleted(userId));
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

export const getDailyQuestProgress = async (
  userId: string,
  dateKey: string
): Promise<QuestProgress> => {
  const hash = await redis.hGetAll(keyUserQuestDaily(userId, dateKey));
  if (Object.keys(hash).length === 0) {
    const progress = defaultQuestProgress();
    await redis.hSet(keyUserQuestDaily(userId, dateKey), {
      dailyPlayCount: '0',
      dailyFastWin: '0',
      dailyUnder5Min: '0',
      dailyNoPowerup: '0',
      dailyNoMistake: '0',
      dailyShareCount: '0',
      socialShareCount: '0',
      lifetimeWordsmith: '0',
      lifetimeLogicalSolved: '0',
      lifetimeFlawless: '0',
      lifetimeCoinsSpent: '0',
      lifetimePurchases: '0',
      lifetimeDailyTopRanks: '0',
      lifetimeEndlessClears: '0',
    });
    await redis.expire(keyUserQuestDaily(userId, dateKey), dailyDataTtlSeconds);
    return progress;
  }

  return questProgressSchema.parse({
    dailyPlayCount: numberFromHash(hash, 'dailyPlayCount', 0),
    dailyFastWin: numberFromHash(hash, 'dailyFastWin', 0) === 1,
    dailyUnder5Min: numberFromHash(hash, 'dailyUnder5Min', 0) === 1,
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

export const getLifetimeQuestProgress = async (
  userId: string
): Promise<QuestProgress> => {
  const hash = await redis.hGetAll(keyUserQuestLifetime(userId));
  if (Object.keys(hash).length === 0) {
    const progress = defaultQuestProgress();
    await redis.hSet(keyUserQuestLifetime(userId), {
      dailyPlayCount: '0',
      dailyFastWin: '0',
      dailyUnder5Min: '0',
      dailyNoPowerup: '0',
      dailyNoMistake: '0',
      dailyShareCount: '0',
      socialShareCount: '0',
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
    dailyUnder5Min: numberFromHash(hash, 'dailyUnder5Min', 0) === 1,
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
  await redis.hSet(keyUserQuestDaily(userId, dateKey), {
    dailyPlayCount: `${progress.dailyPlayCount}`,
    dailyFastWin: progress.dailyFastWin ? '1' : '0',
    dailyUnder5Min: progress.dailyUnder5Min ? '1' : '0',
    dailyNoPowerup: progress.dailyNoPowerup ? '1' : '0',
    dailyNoMistake: progress.dailyNoMistake ? '1' : '0',
    dailyShareCount: `${progress.dailyShareCount}`,
    socialShareCount: `${progress.socialShareCount}`,
    lifetimeWordsmith: `${progress.lifetimeWordsmith}`,
    lifetimeLogicalSolved: `${progress.lifetimeLogicalSolved}`,
    lifetimeFlawless: `${progress.lifetimeFlawless}`,
    lifetimeCoinsSpent: `${progress.lifetimeCoinsSpent}`,
    lifetimePurchases: `${progress.lifetimePurchases}`,
    lifetimeDailyTopRanks: `${progress.lifetimeDailyTopRanks}`,
    lifetimeEndlessClears: `${progress.lifetimeEndlessClears}`,
  });
  await redis.expire(keyUserQuestDaily(userId, dateKey), dailyDataTtlSeconds);
};

export const saveLifetimeQuestProgress = async (
  userId: string,
  progress: QuestProgress
): Promise<void> => {
  await redis.hSet(keyUserQuestLifetime(userId), {
    dailyPlayCount: `${progress.dailyPlayCount}`,
    dailyFastWin: progress.dailyFastWin ? '1' : '0',
    dailyUnder5Min: progress.dailyUnder5Min ? '1' : '0',
    dailyNoPowerup: progress.dailyNoPowerup ? '1' : '0',
    dailyNoMistake: progress.dailyNoMistake ? '1' : '0',
    dailyShareCount: `${progress.dailyShareCount}`,
    socialShareCount: `${progress.socialShareCount}`,
    lifetimeWordsmith: `${progress.lifetimeWordsmith}`,
    lifetimeLogicalSolved: `${progress.lifetimeLogicalSolved}`,
    lifetimeFlawless: `${progress.lifetimeFlawless}`,
    lifetimeCoinsSpent: `${progress.lifetimeCoinsSpent}`,
    lifetimePurchases: `${progress.lifetimePurchases}`,
    lifetimeDailyTopRanks: `${progress.lifetimeDailyTopRanks}`,
    lifetimeEndlessClears: `${progress.lifetimeEndlessClears}`,
  });
};
