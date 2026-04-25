import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAutoDailyLevelIdsForDateMock,
  getPuzzlePublicationReceiptMock,
  countPublishedAutoDailyPuzzlesForDateMock,
  generatePuzzleForDateMock,
  warmAICandidatePoolMock,
  publishAndActivateDailyPostMock,
  stagePuzzleForTomorrowMock,
  publishStagedPuzzleMock,
  reportFailureMock,
  awardDailyTopRankMock,
  getDailyAutomationEnabledMock,
} = vi.hoisted(() => ({
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getPuzzlePublicationReceiptMock: vi.fn(),
  countPublishedAutoDailyPuzzlesForDateMock: vi.fn(),
  generatePuzzleForDateMock: vi.fn(),
  warmAICandidatePoolMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
  stagePuzzleForTomorrowMock: vi.fn(),
  publishStagedPuzzleMock: vi.fn(),
  reportFailureMock: vi.fn(),
  awardDailyTopRankMock: vi.fn(),
  getDailyAutomationEnabledMock: vi.fn(),
}));

vi.mock('../core/ai-pool', () => ({
  warmAICandidatePool: warmAICandidatePoolMock,
}));

vi.mock('../core/generator', () => ({
  generatePuzzleForDate: generatePuzzleForDateMock,
  publishAndActivateDailyPost: publishAndActivateDailyPostMock,
  stagePuzzleForTomorrow: stagePuzzleForTomorrowMock,
  publishStagedPuzzle: publishStagedPuzzleMock,
}));

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

import { schedulerRoutes } from './scheduler';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-07T00:00:00Z'));
  getAutoDailyLevelIdsForDateMock.mockResolvedValue([]);
  getPuzzlePublicationReceiptMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  getAutoDailyLevelIdsForDateMock.mockReset();
  getPuzzlePublicationReceiptMock.mockReset();
  countPublishedAutoDailyPuzzlesForDateMock.mockReset();
  generatePuzzleForDateMock.mockReset();
  warmAICandidatePoolMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
  stagePuzzleForTomorrowMock.mockReset();
  publishStagedPuzzleMock.mockReset();
  reportFailureMock.mockReset();
  awardDailyTopRankMock.mockReset();
  getDailyAutomationEnabledMock.mockReset();
});

describe('scheduler routes', () => {
  it('reports failure for generate-daily automation path', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    warmAICandidatePoolMock.mockResolvedValue({
      attempted: 1,
      generated: 1,
      locked: false,
    });
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

  it('warms the AI pool before staging tomorrow puzzle', async () => {
    getDailyAutomationEnabledMock.mockResolvedValue(true);
    warmAICandidatePoolMock.mockResolvedValue({
      attempted: 2,
      generated: 3,
      locked: false,
    });
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
    expect(warmAICandidatePoolMock).toHaveBeenCalledWith({
      maxCandidatesToGenerate: 9,
    });
    expect(stagePuzzleForTomorrowMock).toHaveBeenCalledTimes(1);
  });

  it('publishes without warming the AI pool first', async () => {
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
    expect(warmAICandidatePoolMock).not.toHaveBeenCalled();
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
      new Error('Daily publish already in progress for lvl_0042. Please retry in a moment.')
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
      new Error('No staged puzzle is ready to publish.')
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
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(new Date('2026-03-07T00:00:00.000Z'), {
      allowSelectionRefill: true,
    });
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
  });
});
