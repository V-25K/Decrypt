import { describe, expect, it } from 'vitest';
import { buildPuzzle, buildPublicPuzzle } from './puzzle';
import { runDummySolver } from './dummy-solver';

describe('phase3 obstructions and scaling', () => {
  const phase3Text =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH';

  it('computes dynamic target time and star thresholds', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_3301',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });
    const targetLength = generated.puzzlePrivate.targetText.length;
    const expectedTarget = targetLength * 2 + 30;

    expect(generated.puzzlePrivate.targetTimeSeconds).toBe(expectedTarget);
    expect(generated.puzzlePrivate.starThresholds?.['3_star']).toBe(expectedTarget);
    expect(generated.puzzlePrivate.starThresholds?.['2_star']).toBe(expectedTarget * 1.5);
    expect(generated.puzzlePrivate.starThresholds?.['1_star']).toBe(expectedTarget * 2);
  });

  it('applies blind tile count as floor(length / 10)', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_3302',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });

    const expectedCount = Math.floor(generated.puzzlePrivate.targetText.length / 10);
    const blocked = new Set([
      ...generated.puzzlePrivate.prefilledIndices,
      ...(generated.puzzlePrivate.lockIndices ?? []),
    ]);
    const letterCounts = new Map<string, number>();
    const wordLetterCounts = new Map<number, number>();
    for (const tile of generated.puzzlePrivate.tiles) {
      if (!tile.isLetter) {
        continue;
      }
      letterCounts.set(tile.char, (letterCounts.get(tile.char) ?? 0) + 1);
      wordLetterCounts.set(tile.wordIndex, (wordLetterCounts.get(tile.wordIndex) ?? 0) + 1);
    }
    const eligibleBlindLetters = new Set<string>();
    for (const tile of generated.puzzlePrivate.tiles) {
      if (!tile.isLetter || blocked.has(tile.index)) {
        continue;
      }
      const wordLength = wordLetterCounts.get(tile.wordIndex) ?? 0;
      const repeats = letterCounts.get(tile.char) ?? 0;
      if (wordLength >= 5 && repeats >= 2) {
        eligibleBlindLetters.add(tile.char);
      }
    }
    const maxFairAvailable = eligibleBlindLetters.size;
    expect(generated.puzzlePrivate.blindIndices.length).toBe(
      Math.min(expectedCount, maxFairAvailable)
    );
  });

  it('marks public tiles with hasLock when lock indices exist', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_3303',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });

    const lockSet = new Set(generated.puzzlePrivate.lockIndices ?? []);
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    for (const tile of view.tiles) {
      if (!tile.isLetter) {
        continue;
      }
      expect(Boolean(tile.hasLock)).toBe(lockSet.has(tile.index));
    }
  });

  it('only accepts lock obstruction when non-lock board stays >=50% solvable', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_3304',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });

    const lockIndices = generated.puzzlePrivate.lockIndices ?? [];
    if (lockIndices.length === 0) {
      expect(lockIndices).toEqual([]);
      return;
    }

    const solver = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: generated.puzzlePrivate.prefilledIndices,
      forbiddenIndices: lockIndices,
    });
    expect(solver.solvedRatio).toBeGreaterThanOrEqual(0.5);
  });
});
