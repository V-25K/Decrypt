import { describe, expect, it } from 'vitest';
import {
  buildRetryDialogState,
  formatRetryPenaltyLabel,
  getRetryAction,
} from './retry-flow';

describe('retry flow helpers', () => {
  it('formats retry score penalties', () => {
    expect(formatRetryPenaltyLabel(1)).toBe('No penalty');
    expect(formatRetryPenaltyLabel(0.875)).toBe('-13% score');
  });

  it('chooses no retry action when no level is active', () => {
    expect(
      getRetryAction({
        levelId: '',
        mode: 'daily',
        isGameOver: true,
        requiresPaidRetry: true,
        hasInfiniteHearts: true,
        currentLives: 0,
      })
    ).toBe('none');
  });

  it('routes paid daily game-over retries to the paid retry dialog when hearts are available', () => {
    expect(
      getRetryAction({
        levelId: 'daily-1',
        mode: 'daily',
        isGameOver: true,
        requiresPaidRetry: true,
        hasInfiniteHearts: false,
        currentLives: 1,
      })
    ).toBe('open-paid-daily-retry');
  });

  it('routes retries to heart purchase when lives are empty', () => {
    expect(
      getRetryAction({
        levelId: 'daily-1',
        mode: 'daily',
        isGameOver: true,
        requiresPaidRetry: true,
        hasInfiniteHearts: false,
        currentLives: 0,
      })
    ).toBe('open-heart-purchase');

    expect(
      getRetryAction({
        levelId: 'daily-1',
        mode: 'endless',
        isGameOver: true,
        requiresPaidRetry: false,
        hasInfiniteHearts: false,
        currentLives: 0,
      })
    ).toBe('open-heart-purchase');
  });

  it('allows a normal level restart when no paid retry or heart gate applies', () => {
    expect(
      getRetryAction({
        levelId: 'endless-1',
        mode: 'endless',
        isGameOver: true,
        requiresPaidRetry: false,
        hasInfiniteHearts: false,
        currentLives: 2,
      })
    ).toBe('restart-level');
  });

  it('builds paid retry dialog state', () => {
    expect(
      buildRetryDialogState({
        coins: 125,
        nextDailyRetryCost: 35,
        nextDailyRetryScoreFactor: 0.9,
        dailyRetryCount: 0,
        puzzleDifficulty: 7,
        difficultyLabel: 'Hard',
      })
    ).toEqual({
      cost: 35,
      penaltyLabel: '-10% score',
      nextPenaltyLabel: '-11% score',
      nextCost: 75,
      coins: 125,
      difficulty: 7,
      difficultyLabel: 'Hard',
    });
  });

  it('returns null when the paid retry dialog is unavailable', () => {
    expect(
      buildRetryDialogState({
        coins: 125,
        nextDailyRetryCost: 0,
        nextDailyRetryScoreFactor: 1,
        dailyRetryCount: 0,
        puzzleDifficulty: undefined,
        difficultyLabel: 'Normal',
      })
    ).toBeNull();
  });
});
