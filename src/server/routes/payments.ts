import { Hono } from 'hono';
import type { PaymentHandlerResponse } from '@devvit/web/server';
import { context, redis } from '@devvit/web/server';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';
import {
  claimOneTimeSku,
  markSkuPurchased,
  releaseOneTimeClaim,
  unmarkSkuPurchased,
} from '../core/state';
import {
  getBundlePerks,
  getInfiniteHeartsDurationMs,
  isOneTimeOfferSku,
} from '../../shared/store';
import type { Inventory, UserProfile } from '../../shared/game';
import { addHeartsFromBundle, normalizeHearts } from '../core/hearts';
import { heartsPerRun } from '../core/constants';
import {
  keyGrantedOrderSkus,
  keyOrderGrantRecord,
  keyPaymentOrderIndex,
  keyProcessedOrder,
  keyRefundProcessedOrder,
  keyUserInventory,
  keyUserProfile,
} from '../core/keys';
import {
  updateQuestProgressOnPurchase,
  updateQuestProgressOnRefund,
} from '../core/quests';
import { numberFromHash } from '../core/hash';

type PaymentOrderProduct = {
  sku: string;
};

type PaymentOrderPayload = {
  id: string | null;
  userId: string | null;
  status: number | string | null;
  products: PaymentOrderProduct[];
};

type OrderGrantRecordStatus = 'in_progress' | 'fulfilled' | 'refunded';

type OrderGrantRecord = {
  userId: string;
  grantedSkus: string[];
  markedOneTimeSkus: string[];
  status: OrderGrantRecordStatus;
  fulfilledAt: number | null;
  refundedAt: number | null;
  updatedAt: number;
};

const orderRecordRetentionMs = 30 * 24 * 60 * 60 * 1000;

const orderRecordExpiration = (): Date =>
  new Date(Date.now() + orderRecordRetentionMs);

const trackPaymentOrderId = async (orderId: string): Promise<void> => {
  await redis.hSet(keyPaymentOrderIndex, {
    [orderId]: '1',
  });
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error.';

const defaultPaymentProfileSnapshot = (): UserProfile => ({
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
	  globalRating: 500,
	  globalScore: 0,
	  ratingGames: 0,
	  ratingWins: 0,
	  ratingLosses: 0,
	  globalWinStreak: 0,
	  bestGlobalRank: 0,
	  bestOverallRank: 0,
  audioEnabled: true,
  themePreference: 'default',
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const defaultPaymentInventorySnapshot = (): Inventory => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
});

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
};

const parseOrderGrantRecord = (value: unknown): OrderGrantRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const userId =
    'userId' in value && typeof value.userId === 'string' && value.userId.trim().length > 0
      ? value.userId
      : null;
  const status =
    'status' in value &&
    (value.status === 'in_progress' ||
      value.status === 'fulfilled' ||
      value.status === 'refunded')
      ? value.status
      : null;
  if (!userId || !status) {
    return null;
  }

  const fulfilledAt =
    'fulfilledAt' in value &&
    (typeof value.fulfilledAt === 'number' || value.fulfilledAt === null)
      ? value.fulfilledAt
      : null;
  const refundedAt =
    'refundedAt' in value &&
    (typeof value.refundedAt === 'number' || value.refundedAt === null)
      ? value.refundedAt
      : null;
  const updatedAt =
    'updatedAt' in value && typeof value.updatedAt === 'number' ? value.updatedAt : Date.now();

  return {
    userId,
    grantedSkus:
      'grantedSkus' in value ? parseStringArray(value.grantedSkus) : [],
    markedOneTimeSkus:
      'markedOneTimeSkus' in value ? parseStringArray(value.markedOneTimeSkus) : [],
    status,
    fulfilledAt,
    refundedAt,
    updatedAt,
  };
};

const buildOrderGrantRecord = (params: {
  userId: string;
  status: OrderGrantRecordStatus;
  grantedSkus?: string[];
  markedOneTimeSkus?: string[];
  fulfilledAt?: number | null;
  refundedAt?: number | null;
}): OrderGrantRecord => ({
  userId: params.userId,
  grantedSkus: params.grantedSkus ?? [],
  markedOneTimeSkus: params.markedOneTimeSkus ?? [],
  status: params.status,
  fulfilledAt: params.fulfilledAt ?? null,
  refundedAt: params.refundedAt ?? null,
  updatedAt: Date.now(),
});

const persistOrderGrantRecord = async (
  orderId: string,
  record: OrderGrantRecord
): Promise<void> => {
  await trackPaymentOrderId(orderId);
  await redis.set(keyOrderGrantRecord(orderId), JSON.stringify(record), {
    expiration: orderRecordExpiration(),
  });
};

const setLegacyGrantedSkus = async (
  orderId: string,
  grantedSkus: string[]
): Promise<void> => {
  await trackPaymentOrderId(orderId);
  await redis.set(keyGrantedOrderSkus(orderId), JSON.stringify(grantedSkus), {
    expiration: orderRecordExpiration(),
  });
};

const getStoredOrderGrantRecord = async (
  orderId: string
): Promise<OrderGrantRecord | null> => {
  const raw = await redis.get(keyOrderGrantRecord(orderId));
  if (!raw) {
    return null;
  }
  try {
    return parseOrderGrantRecord(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
};

const getLegacyOrderGrantRecord = async (params: {
  orderId: string;
  userId: string;
}): Promise<OrderGrantRecord | null> => {
  const raw = await redis.get(keyGrantedOrderSkus(params.orderId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const grantedSkus = parseStringArray(parsed);
    if (grantedSkus.length === 0) {
      return null;
    }
    return buildOrderGrantRecord({
      userId: params.userId,
      status: 'fulfilled',
      grantedSkus,
      markedOneTimeSkus: grantedSkus.filter((sku) => isOneTimeOfferSku(sku)),
    });
  } catch (_error) {
    return null;
  }
};

const getOrderGrantRecord = async (params: {
  orderId: string;
  userId: string;
}): Promise<OrderGrantRecord | null> => {
  const stored = await getStoredOrderGrantRecord(params.orderId);
  if (stored) {
    return stored;
  }
  return await getLegacyOrderGrantRecord(params);
};

const rollbackGrantedEntitlements = async (params: {
  userId: string;
  grantedSkus: string[];
  markedOneTimeSkus: string[];
}): Promise<void> => {
  const rollbackErrors: string[] = [];

  for (const sku of [...params.grantedSkus].reverse()) {
    try {
      await revokeBundle({ userId: params.userId, sku });
    } catch (error) {
      rollbackErrors.push(`revoke ${sku}: ${describeError(error)}`);
    }
  }

  for (const sku of [...params.markedOneTimeSkus].reverse()) {
    try {
      await unmarkSkuPurchased(params.userId, sku);
    } catch (error) {
      rollbackErrors.push(`unmark ${sku}: ${describeError(error)}`);
    }
  }

  if (rollbackErrors.length > 0) {
    throw new Error(`Rollback failed: ${rollbackErrors.join('; ')}`);
  }
};

const restoreRefundedEntitlements = async (params: {
  userId: string;
  revokedSkus: string[];
  markedOneTimeSkus: string[];
}): Promise<void> => {
  const restoreErrors: string[] = [];

  for (const sku of params.revokedSkus) {
    try {
      await applyBundle({ userId: params.userId, sku });
    } catch (error) {
      restoreErrors.push(`restore ${sku}: ${describeError(error)}`);
    }
  }

  for (const sku of params.markedOneTimeSkus) {
    try {
      await markSkuPurchased(params.userId, sku);
    } catch (error) {
      restoreErrors.push(`remark ${sku}: ${describeError(error)}`);
    }
  }

  if (restoreErrors.length > 0) {
    throw new Error(`Refund rollback failed: ${restoreErrors.join('; ')}`);
  }
};

const readPaymentProfileSnapshot = async (
  userId: string
): Promise<UserProfile> => {
  const fallback = defaultPaymentProfileSnapshot();
  const hash = await redis.hGetAll(keyUserProfile(userId));
  if (Object.keys(hash).length === 0) {
    return fallback;
  }

  return {
    ...fallback,
    coins: numberFromHash(hash, 'coins', fallback.coins),
    hearts: numberFromHash(hash, 'hearts', fallback.hearts),
    lastHeartRefillTs: numberFromHash(
      hash,
      'lastHeartRefillTs',
      fallback.lastHeartRefillTs
    ),
    infiniteHeartsExpiryTs: numberFromHash(
      hash,
      'infiniteHeartsExpiryTs',
      fallback.infiniteHeartsExpiryTs
    ),
  };
};

const readPaymentInventorySnapshot = async (
  userId: string
): Promise<Inventory> => {
  const fallback = defaultPaymentInventorySnapshot();
  const hash = await redis.hGetAll(keyUserInventory(userId));
  if (Object.keys(hash).length === 0) {
    return fallback;
  }

  return {
    hammer: numberFromHash(hash, 'hammer', fallback.hammer),
    wand: numberFromHash(hash, 'wand', fallback.wand),
    shield: numberFromHash(hash, 'shield', fallback.shield),
    rocket: numberFromHash(hash, 'rocket', fallback.rocket),
  };
};

const applyBundle = async (params: {
  userId: string;
  sku: string;
}): Promise<void> => {
  const profileKey = keyUserProfile(params.userId);
  const inventoryKey = keyUserInventory(params.userId);
  const perks = getBundlePerks(params.sku);
  const durationMs = getInfiniteHeartsDurationMs(params.sku);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await redis.watch(profileKey, inventoryKey);
    const [profile, inventory] = await Promise.all([
      readPaymentProfileSnapshot(params.userId),
      readPaymentInventorySnapshot(params.userId),
    ]);

    const updatedProfile = { ...profile };
    const updatedInventory = { ...inventory };
    const nowTs = Date.now();
    const normalizedProfile = normalizeHearts(updatedProfile, nowTs);
    updatedProfile.hearts = normalizedProfile.hearts;
    updatedProfile.lastHeartRefillTs = normalizedProfile.lastHeartRefillTs;
    updatedProfile.coins += perks.coins;
    const profileWithBundleHearts = addHeartsFromBundle(updatedProfile, perks.hearts, nowTs);
    updatedProfile.hearts = profileWithBundleHearts.hearts;
    updatedProfile.lastHeartRefillTs = profileWithBundleHearts.lastHeartRefillTs;
    updatedInventory.hammer += perks.hammer;
    updatedInventory.wand += perks.wand;
    updatedInventory.shield += perks.shield;
    updatedInventory.rocket += perks.rocket;

    if (durationMs > 0) {
      const baseTs = Math.max(nowTs, updatedProfile.infiniteHeartsExpiryTs);
      const nextExpiryTs = Math.min(baseTs + durationMs, nowTs + 24 * 60 * 60 * 1000);
      updatedProfile.infiniteHeartsExpiryTs = nextExpiryTs;
      updatedProfile.hearts = heartsPerRun;
      updatedProfile.lastHeartRefillTs = nowTs;
    }

    await tx.multi();
    // Re-implement save logic in the transaction context
    const normalizedToSave = normalizeHearts(updatedProfile); // Re-use normalization
    await tx.hSet(profileKey, {
      coins: `${normalizedToSave.coins}`,
      hearts: `${normalizedToSave.hearts}`,
      lastHeartRefillTs: `${normalizedToSave.lastHeartRefillTs}`,
      infiniteHeartsExpiryTs: `${normalizedToSave.infiniteHeartsExpiryTs}`,
    });
    await tx.hSet(inventoryKey, {
      hammer: `${updatedInventory.hammer}`,
      wand: `${updatedInventory.wand}`,
      shield: `${updatedInventory.shield}`,
      rocket: `${updatedInventory.rocket}`,
    });

    const execResult = await tx.exec();
    if (execResult !== null && execResult !== undefined) {
      return;
    }
  }
  throw new Error(`Optimistic lock failed after 3 attempts applying bundle ${params.sku}`);
};

const revokeBundle = async (params: {
  userId: string;
  sku: string;
}): Promise<void> => {
  const profileKey = keyUserProfile(params.userId);
  const inventoryKey = keyUserInventory(params.userId);
  const perks = getBundlePerks(params.sku);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await redis.watch(profileKey, inventoryKey);
    const [profile, inventory] = await Promise.all([
      readPaymentProfileSnapshot(params.userId),
      readPaymentInventorySnapshot(params.userId),
    ]);

    const updatedProfile = { ...profile };
    const updatedInventory = { ...inventory };
    const nowTs = Date.now();
    const normalizedProfile = normalizeHearts(updatedProfile, nowTs);
    updatedProfile.hearts = normalizedProfile.hearts;
    updatedProfile.lastHeartRefillTs = normalizedProfile.lastHeartRefillTs;
    updatedProfile.coins = Math.max(0, updatedProfile.coins - perks.coins);
    updatedProfile.hearts = Math.max(0, updatedProfile.hearts - perks.hearts);
    updatedInventory.hammer = Math.max(0, updatedInventory.hammer - perks.hammer);
    updatedInventory.wand = Math.max(0, updatedInventory.wand - perks.wand);
    updatedInventory.shield = Math.max(0, updatedInventory.shield - perks.shield);
    updatedInventory.rocket = Math.max(0, updatedInventory.rocket - perks.rocket);

    if (perks.infiniteHeartsHours > 0) {
      const rollbackMs = perks.infiniteHeartsHours * 60 * 60 * 1000;
      updatedProfile.infiniteHeartsExpiryTs =
        updatedProfile.infiniteHeartsExpiryTs <= nowTs
          ? 0
          : Math.max(0, updatedProfile.infiniteHeartsExpiryTs - rollbackMs);
    }

    await tx.multi();
    const normalizedToSave = normalizeHearts(updatedProfile);
    await tx.hSet(profileKey, {
      coins: `${normalizedToSave.coins}`,
      hearts: `${normalizedToSave.hearts}`,
      lastHeartRefillTs: `${normalizedToSave.lastHeartRefillTs}`,
      infiniteHeartsExpiryTs: `${normalizedToSave.infiniteHeartsExpiryTs}`,
    });
    await tx.hSet(inventoryKey, {
      hammer: `${updatedInventory.hammer}`,
      wand: `${updatedInventory.wand}`,
      shield: `${updatedInventory.shield}`,
      rocket: `${updatedInventory.rocket}`,
    });

    const execResult = await tx.exec();
    if (execResult !== null && execResult !== undefined) {
      return;
    }
  }
  throw new Error(`Optimistic lock failed after 3 attempts revoking bundle ${params.sku}`);
};

export const paymentsRoutes = new Hono();

const parseOrderPayload = (value: unknown): PaymentOrderPayload => {
  if (!value || typeof value !== 'object') {
    return {
      id: null,
      userId: null,
      status: null,
      products: [],
    };
  }

  const id = 'id' in value && typeof value.id === 'string' ? value.id : null;
  const userId =
    'userId' in value && typeof value.userId === 'string' ? value.userId : null;
  const status =
    'status' in value && (typeof value.status === 'number' || typeof value.status === 'string')
      ? value.status
      : null;
  const products =
    'products' in value && Array.isArray(value.products)
      ? value.products
          .map((product) => {
            if (!product || typeof product !== 'object') {
              return null;
            }
            return 'sku' in product && typeof product.sku === 'string'
              ? { sku: product.sku }
              : null;
          })
          .filter((product): product is PaymentOrderProduct => product !== null)
      : [];

  return {
    id,
    userId,
    status,
    products,
  };
};

const orderIsFulfillable = (order: PaymentOrderPayload): boolean => {
  if (order.status === OrderStatus.ORDER_STATUS_PAID) {
    return true;
  }
  if (order.status === OrderStatus.ORDER_STATUS_DELIVERED) {
    return true;
  }
  if (typeof order.status === 'string') {
    const normalized = order.status.trim().toUpperCase();
    return normalized === 'PAID' || normalized === 'DELIVERED';
  }
  return false;
};

const getOrderUserId = (order: PaymentOrderPayload): string | null => {
  if (typeof order.userId === 'string' && order.userId.trim().length > 0) {
    return order.userId;
  }
  if (typeof context.userId === 'string' && context.userId.trim().length > 0) {
    return context.userId;
  }
  return null;
};

paymentsRoutes.post('/fulfill', async (c) => {
  try {
    const order = parseOrderPayload(await c.req.json());
    const userId = getOrderUserId(order);
    if (!userId) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Missing user context.' },
        400
      );
    }
    if (!order.id) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Missing order ID.' },
        400
      );
    }
    if (!orderIsFulfillable(order)) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Order is not paid.' },
        200
      );
    }

    const existingRecord = await getOrderGrantRecord({
      orderId: order.id,
      userId,
    });
    if (existingRecord?.status === 'fulfilled' || existingRecord?.status === 'refunded') {
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }
    if (existingRecord?.status === 'in_progress') {
      await rollbackGrantedEntitlements({
        userId: existingRecord.userId,
        grantedSkus: existingRecord.grantedSkus,
        markedOneTimeSkus: existingRecord.markedOneTimeSkus,
      });
      await Promise.all([
        redis.del(keyOrderGrantRecord(order.id)),
        redis.del(keyGrantedOrderSkus(order.id)),
        redis.del(keyProcessedOrder(order.id)),
      ]);
    }

    const initialRecord = buildOrderGrantRecord({
      userId,
      status: 'in_progress',
    });
    await trackPaymentOrderId(order.id);
    const claimed = await redis.set(
      keyOrderGrantRecord(order.id),
      JSON.stringify(initialRecord),
      {
        expiration: orderRecordExpiration(),
        nx: true,
      }
    );
    if (!claimed) {
      const concurrentRecord = await getOrderGrantRecord({
        orderId: order.id,
        userId,
      });
      if (
        concurrentRecord?.status === 'fulfilled' ||
        concurrentRecord?.status === 'refunded'
      ) {
        return c.json<PaymentHandlerResponse>({ success: true }, 200);
      }
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Fulfillment is already in progress.' },
        200
      );
    }

    let currentRecord = initialRecord;
    const grantedSkus: string[] = [];
    const markedOneTimeSkus: string[] = [];
    const claimedOneTimeSkus: string[] = [];

    try {
      for (const product of order.products) {
        const sku = product.sku;

        if (isOneTimeOfferSku(sku)) {
          // Per-(user, sku) guard. claimOneTimeSku first checks the durable
          // `hasPurchasedSku` hash record (set by markSkuPurchased after a prior
          // successful grant) and then NX-locks the in-flight slot, so it covers
          // BOTH the "already owned on an earlier order" case and the concurrent
          // "two distinct orders racing" case.
          //
          // We intentionally do NOT consult payments.getOrders() here: in this
          // Devvit version every getOrders filter (sku, buyer, status, metadata)
          // is annotated "@experimental - This currently does nothing", so a
          // getOrders-based check cannot reliably scope to (user, sku) and would
          // produce false positives that deny a legitimately-paid distinct
          // one-time SKU. The Redis record + NX lock are the authoritative guard.
          const claim = await claimOneTimeSku(userId, sku);
          if (claim.alreadyOwned) {
            continue;
          }
          if (!claim.claimed) {
            throw new Error(
              `Another fulfillment is in progress for one-time SKU ${sku}; retry shortly.`
            );
          }
          claimedOneTimeSkus.push(sku);
        }

        await applyBundle({
          userId,
          sku,
        });
        grantedSkus.push(sku);
        currentRecord = buildOrderGrantRecord({
          userId,
          status: 'in_progress',
          grantedSkus,
          markedOneTimeSkus,
        });
        await persistOrderGrantRecord(order.id, currentRecord);

        if (isOneTimeOfferSku(sku)) {
          await markSkuPurchased(userId, sku);
          markedOneTimeSkus.push(sku);
          // The hash field is now the authoritative record; release the in-flight
          // claim so subsequent orders for the same SKU short-circuit on
          // hasPurchasedSku immediately rather than waiting for the lock to expire.
          await releaseOneTimeClaim(userId, sku);
          currentRecord = buildOrderGrantRecord({
            userId,
            status: 'in_progress',
            grantedSkus,
            markedOneTimeSkus,
          });
          await persistOrderGrantRecord(order.id, currentRecord);
        }
      }

      if (grantedSkus.length > 0) {
        await updateQuestProgressOnPurchase({ userId });
      }

      currentRecord = buildOrderGrantRecord({
        userId,
        status: 'fulfilled',
        grantedSkus,
        markedOneTimeSkus,
        fulfilledAt: Date.now(),
      });
      await trackPaymentOrderId(order.id);
      await Promise.all([
        persistOrderGrantRecord(order.id, currentRecord),
        setLegacyGrantedSkus(order.id, grantedSkus),
        redis.set(keyProcessedOrder(order.id), '1', {
          expiration: orderRecordExpiration(),
        }),
      ]);
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    } catch (error) {
      try {
        await rollbackGrantedEntitlements({
          userId,
          grantedSkus,
          markedOneTimeSkus,
        });
        // Release any claims this invocation acquired but never marked (i.e.,
        // applyBundle/markSkuPurchased threw before commit). Best-effort: the
        // claim has a short TTL, so a failure here resolves itself within ~120s.
        const claimsToRelease = claimedOneTimeSkus.filter(
          (sku) => !markedOneTimeSkus.includes(sku)
        );
        for (const sku of claimsToRelease) {
          try {
            await releaseOneTimeClaim(userId, sku);
          } catch (_releaseError) {
            // Lock TTL bounds recovery; nothing else to do here.
          }
        }
        await Promise.all([
          redis.del(keyOrderGrantRecord(order.id)),
          redis.del(keyGrantedOrderSkus(order.id)),
          redis.del(keyProcessedOrder(order.id)),
        ]);
      } catch (rollbackError) {
        await persistOrderGrantRecord(order.id, currentRecord);
        throw new Error(
          `Fulfillment failed and rollback did not complete. ${describeError(
            error
          )} ${describeError(rollbackError)}`
        );
      }
      throw error;
    }
  } catch (error) {
    return c.json<PaymentHandlerResponse>(
      {
        success: false,
        reason: error instanceof Error ? error.message : 'Fulfillment failed.',
      },
      400
    );
  }
});

paymentsRoutes.post('/refund', async (c) => {
  try {
    const order = parseOrderPayload(await c.req.json());
    const userId = getOrderUserId(order);
    if (!userId) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Missing user context.' },
        400
      );
    }
    if (!order.id) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Missing order ID.' },
        400
      );
    }

    const orderRecord = await getOrderGrantRecord({
      orderId: order.id,
      userId,
    });
    if (!orderRecord) {
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }
    if (orderRecord.status === 'refunded') {
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }
    if (orderRecord.status === 'in_progress') {
      await rollbackGrantedEntitlements({
        userId: orderRecord.userId,
        grantedSkus: orderRecord.grantedSkus,
        markedOneTimeSkus: orderRecord.markedOneTimeSkus,
      });
      await Promise.all([
        redis.del(keyOrderGrantRecord(order.id)),
        redis.del(keyGrantedOrderSkus(order.id)),
        redis.del(keyProcessedOrder(order.id)),
      ]);
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }

    await trackPaymentOrderId(order.id);
    const processedRefund = await redis.set(keyRefundProcessedOrder(order.id), '1', {
      expiration: orderRecordExpiration(),
      nx: true,
    });
    if (!processedRefund) {
      const latestRecord = await getOrderGrantRecord({
        orderId: order.id,
        userId,
      });
      if (latestRecord?.status === 'refunded') {
        return c.json<PaymentHandlerResponse>({ success: true }, 200);
      }
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Refund is already in progress.' },
        200
      );
    }

    const revokedSkus: string[] = [];
    const unmarkedOneTimeSkus: string[] = [];

    try {
      const markedOneTimeSkuSet = new Set(orderRecord.markedOneTimeSkus);
      let totalCoinsRefunded = 0;

      for (const sku of orderRecord.grantedSkus) {
        const perks = getBundlePerks(sku);
        totalCoinsRefunded += perks.coins;
        await revokeBundle({ userId: orderRecord.userId, sku });
        revokedSkus.push(sku);
        if (markedOneTimeSkuSet.has(sku)) {
          await unmarkSkuPurchased(orderRecord.userId, sku);
          unmarkedOneTimeSkus.push(sku);
        }
      }

      if (orderRecord.grantedSkus.length > 0) {
        await updateQuestProgressOnRefund({
          userId: orderRecord.userId,
          coinsRefunded: totalCoinsRefunded,
        });
      }

      const refundedRecord = buildOrderGrantRecord({
        userId: orderRecord.userId,
        status: 'refunded',
        grantedSkus: orderRecord.grantedSkus,
        markedOneTimeSkus: orderRecord.markedOneTimeSkus,
        fulfilledAt: orderRecord.fulfilledAt,
        refundedAt: Date.now(),
      });

      await Promise.all([
        persistOrderGrantRecord(order.id, refundedRecord),
        redis.del(keyGrantedOrderSkus(order.id)),
        redis.del(keyProcessedOrder(order.id)),
        redis.del(keyRefundProcessedOrder(order.id)),
      ]);
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    } catch (error) {
      try {
        await restoreRefundedEntitlements({
          userId: orderRecord.userId,
          revokedSkus,
          markedOneTimeSkus: unmarkedOneTimeSkus,
        });
      } catch (restoreError) {
        await redis.del(keyRefundProcessedOrder(order.id));
        throw new Error(
          `Refund failed and rollback did not complete. ${describeError(
            error
          )} ${describeError(restoreError)}`
        );
      }

      await redis.del(keyRefundProcessedOrder(order.id));
      throw error;
    }
  } catch (error) {
    return c.json<PaymentHandlerResponse>(
      {
        success: false,
        reason: error instanceof Error ? error.message : 'Refund failed.',
      },
      400
    );
  }
});
