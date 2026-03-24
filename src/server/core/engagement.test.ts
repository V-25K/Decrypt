import { afterEach, describe, expect, it, vi } from 'vitest';

const { zAddMock, zCardMock, zsetStore } = vi.hoisted(() => {
  const zsetStore = new Map<string, Map<string, number>>();
  const zAddMock = vi.fn(async (key: string, entry: { member: string; score: number }) => {
    const existing = zsetStore.get(key) ?? new Map<string, number>();
    existing.set(entry.member, entry.score);
    zsetStore.set(key, existing);
  });
  const zCardMock = vi.fn(async (key: string) => {
    const existing = zsetStore.get(key);
    return existing ? existing.size : 0;
  });
  return { zAddMock, zCardMock, zsetStore };
});

vi.mock('@devvit/web/server', () => ({
  redis: {
    zAdd: zAddMock,
    zCard: zCardMock,
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
  zAddMock.mockClear();
  zCardMock.mockClear();
});

describe('engagement', () => {
  it('keeps existing challenge metrics behavior stable', async () => {
    await recordLevelPlay('lvl_0100', 'u_1');
    await recordLevelPlay('lvl_0100', 'u_1');
    await recordLevelPlay('lvl_0100', 'u_2');
    await recordLevelWin('lvl_0100', 'u_2');

    const metrics = await getLevelEngagement('lvl_0100');
    expect(metrics.plays).toBe(2);
    expect(metrics.wins).toBe(1);
    expect(metrics.winRatePct).toBe(50);
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
