import { describe, expect, it } from 'vitest';
import { calculateRating, startingGlobalRating } from './rating';

describe('rating model', () => {
  it('starts players at 500 rating', () => {
    expect(startingGlobalRating).toBe(500);
  });

  it('increases rating on wins and decreases rating on losses', () => {
    const win = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 5,
    });
    const loss = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'loss',
      difficulty: 5,
    });

    expect(win.ratingDelta).toBeGreaterThan(0);
    expect(win.nextRating).toBeGreaterThan(startingGlobalRating);
    expect(loss.ratingDelta).toBeLessThan(0);
    expect(loss.nextRating).toBeLessThan(startingGlobalRating);
  });

  it('rewards harder wins more than easier wins', () => {
    const easy = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 1,
    });
    const hard = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 10,
    });

    expect(hard.ratingDelta).toBeGreaterThan(easy.ratingDelta);
  });

  it('reduces win gains for mistakes and powerups', () => {
    const clean = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 5,
      mistakes: 0,
      usedPowerups: 0,
    });
    const assisted = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 5,
      mistakes: 3,
      usedPowerups: 3,
    });

    expect(clean.ratingDelta).toBeGreaterThan(assisted.ratingDelta);
  });

  it('increases win gains with streaks within the delta cap', () => {
    const noStreak = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 5,
      currentWinStreak: 0,
    });
    const streak = calculateRating({
      playerRating: startingGlobalRating,
      ratingGames: 0,
      outcome: 'win',
      difficulty: 5,
      currentWinStreak: 5,
    });

    expect(streak.ratingDelta).toBeGreaterThan(noStreak.ratingDelta);
    expect(streak.ratingDelta).toBeLessThanOrEqual(40);
  });
});
