import { afterEach, describe, expect, it, vi } from 'vitest';

const { hSetMock } = vi.hoisted(() => ({ hSetMock: vi.fn() }));

vi.mock('@devvit/web/server', () => ({
  redis: { hSet: hSetMock },
}));

import { defaultUserProfile, saveProfileStats } from './state';
import { keyUserProfile } from './keys';

afterEach(() => {
  vi.clearAllMocks();
});

describe('saveProfileStats', () => {
  it('writes stats but NEVER the wallet fields', async () => {
    const profile = {
      ...defaultUserProfile(),
      coins: 999,
      hearts: 1,
      lastHeartRefillTs: 123,
      infiniteHeartsExpiryTs: 456,
      totalLevelsCompleted: 7,
    };

    await saveProfileStats('t2_u', profile);

    expect(hSetMock).toHaveBeenCalledTimes(1);
    const [key, fields] = hSetMock.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(key).toBe(keyUserProfile('t2_u'));
    // The four wallet fields are owned by wallet.ts and must be excluded.
    expect(fields).not.toHaveProperty('coins');
    expect(fields).not.toHaveProperty('hearts');
    expect(fields).not.toHaveProperty('lastHeartRefillTs');
    expect(fields).not.toHaveProperty('infiniteHeartsExpiryTs');
    // Non-wallet stats are still persisted.
    expect(fields.totalLevelsCompleted).toBe('7');
  });
});
