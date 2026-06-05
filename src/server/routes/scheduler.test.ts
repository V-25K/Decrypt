import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PuzzleNotStagedError, PuzzlePublishInProgressError } from '../core/generator';

const {
  getAutoDailyLevelIdsForDateMock,
  getPuzzlePublicationReceiptMock,
  countPublishedAutoDailyPuzzlesForDateMock,
  generatePuzzleForDateMock,
  publishAndActivateDailyPostMock,
  stagePuzzleForTomorrowMock,
  publishStagedPuzzleMock,
  reportFailureMock,
  awardDailyTopRankMock,
  getDailyAutomationEnabledMock,
  runJobMock,
} = vi.hoisted(() => ({
    getAutoDailyLevelIdsForDateMock: vi.fn(),
    getPuzzlePublicationReceiptMock: vi.fn(),
    countPublishedAutoDailyPuzzlesForDateMock: vi.fn(),
    generatePuzzleForDateMock: vi.fn(),
    publishAndActivateDailyPostMock: vi.fn(),
    stagePuzzleForTomorrowMock: vi.fn(),
    publishStagedPuzzleMock: vi.fn(),
  reportFailureMock: vi.fn(),
  awardDailyTopRankMock: vi.fn(),
  getDailyAutomationEnabledMock: vi.fn(),
  runJobMock: vi.fn(),
}));

vi.mock('../core/generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/generator')>();
  return {
    ...actual,
    generatePuzzleForDate: generatePuzzleForDateMock,
    publishAndActivateDailyPost: publishAndActivateDailyPostMock,
    stagePuzzleForTomorrow: stagePuzzleForTomorrowMock,
    publishStagedPuzzle: publishStagedPuzzleMock,
  };
});

vi.mock('../core/puzzle-store', () => ({
  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
  getPuzzlePublicationReceipt: getPuzzlePublicationReceiptMock,
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
  getAutoDailyLevelIdsForDateMock.mockResolvedValue([]);
  getPuzzlePublicationReceiptMock.mockResolvedValue(null);
  runJobMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  getAutoDailyLevelIdsForDateMock.mockReset();
  getPuzzlePublicationReceiptMock.mockReset();
  countPublishedAutoDailyPuzzlesForDateMock.mockReset();
  generatePuzzleForDateMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
  stagePuzzleForTomorrowMock.mockReset();
  publishStagedPuzzleMock.mockReset();
  reportFailureMock.mockReset();
  awardDailyTopRankMock.mockReset();
  getDailyAutomationEnabledMock.mockReset();
  runJobMock.mockReset();
});

describe('scheduler routes', () => {
  it('reports failure for generate-daily automation path', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    stagePuzzleForTomorrowMock.mockRejectedValue(new Error('failed'));

    const response = await schedulerRoutes.request(
      'http://localhost/generate-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(500);
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.generate-daily',
      dateKey: '2026-03-08',
      error: expect.any(Error),
    });
  });

  it('reports failure for publish-daily automation path', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(0);
    publishStagedPuzzleMock.mockRejectedValue(new Error('failed'));

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
    expect(publishStagedPuzzleMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('does not publish outside the scheduled UTC windows', async () => {
    vi.setSystemTime(new Date('2026-03-07T06:30:00Z'));
    getDailyAutomationEnabledMock.mockResolvedValue(true);

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
    expect(publishStagedPuzzleMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(awardDailyTopRankMock).not.toHaveBeenCalled();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('does not publish a second challenge in the same scheduled UTC window', async () => {
    vi.setSystemTime(new Date('2026-03-07T12:15:00Z'));
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0042']);
    getPuzzlePublicationReceiptMock.mockResolvedValue({
      postId: 't3_daily123',
      dateKey: '2026-03-07',
      publishedAt: Date.parse('2026-03-07T12:05:00Z'),
    });

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(publishStagedPuzzleMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(awardDailyTopRankMock).not.toHaveBeenCalled();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('reads published receipts for a window in parallel', async () => {
    vi.setSystemTime(new Date('2026-03-07T12:15:00Z'));
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0101', 'lvl_0102']);
    const receiptResolvers: Array<() => void> = [];
    getPuzzlePublicationReceiptMock.mockImplementation(
      async (levelId: string) =>
        await new Promise((resolve) => {
          receiptResolvers.push(() =>
            resolve({
              postId: `t3_${levelId}`,
              dateKey: '2026-03-07',
              publishedAt: Date.parse('2026-03-07T12:05:00Z'),
            })
          );
        })
    );

    const responsePromise = schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(getPuzzlePublicationReceiptMock).toHaveBeenCalledTimes(2);
    expect(receiptResolvers).toHaveLength(2);
    for (const resolveReceipt of receiptResolvers) {
      resolveReceipt();
    }
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(publishStagedPuzzleMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
  });

  it('stages tomorrow puzzles directly during generate-daily', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    stagePuzzleForTomorrowMock.mockResolvedValue({
      levelId: 'lvl_0042',
      dateKey: '2026-03-08',
    });

    const response = await schedulerRoutes.request(
      'http://localhost/generate-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(stagePuzzleForTomorrowMock).toHaveBeenCalledTimes(1);
  });

  it('publishes without any background AI pool warm-up step', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(0);
    publishStagedPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0042',
      dateKey: '2026-03-07',
      postId: 't3_daily123',
    });
    awardDailyTopRankMock.mockResolvedValue(undefined);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(publishStagedPuzzleMock).toHaveBeenCalledTimes(1);
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(awardDailyTopRankMock).toHaveBeenCalledWith('2026-03-06');
  });

  it('waits for the in-flight staged publish instead of generating a fallback daily', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    publishStagedPuzzleMock.mockRejectedValue(
      new PuzzlePublishInProgressError('lvl_0042')
    );
    awardDailyTopRankMock.mockResolvedValue(undefined);

    const responsePromise = schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });

  it('generates and publishes the second same-day daily challenge when one is already live', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);
    publishStagedPuzzleMock.mockRejectedValue(
      new PuzzleNotStagedError()
    );
    generatePuzzleForDateMock.mockResolvedValue({
      levelId: 'lvl_0043',
      dateKey: '2026-03-07',
    });
    publishAndActivateDailyPostMock.mockResolvedValue('t3_daily124');
    awardDailyTopRankMock.mockResolvedValue(undefined);

    const response = await schedulerRoutes.request(
      'http://localhost/publish-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(new Date('2026-03-07T00:00:00.000Z'));
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0043',
      dateKey: '2026-03-07',
      runAs: 'APP',
    });
  });

  it('verify-daily accepts only when enough published AUTO_DAILY puzzles exist', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(2);

    const response = await schedulerRoutes.request(
      'http://localhost/verify-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(countPublishedAutoDailyPuzzlesForDateMock).toHaveBeenCalledWith('2026-03-07');
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('verify-daily reports missing published AUTO_DAILY puzzles', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);

    const response = await schedulerRoutes.request(
      'http://localhost/verify-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.verify-daily',
      dateKey: '2026-03-07',
      error: {
        reason:
          'Daily watchdog detected 1/2 published AUTO_DAILY puzzles for 2026-03-07.',
      },
    });
    expect(publishStagedPuzzleMock).toHaveBeenCalledTimes(1);
    expect(runJobMock).not.toHaveBeenCalled();
  });

  it('verify-daily reports recovery publish failures without relying on cron windows', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    countPublishedAutoDailyPuzzlesForDateMock.mockResolvedValue(1);
    const recoveryError = new Error('publish recovery failed');
    publishStagedPuzzleMock.mockRejectedValue(recoveryError);

    const response = await schedulerRoutes.request(
      'http://localhost/verify-daily',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    );

    expect(response.status).toBe(200);
    expect(publishStagedPuzzleMock).toHaveBeenCalledTimes(1);
    expect(runJobMock).not.toHaveBeenCalled();
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.verify-daily.recovery',
      dateKey: '2026-03-07',
      error: recoveryError,
    });
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'scheduler.verify-daily',
      dateKey: '2026-03-07',
      error: {
        reason:
          'Daily watchdog detected 1/2 published AUTO_DAILY puzzles for 2026-03-07.',
      },
    });
  });
});
