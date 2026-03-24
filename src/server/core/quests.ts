import type { Inventory, QuestProgress, UserProfile } from '../../shared/game';
import {
  isQuestDefinitionComplete,
  questCatalogById,
  type QuestReward,
} from '../../shared/quests';
import {
  getDailyQuestProgress,
  getLifetimeQuestProgress,
  saveDailyQuestProgress,
  saveLifetimeQuestProgress,
} from './state';
import { keyUserQuestDaily, keyUserQuestLifetime } from './keys';
import { redis } from '@devvit/web/server';

const claimField = (questId: string) => `claim:${questId}`;

const isClaimed = async (key: string, questId: string): Promise<boolean> => {
  const value = await redis.hGet(key, claimField(questId));
  return value === '1';
};

const markClaimed = async (key: string, questId: string): Promise<void> => {
  await redis.hSet(key, {
    [claimField(questId)]: '1',
  });
};

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
}): Promise<void> => {
  const daily = await getDailyQuestProgress(params.userId, params.dateKey);
  const lifetime = await getLifetimeQuestProgress(params.userId);

  if (params.mode === 'daily') {
    daily.dailyPlayCount += 1;
    if (params.solveSeconds <= 120) {
      daily.dailyFastWin = true;
    }
    if (params.solveSeconds <= 300) {
      daily.dailyUnder5Min = true;
    }
    if (params.usedPowerups === 0) {
      daily.dailyNoPowerup = true;
    }
    if (params.mistakes === 0) {
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

  await saveDailyQuestProgress(params.userId, params.dateKey, daily);
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
  profile: UserProfile;
  inventory: Inventory;
}): Promise<{
  success: boolean;
  reason: string | null;
  rewardCoins: number;
  profile: UserProfile;
  inventory: Inventory;
}> => {
  const daily = await getDailyQuestProgress(params.userId, params.dateKey);
  const lifetime = await getLifetimeQuestProgress(params.userId);
  const dailyKey = keyUserQuestDaily(params.userId, params.dateKey);
  const lifetimeKey = keyUserQuestLifetime(params.userId);

  const useDailyKey = params.questId.startsWith('daily_');
  const claimKey = useDailyKey ? dailyKey : lifetimeKey;
  const alreadyClaimed = await isClaimed(claimKey, params.questId);
  if (alreadyClaimed) {
    return {
      success: false,
      reason: 'Quest already claimed.',
      rewardCoins: 0,
      profile: params.profile,
      inventory: params.inventory,
    };
  }

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
      profile: params.profile,
      inventory: params.inventory,
    };
  }

  const reward = getQuestReward(params.questId);
  const unlockedFlairs =
    reward.flair && !params.profile.unlockedFlairs.includes(reward.flair)
      ? [...params.profile.unlockedFlairs, reward.flair]
      : params.profile.unlockedFlairs;
  const profile = {
    ...params.profile,
    coins: params.profile.coins + reward.coins,
    questsCompleted: params.profile.questsCompleted + 1,
    unlockedFlairs,
    activeFlair: params.profile.activeFlair,
  };
  const inventory = {
    ...params.inventory,
    hammer: params.inventory.hammer + (reward.inventory.hammer ?? 0),
    wand: params.inventory.wand + (reward.inventory.wand ?? 0),
    shield: params.inventory.shield + (reward.inventory.shield ?? 0),
    rocket: params.inventory.rocket + (reward.inventory.rocket ?? 0),
  };

  await markClaimed(claimKey, params.questId);

  return {
    success: true,
    reason: null,
    rewardCoins: reward.coins,
    profile,
    inventory,
  };
};
