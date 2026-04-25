import type { Inventory, QuestProgress, UserProfile } from '../../shared/game';
import {
  isQuestDefinitionComplete,
  questCatalogById,
  type QuestReward,
} from '../../shared/quests';
import {
  getDailyQuestProgress,
  getInventory,
  getLifetimeQuestProgress,
  getUserProfile,
  saveInventory,
  saveDailyQuestProgress,
  saveUserProfile,
  saveLifetimeQuestProgress,
} from './state';
import { keyUserQuestDaily, keyUserQuestLifetime } from './keys';
import { redis } from '@devvit/web/server';

const claimField = (questId: string) => `claim:${questId}`;

const markClaimed = async (key: string, questId: string): Promise<boolean> =>
  (await redis.hSetNX(key, claimField(questId), '1')) === 1;

const claimedQuestIdsFromHash = (hash: Record<string, string>): string[] =>
  Object.entries(hash)
    .filter((entry) => entry[0].startsWith('claim:') && entry[1] === '1')
    .map((entry) => entry[0].slice('claim:'.length));

export const updateQuestProgressOnCompletion = async (params: {
  userId: string;
  dateKey: string;
  solvedWords: number;
  solveSeconds: number;
  mistakes: number;
  usedPowerups: number;
  isLogical: boolean;
  mode: 'daily' | 'endless';
  isCurrentDaily: boolean;
  isRecoveryRun: boolean;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  const daily =
    params.mode === 'daily' && params.isCurrentDaily
      ? await getDailyQuestProgress(params.userId, params.dateKey)
      : null;

  if (daily) {
    daily.dailyPlayCount += 1;
    if (!params.isRecoveryRun && params.solveSeconds <= 180) {
      daily.dailyFastWin = true;
    }
    if (!params.isRecoveryRun && params.usedPowerups === 0) {
      daily.dailyNoPowerup = true;
    }
    if (!params.isRecoveryRun && params.mistakes === 0) {
      daily.dailyNoMistake = true;
    }
  }

  lifetime.lifetimeWordsmith += params.solvedWords;
  if (params.isLogical) {
    lifetime.lifetimeLogicalSolved += 1;
  }
  if (params.mistakes === 0) {
    lifetime.lifetimeFlawless += 1;
  }
  if (params.mode === 'endless') {
    lifetime.lifetimeEndlessClears += 1;
  }

  if (daily) {
    await saveDailyQuestProgress(params.userId, params.dateKey, daily);
  }
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnShare = async (params: {
  userId: string;
  dateKey: string;
}): Promise<void> => {
  const daily = await getDailyQuestProgress(params.userId, params.dateKey);
  const lifetime = await getLifetimeQuestProgress(params.userId);
  daily.dailyShareCount += 1;
  lifetime.socialShareCount += 1;
  await saveDailyQuestProgress(params.userId, params.dateKey, daily);
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnCoinSpend = async (params: {
  userId: string;
  amount: number;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimeCoinsSpent += params.amount;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnPurchase = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimePurchases += 1;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnRefund = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimePurchases = Math.max(0, lifetime.lifetimePurchases - 1);
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnDailyTopRank = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimeDailyTopRanks += 1;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const getQuestStatus = async (params: {
  userId: string;
  dateKey: string;
}) => {
  const daily = await getDailyQuestProgress(params.userId, params.dateKey);
  const lifetime = await getLifetimeQuestProgress(params.userId);

  return {
    daily,
    lifetime,
  };
};

export const getClaimedQuestIds = async (params: {
  userId: string;
  dateKey: string;
}): Promise<string[]> => {
  const [dailyHash, lifetimeHash] = await Promise.all([
    redis.hGetAll(keyUserQuestDaily(params.userId, params.dateKey)),
    redis.hGetAll(keyUserQuestLifetime(params.userId)),
  ]);
  const ids = new Set<string>([
    ...claimedQuestIdsFromHash(dailyHash),
    ...claimedQuestIdsFromHash(lifetimeHash),
  ]);
  return Array.from(ids.values());
};

const emptyReward: QuestReward = {
  coins: 0,
  inventory: {},
  flair: null,
};

const getQuestReward = (questId: string): QuestReward =>
  questCatalogById[questId]?.reward ?? emptyReward;

const isQuestComplete = (params: {
  questId: string;
  daily: Awaited<ReturnType<typeof getDailyQuestProgress>>;
  lifetime: Awaited<ReturnType<typeof getLifetimeQuestProgress>>;
}): boolean => {
  const quest = questCatalogById[params.questId];
  if (!quest) {
    return false;
  }
  const progress: QuestProgress =
    quest.category === 'daily'
      ? params.daily
      : {
          ...params.daily,
          ...params.lifetime,
        };
  return isQuestDefinitionComplete(quest, progress);
};

export const claimQuest = async (params: {
  userId: string;
  dateKey: string;
  questId: string;
}): Promise<{
  success: boolean;
  reason: string | null;
  rewardCoins: number;
  profile: UserProfile;
  inventory: Inventory;
}> => {
  const [daily, lifetime, currentProfile, currentInventory] = await Promise.all([
    getDailyQuestProgress(params.userId, params.dateKey),
    getLifetimeQuestProgress(params.userId),
    getUserProfile(params.userId),
    getInventory(params.userId),
  ]);
  const dailyKey = keyUserQuestDaily(params.userId, params.dateKey);
  const lifetimeKey = keyUserQuestLifetime(params.userId);

  const useDailyKey = params.questId.startsWith('daily_');
  const claimKey = useDailyKey ? dailyKey : lifetimeKey;
  const complete = isQuestComplete({
    questId: params.questId,
    daily,
    lifetime,
  });
  if (!complete) {
    return {
      success: false,
      reason: 'Quest not complete.',
      rewardCoins: 0,
      profile: currentProfile,
      inventory: currentInventory,
    };
  }

  const reward = getQuestReward(params.questId);
  const claimed = await markClaimed(claimKey, params.questId);
  if (!claimed) {
    const [latestProfile, latestInventory] = await Promise.all([
      getUserProfile(params.userId),
      getInventory(params.userId),
    ]);
    return {
      success: false,
      reason: 'Quest already claimed.',
      rewardCoins: 0,
      profile: latestProfile,
      inventory: latestInventory,
    };
  }
  try {
    const [latestProfile, latestInventory] = await Promise.all([
      getUserProfile(params.userId),
      getInventory(params.userId),
    ]);
    const unlockedFlairs =
      reward.flair && !latestProfile.unlockedFlairs.includes(reward.flair)
        ? [...latestProfile.unlockedFlairs, reward.flair]
        : latestProfile.unlockedFlairs;
    const profile = {
      ...latestProfile,
      coins: latestProfile.coins + reward.coins,
      questsCompleted: latestProfile.questsCompleted + 1,
      unlockedFlairs,
      activeFlair: latestProfile.activeFlair,
    };
    const inventory = {
      ...latestInventory,
      hammer: latestInventory.hammer + (reward.inventory.hammer ?? 0),
      wand: latestInventory.wand + (reward.inventory.wand ?? 0),
      shield: latestInventory.shield + (reward.inventory.shield ?? 0),
      rocket: latestInventory.rocket + (reward.inventory.rocket ?? 0),
    };
    await Promise.all([
      saveUserProfile(params.userId, profile),
      saveInventory(params.userId, inventory),
    ]);
    return {
      success: true,
      reason: null,
      rewardCoins: reward.coins,
      profile,
      inventory,
    };
  } catch (error) {
    await redis.hDel(claimKey, [claimField(params.questId)]);
    throw error;
  }
};
