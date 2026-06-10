import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  countPublishedAutoDailyPuzzlesForDateMock,
  generatePuzzleForDateMock,
  publishAndActivateDailyPostMock,
  reportFailureMock,
  awardDailyTopRankMock,
  getDailyAutomationEnabledMock,
  runJobMock,
} = vi.hoisted(() => ({
  countPublishedAutoDailyPuzzlesForDateMock: vi.fn(),
  generatePuzzleForDateMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
  reportFailureMock: vi.fn(),
  awardDailyTopRankMock: vi.fn(),
  getDailyAutomationEnabledMock: vi.fn(),
  runJobMock: vi.fn(),
}));

vi.mock('../core/generator', () => ({
  generatePuzzleForDate: generatePuzzleForDateMock,
  publishAndActivateDailyPost: publishAndActivateDailyPostMock,
}));

vi.mock('../core/puzzle-store', () => ({
  countPublishedAutoDailyPuzzlesForDate: countPublishedAutoDailyPuzzlesForDateMock,
}));

vi.mock('../core/generation-failure', () => ({
  reportAutomatedGenerationFailure: reportFailureMock,
}));

vi.mock('../core/leaderboard', () => ({
  awardDailyTopRank: awardDailyTopRankMock,
}));

vi.mock('../core/config', () => ({
  getDailyAutomationEnabled: getDailyAutomationEnabledMock,
}));

vi.mock('@devvit/web/server', () => ({
  scheduler: {
    runJob: runJobMock,
  },
}));

import { schedulerRoutes } from './scheduler';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-07T00:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  runJobMock.mockResolvedValue(undefined);
  getDailyAutomationEnabledMock.mockResolvedValue(true);
  countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(0);
  generatePuzzleForDateMock.mockResolvedValue({
    levelId: 'lvl_0042',
    dateKey: '2026-03-07',
  });
  publishAndActivateDailyPostMock.mockResolvedValue('t3_daily123');
  awardDailyTopRankMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  countPublishedAutoDailyPuzzlesForDateMock.mockReset();
  generatePuzzleForDateMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
  reportFailureMock.mockReset();
  awardDailyTopRankMock.mockReset();
  getDailyAutomationEnabledMock.mockReset();
  runJobMock.mockReset();
});

describe('scheduler routes', () => {
  it('generates and publishes one daily challenge at 00:00 UTC', async () => {
    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(countPublishedAutoDailyPuzzlesForDateMock).toHaveBeenCalledWith(
      '2026-03-07'
    );
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(
      new Date('2026-03-07T00:00:00.000Z')
    );
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0042',
      dateKey: '2026-03-07',
      runAs: 'APP',
    });
    expect(awardDailyTopRankMock).toHaveBeenCalledWith('2026-03-06');
  });

  it('skips automation when disabled', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(false);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(countPublishedAutoDailyPuzzlesForDateMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('publishes when invoked later in the UTC day if no daily exists yet (retry path)', async () => {
    // A Devvit cron retry past 00:00 UTC must still recover the daily post.
    vi.setSystemTime(new Date('2026-03-07T12:34:00Z'));
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(0);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(countPublishedAutoDailyPuzzlesForDateMock).toHaveBeenCalledWith(
      '2026-03-07'
    );
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(
      new Date('2026-03-07T12:34:00.000Z')
    );
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0042',
      dateKey: '2026-03-07',
      runAs: 'APP',
    });
    expect(awardDailyTopRankMock).toHaveBeenCalledWith('2026-03-06');
  });

  it('still respects the count-based idempotency at non-zero UTC hours', async () => {
    // Even on a late retry, if a daily already exists for today, no second post is created.
    vi.setSystemTime(new Date('2026-03-07T18:00:00Z'));
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(countPublishedAutoDailyPuzzlesForDateMock).toHaveBeenCalledWith(
      '2026-03-07'
    );
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(awardDailyTopRankMock).toHaveBeenCalledWith('2026-03-06');
  });

  it('does not generate a second daily challenge once the day quota is met', async () => {
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(awardDailyTopRankMock).toHaveBeenCalledWith('2026-03-06');
  });

  it('reports failure for the midnight publish automation path', async () => {
    generatePuzzleForDateMock.mockRejectedValue(new Error('failed'));

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(500);
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.publish-daily',
      dateKey: '2026-03-07',
      error: expect.any(Error),
    });
  });

  it('rejects a generated puzzle for the wrong UTC date', async () => {
    generatePuzzleForDateMock.mockResolvedValue({
      levelId: 'lvl_wrong_day',
      dateKey: '2026-03-08',
    });

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(500);
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.publish-daily',
      dateKey: '2026-03-07',
      error: expect.any(Error),
    });
  });
});
