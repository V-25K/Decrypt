import { describe, expect, it } from 'vitest';
import {
  applyRevealedTiles,
  countRemainingLetters,
  hasAvailableLetters,
} from './puzzle-view';
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

describe('puzzle-view helpers', () => {
  it('applies revealed tiles while preserving untouched tile objects', () => {
    const untouched = tile(1);
    const view = puzzle([tile(0), untouched]);
    const next = applyRevealedTiles(view, [{ index: 0, letter: 'A' }]);

    expect(next?.tiles[0]).toMatchObject({
      displayChar: 'A',
      isSessionRevealed: true,
    });
    expect(next?.tiles[1]).toBe(untouched);
  });

  it('returns the same puzzle when no reveal can be applied', () => {
    const view = puzzle([tile(0)]);

    expect(applyRevealedTiles(view, [])).toBe(view);
    expect(applyRevealedTiles(null, [{ index: 0, letter: 'A' }])).toBeNull();
  });

  it('detects available unlocked letter tiles', () => {
    expect(
      hasAvailableLetters(
        puzzle([
          tile(0, { displayChar: 'A' }),
          tile(1, { isLocked: true }),
          tile(2),
        ])
      )
    ).toBe(true);

    expect(
      hasAvailableLetters(
        puzzle([
          tile(0, { displayChar: 'A' }),
          tile(1, { isLocked: true }),
          tile(2, { isLetter: false }),
        ])
      )
    ).toBe(false);
  });

  it('counts remaining letters for pricing', () => {
    expect(countRemainingLetters(null)).toBe(10);
    expect(
      countRemainingLetters(
        puzzle([
          tile(0),
          tile(1, { displayChar: 'B' }),
          tile(2, { isLetter: false }),
        ])
      )
    ).toBe(1);
  });
});
