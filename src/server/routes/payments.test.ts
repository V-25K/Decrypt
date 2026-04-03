import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';

const {
  getUserProfileMock,
  getInventoryMock,
  saveUserProfileMock,
  saveInventoryMock,
  hasPurchasedSkuMock,
  markSkuPurchasedMock,
  unmarkSkuPurchasedMock,
  redisGetMock,
  redisSetMock,
  redisDelMock,
  updateQuestProgressOnPurchaseMock,
  updateQuestProgressOnRefundMock,
} = vi.hoisted(() => ({
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  hasPurchasedSkuMock: vi.fn(),
  markSkuPurchasedMock: vi.fn(),
  unmarkSkuPurchasedMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisDelMock: vi.fn(),
  updateQuestProgressOnPurchaseMock: vi.fn(),
  updateQuestProgressOnRefundMock: vi.fn(),
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
    get: redisGetMock,
    set: redisSetMock,
    del: redisDelMock,
  },
}));

vi.mock('../core/state', () => ({
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
  saveUserProfile: saveUserProfileMock,
  saveInventory: saveInventoryMock,
  hasPurchasedSku: hasPurchasedSkuMock,
  markSkuPurchased: markSkuPurchasedMock,
  unmarkSkuPurchased: unmarkSkuPurchasedMock,
}));

vi.mock('../core/quests', () => ({
  updateQuestProgressOnPurchase: updateQuestProgressOnPurchaseMock,
  updateQuestProgressOnRefund: updateQuestProgressOnRefundMock,
}));

import { paymentsRoutes } from './payments';

const profileFixture = () => ({
  coins: 10,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  questsCompleted: 0,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  unlockedFlairs: [],
  activeFlair: '',
});

const inventoryFixture = () => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
});

afterEach(() => {
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  saveUserProfileMock.mockReset();
  saveInventoryMock.mockReset();
  hasPurchasedSkuMock.mockReset();
  markSkuPurchasedMock.mockReset();
  unmarkSkuPurchasedMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisDelMock.mockReset();
  updateQuestProgressOnPurchaseMock.mockReset();
  updateQuestProgressOnRefundMock.mockReset();
});

describe('payments one-time bundle fulfillment', () => {
  it('applies rookie stash on first fulfillment and marks purchase', async () => {
    hasPurchasedSkuMock.mockResolvedValue(false);
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');

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
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      'u_order',
      expect.objectContaining({ coins: 510 })
    );
    expect(saveInventoryMock).toHaveBeenCalledWith(
      'u_order',
      expect.objectContaining({ hammer: 1, shield: 1 })
    );
    expect(markSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(updateQuestProgressOnPurchaseMock).toHaveBeenCalledWith({ userId: 'u_order' });
    expect(redisSetMock).toHaveBeenCalledWith(
      'decrypt:payments:granted_order_skus:order_1',
      JSON.stringify(['rookie_stash']),
      expect.any(Object)
    );
  });

  it('skips rookie stash if already purchased', async () => {
    hasPurchasedSkuMock.mockResolvedValue(true);
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');

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
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(saveInventoryMock).not.toHaveBeenCalled();
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(updateQuestProgressOnPurchaseMock).not.toHaveBeenCalled();
  });

  it('rejects non-paid orders without granting entitlements', async () => {
    const response = await paymentsRoutes.request('http://localhost/fulfill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_3',
        userId: 'u_order',
        status: OrderStatus.ORDER_STATUS_CANCELED,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(saveInventoryMock).not.toHaveBeenCalled();
    expect(markSkuPurchasedMock).not.toHaveBeenCalled();
    expect(updateQuestProgressOnPurchaseMock).not.toHaveBeenCalled();
  });

  it('revokes granted entitlements on refund and clears one-time ownership', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue({
      hammer: 1,
      wand: 0,
      shield: 1,
      rocket: 0,
    });
    redisGetMock.mockResolvedValue(JSON.stringify(['rookie_stash']));
    redisSetMock.mockResolvedValue('OK');

    const response = await paymentsRoutes.request('http://localhost/refund', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_refund_1',
        userId: 'u_order',
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      'u_order',
      expect.objectContaining({ coins: 0 })
    );
    expect(saveInventoryMock).toHaveBeenCalledWith(
      'u_order',
      expect.objectContaining({ hammer: 0, shield: 0 })
    );
    expect(unmarkSkuPurchasedMock).toHaveBeenCalledWith('u_order', 'rookie_stash');
    expect(updateQuestProgressOnRefundMock).toHaveBeenCalledWith({ userId: 'u_order' });
    expect(redisDelMock).toHaveBeenCalledWith('decrypt:payments:granted_order_skus:order_refund_1');
    expect(redisDelMock).toHaveBeenCalledWith('decrypt:payments:processed_order:order_refund_1');
  });

  it('treats repeated refunds as idempotent', async () => {
    redisSetMock.mockResolvedValue(null);

    const response = await paymentsRoutes.request('http://localhost/refund', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'order_refund_2',
        userId: 'u_order',
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(saveInventoryMock).not.toHaveBeenCalled();
    expect(unmarkSkuPurchasedMock).not.toHaveBeenCalled();
    expect(updateQuestProgressOnRefundMock).not.toHaveBeenCalled();
  });
});
