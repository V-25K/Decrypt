import { describe, expect, it, vi } from 'vitest';
import { normalizeRequiredSolveRatio, runDummySolver } from './dummy-solver';
import { buildPuzzle } from './puzzle';

describe('dummy solver phase2', () => {
  it('fails when there are no revealed indices', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2301',
      dateKey: '2026-03-06',
      text: 'PATTERNS REPEAT WHEN LETTERS REPEAT AGAIN',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });

    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [],
    });
    expect(result.solvable).toBe(false);
    expect(result.blindGuessRequired).toBe(true);
  });

  it('passes when reveals and propagation solve at least 80%', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2302',
      dateKey: '2026-03-06',
      text: 'A A A A A A A A A A A A A A A A A A A A',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const firstLetterIndex = generated.puzzlePrivate.tiles.find(
      (tile) => tile.isLetter && tile.char === 'A'
    )?.index;
    if (firstLetterIndex === undefined) {
      throw new Error('Expected an A tile index');
    }

    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [firstLetterIndex],
    });
    expect(result.solvable).toBe(true);
    expect(result.solvedRatio).toBeGreaterThanOrEqual(0.8);
  });

  it('fails and marks blind-guess required when known letters do not expand', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2303',
      dateKey: '2026-03-06',
      text: 'ABCDEFG HIJKLMN OPQRSTU',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const revealIndex = generated.puzzlePrivate.tiles.find((tile) => tile.isLetter)?.index;
    if (revealIndex === undefined) {
      throw new Error('Expected a revealed index');
    }

    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [revealIndex],
    });
    expect(result.solvable).toBe(false);
    expect(result.blindGuessRequired).toBe(true);
  });

  it('produces identical results when non-revealed plaintext chars are tampered', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2304',
      dateKey: '2026-03-06',
      text: 'TESTING MAKES SYSTEMS STRONGER OVER TIME',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const revealedIndex = generated.puzzlePrivate.tiles.find((tile) => tile.isLetter)?.index;
    if (revealedIndex === undefined) {
      throw new Error('Expected at least one revealed tile');
    }
    const tampered = structuredClone(generated.puzzlePrivate);
    const tamperIndex = tampered.tiles.find(
      (tile) => tile.isLetter && tile.index !== revealedIndex
    )?.index;
    if (tamperIndex === undefined) {
      throw new Error('Expected a tamper candidate tile');
    }
    const targetTile = tampered.tiles[tamperIndex];
    if (!targetTile || !targetTile.isLetter) {
      throw new Error('Expected a letter tile');
    }
    const originalCipher = tampered.mapping[targetTile.char];
    if (!originalCipher) {
      throw new Error('Expected mapped cipher number');
    }
    const replacement = targetTile.char === 'Z' ? 'Y' : 'Z';
    tampered.tiles[tamperIndex] = {
      ...targetTile,
      char: replacement,
    };
    tampered.mapping[replacement] = originalCipher;

    const baseline = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [revealedIndex],
    });
    const tamperedResult = runDummySolver({
      puzzle: tampered,
      revealedIndices: [revealedIndex],
    });
    expect(tamperedResult).toEqual(baseline);
  });

  it('fails safely when solver time budget is exceeded', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2305',
      dateKey: '2026-03-06',
      text: 'A A A A A A A A A A A A A A A A A A A A',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const revealedIndex = generated.puzzlePrivate.tiles.find((tile) => tile.isLetter)?.index;
    if (revealedIndex === undefined) {
      throw new Error('Expected a revealed index');
    }

    let calls = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      calls += 1;
      return calls * 50;
    });
    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [revealedIndex],
    });
    nowSpy.mockRestore();

    expect(result.solvable).toBe(false);
    expect(result.blindGuessRequired).toBe(true);
  });

  it('uses common word-pattern inference to expand beyond starter clues', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2306',
      dateKey: '2026-03-06',
      text: 'THE AND THE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const revealedIndex = generated.puzzlePrivate.tiles.find(
      (tile) => tile.isLetter && tile.char === 'T'
    )?.index;
    if (revealedIndex === undefined) {
      throw new Error('Expected a revealed T tile');
    }

    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [revealedIndex],
      requiredSolveRatio: 0.8,
    });
    expect(result.solvable).toBe(true);
    expect(result.solvedRatio).toBeGreaterThanOrEqual(0.8);
  });

  it('allows expert-tier solve thresholds below 0.5', () => {
    expect(normalizeRequiredSolveRatio(0.42)).toBe(0.42);
    expect(normalizeRequiredSolveRatio(0.4)).toBe(0.4);
    expect(normalizeRequiredSolveRatio(0.2)).toBe(0.35);
  });

  it('does not auto-solve blind copies of a revealed letter', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2307',
      dateKey: '2026-03-06',
      text: 'ALARM',
      author: 'UNKNOWN',
      difficulty: 7,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const revealIndex = generated.puzzlePrivate.tiles.find(
      (tile) => tile.isLetter && tile.char === 'A'
    )?.index;
    const blindIndex = generated.puzzlePrivate.tiles.find(
      (tile) => tile.isLetter && tile.char === 'A' && tile.index !== revealIndex
    )?.index;
    if (revealIndex === undefined || blindIndex === undefined) {
      throw new Error('Expected repeated A tiles');
    }
    generated.puzzlePrivate.blindIndices = [blindIndex];

    const result = runDummySolver({
      puzzle: generated.puzzlePrivate,
      revealedIndices: [revealIndex],
      requiredSolveRatio: 0.99,
    });

    expect(result.solvable).toBe(false);
    expect(result.solvedRatio).toBeLessThan(1);
  });
});
