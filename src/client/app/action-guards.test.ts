import { describe, expect, it } from 'vitest';
import {
  getBusyActionBlockState,
  getOfferPurchaseBlockState,
  hasActiveGuessWork,
  isBusyOrGuessBlocked,
  isOfferPurchaseBlocked,
} from './action-guards';

describe('action guard helpers', () => {
  it('detects active guess work', () => {
    expect(
      hasActiveGuessWork({
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toBe(false);

    expect(
      hasActiveGuessWork({
        processingGuess: true,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toBe(true);

    expect(
      hasActiveGuessWork({
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 2,
      })
    ).toBe(true);
  });

  it('blocks busy or guessing actions', () => {
    expect(
      isBusyOrGuessBlocked({
        busy: false,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toBe(false);

    expect(
      isBusyOrGuessBlocked({
        busy: true,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toBe(true);

    expect(
      isBusyOrGuessBlocked({
        busy: false,
        processingGuess: false,
        guessInFlight: true,
        queuedGuessCount: 0,
      })
    ).toBe(true);
  });

  it('blocks offer purchases when offer purchase state is already busy', () => {
    expect(
      isOfferPurchaseBlocked({
        offerBusy: true,
        busy: false,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toBe(true);
  });

  it('returns named busy action block state', () => {
    expect(
      getBusyActionBlockState({
        busy: true,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toEqual({
      blocked: true,
      guessWorkActive: false,
    });

    expect(
      getBusyActionBlockState({
        busy: false,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 1,
      })
    ).toEqual({
      blocked: true,
      guessWorkActive: true,
    });
  });

  it('returns named offer purchase block state', () => {
    expect(
      getOfferPurchaseBlockState({
        offerBusy: true,
        busy: false,
        processingGuess: false,
        guessInFlight: false,
        queuedGuessCount: 0,
      })
    ).toEqual({
      blocked: true,
      guessWorkActive: false,
    });
  });
});
