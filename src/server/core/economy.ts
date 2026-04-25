import { redis } from '@devvit/web/server';
import type { Inventory, PowerupType, UserProfile } from '../../shared/game';
import { getPowerupPrice } from '../../shared/game-balance';
import {
  coinHeartRefillCost,
  coinHeartTopUpCost,
  heartsPerRun,
  maxCoinHeartPurchasesPerDay,
} from './constants';
import {
  keyUserCoinHeartPurchases,
  keyUserInventory,
  keyUserProfile,
} from './keys';
import { formatDateKey } from './serde';
import { defaultUserProfile, getInventory, getUserProfile } from './state';
import { updateQuestProgressOnCoinSpend } from './quests';
import { normalizeHearts } from './hearts';
import { getSessionState } from './session';
import { getPuzzlePrivate } from './puzzle-store';

import { parseNumber, transactionCommitted } from './redis-util';

const maxOptimisticRetries = 3;

const countRemainingLetters = (params: {
  puzzle: NonNullable<Awaited<ReturnType<typeof getPuzzlePrivate>>>;
  revealedIndices: number[];
}): number => {
  const revealedSet = new Set(params.revealedIndices);
  return params.puzzle.tiles.filter(
    (tile) => tile.isLetter && !revealedSet.has(tile.index)
  ).length;
};

export const purchasePowerup = async (params: {
  userId: string;
  postId?: string;
  levelId: string;
  itemType: PowerupType;
  quantity?: number;
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
  inventory: Inventory;
}> => {
  const quantity = params.quantity ?? 1;
  if (!params.postId) {
    return {
      success: false,
      reason: 'Start the level before buying powerups.',
      profile: await getUserProfile(params.userId),
      inventory: await getInventory(params.userId),
    };
  }

  const [session, puzzle] = await Promise.all([
    getSessionState(params.userId, params.postId),
    getPuzzlePrivate(params.levelId),
  ]);
  if (!session || session.activeLevelId !== params.levelId) {
    return {
      success: false,
      reason: 'Powerup purchases require an active session for this level.',
      profile: await getUserProfile(params.userId),
      inventory: await getInventory(params.userId),
    };
  }
  if (!puzzle) {
    return {
      success: false,
      reason: 'Level data is unavailable.',
      profile: await getUserProfile(params.userId),
      inventory: await getInventory(params.userId),
    };
  }

  const totalCost =
    getPowerupPrice(params.itemType, {
      difficulty: puzzle.difficulty,
      remainingLetters: countRemainingLetters({
        puzzle,
        revealedIndices: session.revealedIndices,
      }),
    }) * quantity;
  const profileKey = keyUserProfile(params.userId);
  const inventoryKey = keyUserInventory(params.userId);

  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(profileKey, inventoryKey);
    const coins = parseNumber(await redis.hGet(profileKey, 'coins'), 0);
    if (coins < totalCost) {
      await tx.unwatch();
      return {
        success: false,
        reason: 'Not enough coins.',
        profile: await getUserProfile(params.userId),
        inventory: await getInventory(params.userId),
      };
    }

    await tx.multi();
    await tx.hIncrBy(profileKey, 'coins', -totalCost);
    await tx.hIncrBy(inventoryKey, params.itemType, quantity);
    const execResult = await tx.exec();
    if (!transactionCommitted(execResult)) {
      continue;
    }

    await updateQuestProgressOnCoinSpend({
      userId: params.userId,
      amount: totalCost,
    });

    return {
      success: true,
      reason: null,
      profile: await getUserProfile(params.userId),
      inventory: await getInventory(params.userId),
    };
  }

  return {
    success: false,
    reason: 'Purchase conflicted with another update. Please try again.',
    profile: await getUserProfile(params.userId),
    inventory: await getInventory(params.userId),
  };
};

export const consumePowerup = async (params: {
  userId: string;
  itemType: PowerupType;
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
  inventory: Inventory;
}> => {
  const inventoryKey = keyUserInventory(params.userId);

  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(inventoryKey);
    const count = parseNumber(await redis.hGet(inventoryKey, params.itemType), 0);
    if (count <= 0) {
      await tx.unwatch();
      return {
        success: false,
        reason: 'No inventory available.',
        profile: await getUserProfile(params.userId),
        inventory: await getInventory(params.userId),
      };
    }

    await tx.multi();
    await tx.hIncrBy(inventoryKey, params.itemType, -1);
    const execResult = await tx.exec();
    if (!transactionCommitted(execResult)) {
      continue;
    }

    return {
      success: true,
      reason: null,
      profile: await getUserProfile(params.userId),
      inventory: await getInventory(params.userId),
    };
  }

  return {
    success: false,
    reason: 'Inventory update conflicted. Please try again.',
    profile: await getUserProfile(params.userId),
    inventory: await getInventory(params.userId),
  };
};

const buildProfileSnapshot = (params: {
  coins: number;
  hearts: number;
  lastHeartRefillTs: number;
  infiniteHeartsExpiryTs: number;
}): UserProfile =>
  normalizeHearts({
    ...defaultUserProfile(),
    coins: params.coins,
    hearts: params.hearts,
    lastHeartRefillTs: params.lastHeartRefillTs,
    infiniteHeartsExpiryTs: params.infiniteHeartsExpiryTs,
  });

const purchaseCoinHeart = async (params: {
  userId: string;
  cost: number;
  purchaseType: 'refill' | 'topup';
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
}> => {
  const profileKey = keyUserProfile(params.userId);
  const dateKey = formatDateKey(new Date());
  const counterKey = keyUserCoinHeartPurchases(params.userId, dateKey);

  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(profileKey, counterKey);
    const [
      coinsRaw,
      heartsRaw,
      lastHeartRefillTsRaw,
      infiniteHeartsExpiryTsRaw,
      counterRaw,
    ] = await Promise.all([
      redis.hGet(profileKey, 'coins'),
      redis.hGet(profileKey, 'hearts'),
      redis.hGet(profileKey, 'lastHeartRefillTs'),
      redis.hGet(profileKey, 'infiniteHeartsExpiryTs'),
      redis.get(counterKey),
    ]);

    const profile = buildProfileSnapshot({
      coins: parseNumber(coinsRaw ?? undefined, 0),
      hearts: parseNumber(heartsRaw ?? undefined, heartsPerRun),
      lastHeartRefillTs: parseNumber(lastHeartRefillTsRaw ?? undefined, Date.now()),
      infiniteHeartsExpiryTs: parseNumber(
        infiniteHeartsExpiryTsRaw ?? undefined,
        0
      ),
    });
    const dailyPurchases = parseNumber(counterRaw ?? undefined, 0);

    if (profile.hearts >= heartsPerRun) {
      await tx.unwatch();
      return {
        success: false,
        reason: 'Hearts are already full.',
        profile: await getUserProfile(params.userId),
      };
    }

    if (profile.coins < params.cost) {
      await tx.unwatch();
      return {
        success: false,
        reason: 'Not enough coins.',
        profile: await getUserProfile(params.userId),
      };
    }

    if (dailyPurchases >= maxCoinHeartPurchasesPerDay) {
      await tx.unwatch();
      return {
        success: false,
        reason: `Daily limit reached (max ${maxCoinHeartPurchasesPerDay} coin heart purchases per day).`,
        profile: await getUserProfile(params.userId),
      };
    }

    const nextHearts =
      params.purchaseType === 'refill'
        ? heartsPerRun
        : Math.min(heartsPerRun, profile.hearts + 1);
    const now = Date.now();

    await tx.multi();
    await tx.hIncrBy(profileKey, 'coins', -params.cost);
    await tx.hSet(profileKey, {
      hearts: `${nextHearts}`,
      lastHeartRefillTs: `${now}`,
    });
    await tx.incrBy(counterKey, 1);
    await tx.expire(counterKey, 2 * 24 * 60 * 60);
    const execResult = await tx.exec();
    if (!transactionCommitted(execResult)) {
      continue;
    }

    await updateQuestProgressOnCoinSpend({
      userId: params.userId,
      amount: params.cost,
    });

    return {
      success: true,
      reason: null,
      profile: await getUserProfile(params.userId),
    };
  }

  return {
    success: false,
    reason: 'Purchase conflicted. Please try again.',
    profile: await getUserProfile(params.userId),
  };
};

export const purchaseCoinHeartRefill = async (params: {
  userId: string;
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
}> =>
  await purchaseCoinHeart({
    userId: params.userId,
    cost: coinHeartRefillCost,
    purchaseType: 'refill',
  });

export const purchaseCoinHeartTopUp = async (params: {
  userId: string;
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
}> =>
  await purchaseCoinHeart({
    userId: params.userId,
    cost: coinHeartTopUpCost,
    purchaseType: 'topup',
  });
