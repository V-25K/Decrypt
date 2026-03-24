import { Hono } from 'hono';
import type { PaymentHandlerResponse } from '@devvit/web/server';
import type { Order } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';
import {
  getInventory,
  getUserProfile,
  hasPurchasedSku,
  markSkuPurchased,
  saveInventory,
  saveUserProfile,
} from '../core/state';
import { getBundlePerks, isOneTimeOfferSku } from '../../shared/store';
import { addHeartsFromBundle, normalizeHearts } from '../core/hearts';
import { keyProcessedOrder } from '../core/keys';
import { updateQuestProgressOnPurchase } from '../core/quests';

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

export const paymentsRoutes = new Hono();

const orderIsFulfillable = (order: Order): boolean =>
  order.status === OrderStatus.ORDER_STATUS_PAID ||
  order.status === OrderStatus.ORDER_STATUS_DELIVERED;

paymentsRoutes.post('/fulfill', async (c) => {
  try {
    const userId = context.userId;
    if (!userId) {
      return c.json<PaymentHandlerResponse>(
        { success: false, reason: 'Missing user context.' },
        400
      );
    }
    const order = await c.req.json<Order>();
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
        if (isOneTimeOfferSku(product.sku)) {
          await markSkuPurchased(userId, product.sku);
        }
      }
      if (fulfilledAny) {
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
  await c.req.json<Order>();
  return c.json<PaymentHandlerResponse>({ success: true }, 200);
});
