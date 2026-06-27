import { redis } from '@devvit/web/server';
import type { UserProfile } from '../../shared/game';
import { keyUserProfile } from './keys';
import { parseNumber, transactionCommitted } from './redis-util';
import { heartsPerRun } from './constants';
import { defaultUserProfile } from './state';

/**
 * Wallet helpers — the ONLY sanctioned way to mutate a player's monetary state.
 *
 * The four "wallet" fields on the profile hash — `coins`, `hearts`,
 * `lastHeartRefillTs`, `infiniteHeartsExpiryTs` — must never be written by a
 * full-object save (`saveUserProfile`). A blind hSet that read a value earlier
 * and writes it later silently clobbers a concurrent atomic increment, which is
 * how coins/items used to dupe under concurrency.
 *
 * Rules enforced by this module:
 *   - Coin GRANTS use `hIncrBy` directly (atomic, no transaction → no exposure
 *     to the 20-concurrent-transaction-per-installation Devvit limit).
 *   - Coin SPENDS use a watched optimistic transaction (they must check the
 *     balance first). Per-user spend concurrency is naturally low.
 *   - HEART changes go through `mutateHearts`, which writes back ONLY the heart
 *     fields inside a watched transaction.
 */

// Fields that this module owns. Anything writing the profile hash outside this
// module must exclude these (see `saveProfileStats` in state.ts).
export const WALLET_FIELDS = [
  'coins',
  'hearts',
  'lastHeartRefillTs',
  'infiniteHeartsExpiryTs',
] as const;

const maxOptimisticRetries = 3;

/**
 * Atomically add coins to a player. `hIncrBy` is atomic on its own, so no
 * transaction is needed. Returns the new coin balance. A non-positive amount is
 * a no-op that just returns the current balance.
 */
export const grantCoins = async (
  userId: string,
  amount: number
): Promise<number> => {
  const profileKey = keyUserProfile(userId);
  const delta = Math.max(0, Math.floor(amount));
  if (delta === 0) {
    return parseNumber(await redis.hGet(profileKey, 'coins'), 0);
  }
  return await redis.hIncrBy(profileKey, 'coins', delta);
};

/**
 * Atomically spend coins if the player can afford it. Uses the same watched
 * optimistic loop as the existing purchase paths so a concurrent grant/spend
 * cannot wipe this deduction. Returns whether the spend happened and the
 * resulting (or current, on failure) balance.
 */
export const spendCoins = async (
  userId: string,
  amount: number
): Promise<{ ok: boolean; balance: number }> => {
  const profileKey = keyUserProfile(userId);
  const cost = Math.max(0, Math.floor(amount));
  if (cost === 0) {
    return { ok: true, balance: parseNumber(await redis.hGet(profileKey, 'coins'), 0) };
  }
  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(profileKey);
    const coins = parseNumber(await redis.hGet(profileKey, 'coins'), 0);
    if (coins < cost) {
      await tx.unwatch();
      return { ok: false, balance: coins };
    }
    await tx.multi();
    await tx.hIncrBy(profileKey, 'coins', -cost);
    const execResult = await tx.exec();
    if (transactionCommitted(execResult)) {
      return { ok: true, balance: coins - cost };
    }
  }
  return {
    ok: false,
    balance: parseNumber(await redis.hGet(profileKey, 'coins'), 0),
  };
};

/**
 * Mutate ONLY the heart fields inside a watched optimistic transaction. The
 * caller provides a pure transform over a minimal profile snapshot (e.g.
 * `consumeHeartOnFailure`, `addHeartsFromBundle`, `normalizeHearts`). Coins are
 * never touched here — combine with `grantCoins`/`spendCoins` if both must
 * change.
 *
 * Returns the resulting minimal profile so callers can build a response.
 */
export const mutateHearts = async (
  userId: string,
  transform: (profile: UserProfile, nowTs: number) => UserProfile
): Promise<UserProfile> => {
  const profileKey = keyUserProfile(userId);
  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(profileKey);
    const nowTs = Date.now();
    const [coinsRaw, heartsRaw, lastRefillRaw, infiniteRaw] = await Promise.all([
      redis.hGet(profileKey, 'coins'),
      redis.hGet(profileKey, 'hearts'),
      redis.hGet(profileKey, 'lastHeartRefillTs'),
      redis.hGet(profileKey, 'infiniteHeartsExpiryTs'),
    ]);
    const snapshot: UserProfile = {
      ...defaultUserProfile(),
      coins: parseNumber(coinsRaw ?? undefined, 0),
      hearts: parseNumber(heartsRaw ?? undefined, heartsPerRun),
      lastHeartRefillTs: parseNumber(lastRefillRaw ?? undefined, nowTs),
      infiniteHeartsExpiryTs: parseNumber(infiniteRaw ?? undefined, 0),
    };
    const next = transform(snapshot, nowTs);
    await tx.multi();
    await tx.hSet(profileKey, {
      hearts: `${next.hearts}`,
      lastHeartRefillTs: `${next.lastHeartRefillTs}`,
      infiniteHeartsExpiryTs: `${next.infiniteHeartsExpiryTs}`,
    });
    const execResult = await tx.exec();
    if (transactionCommitted(execResult)) {
      return next;
    }
  }
  throw new Error('Heart update conflicted. Please try again.');
};
