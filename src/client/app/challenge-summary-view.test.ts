import { describe, expect, it } from 'vitest';
import {
  formatLevelNumber,
  getChallengeSummaryView,
} from './challenge-summary-view';
import { getChallengeBackgroundAsset } from './challenge-backgrounds';
import type { Puzzle } from './types';

const puzzle = (overrides: Partial<Puzzle> = {}): Puzzle => ({
  author: 'author',
  challengeType: 'MOVIE_LINE',
  dateKey: '2026-05-17',
  difficulty: 8,
  heartsMax: 3,
  levelId: 'daily-42',
  targetTimeSeconds: 30,
  tiles: [],
  words: [],
  ...overrides,
});

describe('formatLevelNumber', () => {
  it('formats trailing numeric level ids', () => {
    expect(formatLevelNumber('daily-007')).toBe('7');
  });

  it('keeps non-numeric ids unchanged', () => {
    expect(formatLevelNumber('daily-latest')).toBe('daily-latest');
  });
});

describe('getChallengeSummaryView', () => {
  it('builds challenge labels and stable background data from the puzzle', () => {
    const view = getChallengeSummaryView({
      levelId: 'daily-007',
      puzzle: puzzle(),
    });

    expect(view.formattedLevel).toBe('7');
    expect(view.challengeTypeLabel).toBe('Movie');
    expect(view.difficultyLabel).toBe('Hard');
    expect(view.backgroundClass).toBe(`challenge-backdrop-img-${view.backgroundIndex + 1}`);
    expect(view.backgroundAsset).toBe(getChallengeBackgroundAsset(view.backgroundIndex));
  });

  it('falls back to the requested level when puzzle data is unavailable', () => {
    const view = getChallengeSummaryView({
      levelId: 'fallback-12',
      puzzle: null,
    });

    expect(view.formattedLevel).toBe('12');
    expect(view.challengeTypeLabel).toBe('Quote');
    expect(view.difficultyLabel).toBe('Medium');
  });
});
