import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../shared/game';

const { watchMock, hGetMock, hIncrByMock, tx } = vi.hoisted(() => ({
  watchMock: vi.fn(),
  hGetMock: vi.fn(),
  hIncrByMock: vi.fn(),
  tx: {
    unwatch: vi.fn(),
    multi: vi.fn(),
    hIncrBy: vi.fn(),
    hSet: vi.fn(),
    exec: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    watch: watchMock,
    hGet: hGetMock,
    hIncrBy: hIncrByMock,
  },
}));

// wallet.ts imports defaultUserProfile only for the mutateHearts snapshot.
vi.mock('./state', () => ({
  defaultUserProfile: vi.fn(
    () =>
      ({
        coins: 0,
        hearts: 3,
        lastHeartRefillTs: 0,
        infiniteHeartsExpiryTs: 0,
      }) as unknown as UserProfile
  ),
}));

import { grantCoins, mutateHearts, spendCoins } from './wallet';
import { keyUserProfile } from './keys';

const profileKey = keyUserProfile('t2_u');

afterEach(() => {
  vi.clearAllMocks();
});

describe('grantCoins', () => {
  it('grants coins via an atomic hIncrBy, never a full-profile write', async () => {
    hIncrByMock.mockResolvedValue(120);

    const balance = await grantCoins('t2_u', 20);

    expect(hIncrByMock).toHaveBeenCalledWith(profileKey, 'coins', 20);
    expect(balance).toBe(120);
  });

  it('is a no-op read for a non-positive amount', async () => {
    hGetMock.mockResolvedValue('100');

    const balance = await grantCoins('t2_u', 0);

    expect(hIncrByMock).not.toHaveBeenCalled();
    expect(balance).toBe(100);
  });
});

describe('spendCoins', () => {
  it('spends inside a watched transaction when affordable', async () => {
    hGetMock.mockResolvedValue('50');
    watchMock.mockResolvedValue(tx);
    tx.exec.mockResolvedValue([-30]); // non-null => committed

    const result = await spendCoins('t2_u', 30);

    expect(watchMock).toHaveBeenCalledWith(profileKey);
    expect(tx.hIncrBy).toHaveBeenCalledWith(profileKey, 'coins', -30);
    expect(result).toEqual({ ok: true, balance: 20 });
  });

  it('refuses to spend (and never opens a transaction) when funds are short', async () => {
    hGetMock.mockResolvedValue('10');
    watchMock.mockResolvedValue(tx);

    const result = await spendCoins('t2_u', 30);

    expect(tx.unwatch).toHaveBeenCalled();
    expect(tx.multi).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, balance: 10 });
  });

  it('retries on a watch conflict and gives up after the retry budget', async () => {
    hGetMock.mockResolvedValue('50');
    watchMock.mockResolvedValue(tx);
    tx.exec.mockResolvedValue(null); // null => aborted by watch conflict

    const result = await spendCoins('t2_u', 30);

    // 3 optimistic attempts, then a final balance read.
    expect(tx.exec).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
  });
});

describe('mutateHearts', () => {
  it('writes ONLY the heart fields back (never coins)', async () => {
    hGetMock.mockImplementation(async (_key: string, field: string) => {
      switch (field) {
        case 'coins':
          return '500';
        case 'hearts':
          return '1';
        case 'lastHeartRefillTs':
          return '0';
        case 'infiniteHeartsExpiryTs':
          return '0';
        default:
          return undefined;
      }
    });
    watchMock.mockResolvedValue(tx);
    tx.exec.mockResolvedValue([1]);

    await mutateHearts('t2_u', (profile) => ({ ...profile, hearts: 3 }));

    expect(tx.hSet).toHaveBeenCalledTimes(1);
    const written = tx.hSet.mock.calls[0]?.[1] as Record<string, string>;
    expect(Object.keys(written).sort()).toEqual([
      'hearts',
      'infiniteHeartsExpiryTs',
      'lastHeartRefillTs',
    ]);
    expect(written).not.toHaveProperty('coins');
    expect(written.hearts).toBe('3');
  });
});
