import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, SessionState, UserProfile } from '../../shared/game';

const {
  watchMock,
  hGetMock,
  getMock,
  getUserProfileMock,
  getInventoryMock,
  getSessionStateMock,
  getPuzzlePrivateMock,
  updateQuestProgressOnCoinSpendMock,
  tx,
} = vi.hoisted(() => ({
  watchMock: vi.fn(),
  hGetMock: vi.fn(),
  getMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  updateQuestProgressOnCoinSpendMock: vi.fn(),
  tx: {
    unwatch: vi.fn(),
    multi: vi.fn(),
    hIncrBy: vi.fn(),
    hSet: vi.fn(),
    incrBy: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    watch: watchMock,
    hGet: hGetMock,
    get: getMock,
  },
}));

vi.mock('./state', () => ({
  defaultUserProfile: vi.fn(() => ({
    coins: 0,
    hearts: 3,
    lastHeartRefillTs: 0,
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
    bestOverallRank: 0,
    audioEnabled: true,
    communityJoinRecorded: false,
    communityJoinRewardClaimed: false,
    unlockedFlairs: [],
    activeFlair: '',
  })),
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
}));

vi.mock('./session', () => ({
  getSessionState: getSessionStateMock,
}));

vi.mock('./puzzle-store', () => ({
  getPuzzlePrivate: getPuzzlePrivateMock,
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: updateQuestProgressOnCoinSpendMock,
}));

import {
  consumePowerup,
  purchaseCoinHeartRefill,
  purchaseCoinHeartTopUp,
  purchasePowerup,
} from './economy';

const profileFixture = (overrides?: Partial<UserProfile>): UserProfile => ({
  coins: 500,
  hearts: 3,
  lastHeartRefillTs: 0,
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
  bestOverallRank: 0,
  audioEnabled: true,
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
});

const inventoryFixture = (overrides?: Partial<Inventory>): Inventory => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
  ...overrides,
});

const sessionFixture = (overrides?: Partial<SessionState>): SessionState => ({
  activeLevelId: 'lvl_0001',
  mode: 'daily',
  startTimestamp: 0,
  activeMs: 0,
  lastSeenAt: 0,
  mistakesMade: 0,
  shieldIsActive: false,
  revealedIndices: [],
  usedPowerups: 0,
  wrongGuesses: 0,
  guessCount: 0,
  ...overrides,
});

afterEach(() => {
  watchMock.mockReset();
  hGetMock.mockReset();
  getMock.mockReset();
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  getSessionStateMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  updateQuestProgressOnCoinSpendMock.mockReset();
  tx.unwatch.mockReset();
  tx.multi.mockReset();
  tx.hIncrBy.mockReset();
  tx.hSet.mockReset();
  tx.incrBy.mockReset();
  tx.expire.mockReset();
  tx.exec.mockReset();
});

describe('purchasePowerup', () => {
  it('deducts the dynamic price and increments inventory by quantity', async () => {
    watchMock.mockResolvedValue(tx);
    tx.exec.mockResolvedValue(['ok']);
    hGetMock.mockResolvedValue('500');
    getUserProfileMock.mockResolvedValue(profileFixture({ coins: 320 }));
    getInventoryMock.mockResolvedValue(inventoryFixture({ hammer: 3 }));
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getPuzzlePrivateMock.mockResolvedValue({
      difficulty: 5,
      tiles: [
        { index: 0, isLetter: true },
        { index: 1, isLetter: true },
        { index: 2, isLetter: true },
        { index: 3, isLetter: true },
        { index: 4, isLetter: true },
        { index: 5, isLetter: true },
      ],
    });

    await purchasePowerup({
      userId: 'u1',
      postId: 'p1',
      levelId: 'lvl_0001',
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
});

describe('consumePowerup', () => {
  it('consumes one powerup when inventory is available', async () => {
    watchMock.mockResolvedValue(tx);
    hGetMock.mockResolvedValue('2');
    tx.exec.mockResolvedValue(['ok']);
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());

    const result = await consumePowerup({
      userId: 'u1',
      itemType: 'hammer',
    });

    expect(result.success).toBe(true);
    expect(tx.hIncrBy).toHaveBeenCalledWith('decrypt:user:u1:inventory', 'hammer', -1);
  });
});

describe('coin heart purchases', () => {
  it('does not consume a daily slot when normalized hearts are already full', async () => {
    watchMock.mockResolvedValue(tx);
    getUserProfileMock.mockResolvedValue(profileFixture({ hearts: 3 }));
    hGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 'coins') {
        return '500';
      }
      if (field === 'hearts') {
        return '2';
      }
      if (field === 'lastHeartRefillTs') {
        return `${Date.now() - 60 * 60 * 1000}`;
      }
      if (field === 'infiniteHeartsExpiryTs') {
        return '0';
      }
      return undefined;
    });
    getMock.mockResolvedValue('0');

    const result = await purchaseCoinHeartRefill({ userId: 'u1' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Hearts are already full.');
    expect(tx.incrBy).not.toHaveBeenCalled();
    expect(tx.hIncrBy).not.toHaveBeenCalled();
    expect(updateQuestProgressOnCoinSpendMock).not.toHaveBeenCalled();
  });

  it('does not consume a daily slot when coins are insufficient', async () => {
    watchMock.mockResolvedValue(tx);
    getUserProfileMock.mockResolvedValue(profileFixture({ coins: 50, hearts: 1 }));
    hGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 'coins') {
        return '50';
      }
      if (field === 'hearts') {
        return '1';
      }
      if (field === 'lastHeartRefillTs') {
        return `${Date.now()}`;
      }
      if (field === 'infiniteHeartsExpiryTs') {
        return '0';
      }
      return undefined;
    });
    getMock.mockResolvedValue('0');

    const result = await purchaseCoinHeartTopUp({ userId: 'u1' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Not enough coins.');
    expect(tx.incrBy).not.toHaveBeenCalled();
    expect(tx.hIncrBy).not.toHaveBeenCalled();
    expect(updateQuestProgressOnCoinSpendMock).not.toHaveBeenCalled();
  });
});
