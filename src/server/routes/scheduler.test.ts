import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  stagePuzzleForTomorrowMock,
  publishStagedPuzzleMock,
  reportFailureMock,
  settingsGetMock,
} = vi.hoisted(() => ({
  stagePuzzleForTomorrowMock: vi.fn(),
  publishStagedPuzzleMock: vi.fn(),
  reportFailureMock: vi.fn(),
  settingsGetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  settings: {
    get: settingsGetMock,
  },
}));

vi.mock('../core/generator', () => ({
  stagePuzzleForTomorrow: stagePuzzleForTomorrowMock,
  publishStagedPuzzle: publishStagedPuzzleMock,
}));

vi.mock('../core/generation-failure', () => ({
  reportAutomatedGenerationFailure: reportFailureMock,
}));

import { schedulerRoutes } from './scheduler';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-07T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  stagePuzzleForTomorrowMock.mockReset();
  publishStagedPuzzleMock.mockReset();
  reportFailureMock.mockReset();
  settingsGetMock.mockReset();
});

describe('scheduler routes', () => {
  it('reports failure for generate-daily automation path', async () => {
    settingsGetMock.mockResolvedValue(true);
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
    settingsGetMock.mockResolvedValue(true);
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
    settingsGetMock.mockResolvedValue(false);

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
    expect(reportFailureMock).not.toHaveBeenCalled();
  });
});
