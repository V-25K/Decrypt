import { describe, expect, it } from 'vitest';
import {
  buildDispatchableGuessChunk,
  filterGuessQueueForLevel,
  type GuessQueueEntry,
} from './guess-queue';
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

const entry = (
  tileIndex: number,
  overrides: Partial<GuessQueueEntry> = {}
): GuessQueueEntry => ({
  levelId: 'daily-1',
  tileIndex,
  letter: 'A',
  ...overrides,
});

describe('guess queue helpers', () => {
  it('filters queue entries to the active level', () => {
    expect(
      filterGuessQueueForLevel([
        entry(0),
        entry(1, { levelId: 'daily-2' }),
        entry(2),
      ], 'daily-1')
    ).toEqual([entry(0), entry(2)]);
  });

  it('builds dispatchable chunks for unique guessable tiles and cipher numbers', () => {
    const view = puzzle([
      tile(0, { cipherNumber: 1 }),
      tile(1, { cipherNumber: 1 }),
      tile(2, { isLocked: true }),
      tile(3, { displayChar: 'D' }),
      tile(4, { isLetter: false }),
      tile(5, { cipherNumber: 5 }),
    ]);

    expect(
      buildDispatchableGuessChunk([
        entry(0, { letter: 'A' }),
        entry(0, { letter: 'B' }),
        entry(1, { letter: 'C' }),
        entry(2, { letter: 'D' }),
        entry(3, { letter: 'E' }),
        entry(4, { letter: 'F' }),
        entry(5, { letter: 'G' }),
      ], view)
    ).toEqual([
      entry(0, { letter: 'A' }),
      entry(5, { letter: 'G' }),
    ]);
  });

  it('returns an empty chunk when there is no puzzle', () => {
    expect(buildDispatchableGuessChunk([entry(0)], null)).toEqual([]);
  });
});
