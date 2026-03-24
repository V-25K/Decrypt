import { describe, expect, it, vi } from 'vitest';
import { runDummySolver } from './dummy-solver';
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
      text: 'ABCD EFGH IJKL MNOP',
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
});
