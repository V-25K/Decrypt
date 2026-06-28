import { describe, expect, it } from 'vitest';
import {
  applyRevealedTiles,
  buildCompletionQuote,
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
  dateKey: '2026-06-27',
  author: 'tester',
  tiles,
  heartsMax: 3,
  difficulty: 2,
  challengeType: 'QUOTE',
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

  it('rebuilds the completion quote from the revealed tile letters and punctuation', () => {
    // At completion every letter tile's displayChar holds the solved letter.
    expect(
      buildCompletionQuote(
        puzzle([
          tile(0, { displayChar: 'H' }),
          tile(1, { displayChar: 'I' }),
          tile(2, { isLetter: false, displayChar: ' ' }),
          tile(3, { displayChar: 'A' }),
          tile(4, { isLetter: false, displayChar: '!' }),
        ])
      )
    ).toBe('HI A!');
  });

  it('preserves punctuation tiles such as apostrophes', () => {
    expect(
      buildCompletionQuote(
        puzzle([
          tile(0, { displayChar: 'I' }),
          tile(1, { displayChar: 'T' }),
          tile(2, { isLetter: false, displayChar: "'" }),
          tile(3, { displayChar: 'S' }),
        ])
      )
    ).toBe("IT'S");
  });

  it('prefers the server-authorized solvedText for losses / self-created (tiles still masked)', () => {
    // A loss leaves most tiles masked as "_", so the tile fallback alone would
    // produce gibberish. The server-authorized full line must win.
    const view: Puzzle = {
      ...puzzle([
        tile(0, { displayChar: 'H' }),
        tile(1, { displayChar: '_' }),
        tile(2, { isLetter: false, displayChar: ' ' }),
        tile(3, { displayChar: '_' }),
      ]),
      solvedText: 'HI A',
    };

    expect(buildCompletionQuote(view)).toBe('HI A');
  });

  it('falls back to revealed tiles when solvedText is absent (a fresh win)', () => {
    const view: Puzzle = {
      ...puzzle([tile(0, { displayChar: 'H' }), tile(1, { displayChar: 'I' })]),
      solvedText: undefined,
    };

    expect(buildCompletionQuote(view)).toBe('HI');
  });

  it('returns an empty quote when masked with no solvedText (defensive guard)', () => {
    // Safety net: a finished daily now always carries solvedText, but if a result
    // screen ever renders before it arrives, some letter tiles are still "_", so
    // hide the quote rather than show "_ _ _" gibberish.
    const view: Puzzle = {
      ...puzzle([
        tile(0, { displayChar: 'H' }),
        tile(1, { displayChar: '_' }),
        tile(2, { isLetter: false, displayChar: ' ' }),
        tile(3, { displayChar: '_' }),
      ]),
      solvedText: undefined,
    };

    expect(buildCompletionQuote(view)).toBe('');
  });
});
