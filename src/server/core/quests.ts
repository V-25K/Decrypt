import type { Inventory, QuestProgress, UserProfile } from '../../shared/game';
import {
  isQuestDefinitionComplete,
  questCatalog,
  questCatalogById,
  type QuestReward,
} from '../../shared/quests';
import {
  getDailyQuestProgress,
  getInventory,
  getLifetimeQuestProgress,
  trackUserDailyDataDate,
  getUserProfile,
  saveInventory,
  saveDailyQuestProgress,
  saveUserProfile,
  saveLifetimeQuestProgress,
} from './state';
import {
  keyKnownUsersIndex,
  keyQuestClaimCount,
  keyUserQuestDaily,
  keyUserQuestLifetime,
} from './keys';
import { redis } from '@devvit/web/server';
import { dailyDataTtlSeconds } from './constants';

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
  const dailyKey = keyUserQuestDaily(params.userId, params.dateKey);
  await trackUserDailyDataDate(params.userId, params.dateKey);
  await Promise.all([
    redis.hIncrBy(dailyKey, 'dailyShareCount', 1),
    redis.expire(dailyKey, dailyDataTtlSeconds),
    redis.hIncrBy(keyUserQuestLifetime(params.userId), 'socialShareCount', 1),
  ]);
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
  coinsRefunded?: number;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimePurchases = Math.max(0, lifetime.lifetimePurchases - 1);
  if (params.coinsRefunded && params.coinsRefunded > 0) {
    lifetime.lifetimeCoinsSpent = Math.max(0, lifetime.lifetimeCoinsSpent - params.coinsRefunded);
  }
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

export const updateQuestProgressOnDailyTopRank = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimeDailyTopRanks += 1;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

// Credited once per community challenge that crosses the acclaim bar (see
// src/server/core/community.ts evaluateCommunityAcclaim).
export const updateQuestProgressOnAcclaim = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimeAcclaimedChallenges += 1;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

// Credited once per unique voter per level — the toggle-proof gate lives in
// recordCommunityVote (keyCommunityLevelLikedBy hSetNX).
export const updateQuestProgressOnCreatorLike = async (params: {
  userId: string;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  lifetime.lifetimeLikesReceived += 1;
  await saveLifetimeQuestProgress(params.userId, lifetime);
};

const milestoneQuestIds = questCatalog
  .filter((quest) => quest.category === 'milestone')
  .map((quest) => quest.id);

/**
 * "Achieved by X% of players" per milestone quest: claims counter over the
 * known-player count. Quests nobody has claimed are omitted so the client
 * shows nothing rather than a noisy 0%.
 */
const getMilestoneClaimPercents = async (): Promise<Record<string, number>> => {
  const [counts, totalPlayers] = await Promise.all([
    redis.mGet(milestoneQuestIds.map((questId) => keyQuestClaimCount(questId))),
    redis.hLen(keyKnownUsersIndex),
  ]);
  if (!totalPlayers || totalPlayers <= 0) {
    return {};
  }
  const percents: Record<string, number> = {};
  for (let index = 0; index < milestoneQuestIds.length; index += 1) {
    const questId = milestoneQuestIds[index];
    const claims = Number(counts[index] ?? 0) || 0;
    if (!questId || claims <= 0) {
      continue;
    }
    percents[questId] = Math.max(
      1,
      Math.min(100, Math.round((claims / totalPlayers) * 100))
    );
  }
  return percents;
};

export const getQuestStatus = async (params: {
  userId: string;
  dateKey: string;
}) => {
  const [daily, lifetime, milestoneClaimPercents] = await Promise.all([
    getDailyQuestProgress(params.userId, params.dateKey),
    getLifetimeQuestProgress(params.userId),
    getMilestoneClaimPercents(),
  ]);

  return {
    daily,
    lifetime,
    milestoneClaimPercents,
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
    // Feeds the "achieved by X% of players" stat; daily quests never show it,
    // so only milestone claims are counted.
    if (!useDailyKey) {
      await redis.incrBy(keyQuestClaimCount(params.questId), 1);
    }
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
