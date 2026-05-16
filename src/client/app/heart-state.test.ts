import { describe, expect, it } from 'vitest';
import { heartRefillIntervalMs } from './constants';
import { canBuyCoinHeartsFromState, getHeartState } from './heart-state';

describe('getHeartState', () => {
  it('clamps stored hearts to the maximum lives', () => {
    const state = getHeartState({
      hearts: 12,
      infiniteHeartsExpiryTs: 0,
      lastHeartRefillTs: 1_000,
      nowTs: 1_000,
    });

    expect(state.maxLives).toBe(3);
    expect(state.currentLives).toBe(3);
    expect(state.nextLifeRemainingMs).toBe(0);
    expect(state.canUseLifeForChallenge).toBe(true);
    expect(state.heartsNotFull).toBe(false);
    expect(state.lifeStatusText).toBe('Full');
  });

  it('applies earned refills and reports the next refill countdown', () => {
    const state = getHeartState({
      hearts: 1,
      infiniteHeartsExpiryTs: 0,
      lastHeartRefillTs: 0,
      nowTs: heartRefillIntervalMs + 15 * 60 * 1_000,
    });

    expect(state.currentLives).toBe(2);
    expect(state.nextLifeRemainingMs).toBe(15 * 60 * 1_000);
    expect(state.heartsNotFull).toBe(true);
    expect(state.lifeStatusText).toBe('+1 in 15:00');
  });

  it('keeps a full refill interval when exactly on a non-full refill boundary', () => {
    const state = getHeartState({
      hearts: 1,
      infiniteHeartsExpiryTs: 0,
      lastHeartRefillTs: 0,
      nowTs: heartRefillIntervalMs,
    });

    expect(state.currentLives).toBe(2);
    expect(state.nextLifeRemainingMs).toBe(heartRefillIntervalMs);
    expect(state.lifeStatusText).toBe('+1 in 30:00');
  });

  it('treats active infinite hearts as full lives', () => {
    const state = getHeartState({
      hearts: 0,
      infiniteHeartsExpiryTs: 100_000,
      lastHeartRefillTs: 0,
      nowTs: 10_000,
    });

    expect(state.hasInfiniteHearts).toBe(true);
    expect(state.infiniteHeartsRemainingMs).toBe(90_000);
    expect(state.currentLives).toBe(3);
    expect(state.nextLifeRemainingMs).toBe(0);
    expect(state.canUseLifeForChallenge).toBe(true);
    expect(state.heartsNotFull).toBe(false);
    expect(state.lifeStatusText).toBe('Infinite 01:30');
  });

  it('handles empty lives without a usable challenge life', () => {
    const state = getHeartState({
      hearts: -2,
      infiniteHeartsExpiryTs: 0,
      lastHeartRefillTs: 10_000,
      nowTs: 10_000,
    });

    expect(state.currentLives).toBe(0);
    expect(state.canUseLifeForChallenge).toBe(false);
    expect(state.heartsNotFull).toBe(true);
    expect(state.lifeStatusText).toBe('+1 in 30:00');
  });
});

describe('canBuyCoinHeartsFromState', () => {
  it('allows coin hearts only when hearts can be bought immediately', () => {
    expect(
      canBuyCoinHeartsFromState({
        hasInfiniteHearts: false,
        coinHeartLimitReached: false,
        heartPurchaseBusy: false,
        heartsNotFull: true,
      })
    ).toBe(true);

    expect(
      canBuyCoinHeartsFromState({
        hasInfiniteHearts: true,
        coinHeartLimitReached: false,
        heartPurchaseBusy: false,
        heartsNotFull: true,
      })
    ).toBe(false);
    expect(
      canBuyCoinHeartsFromState({
        hasInfiniteHearts: false,
        coinHeartLimitReached: true,
        heartPurchaseBusy: false,
        heartsNotFull: true,
      })
    ).toBe(false);
    expect(
      canBuyCoinHeartsFromState({
        hasInfiniteHearts: false,
        coinHeartLimitReached: false,
        heartPurchaseBusy: true,
        heartsNotFull: true,
      })
    ).toBe(false);
    expect(
      canBuyCoinHeartsFromState({
        hasInfiniteHearts: false,
        coinHeartLimitReached: false,
        heartPurchaseBusy: false,
        heartsNotFull: false,
      })
    ).toBe(false);
  });
});
