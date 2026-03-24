import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  watchMock,
  hGetMock,
  getUserProfileMock,
  getInventoryMock,
  updateQuestProgressOnCoinSpendMock,
  tx,
} = vi.hoisted(() => ({
  watchMock: vi.fn(),
  hGetMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  updateQuestProgressOnCoinSpendMock: vi.fn(),
  tx: {
    unwatch: vi.fn(),
    multi: vi.fn(),
    hIncrBy: vi.fn(),
    exec: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    watch: watchMock,
    hGet: hGetMock,
  },
}));

vi.mock('./state', () => ({
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: updateQuestProgressOnCoinSpendMock,
}));

import { purchasePowerup } from './economy';

const profileFixture = () => ({
  coins: 0,
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
  watchMock.mockReset();
  hGetMock.mockReset();
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  updateQuestProgressOnCoinSpendMock.mockReset();
  tx.unwatch.mockReset();
  tx.multi.mockReset();
  tx.hIncrBy.mockReset();
  tx.exec.mockReset();
});

describe('purchasePowerup', () => {
  it('deducts quantity-based cost and increments inventory by quantity', async () => {
    watchMock.mockResolvedValue(tx);
    hGetMock.mockResolvedValue('500');
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());

    await purchasePowerup({
      userId: 'u1',
      itemType: 'hammer',
      quantity: 3,
    });

    expect(tx.hIncrBy).toHaveBeenCalledWith('decrypt:user:u1:profile', 'coins', -180);
    expect(tx.hIncrBy).toHaveBeenCalledWith('decrypt:user:u1:inventory', 'hammer', 3);
    expect(updateQuestProgressOnCoinSpendMock).toHaveBeenCalledWith({
      userId: 'u1',
      amount: 180,
    });
  });

  it('returns failure and leaves state untouched when coins are insufficient', async () => {
    watchMock.mockResolvedValue(tx);
    hGetMock.mockResolvedValue('20');
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());

    const result = await purchasePowerup({
      userId: 'u1',
      itemType: 'hammer',
      quantity: 1,
    });

    expect(result.success).toBe(false);
    expect(tx.unwatch).toHaveBeenCalled();
    expect(tx.hIncrBy).not.toHaveBeenCalled();
    expect(updateQuestProgressOnCoinSpendMock).not.toHaveBeenCalled();
  });

  it('keeps single-quantity behavior when quantity is omitted', async () => {
    watchMock.mockResolvedValue(tx);
    hGetMock.mockResolvedValue('500');
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());

    await purchasePowerup({
      userId: 'u1',
      itemType: 'shield',
    });

    expect(tx.hIncrBy).toHaveBeenCalledWith('decrypt:user:u1:profile', 'coins', -110);
    expect(tx.hIncrBy).toHaveBeenCalledWith('decrypt:user:u1:inventory', 'shield', 1);
    expect(updateQuestProgressOnCoinSpendMock).toHaveBeenCalledWith({
      userId: 'u1',
      amount: 110,
    });
  });
});
