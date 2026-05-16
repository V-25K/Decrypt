import { beforeEach, describe, expect, it } from 'vitest';
import {
  persistCorrectGuessIndices,
  readCorrectGuessIndices,
} from './game-storage';
import { readRestoredCorrectGuessFeedback } from './server-puzzle-view';
import type { Puzzle, PuzzlePublicTile } from './types';

const tile = (
  index: number,
  overrides: Partial<PuzzlePublicTile> = {}
): PuzzlePublicTile => ({
  index,
  char: '_',
  displayChar: '_',
  cipherNumber: index + 1,
  isLetter: true,
  isLocked: false,
  isSessionRevealed: false,
  ...overrides,
});

const puzzle = (tiles: PuzzlePublicTile[]): Puzzle => ({
  levelId: 'daily-1',
  quote: 'ABC',
  normalizedQuote: 'ABC',
  tiles,
  heartsMax: 3,
  difficulty: 2,
  challengeType: 'daily',
});

describe('readRestoredCorrectGuessFeedback', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns no feedback without a user id', () => {
    const restored = readRestoredCorrectGuessFeedback({
      userId: null,
      levelId: 'daily-1',
      view: puzzle([tile(0, { displayChar: 'A' })]),
    });

    expect(restored.size).toBe(0);
  });

  it('keeps only stored indices revealed in the current server view', () => {
    persistCorrectGuessIndices('user-a', 'daily-1', [0, 1, 2]);

    const restored = readRestoredCorrectGuessFeedback({
      userId: 'user-a',
      levelId: 'daily-1',
      view: puzzle([
        tile(0, { displayChar: 'A' }),
        tile(1),
        tile(2, { isLetter: false, displayChar: '-' }),
      ]),
    });

    expect(Array.from(restored)).toEqual([0]);
    expect(readCorrectGuessIndices('user-a', 'daily-1')).toEqual([0]);
  });
});
