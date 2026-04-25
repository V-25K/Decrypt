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
    const baselineTarget = targetLength * 2 + 30;
    const expectedTarget = generated.puzzlePrivate.targetTimeSeconds;
    if (expectedTarget === undefined) {
      throw new Error('Expected targetTimeSeconds to be set');
    }

    expect(generated.puzzlePrivate.targetTimeSeconds).toBeGreaterThanOrEqual(baselineTarget);
    expect(generated.puzzlePrivate.starThresholds?.['3_star']).toBe(expectedTarget);
    expect(generated.puzzlePrivate.starThresholds?.['2_star']).toBe(expectedTarget * 1.5);
    expect(generated.puzzlePrivate.starThresholds?.['1_star']).toBe(expectedTarget * 2);
  });

  it('applies blind tile count with a tier cap and fair candidate cap', () => {
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

    const maxTierBlindCount = 2;
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
    expect(generated.puzzlePrivate.blindIndices.length).toBeLessThanOrEqual(
      Math.min(maxTierBlindCount, maxFairAvailable)
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

  it('keeps shift-cipher obstruction load at or below random for the same seed', () => {
    const randomGenerated = buildPuzzle({
      levelId: 'lvl_3305',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 0,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });
    const shiftGenerated = buildPuzzle({
      levelId: 'lvl_3305',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 100,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });

    const randomObstructionLoad =
      (randomGenerated.puzzlePrivate.lockIndices ?? []).length +
      randomGenerated.puzzlePrivate.blindIndices.length;
    const shiftObstructionLoad =
      (shiftGenerated.puzzlePrivate.lockIndices ?? []).length +
      shiftGenerated.puzzlePrivate.blindIndices.length;

    expect(shiftObstructionLoad).toBeLessThanOrEqual(randomObstructionLoad);
  });

  it('computes timing once for skip-without-obstructions branch', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_3306',
      dateKey: '2026-03-06',
      text: phase3Text,
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: false,
    });
    const hardness = generated.puzzlePrivate.cryptoHardness ?? 0;
    const expectedTarget = Math.max(
      20,
      generated.puzzlePrivate.targetText.length * 2 +
        30 +
        Math.round((generated.puzzlePrivate.difficulty - 5) * 2) +
        Math.round(hardness * 8)
    );

    expect(generated.puzzlePrivate.targetTimeSeconds).toBe(expectedTarget);
    expect(generated.puzzlePrivate.starThresholds?.['3_star']).toBe(expectedTarget);
    expect(generated.puzzlePrivate.starThresholds?.['2_star']).toBe(expectedTarget * 1.5);
    expect(generated.puzzlePrivate.starThresholds?.['1_star']).toBe(expectedTarget * 2);
  });
});
