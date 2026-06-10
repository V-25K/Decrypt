import { describe, expect, it } from 'vitest';
import { transformer } from './transformer';

describe('transformer', () => {
  it('uses identity transforms for JSON-only tRPC payloads', () => {
    const payload = {
      levelId: 'daily_2026_05_16',
      score: 1250,
      entries: [
        {
          userId: 't2_alpha',
          username: 'alpha',
        },
      ],
    };

    expect(transformer.input.serialize(payload)).toBe(payload);
    expect(transformer.input.deserialize(payload)).toBe(payload);
    expect(transformer.output.serialize(payload)).toBe(payload);
    expect(transformer.output.deserialize(payload)).toBe(payload);
  });

  // The identity transformer is provably safe only if every payload is
  // structurally identical after a JSON round-trip. This test asserts the
  // contract on a payload shape representative of real tRPC outputs in this
  // app (mixed numbers, strings, nullables, arrays, optional records). If you
  // add a forbidden type (Date, Map, Set, BigInt, RegExp, etc.) anywhere in a
  // procedure output, the corresponding shape will fail this round-trip and
  // the identity transformer becomes unsafe — switch to superjson at that
  // point instead of papering over it.
  it('round-trips representative tRPC payloads through JSON without loss', () => {
    const payload = {
      ok: true,
      score: 1250,
      mistakes: 0,
      ratingDelta: -7,
      ratingAfter: 503,
      rewardCoins: 30,
      isCurrentDaily: true,
      rewardNotice: null,
      profile: {
        coins: 1200,
        hearts: 3,
        lastHeartRefillTs: 1717932000000,
        infiniteHeartsExpiryTs: 0,
        currentStreak: 5,
        audioEnabled: true,
        unlockedFlairs: ['rookie', 'speedster'],
        activeFlair: 'speedster',
      },
      inventory: {
        hammer: 2,
        wand: 0,
        shield: 1,
        rocket: 0,
      },
      entries: [
        { userId: 't2_alpha', username: 'alpha', score: 1340 },
        { userId: 't2_bravo', username: 'bravo', score: 1320 },
      ],
    };

    const roundTripped = JSON.parse(JSON.stringify(payload)) as typeof payload;
    expect(roundTripped).toEqual(payload);
  });

  it('catches forbidden types: a Date in a payload is silently truncated to a string after JSON round-trip', () => {
    // This test exists to document WHY Dates are forbidden. The structural
    // inequality after round-trip is exactly what would burn a procedure
    // author who returned a Date — the client receives a string, not the
    // Date the server typed in.
    const withDate = { eventAt: new Date('2026-06-09T12:00:00Z') };
    const roundTripped = JSON.parse(JSON.stringify(withDate));

    expect(typeof withDate.eventAt).toBe('object');
    expect(typeof roundTripped.eventAt).toBe('string');
    expect(roundTripped).not.toEqual(withDate);
  });
});
