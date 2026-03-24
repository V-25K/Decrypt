import { redis } from '@devvit/web/server';
import type { Inventory, PowerupType, UserProfile } from '../../shared/game';
import { powerupCosts } from './constants';
import { keyUserInventory, keyUserProfile } from './keys';
import { getInventory, getUserProfile } from './state';
import { updateQuestProgressOnCoinSpend } from './quests';

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

export const purchasePowerup = async (params: {
  userId: string;
  itemType: PowerupType;
  quantity?: number;
}): Promise<{
  success: boolean;
  reason: string | null;
  profile: UserProfile;
  inventory: Inventory;
}> => {
  const quantity = params.quantity ?? 1;
  const cost = powerupCosts[params.itemType];
  const totalCost = cost * quantity;
  const profileKey = keyUserProfile(params.userId);
  const inventoryKey = keyUserInventory(params.userId);

  await getUserProfile(params.userId);
  await getInventory(params.userId);

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
  await tx.exec();

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
  await getInventory(params.userId);

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
  await tx.exec();

  return {
    success: true,
    reason: null,
    profile: await getUserProfile(params.userId),
    inventory: await getInventory(params.userId),
  };
};
