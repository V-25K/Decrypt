import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';

const {
  getUserProfileMock,
  getInventoryMock,
  hasPurchasedSkuMock,
  markSkuPurchasedMock,
  unmarkSkuPurchasedMock,
  claimOneTimeSkuMock,
  releaseOneTimeClaimMock,
  updateQuestProgressOnPurchaseMock,
  updateQuestProgressOnRefundMock,
  watchMock,
  redisHashState,
  redisState,
  tx,
} = vi.hoisted(() => ({
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  hasPurchasedSkuMock: vi.fn(),
  markSkuPurchasedMock: vi.fn(),
  unmarkSkuPurchasedMock: vi.fn(),
  claimOneTimeSkuMock: vi.fn(),
  releaseOneTimeClaimMock: vi.fn(),
  updateQuestProgressOnPurchaseMock: vi.fn(),
  updateQuestProgressOnRefundMock: vi.fn(),
  watchMock: vi.fn(),
  redisHashState: new Map<string, Record<string, string>>(),
  redisState: new Map<string, string>(),
  tx: {
    multi: vi.fn(),
    hSet: vi.fn(),
    exec: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 'u_test',
    subredditName: null,
  },
  reddit: {
    getCurrentUsername: vi.fn(),
    setUserFlair: vi.fn(),
  },
  redis: {
    get: vi.fn(async (key: string) => redisState.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, options?: { nx?: boolean }) => {
      if (options?.nx && redisState.has(key)) {
        return null;
      }
      redisState.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const existed = redisState.delete(key);
      return existed ? 1 : 0;
    }),
    hSet: vi.fn(async (key: string, values: Record<string, string>) => {
      const existing = redisHashState.get(key) ?? {};
      redisHashState.set(key, { ...existing, ...values });
      return Object.keys(values).length;
    }),
    hGetAll: vi.fn(async (key: string) => redisHashState.get(key) ?? {}),
    watch: watchMock,
  },
}));

vi.mock('../core/state', () => ({
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
  hasPurchasedSku: hasPurchasedSkuMock,
  markSkuPurchased: markSkuPurchasedMock,
  unmarkSkuPurchased: unmarkSkuPurchasedMock,
  claimOneTimeSku: claimOneTimeSkuMock,
  releaseOneTimeClaim: releaseOneTimeClaimMock,
}));

vi.mock('../core/quests', () => ({
  updateQuestProgressOnPurchase: updateQuestProgressOnPurchaseMock,
  updateQuestProgressOnRefund: updateQuestProgressOnRefundMock,
}));

import { paymentsRoutes } from './payments';
import {
  keyGrantedOrderSkus,
  keyOrderGrantRecord,
  keyPaymentOrderIndex,
  keyProcessedOrder,
  keyRefundProcessedOrder,
  keyUserInventory,
  keyUserProfile,
} from '../core/keys';

const profileFixture = (overrides?: Partial<{
  coins: number;
  hearts: number;
  lastHeartRefillTs: number;
  infiniteHeartsExpiryTs: number;
}>): {
  coins: number;
  hearts: number;
  lastHeartRefillTs: number;
  infiniteHeartsExpiryTs: number;
} => ({
  coins: 10,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  ...overrides,
});

const inventoryFixture = (overrides?: Partial<{
  hammer: number;
  wand: number;
  shield: number;
  rocket: number;
}>): {
  hammer: number;
  wand: number;
  shield: number;
  rocket: number;
} => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
  ...overrides,
});

const readOrderRecord = (orderId: string) => {
  const raw = redisState.get(keyOrderGrantRecord(orderId));
  return raw ? JSON.parse(raw) : null;
};

const seedUserState = (params: {
  userId: string;
  profile?: ReturnType<typeof profileFixture>;
  inventory?: ReturnType<typeof inventoryFixture>;
}) => {
  const profile = params.profile ?? profileFixture();
  const inventory = params.inventory ?? inventoryFixture();
  redisHashState.set(keyUserProfile(params.userId), {
    coins: `${profile.coins}`,
    hearts: `${profile.hearts}`,
    lastHeartRefillTs: `${profile.lastHeartRefillTs}`,
    infiniteHeartsExpiryTs: `${profile.infiniteHeartsExpiryTs}`,
  });
  redisHashState.set(keyUserInventory(params.userId), {
    hammer: `${inventory.hammer}`,
    wand: `${inventory.wand}`,
    shield: `${inventory.shield}`,
    rocket: `${inventory.rocket}`,
  });
};

beforeEach(() => {
  watchMock.mockResolvedValue(tx);
  tx.exec.mockResolvedValue(['ok']);
  // Default: the in-flight claim succeeds. Individual tests override to simulate
  // already-owned or in-progress states.
  claimOneTimeSkuMock.mockResolvedValue({ claimed: true, alreadyOwned: false });
  releaseOneTimeClaimMock.mockResolvedValue(undefined);
});

afterEach(() => {
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  hasPurchasedSkuMock.mockReset();
  markSkuPurchasedMock.mockReset();
  unmarkSkuPurchasedMock.mockReset();
  claimOneTimeSkuMock.mockReset();
  releaseOneTimeClaimMock.mockReset();
  updateQuestProgressOnPurchaseMock.mockReset();
  updateQuestProgressOnRefundMock.mockReset();
  watchMock.mockReset();
  tx.multi.mockReset();
  tx.hSet.mockReset();
  tx.exec.mockReset();
  redisHashState.clear();
  redisState.clear();
});

describe('paymentsRoutes', () => {
  it('fulfills a paid order and stores a canonical grant record', async () => {
    hasPurchasedSkuMock.mockResolvedValue(false);
    seedUserState({ userId: 'u_order' });

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_1',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(markSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(updateQuestProgressOnPurchaseMock).toHaveBeenCalledWith({ userId: 'u_order' });
    expect(tx.hSet).toHaveBeenCalledWith(
      'decrypt:user:u_order:profile',
      expect.objectContaining({ coins: '510' })
    );
    expect(tx.hSet).toHaveBeenCalledWith(
      'decrypt:user:u_order:inventory',
      expect.objectContaining({ hammer: '1', shield: '1' })
    );
    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(getInventoryMock).not.toHaveBeenCalled();
    expect(readOrderRecord('order_1')).toMatchObject({
      userId: 'u_order',
      status: 'fulfilled',
      grantedSkus: ['rookie_stash'],
      markedOneTimeSkus: ['rookie_stash'],
    });
    expect(redisHashState.get(keyPaymentOrderIndex)).toMatchObject({
      order_1: '1',
    });
    expect(redisState.get(keyGrantedOrderSkus('order_1'))).toBe(
      JSON.stringify(['rookie_stash'])
    );
    expect(redisState.get(keyProcessedOrder('order_1'))).toBe('1');
  });

  it('treats duplicate fulfill calls as idempotent from the canonical record', async () => {
    redisState.set(
      keyOrderGrantRecord('order_2'),
      JSON.stringify({
        userId: 'u_order',
        grantedSkus: ['rookie_stash'],
        markedOneTimeSkus: ['rookie_stash'],
        status: 'fulfilled',
        fulfilledAt: 123,
        refundedAt: null,
        updatedAt: 123,
      })
    );

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_2',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(watchMock).not.toHaveBeenCalled();
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(updateQuestProgressOnPurchaseMock).not.toHaveBeenCalled();
  });

  it('rolls back granted entitlements when fulfillment fails after granting', async () => {
    hasPurchasedSkuMock.mockResolvedValue(false);
    seedUserState({ userId: 'u_order' });
    updateQuestProgressOnPurchaseMock.mockRejectedValue(new Error('quest failure'));

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_rollback',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(400);
    expect(unmarkSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(readOrderRecord('order_rollback')).toBeNull();
    expect(redisState.has(keyGrantedOrderSkus('order_rollback'))).toBe(false);
    expect(redisState.has(keyProcessedOrder('order_rollback'))).toBe(false);
  });

  it('treats refund-before-fulfill as a safe no-op', async () => {
    const response = await paymentsRoutes.request('http://localhost/refund', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_refund_none',
        userId: 'u_order',
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(unmarkSkuPurchasedMock).not.toHaveBeenCalled();
    expect(redisState.has(keyRefundProcessedOrder('order_refund_none'))).toBe(false);
  });

  it('refunds only what was recorded as granted and persists refunded state', async () => {
    redisState.set(
      keyOrderGrantRecord('order_refund_1'),
      JSON.stringify({
        userId: 'u_order',
        grantedSkus: ['rookie_stash'],
        markedOneTimeSkus: ['rookie_stash'],
        status: 'fulfilled',
        fulfilledAt: 123,
        refundedAt: null,
        updatedAt: 123,
      })
    );
    redisState.set(keyGrantedOrderSkus('order_refund_1'), JSON.stringify(['rookie_stash']));
    seedUserState({
      userId: 'u_order',
      profile: profileFixture({ coins: 510 }),
      inventory: inventoryFixture({ hammer: 1, shield: 1 }),
    });

    const response = await paymentsRoutes.request('http://localhost/refund', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_refund_1',
        userId: 'u_order',
        products: [{ sku: 'rookie_stash' }, { sku: 'decoder_pack' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(unmarkSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(updateQuestProgressOnRefundMock).toHaveBeenCalledWith({
      userId: 'u_order',
      coinsRefunded: 500,
    });
    expect(tx.hSet).toHaveBeenCalledWith(
      'decrypt:user:u_order:profile',
      expect.objectContaining({ coins: '10' })
    );
    expect(readOrderRecord('order_refund_1')).toMatchObject({
      status: 'refunded',
      grantedSkus: ['rookie_stash'],
      markedOneTimeSkus: ['rookie_stash'],
    });
    expect(redisState.has(keyGrantedOrderSkus('order_refund_1'))).toBe(false);
  });

  it('can refund legacy grant records without guessing from raw order payload', async () => {
    redisState.set(keyGrantedOrderSkus('order_legacy'), JSON.stringify(['rookie_stash']));
    seedUserState({
      userId: 'u_order',
      profile: profileFixture({ coins: 510 }),
      inventory: inventoryFixture({ hammer: 1, shield: 1 }),
    });

    const response = await paymentsRoutes.request('http://localhost/refund', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_legacy',
        userId: 'u_order',
        products: [{ sku: 'rookie_stash' }, { sku: 'decoder_pack' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(updateQuestProgressOnRefundMock).toHaveBeenCalledWith({
      userId: 'u_order',
      coinsRefunded: 500,
    });
    expect(readOrderRecord('order_legacy')).toMatchObject({
      userId: 'u_order',
      status: 'refunded',
      grantedSkus: ['rookie_stash'],
    });
  });

  it('grants a one-time SKU via the claim guard (no getOrders dependency)', async () => {
    // Regression: the one-time guard is claimOneTimeSku (Redis NX + durable
    // hasPurchasedSku record), NOT payments.getOrders — whose filters are
    // non-functional in this Devvit version. A fresh claim must grant normally.
    seedUserState({ userId: 'u_order' });

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'order_claim_grant',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(claimOneTimeSkuMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(markSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(readOrderRecord('order_claim_grant')).toMatchObject({
      status: 'fulfilled',
      grantedSkus: ['rookie_stash'],
      markedOneTimeSkus: ['rookie_stash'],
    });
  });

  it('short-circuits when claimOneTimeSku reports the SKU is already owned', async () => {
    claimOneTimeSkuMock.mockResolvedValue({ claimed: false, alreadyOwned: true });
    seedUserState({ userId: 'u_order' });

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'order_already_owned',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(tx.hSet).not.toHaveBeenCalled();
    expect(readOrderRecord('order_already_owned')).toMatchObject({
      grantedSkus: [],
      markedOneTimeSkus: [],
      status: 'fulfilled',
    });
  });

  it('fails fulfillment (so Devvit can retry) when another fulfillment holds the claim lock', async () => {
    // claim.claimed === false AND alreadyOwned === false means another order's
    // fulfillment is mid-flight for the same (user, sku). The handler must
    // reject so Devvit retries shortly rather than silently double-grant.
    claimOneTimeSkuMock.mockResolvedValue({ claimed: false, alreadyOwned: false });
    seedUserState({ userId: 'u_order' });

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'order_busy',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(400);
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(tx.hSet).not.toHaveBeenCalled();
    expect(readOrderRecord('order_busy')).toBeNull();
  });

  it('releases the claim on the success path once markSkuPurchased commits', async () => {
    // When the loop completes normally, the per-(user, sku) claim must be
    // released so subsequent orders short-circuit on hasPurchasedSku instead
    // of waiting for the 120s lock TTL.
    seedUserState({ userId: 'u_order' });

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'order_success_release',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(markSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(releaseOneTimeClaimMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
  });

  it('releases the claim during rollback when applyBundle throws before mark', async () => {
    // applyBundle fails after the claim is acquired but before markSkuPurchased
    // commits. The rollback's release pass must clean the lock so a future
    // order for the same SKU is not blocked for the full TTL.
    seedUserState({ userId: 'u_order' });
    tx.exec.mockResolvedValue(null); // optimistic lock keeps failing → throws

    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'order_apply_fail',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(400);
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(releaseOneTimeClaimMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(readOrderRecord('order_apply_fail')).toBeNull();
  });
});
