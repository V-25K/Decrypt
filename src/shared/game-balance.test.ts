import { describe, expect, it } from 'vitest';
import { getDailyRetryQuote } from './game-balance';

describe('game balance retry quote arithmetic', () => {
  it('matches the current retry score multiplier and next retry cost', () => {
    expect(getDailyRetryQuote({
      retryCount: 0,
      difficulty: 5,
    })).toEqual({
      retryScoreFactor: 1,
      nextRetryCost: 35,
      nextRetryScoreFactor: 1,
    });

    const thirdAttemptQuote = getDailyRetryQuote({
      retryCount: 2,
      difficulty: 5,
    });

    expect(thirdAttemptQuote.retryScoreFactor).toBeCloseTo(
      1 - 0.25 * (Math.log(2) / Math.log(5)),
      8
    );
    expect(thirdAttemptQuote.nextRetryCost).toBe(105);
    expect(thirdAttemptQuote.nextRetryScoreFactor).toBeCloseTo(
      1 - 0.25 * (Math.log(3) / Math.log(5)),
      8
    );
  });

  it('clamps invalid retry quote inputs into playable bounds', () => {
    expect(getDailyRetryQuote({
      retryCount: Number.NaN,
      difficulty: Number.NaN,
    })).toEqual({
      retryScoreFactor: 1,
      nextRetryCost: 35,
      nextRetryScoreFactor: 1,
    });
  });
});
