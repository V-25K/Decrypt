import { afterEach, describe, expect, it, vi } from 'vitest';

const { settingsGetMock } = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  settings: {
    get: settingsGetMock,
  },
}));

import { getDailyAutomationEnabled, getDecryptSettings } from './config';

afterEach(() => {
  settingsGetMock.mockReset();
});

describe('getDecryptSettings', () => {
  it('clamps aiMaxRetries to an upper bound of 8', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'aiMaxRetries') {
        return 99;
      }
      return undefined;
    });

    const parsed = await getDecryptSettings();
    expect(parsed.aiMaxRetries).toBe(8);
  });

  it('clamps aiMaxRetries to a lower bound of 1', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'aiMaxRetries') {
        return 0;
      }
      return undefined;
    });

    const parsed = await getDecryptSettings();
    expect(parsed.aiMaxRetries).toBe(1);
  });

  it('normalizes non-string contentSafetyMode values without crashing', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'contentSafetyMode') {
        return { value: ' strict ' };
      }
      return undefined;
    });

    const parsed = await getDecryptSettings();
    expect(parsed.contentSafetyMode).toBe('strict');
  });
});

describe('getDailyAutomationEnabled', () => {
  it('reads disabled app settings from wrapped select values', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'dailyAutomationEnabled') {
        return { value: 'disabled' };
      }
      return undefined;
    });

    const parsed = await getDailyAutomationEnabled();
    expect(parsed).toBe(false);
  });

  it('reads disabled app settings from array-shaped select values', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'dailyAutomationEnabled') {
        return ['disabled'];
      }
      return undefined;
    });

    const parsed = await getDailyAutomationEnabled();
    expect(parsed).toBe(false);
  });
});
