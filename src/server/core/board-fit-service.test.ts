import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FittedLayout, TierFitOutcome } from './tier-fitter';

const { fitBoardToTierMock, redisMock } = vi.hoisted(() => ({
  fitBoardToTierMock: vi.fn(),
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: redisMock,
}));

vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({
    logicalCipherPercent: 10,
  }),
}));

vi.mock('./tier-fitter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tier-fitter')>();
  return {
    ...actual,
    fitBoardToTier: fitBoardToTierMock,
  };
});

import {
  boardFitTextHash,
  boardFitTierOrder,
  fitLineToTiers,
  getCachedFittedLayout,
} from './board-fit-service';
import { tierFitLayoutVersion } from './tier-fitter';

const validText = 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO';

const fakeLayout = (tier: string): FittedLayout => ({
  prefilledIndices: [0, 4],
  blindIndices: [9],
  padlockChains: [],
  goldIndex: 12,
  seedKey: `fit:${tierFitLayoutVersion}:${tier}`,
  difficulty: 5,
  layoutVersion: tierFitLayoutVersion,
});

const fittedOutcome = (tier: string): TierFitOutcome => ({
  fitted: true,
  puzzlePrivate: {} as never,
  layout: fakeLayout(tier),
  summary: {
    solverRatio: 0.8,
    revealCount: 2,
    blindCount: 1,
    padlockCount: 0,
    estimatedDifficulty: 5,
    ceilingExceeded: false,
  },
});

describe('boardFitTextHash', () => {
  it('normalizes whitespace and case before hashing', () => {
    expect(boardFitTextHash('  the only way  to do GREAT work is to love what you do ')).toBe(
      boardFitTextHash(validText)
    );
  });

  it('differs for different lines', () => {
    expect(boardFitTextHash(validText)).not.toBe(
      boardFitTextHash('TO BE OR NOT TO BE THAT IS THE QUESTION')
    );
  });
});

describe('fitLineToTiers', () => {
  beforeEach(() => {
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.expire.mockReset();
    fitBoardToTierMock.mockReset();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.expire.mockResolvedValue(undefined);
  });

  it('short-circuits invalid text without fitting or caching', async () => {
    const report = await fitLineToTiers({ text: 'SHORT' });
    expect(report.textValid).toBe(false);
    expect(report.reasons.length).toBeGreaterThan(0);
    expect(report.tiers).toHaveLength(4);
    expect(report.tiers.every((entry) => !entry.feasible)).toBe(true);
    expect(fitBoardToTierMock).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('fits all four tiers, caches layouts and the report with a TTL', async () => {
    fitBoardToTierMock.mockImplementation(
      ({ tier }: { tier: string }): TierFitOutcome =>
        tier === 'expert'
          ? {
              fitted: false,
              reasonCode: 'TOO_SIMPLE_FOR_TIER',
              detail: 'Expert needs at least 14 different letters; this line has 12.',
            }
          : fittedOutcome(tier)
    );

    const report = await fitLineToTiers({ text: validText });

    expect(fitBoardToTierMock).toHaveBeenCalledTimes(4);
    expect(report.textValid).toBe(true);
    expect(report.tiers.map((entry) => entry.tier)).toEqual(boardFitTierOrder);
    expect(report.tiers.filter((entry) => entry.feasible)).toHaveLength(3);
    const expertEntry = report.tiers.find((entry) => entry.tier === 'expert');
    expect(expertEntry?.reason).toContain('Expert');
    expect(report.suggestedTier).not.toBe('expert');

    // 3 feasible layouts + 1 report cached, each with a TTL.
    expect(redisMock.set).toHaveBeenCalledTimes(4);
    expect(redisMock.expire).toHaveBeenCalledTimes(4);
    const hash = boardFitTextHash(validText);
    const setKeys = redisMock.set.mock.calls.map((call) => call[0] as string);
    expect(setKeys).toContain(`decrypt:fit:${hash}:report`);
    expect(setKeys).toContain(`decrypt:fit:${hash}:layout:warmup`);
    for (const call of redisMock.expire.mock.calls) {
      expect(call[1]).toBe(45 * 60);
    }
  });

  it('serves the cached report without re-fitting', async () => {
    fitBoardToTierMock.mockImplementation(({ tier }: { tier: string }) =>
      fittedOutcome(tier)
    );
    const first = await fitLineToTiers({ text: validText });
    expect(fitBoardToTierMock).toHaveBeenCalledTimes(4);

    redisMock.get.mockImplementation((key: string) =>
      key.endsWith(':report')
        ? Promise.resolve(JSON.stringify(first))
        : Promise.resolve(null)
    );
    const second = await fitLineToTiers({ text: validText });
    expect(fitBoardToTierMock).toHaveBeenCalledTimes(4);
    expect(second).toEqual(first);
  });

  it('ignores cached reports from an older fitter version', async () => {
    fitBoardToTierMock.mockImplementation(({ tier }: { tier: string }) =>
      fittedOutcome(tier)
    );
    redisMock.get.mockResolvedValue(
      JSON.stringify({ layoutVersion: 'v0-stale', tiers: [] })
    );
    await fitLineToTiers({ text: validText });
    expect(fitBoardToTierMock).toHaveBeenCalledTimes(4);
  });
});

describe('getCachedFittedLayout', () => {
  beforeEach(() => {
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.expire.mockReset();
    fitBoardToTierMock.mockReset();
    redisMock.set.mockResolvedValue(undefined);
    redisMock.expire.mockResolvedValue(undefined);
  });

  it('returns the cached layout without re-fitting', async () => {
    const layout = fakeLayout('medium');
    redisMock.get.mockResolvedValue(JSON.stringify(layout));
    const result = await getCachedFittedLayout({ text: validText, tier: 'medium' });
    expect(result).toEqual(layout);
    expect(fitBoardToTierMock).not.toHaveBeenCalled();
  });

  it('re-fits deterministically on a cache miss and writes back', async () => {
    redisMock.get.mockResolvedValue(null);
    fitBoardToTierMock.mockReturnValue(fittedOutcome('medium'));
    const result = await getCachedFittedLayout({ text: validText, tier: 'medium' });
    expect(result).toEqual(fakeLayout('medium'));
    expect(fitBoardToTierMock).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    expect(redisMock.expire).toHaveBeenCalledTimes(1);
  });

  it('returns null when the tier is infeasible', async () => {
    redisMock.get.mockResolvedValue(null);
    fitBoardToTierMock.mockReturnValue({
      fitted: false,
      reasonCode: 'COULD_NOT_REACH_BAND',
      detail: 'no fit',
    });
    const result = await getCachedFittedLayout({ text: validText, tier: 'expert' });
    expect(result).toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('re-fits when the cached layout is from an older fitter version', async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify({ ...fakeLayout('medium'), layoutVersion: 'v0-stale' })
    );
    fitBoardToTierMock.mockReturnValue(fittedOutcome('medium'));
    const result = await getCachedFittedLayout({ text: validText, tier: 'medium' });
    expect(result).toEqual(fakeLayout('medium'));
    expect(fitBoardToTierMock).toHaveBeenCalledTimes(1);
  });
});
