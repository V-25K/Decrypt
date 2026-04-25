import { afterEach, describe, expect, it, vi } from 'vitest';

const { zAddMock, zCardMock, incrByMock, getMock, zsetStore, counterStore } =
  vi.hoisted(() => {
    const zsetStore = new Map<string, Map<string, number>>();
    const counterStore = new Map<string, number>();
    const zAddMock = vi.fn(async (key: string, entry: { member: string; score: number }) => {
      const existing = zsetStore.get(key) ?? new Map<string, number>();
      existing.set(entry.member, entry.score);
      zsetStore.set(key, existing);
    });
    const zCardMock = vi.fn(async (key: string) => {
      const existing = zsetStore.get(key);
      return existing ? existing.size : 0;
    });
    const incrByMock = vi.fn(async (key: string, amount: number) => {
      counterStore.set(key, (counterStore.get(key) ?? 0) + amount);
    });
    const getMock = vi.fn(async (key: string) => {
      const value = counterStore.get(key);
      return value === undefined ? null : String(value);
    });
    return { zAddMock, zCardMock, incrByMock, getMock, zsetStore, counterStore };
  });

vi.mock('@devvit/web/server', () => ({
  redis: {
    zAdd: zAddMock,
    zCard: zCardMock,
    incrBy: incrByMock,
    get: getMock,
  },
}));

import {
  getLevelEngagement,
  getQualifiedLevelTelemetry,
  recordLevelPlay,
  recordLevelWin,
  recordQualifiedLevelPlay,
  recordQualifiedLevelWin,
} from './engagement';

afterEach(() => {
  zsetStore.clear();
  counterStore.clear();
  zAddMock.mockClear();
  zCardMock.mockClear();
  incrByMock.mockClear();
  getMock.mockClear();
});

describe('engagement', () => {
  it('counts public play metrics as raw attempts while keeping winner counts accurate', async () => {
    await recordLevelPlay('lvl_0100', 'u_1');
    await recordLevelPlay('lvl_0100', 'u_1');
    await recordLevelPlay('lvl_0100', 'u_2');
    await recordLevelWin('lvl_0100', 'u_2');

    const metrics = await getLevelEngagement('lvl_0100');
    expect(metrics.plays).toBe(3);
    expect(metrics.wins).toBe(1);
    expect(metrics.winRatePct).toBe(33);
  });

  it('records qualified plays as unique engaged users', async () => {
    await recordQualifiedLevelPlay('lvl_0200', 'u_1');
    await recordQualifiedLevelPlay('lvl_0200', 'u_1');
    await recordQualifiedLevelPlay('lvl_0200', 'u_2');

    const telemetry = await getQualifiedLevelTelemetry('lvl_0200');
    expect(telemetry.plays).toBe(2);
    expect(telemetry.wins).toBe(0);
  });

  it('records qualified wins as unique clean winners', async () => {
    await recordQualifiedLevelWin('lvl_0300', 'u_1');
    await recordQualifiedLevelWin('lvl_0300', 'u_1');
    await recordQualifiedLevelWin('lvl_0300', 'u_2');

    const telemetry = await getQualifiedLevelTelemetry('lvl_0300');
    expect(telemetry.plays).toBe(0);
    expect(telemetry.wins).toBe(2);
  });
});
