import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runJobMock, reportFailureMock } = vi.hoisted(() => ({
  runJobMock: vi.fn(),
  reportFailureMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  scheduler: {
    runJob: runJobMock,
  },
}));

vi.mock('../core/generation-failure', () => ({
  reportAutomatedGenerationFailure: reportFailureMock,
}));

import { triggers } from './triggers';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  runJobMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  runJobMock.mockReset();
  reportFailureMock.mockReset();
});

describe('triggers route', () => {
  it('schedules an immediate daily staging run on app install', async () => {
    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    expect(runJobMock).toHaveBeenCalledWith({
      name: 'decrypt-generate-daily-2200',
      runAt: expect.any(Date),
    });
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message: 'Bootstrap trigger received (AppInstall); requested an immediate daily staging run.',
    });
  });

  it('acknowledges app upgrade without scheduling a staging run', async () => {
    const response = await triggers.request('http://localhost/on-app-upgrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppUpgrade' }),
    });

    expect(response.status).toBe(200);
    expect(runJobMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message:
        'Bootstrap trigger received (AppUpgrade); no immediate staging or post creation was performed.',
    });
  });
});
