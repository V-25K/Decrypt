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
  saveDailyQuestProgress,
  saveLifetimeQuestProgress,
} from './state';
import {
  keyKnownUsersIndex,
  keyQuestClaimCount,
  keyUserInventory,
  keyUserProfile,
  keyUserQuestDaily,
  keyUserQuestLifetime,
} from './keys';
import { grantCoins } from './wallet';
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
  // True when the player ran out of mistakes and paid to keep the board going.
  // A continue resets mistakesMade to 0, so a continued clear must never count
  // as flawless / Clean Sheet (it always followed a maxed-out mistake count).
  continued: boolean;
}): Promise<void> => {
  const lifetime = await getLifetimeQuestProgress(params.userId);
  const isOfficialDailyClear = params.mode === 'daily' && params.isCurrentDaily;
  // "First Clear" stays anchored to the official daily, but the style quests
  // (Quick Clear / Clean Sheet / Bare Hands) complete on ANY genuine clear:
  // the official daily, an endless-catalog level, an older daily from the
  // archive, or a player-created community challenge. Community posts load in
  // mode 'daily' with isCurrentDaily=false (their puzzle source is COMMUNITY,
  // never the daily pointer), so the style flags can't be gated on mode /
  // isCurrentDaily — we always read today's daily progress and credit them.
  // Replays are rejected upstream by the completion repeat-guards, so every
  // clear that reaches here is a fresh clear.
  const daily = await getDailyQuestProgress(params.userId, params.dateKey);

  if (isOfficialDailyClear) {
    daily.dailyPlayCount += 1;
  }
  if (!params.isRecoveryRun && params.solveSeconds <= 180) {
    daily.dailyFastWin = true;
  }
  if (!params.isRecoveryRun && params.usedPowerups === 0) {
    daily.dailyNoPowerup = true;
  }
  if (!params.isRecoveryRun && !params.continued && params.mistakes === 0) {
    daily.dailyNoMistake = true;
  }

  lifetime.lifetimeWordsmith += params.solvedWords;
  if (params.isLogical) {
    lifetime.lifetimeLogicalSolved += 1;
  }
  if (params.mistakes === 0 && !params.continued) {
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
    const profileKey = keyUserProfile(params.userId);
    const inventoryKey = keyUserInventory(params.userId);

    // Read current state once: used for the flair-append decision and to build
    // the response from known deltas (no extra read after the writes).
    const [latestProfile, latestInventory] = await Promise.all([
      getUserProfile(params.userId),
      getInventory(params.userId),
    ]);

    // Coins via atomic grant; questsCompleted via atomic increment. Never a
    // full-profile overwrite — that would clobber a concurrent wallet mutation.
    await grantCoins(params.userId, reward.coins);
    await redis.hIncrBy(profileKey, 'questsCompleted', 1);

    // Inventory rewards: per-item atomic increments (the same primitive
    // purchases use), so a concurrent purchase is never clobbered.
    const inventoryReward: Array<[keyof Inventory, number]> = [
      ['hammer', reward.inventory.hammer ?? 0],
      ['wand', reward.inventory.wand ?? 0],
      ['shield', reward.inventory.shield ?? 0],
      ['rocket', reward.inventory.rocket ?? 0],
    ];
    for (const [item, delta] of inventoryReward) {
      if (delta > 0) {
        await redis.hIncrBy(inventoryKey, item, delta);
      }
    }

    // Flair unlock: narrow append-only field write (never auto-equipped).
    const unlockedFlairs =
      reward.flair && !latestProfile.unlockedFlairs.includes(reward.flair)
        ? [...latestProfile.unlockedFlairs, reward.flair]
        : latestProfile.unlockedFlairs;
    if (reward.flair && unlockedFlairs !== latestProfile.unlockedFlairs) {
      await redis.hSet(profileKey, {
        unlockedFlairs: JSON.stringify(unlockedFlairs),
      });
    }

    // Build the response from known deltas — coins/questsCompleted/inventory all
    // changed by exactly the reward amounts above.
    const profile: UserProfile = {
      ...latestProfile,
      coins: latestProfile.coins + reward.coins,
      questsCompleted: latestProfile.questsCompleted + 1,
      unlockedFlairs,
      activeFlair: latestProfile.activeFlair,
    };
    const inventory: Inventory = {
      ...latestInventory,
      hammer: latestInventory.hammer + (reward.inventory.hammer ?? 0),
      wand: latestInventory.wand + (reward.inventory.wand ?? 0),
      shield: latestInventory.shield + (reward.inventory.shield ?? 0),
      rocket: latestInventory.rocket + (reward.inventory.rocket ?? 0),
    };
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

/**
 * Claims every completed-but-unclaimed DAILY quest for a given dateKey. Built
 * on claimQuest, so each grant stays idempotent (hSetNX) — re-running is safe.
 * The completed/unclaimed pre-filter means that once a day is fully claimed
 * this is just two reads with no writes.
 */
export const autoClaimDailyQuestsForDate = async (params: {
  userId: string;
  dateKey: string;
}): Promise<{ autoClaimedQuestIds: string[]; rewardCoins: number }> => {
  const [daily, claimedIds] = await Promise.all([
    getDailyQuestProgress(params.userId, params.dateKey),
    getClaimedQuestIds({ userId: params.userId, dateKey: params.dateKey }),
  ]);
  const claimable = questCatalog.filter(
    (quest) =>
      quest.category === 'daily' &&
      !claimedIds.includes(quest.id) &&
      isQuestDefinitionComplete(quest, daily)
  );
  const autoClaimedQuestIds: string[] = [];
  let rewardCoins = 0;
  // Sequential: each claimQuest read-modify-writes the profile.
  for (const quest of claimable) {
    const result = await claimQuest({
      userId: params.userId,
      dateKey: params.dateKey,
      questId: quest.id,
    });
    if (result.success) {
      autoClaimedQuestIds.push(quest.id);
      rewardCoins += result.rewardCoins;
    }
  }
  return { autoClaimedQuestIds, rewardCoins };
};

/**
 * Auto-claims daily rewards the player completed but never claimed before the
 * date rolled over. Daily quest progress is keyed by dateKey (90-day TTL) and
 * the rollover is lazy, so yesterday's unclaimed completions are otherwise
 * unreachable. We sweep the user's LAST ACTIVE day when it predates today —
 * that's the only day that can hold completed-unclaimed dailies. dateKeys are
 * `YYYY-MM-DD`, so a string compare is chronological.
 */
export const autoClaimMissedDailyRewards = async (
  userId: string,
  today: string
): Promise<{ autoClaimedQuestIds: string[]; rewardCoins: number }> => {
  const profile = await getUserProfile(userId);
  const last = profile.lastPlayedDateKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last) || last >= today) {
    return { autoClaimedQuestIds: [], rewardCoins: 0 };
  }
  return autoClaimDailyQuestsForDate({ userId, dateKey: last });
};
