import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@devvit/protos/json/devvit/payments/v1alpha/order.js';

const {
  getUserProfileMock,
  getInventoryMock,
  saveUserProfileMock,
  saveInventoryMock,
  hasPurchasedSkuMock,
  markSkuPurchasedMock,
  redisGetMock,
  redisSetMock,
  updateQuestProgressOnPurchaseMock,
} = vi.hoisted(() => ({
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  hasPurchasedSkuMock: vi.fn(),
  markSkuPurchasedMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  updateQuestProgressOnPurchaseMock: vi.fn(),
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
  },
}));

vi.mock('../core/state', () => ({
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
  saveUserProfile: saveUserProfileMock,
  saveInventory: saveInventoryMock,
  hasPurchasedSku: hasPurchasedSkuMock,
  markSkuPurchased: markSkuPurchasedMock,
}));

vi.mock('../core/quests', () => ({
  updateQuestProgressOnPurchase: updateQuestProgressOnPurchaseMock,
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
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  updateQuestProgressOnPurchaseMock.mockReset();
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
        status: OrderStatus.ORDER_STATUS_PAID,
        products: [{ sku: 'rookie_stash' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      'u_test',
      expect.objectContaining({ coins: 510 })
    );
    expect(saveInventoryMock).toHaveBeenCalledWith(
      'u_test',
      expect.objectContaining({ hammer: 1, shield: 1 })
    );
    expect(markSkuPurchasedMock).toHaveBeenCalledWith('u_test', 'rookie_stash');
    expect(updateQuestProgressOnPurchaseMock).toHaveBeenCalledWith({ userId: 'u_test' });
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
});
