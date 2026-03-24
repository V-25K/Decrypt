import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createPostMock, reportFailureMock, settingsGetMock } = vi.hoisted(
  () => ({
    createPostMock: vi.fn(),
    reportFailureMock: vi.fn(),
    settingsGetMock: vi.fn(),
  })
);

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest', subredditId: 't5_test' },
  settings: {
    get: settingsGetMock,
  },
}));

vi.mock('../core/post', () => ({
  createPost: createPostMock,
}));

vi.mock('../core/generation-failure', () => ({
  reportAutomatedGenerationFailure: reportFailureMock,
}));

import { triggers } from './triggers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-07T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  createPostMock.mockReset();
  reportFailureMock.mockReset();
  settingsGetMock.mockReset();
});

describe('triggers route', () => {
  it('reports automated install failure and returns 400', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'dailyAutomationEnabled') {
        return true;
      }
      if (key === 'geminiApiKey') {
        return 'api-key';
      }
      return undefined;
    });
    createPostMock.mockRejectedValue(new Error('generation failed'));

    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(400);
    expect(reportFailureMock).toHaveBeenCalledWith({
      source: 'trigger.on-app-install',
      dateKey: '2026-03-07',
      error: expect.any(Error),
    });
  });

  it('skips auto post when automation is disabled', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'dailyAutomationEnabled') {
        return false;
      }
      return undefined;
    });

    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('skips auto post when gemini key is missing', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'dailyAutomationEnabled') {
        return true;
      }
      if (key === 'geminiApiKey') {
        return '';
      }
      return undefined;
    });

    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    expect(createPostMock).not.toHaveBeenCalled();
  });
});
