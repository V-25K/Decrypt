import { Hono } from 'hono';
import type { PaymentHandlerResponse } from '@devvit/web/server';
import { context, redis } from '@devvit/web/server';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';
import {
  getInventory,
  getUserProfile,
  hasPurchasedSku,
  markSkuPurchased,
  saveInventory,
  saveUserProfile,
  unmarkSkuPurchased,
} from '../core/state';
import { getBundlePerks, isOneTimeOfferSku } from '../../shared/store';
import { addHeartsFromBundle, normalizeHearts } from '../core/hearts';
import {
  keyGrantedOrderSkus,
  keyProcessedOrder,
  keyRefundProcessedOrder,
} from '../core/keys';
import {
  updateQuestProgressOnPurchase,
  updateQuestProgressOnRefund,
} from '../core/quests';

type PaymentOrderProduct = {
  sku: string;
};

type PaymentOrderPayload = {
  id: string | null;
  userId: string | null;
  status: number | null;
  products: PaymentOrderProduct[];
};

const applyBundle = async (params: {
  userId: string;
  sku: string;
}): Promise<void> => {
  const [profile, inventory] = await Promise.all([
    getUserProfile(params.userId),
    getInventory(params.userId),
  ]);

  const updatedProfile = { ...profile };
  const updatedInventory = { ...inventory };
  const perks = getBundlePerks(params.sku);
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
  if (perks.infiniteHeartsHours > 0) {
    updatedProfile.infiniteHeartsExpiryTs = Math.max(
      updatedProfile.infiniteHeartsExpiryTs,
      nowTs + perks.infiniteHeartsHours * 60 * 60 * 1000
    );
  }

  await Promise.all([
    saveUserProfile(params.userId, updatedProfile),
    saveInventory(params.userId, updatedInventory),
  ]);
};

const revokeBundle = async (params: {
  userId: string;
  sku: string;
}): Promise<void> => {
  const [profile, inventory] = await Promise.all([
    getUserProfile(params.userId),
    getInventory(params.userId),
  ]);

  const updatedProfile = { ...profile };
  const updatedInventory = { ...inventory };
  const perks = getBundlePerks(params.sku);
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
        : Math.max(nowTs, updatedProfile.infiniteHeartsExpiryTs - rollbackMs);
  }

  await Promise.all([
    saveUserProfile(params.userId, updatedProfile),
    saveInventory(params.userId, updatedInventory),
  ]);
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
    'status' in value && typeof value.status === 'number'
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

const orderIsFulfillable = (order: PaymentOrderPayload): boolean =>
  order.status === OrderStatus.ORDER_STATUS_PAID ||
  order.status === OrderStatus.ORDER_STATUS_DELIVERED;

const grantedSkusFromOrder = (order: PaymentOrderPayload): string[] =>
  order.products
    .map((product) => product.sku)
    .filter((sku): sku is string => typeof sku === 'string' && sku.trim().length > 0);

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
    const processedOrderKey = keyProcessedOrder(order.id);
    const processed = await redis.set(processedOrderKey, '1', {
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nx: true,
    });
    if (!processed) {
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }
    try {
      let fulfilledAny = false;
      const grantedSkus: string[] = [];
      for (const product of order.products) {
        if (
          isOneTimeOfferSku(product.sku) &&
          (await hasPurchasedSku(userId, product.sku))
        ) {
          continue;
        }
        await applyBundle({
          userId,
          sku: product.sku,
        });
        fulfilledAny = true;
        grantedSkus.push(product.sku);
        if (isOneTimeOfferSku(product.sku)) {
          await markSkuPurchased(userId, product.sku);
        }
      }
      if (fulfilledAny) {
        await redis.set(keyGrantedOrderSkus(order.id), JSON.stringify(grantedSkus), {
          expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        await updateQuestProgressOnPurchase({ userId });
      }
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    } catch (error) {
      await redis.del(processedOrderKey);
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

    const processedRefund = await redis.set(keyRefundProcessedOrder(order.id), '1', {
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nx: true,
    });
    if (!processedRefund) {
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    }

    try {
      const grantedRaw = await redis.get(keyGrantedOrderSkus(order.id));
      const grantedSkus = grantedRaw ? JSON.parse(grantedRaw) : grantedSkusFromOrder(order);
      const normalizedGrantedSkus = Array.isArray(grantedSkus)
        ? grantedSkus.filter(
            (sku): sku is string => typeof sku === 'string' && sku.trim().length > 0
          )
        : grantedSkusFromOrder(order);

      for (const sku of normalizedGrantedSkus) {
        await revokeBundle({ userId, sku });
        if (isOneTimeOfferSku(sku)) {
          await unmarkSkuPurchased(userId, sku);
        }
      }
      if (normalizedGrantedSkus.length > 0) {
        await updateQuestProgressOnRefund({ userId });
      }
      await Promise.all([
        redis.del(keyGrantedOrderSkus(order.id)),
        redis.del(keyProcessedOrder(order.id)),
      ]);
      return c.json<PaymentHandlerResponse>({ success: true }, 200);
    } catch (error) {
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
