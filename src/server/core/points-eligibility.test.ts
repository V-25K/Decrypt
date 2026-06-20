import { afterEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock, redisSetMock, getOfficialDailyCreatedAtForSequenceMock } =
  vi.hoisted(() => ({
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    getOfficialDailyCreatedAtForSequenceMock: vi.fn(),
  }));

vi.mock('@devvit/web/server', () => ({
  redis: { get: redisGetMock, set: redisSetMock },
}));

vi.mock('./generator', () => ({
  getOfficialDailyCreatedAtForSequence: getOfficialDailyCreatedAtForSequenceMock,
}));

import {
  globalScorePointsMinDailyNumber,
  isPuzzleEligibleForGlobalPoints,
  resolveGlobalScorePointsCutoffMs,
} from './points-eligibility';
import { keyGlobalScorePointsCutoffMs } from './keys';

afterEach(() => {
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  getOfficialDailyCreatedAtForSequenceMock.mockReset();
});

describe('global-points eligibility cutoff', () => {
  it('uses the cached cutoff without rescanning the catalog', async () => {
    redisGetMock.mockResolvedValue('1000');
    expect(await resolveGlobalScorePointsCutoffMs()).toBe(1000);
    expect(getOfficialDailyCreatedAtForSequenceMock).not.toHaveBeenCalled();
  });

  it('resolves from the threshold daily and caches it permanently when cold', async () => {
    redisGetMock.mockResolvedValue(null);
    getOfficialDailyCreatedAtForSequenceMock.mockResolvedValue(5000);
    expect(await resolveGlobalScorePointsCutoffMs()).toBe(5000);
    expect(getOfficialDailyCreatedAtForSequenceMock).toHaveBeenCalledWith(
      globalScorePointsMinDailyNumber
    );
    expect(redisSetMock).toHaveBeenCalledWith(
      keyGlobalScorePointsCutoffMs,
      '5000'
    );
  });

  it('awards points only for puzzles created at/after the cutoff', async () => {
    redisGetMock.mockResolvedValue('5000');
    expect(await isPuzzleEligibleForGlobalPoints({ createdAt: 5000 })).toBe(true);
    expect(await isPuzzleEligibleForGlobalPoints({ createdAt: 6000 })).toBe(true);
    expect(await isPuzzleEligibleForGlobalPoints({ createdAt: 4999 })).toBe(false);
  });

  it('fails open (awards points) until the threshold daily exists', async () => {
    redisGetMock.mockResolvedValue(null);
    getOfficialDailyCreatedAtForSequenceMock.mockResolvedValue(null);
    expect(await isPuzzleEligibleForGlobalPoints({ createdAt: 1 })).toBe(true);
    expect(redisSetMock).toHaveBeenCalledWith(
      keyGlobalScorePointsCutoffMs,
      'none',
      expect.objectContaining({ expiration: expect.any(Date) })
    );
  });

  it('fails open when resolution throws', async () => {
    redisGetMock.mockRejectedValue(new Error('redis down'));
    expect(await isPuzzleEligibleForGlobalPoints({ createdAt: 1 })).toBe(true);
  });
});
