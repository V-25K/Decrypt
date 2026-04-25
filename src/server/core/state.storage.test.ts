import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestProgress } from '../../shared/game';

const {
  hGetAllMock,
  hSetMock,
  hSetNXMock,
  expireMock,
} = vi.hoisted(() => ({
  hGetAllMock: vi.fn(),
  hSetMock: vi.fn(),
  hSetNXMock: vi.fn(),
  expireMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGetAll: hGetAllMock,
    hSet: hSetMock,
    hSetNX: hSetNXMock,
    expire: expireMock,
    hKeys: vi.fn(),
    hGet: vi.fn(),
    hIncrBy: vi.fn(),
    hDel: vi.fn(),
  },
}));

import {
  getDailyQuestProgress,
  getInventory,
  getUserProfile,
  saveDailyQuestProgress,
} from './state';

const progressFixture = (overrides?: Partial<QuestProgress>): QuestProgress => ({
  dailyPlayCount: 1,
  dailyFastWin: true,
  dailyNoPowerup: false,
  dailyNoMistake: true,
  dailyShareCount: 2,
  socialShareCount: 3,
  lifetimeWordsmith: 25,
  lifetimeLogicalSolved: 4,
  lifetimeFlawless: 5,
  lifetimeCoinsSpent: 120,
  lifetimePurchases: 6,
  lifetimeDailyTopRanks: 1,
  lifetimeEndlessClears: 7,
  ...overrides,
});

afterEach(() => {
  hGetAllMock.mockReset();
  hSetMock.mockReset();
  hSetNXMock.mockReset();
  expireMock.mockReset();
});

describe('state storage behavior', () => {
  it('bootstrap daily quest hash with daily-only fields', async () => {
    hGetAllMock.mockResolvedValue({});

    const progress = await getDailyQuestProgress('u1', '2026-04-08');

    expect(progress.dailyPlayCount).toBe(0);
    expect(progress.lifetimeWordsmith).toBe(0);
    const payload = hSetMock.mock.calls[0]?.[1] as Record<string, string> | undefined;
    if (!payload) {
      throw new Error('Expected daily quest bootstrap write payload');
    }
    expect(payload.lifetimeWordsmith).toBeUndefined();
    expect(payload.lifetimeLogicalSolved).toBeUndefined();
    expect(payload.lifetimeEndlessClears).toBeUndefined();
  });

  it('saveDailyQuestProgress keeps lifetime fields out of daily hash', async () => {
    await saveDailyQuestProgress('u1', '2026-04-08', progressFixture());

    const payload = hSetMock.mock.calls[0]?.[1] as Record<string, string> | undefined;
    if (!payload) {
      throw new Error('Expected daily quest save payload');
    }
    expect(payload.dailyPlayCount).toBe('1');
    expect(payload.socialShareCount).toBe('3');
    expect(payload.lifetimeWordsmith).toBeUndefined();
    expect(payload.lifetimeFlawless).toBeUndefined();
  });

  it('uses first-writer-wins profile bootstrap under concurrent creation', async () => {
    hGetAllMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        coins: '42',
        hearts: '3',
      });
    hSetNXMock.mockResolvedValue(0);

    const profile = await getUserProfile('u1');

    expect(hSetNXMock).toHaveBeenCalledWith('decrypt:user:u1:profile', 'coins', '0');
    expect(profile.coins).toBe(42);
  });

  it('falls back safely when inventory hash contains invalid values', async () => {
    hGetAllMock.mockResolvedValue({
      hammer: '-1',
      wand: '2',
      shield: '0',
      rocket: '0',
    });

    const inventory = await getInventory('u1');

    expect(inventory).toEqual({
      hammer: 0,
      wand: 0,
      shield: 0,
      rocket: 0,
    });
    expect(hSetMock).toHaveBeenCalledWith('decrypt:user:u1:inventory', {
      hammer: '0',
      wand: '0',
      shield: '0',
      rocket: '0',
    });
  });
});
