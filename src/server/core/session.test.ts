import { afterEach, describe, expect, it, vi } from 'vitest';

const { hGetAllMock } = vi.hoisted(() => ({
  hGetAllMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGetAll: hGetAllMock,
    hSet: vi.fn(),
    expire: vi.fn(),
    hDel: vi.fn(),
    hKeys: vi.fn(),
  },
}));

import { getSessionState } from './session';

describe('getSessionState', () => {
  afterEach(() => {
    hGetAllMock.mockReset();
  });

  it('falls back to an empty revealed set when revealed indices JSON is malformed', async () => {
    hGetAllMock.mockResolvedValue({
      activeLevelId: 'lvl_1234',
      mode: 'daily',
      startTimestamp: '100',
      activeMs: '0',
      lastSeenAt: '0',
      mistakesMade: '0',
      shieldIsActive: '0',
      revealedIndices: '{"broken":',
      usedPowerups: '0',
      wrongGuesses: '0',
      guessCount: '0',
    });

    await expect(getSessionState('t2_test', 't3_test')).resolves.toEqual(
      expect.objectContaining({
        activeLevelId: 'lvl_1234',
        revealedIndices: [],
      })
    );
  });

  it('returns null instead of throwing on corrupt session values', async () => {
    hGetAllMock.mockResolvedValue({
      activeLevelId: 'lvl_1234',
      mode: 'daily',
      startTimestamp: '-5',
      activeMs: '0',
      lastSeenAt: '0',
      mistakesMade: '0',
      shieldIsActive: '0',
      revealedIndices: '[]',
      usedPowerups: '0',
      wrongGuesses: '0',
      guessCount: '0',
    });

    await expect(getSessionState('t2_test', 't3_test')).resolves.toBeNull();
  });
});
