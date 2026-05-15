import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  zAddMock,
  zCardMock,
  zRangeMock,
  incrByMock,
  getMock,
  hSetMock,
  hGetAllMock,
  zsetStore,
  counterStore,
  hashStore,
} =
  vi.hoisted(() => {
    const zsetStore = new Map<string, Map<string, number>>();
    const counterStore = new Map<string, number>();
    const hashStore = new Map<string, Record<string, string>>();
    const zAddMock = vi.fn(async (key: string, entry: { member: string; score: number }) => {
      const existing = zsetStore.get(key) ?? new Map<string, number>();
      existing.set(entry.member, entry.score);
      zsetStore.set(key, existing);
    });
    const zCardMock = vi.fn(async (key: string) => {
      const existing = zsetStore.get(key);
      return existing ? existing.size : 0;
    });
    const zRangeMock = vi.fn(async (key: string) => {
      const existing = zsetStore.get(key);
      if (!existing) {
        return [];
      }
      return Array.from(existing.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([member, score]) => ({ member, score }));
    });
    const incrByMock = vi.fn(async (key: string, amount: number) => {
      counterStore.set(key, (counterStore.get(key) ?? 0) + amount);
    });
    const getMock = vi.fn(async (key: string) => {
      const value = counterStore.get(key);
      return value === undefined ? null : String(value);
    });
    const hSetMock = vi.fn(async (key: string, values: Record<string, string>) => {
      const existing = hashStore.get(key) ?? {};
      hashStore.set(key, {
        ...existing,
        ...values,
      });
    });
    const hGetAllMock = vi.fn(async (key: string) => hashStore.get(key) ?? {});
    return {
      zAddMock,
      zCardMock,
      zRangeMock,
      incrByMock,
      getMock,
      hSetMock,
      hGetAllMock,
      zsetStore,
      counterStore,
      hashStore,
    };
  });

vi.mock('@devvit/web/server', () => ({
  redis: {
    zAdd: zAddMock,
    zCard: zCardMock,
    zRange: zRangeMock,
    incrBy: incrByMock,
    get: getMock,
    hSet: hSetMock,
    hGetAll: hGetAllMock,
  },
}));

import {
  getLevelEngagement,
  getQualifiedLevelTelemetry,
  recordLevelPlay,
  recordLevelWin,
  recordQualifiedLevelFailure,
  recordQualifiedLevelPlay,
  recordQualifiedLevelWin,
} from './engagement';
import { sessionTtlSeconds } from './constants';

afterEach(() => {
  zsetStore.clear();
  counterStore.clear();
  hashStore.clear();
  zAddMock.mockClear();
  zCardMock.mockClear();
  zRangeMock.mockClear();
  incrByMock.mockClear();
  getMock.mockClear();
  hSetMock.mockClear();
  hGetAllMock.mockClear();
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
    expect(telemetry.failures).toBe(0);
    expect(telemetry.abandons).toBe(0);
  });

  it('stores the latest qualified outcome per user', async () => {
    await recordQualifiedLevelPlay('lvl_0300', 'u_1');
    await recordQualifiedLevelFailure('lvl_0300', 'u_1', {
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 1,
    });
    await recordQualifiedLevelWin('lvl_0300', 'u_1', {
      solveSeconds: 55,
      mistakes: 1,
      usedPowerups: 0,
      retryCount: 1,
      targetTimeSeconds: 60,
    });

    const telemetry = await getQualifiedLevelTelemetry('lvl_0300');
    expect(telemetry.plays).toBe(1);
    expect(telemetry.wins).toBe(1);
    expect(telemetry.failures).toBe(0);
    expect(telemetry.averageSolveSeconds).toBe(55);
  });

  it('counts stale unresolved qualified plays as abandons', async () => {
    const nowMs = 2_000_000;
    await recordQualifiedLevelPlay(
      'lvl_0400',
      'u_stale',
      nowMs - sessionTtlSeconds * 1000 - 1
    );
    await recordQualifiedLevelPlay('lvl_0400', 'u_fresh', nowMs);

    const telemetry = await getQualifiedLevelTelemetry('lvl_0400', nowMs);
    expect(telemetry.plays).toBe(2);
    expect(telemetry.abandons).toBe(1);
  });

  it('aggregates qualified solve quality metrics', async () => {
    await recordQualifiedLevelPlay('lvl_0500', 'u_1');
    await recordQualifiedLevelPlay('lvl_0500', 'u_2');
    await recordQualifiedLevelPlay('lvl_0500', 'u_3');
    await recordQualifiedLevelWin('lvl_0500', 'u_1', {
      solveSeconds: 40,
      mistakes: 1,
      usedPowerups: 1,
      retryCount: 0,
      targetTimeSeconds: 60,
    });
    await recordQualifiedLevelWin('lvl_0500', 'u_2', {
      solveSeconds: 80,
      mistakes: 2,
      usedPowerups: 0,
      retryCount: 1,
      targetTimeSeconds: 60,
    });
    await recordQualifiedLevelFailure('lvl_0500', 'u_3', {
      mistakes: 3,
      usedPowerups: 2,
      retryCount: 2,
    });

    const telemetry = await getQualifiedLevelTelemetry('lvl_0500');
    expect(telemetry.plays).toBe(3);
    expect(telemetry.wins).toBe(2);
    expect(telemetry.failures).toBe(1);
    expect(telemetry.averageSolveSeconds).toBe(60);
    expect(telemetry.averageMistakes).toBe(2);
    expect(telemetry.averageUsedPowerups).toBe(1);
    expect(telemetry.averageRetryCount).toBe(1);
    expect(telemetry.fastSolveRate).toBe(0.5);
  });
});
