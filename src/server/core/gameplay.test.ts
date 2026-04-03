import { describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate, SessionState } from '../../shared/game';
import { buildPuzzle } from './puzzle';
import {
  applyHammer,
  applyRocket,
  applyWand,
  checkPadlockStatus,
  getUnlockedWordIndices,
  revealFromGuess,
} from './gameplay';

const wordLetterIndices = (puzzle: PuzzlePrivate, wordIndex: number): number[] =>
  puzzle.tiles
    .filter((tile) => tile.isLetter && tile.wordIndex === wordIndex)
    .map((tile) => tile.index);

const firstIndex = (indices: number[]): number => {
  const value = indices[0];
  if (value === undefined) {
    throw new Error('Expected at least one index');
  }
  return value;
};

const buildLockedPuzzle = (text: string, lockedWordIndex = 1): PuzzlePrivate => {
  const generated = buildPuzzle({
    levelId: 'lvl_0999',
    dateKey: '2026-02-27',
    text,
    author: 'UNKNOWN',
    difficulty: 8,
    logicalPercent: 10,
    skipSolvabilityCheck: true,
  });
  const puzzle = generated.puzzlePrivate;
  puzzle.prefilledIndices = [];
  puzzle.blindIndices = [];
  puzzle.padlockChains = [
    {
      chainId: 1,
      keyIndices: wordLetterIndices(puzzle, 0),
      lockedIndices: wordLetterIndices(puzzle, lockedWordIndex),
    },
  ];
  return puzzle;
};

const buildSession = (
  levelId: string,
  revealedIndices: number[] = []
): SessionState => ({
  activeLevelId: levelId,
  mode: 'daily',
  startTimestamp: 0,
  activeMs: 0,
  lastSeenAt: 0,
  mistakesMade: 0,
  shieldIsActive: false,
  revealedIndices,
  usedPowerups: 0,
  wrongGuesses: 0,
  guessCount: 0,
});

describe('gameplay lock + powerup rules', () => {
  it('keeps locked words unavailable until key word is solved', () => {
    const puzzle = buildLockedPuzzle('DOG LOCK OPEN');
    const keyIndices = wordLetterIndices(puzzle, 0);

    const initiallyUnlocked = getUnlockedWordIndices(puzzle, new Set<number>());
    expect(initiallyUnlocked.has(0)).toBe(true);
    expect(initiallyUnlocked.has(1)).toBe(false);
    expect(initiallyUnlocked.has(2)).toBe(true);

    const unlockedAfterKeySolve = getUnlockedWordIndices(puzzle, new Set(keyIndices));
    expect(unlockedAfterKeySolve.has(1)).toBe(true);
  });

  it('reports newly unlocked chain when key indices are solved', () => {
    const puzzle = buildLockedPuzzle('DOG LOCK OPEN');
    const beforeStatus = checkPadlockStatus(puzzle, new Set<number>());
    const afterStatus = checkPadlockStatus(
      puzzle,
      new Set(wordLetterIndices(puzzle, 0))
    );

    expect(beforeStatus.unlockedChainIds).toEqual([]);
    expect(afterStatus.unlockedChainIds).toEqual([1]);
    expect(afterStatus.lockedIndices).toEqual([]);
  });

  it('does not reveal matching letters in locked words from a correct guess', () => {
    const puzzle = buildLockedPuzzle('ALPHA AURA BETA');
    const sourceIndex =
      wordLetterIndices(puzzle, 0)
        .map((index) => puzzle.tiles[index])
        .find((tile) => tile?.isLetter && tile.char === 'A')?.index ?? -1;
    expect(sourceIndex).toBeGreaterThanOrEqual(0);

    const result = revealFromGuess({
      puzzle,
      session: buildSession(puzzle.levelId),
      tileIndex: sourceIndex,
      guessedLetter: 'A',
    });

    const lockedIndices = new Set(wordLetterIndices(puzzle, 1));
    expect(result.isCorrect).toBe(true);
    expect(result.revealedIndices).toContain(sourceIndex);
    expect(result.revealedTiles.some((tile) => tile.index === sourceIndex)).toBe(true);
    expect(result.revealedIndices.some((index) => lockedIndices.has(index))).toBe(false);
    expect(result.revealedLetter).toBe('A');
  });

  it('blind tile guess and hammer reveal only that blind tile', () => {
    const puzzle = buildLockedPuzzle('ALPHA AURA BETA');
    puzzle.padlockChains = [];
    const blindTarget =
      puzzle.tiles.find((tile) => tile.isLetter && tile.char === 'A')?.index ?? -1;
    expect(blindTarget).toBeGreaterThanOrEqual(0);
    puzzle.blindIndices = [blindTarget];

    const guessed = revealFromGuess({
      puzzle,
      session: buildSession(puzzle.levelId),
      tileIndex: blindTarget,
      guessedLetter: 'A',
    });
    expect(guessed.revealedIndices).toEqual([blindTarget]);
    expect(guessed.revealedTiles).toEqual([{ index: blindTarget, letter: 'A' }]);
    expect(guessed.revealedLetter).toBe('A');

    const hammered = applyHammer(puzzle, buildSession(puzzle.levelId), blindTarget);
    expect(hammered.revealedIndices).toEqual([blindTarget]);
    expect(hammered.revealedTiles).toEqual([{ index: blindTarget, letter: 'A' }]);
    expect(hammered.revealedLetter).toBe('A');
  });

  it('non-blind propagation does not auto-fill blind tile', () => {
    const puzzle = buildLockedPuzzle('ALPHA AURA BETA');
    puzzle.padlockChains = [];
    const allAIndices = puzzle.tiles
      .filter((tile) => tile.isLetter && tile.char === 'A')
      .map((tile) => tile.index);
    const blindIndex = firstIndex(allAIndices);
    const sourceIndex = firstIndex(allAIndices.filter((index) => index !== blindIndex));
    puzzle.blindIndices = [blindIndex];

    const result = revealFromGuess({
      puzzle,
      session: buildSession(puzzle.levelId),
      tileIndex: sourceIndex,
      guessedLetter: 'A',
    });
    expect(result.isCorrect).toBe(true);
    expect(result.revealedIndices).toContain(sourceIndex);
    expect(result.revealedIndices).not.toContain(blindIndex);
    expect(result.revealedTiles.some((tile) => tile.index === blindIndex)).toBe(false);
  });

  it('wand picks only unlocked words and uses longest-word tie break', () => {
    const puzzle = buildLockedPuzzle('DOG LION SEAL', 2);
    const wordOneIndices = wordLetterIndices(puzzle, 1);
    const lockedWordTwo = new Set(wordLetterIndices(puzzle, 2));

    const preRevealed = firstIndex(wordOneIndices);
    const result = applyWand(puzzle, buildSession(puzzle.levelId, [preRevealed]));
    const expected = wordOneIndices
      .filter((index) => index !== preRevealed)
      .sort((a, b) => a - b);
    const actual = [...result.revealedIndices].sort((a, b) => a - b);

    expect(actual).toEqual(expected);
    expect(actual.some((index) => lockedWordTwo.has(index))).toBe(false);
    expect(result.revealedTiles.map((tile) => tile.index).sort((a, b) => a - b)).toEqual(
      expected
    );
    expect(result.revealedLetter).toBeNull();
  });

  it('rocket excludes locked tiles and can reveal blind tiles', () => {
    const puzzle = buildLockedPuzzle('ABA AAB CAA');
    const blindIndex = firstIndex(wordLetterIndices(puzzle, 2));
    puzzle.blindIndices = [blindIndex];
    const lockedWordIndices = new Set(wordLetterIndices(puzzle, 1));

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = applyRocket(puzzle, buildSession(puzzle.levelId));
    randomSpy.mockRestore();

    expect(result.revealedTiles.length).toBeGreaterThan(0);
    expect(result.revealedLetter).toBeNull();
    expect(result.revealedIndices.some((index) => lockedWordIndices.has(index))).toBe(
      false
    );
    expect(result.revealedIndices).toContain(blindIndex);
    expect(result.revealedTiles.some((tile) => tile.index === blindIndex)).toBe(true);
  });
});
