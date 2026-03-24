import { describe, expect, it } from 'vitest';
import { buildPuzzle } from './puzzle';
import { validatePuzzle } from './validation';
import { puzzlePrivateSchema, puzzlePrivateStoredSchema } from '../../shared/game';

const letterIndicesForWord = (text: string, wordIndex: number): number[] => {
  const words = text.split(' ');
  let cursor = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word) {
      continue;
    }
    const indices = Array.from({ length: word.length }, (_unused, offset) => cursor + offset);
    if (i === wordIndex) {
      return indices;
    }
    cursor += word.length + 1;
  }
  return [];
};

describe('validation', () => {
  it('accepts a standard generated puzzle', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0001',
      dateKey: '2026-02-24',
      text: 'KNOWLEDGE IS POWER',
      author: 'UNKNOWN',
      difficulty: 4,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(true);
  });

  it('rejects obvious circular padlock', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0002',
      dateKey: '2026-02-24',
      text: 'ABCD EFGH',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    generated.puzzlePrivate.padlockChains = [
      {
        chainId: 1,
        keyIndices: [0],
        lockedIndices: [0],
      },
    ];
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Padlock'))).toBe(true);
  });

  it('parses legacy padlock chain shape through stored schema', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0003',
      dateKey: '2026-02-24',
      text: 'ABCD EFGH',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const stored = puzzlePrivateStoredSchema.parse({
      ...generated.puzzlePrivate,
      padlockChains: [{ keyWordIndex: 0, lockedWordIndex: 1 }],
    });
    expect(stored.padlockChains.length).toBe(1);
    expect(
      puzzlePrivateSchema.safeParse({
        ...generated.puzzlePrivate,
        padlockChains: stored.padlockChains,
      }).success
    ).toBe(false);
  });

  it('rejects puzzles containing words longer than mobile-safe limit', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0004',
      dateKey: '2026-02-24',
      text: 'UNCHARACTERISTIC CLUE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Word length exceeds'))).toBe(
      true
    );
  });

  it('rejects puzzles exceeding total challenge length cap', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0005',
      dateKey: '2026-02-24',
      text: 'THIS CHALLENGE TEXT IS INTENTIONALLY LONG TO EXCEED THE SEVENTY TWO CHARACTER HARD LIMIT',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((reason) => reason.includes('Total challenge length exceeds'))
    ).toBe(true);
  });

  it('counts punctuation toward total challenge length cap', () => {
    const overLimitWithPunctuation = `${'A '.repeat(36)}!`;
    const generated = buildPuzzle({
      levelId: 'lvl_0006',
      dateKey: '2026-02-24',
      text: overLimitWithPunctuation,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((reason) => reason.includes('Total challenge length exceeds'))
    ).toBe(true);
  });

  it('rejects reciprocal two-chain padlock cycle', () => {
    const text = 'ALPHA BRAVO';
    const generated = buildPuzzle({
      levelId: 'lvl_0007',
      dateKey: '2026-02-24',
      text,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    generated.puzzlePrivate.padlockChains = [
      {
        chainId: 1,
        keyIndices: letterIndicesForWord(text, 0),
        lockedIndices: letterIndicesForWord(text, 1),
      },
      {
        chainId: 2,
        keyIndices: letterIndicesForWord(text, 1),
        lockedIndices: letterIndicesForWord(text, 0),
      },
    ];
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Padlock'))).toBe(true);
  });

  it('rejects three-chain padlock cycle', () => {
    const text = 'ALPHA BRAVO CHARLIE';
    const generated = buildPuzzle({
      levelId: 'lvl_0008',
      dateKey: '2026-02-24',
      text,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    generated.puzzlePrivate.padlockChains = [
      {
        chainId: 1,
        keyIndices: letterIndicesForWord(text, 0),
        lockedIndices: letterIndicesForWord(text, 1),
      },
      {
        chainId: 2,
        keyIndices: letterIndicesForWord(text, 1),
        lockedIndices: letterIndicesForWord(text, 2),
      },
      {
        chainId: 3,
        keyIndices: letterIndicesForWord(text, 2),
        lockedIndices: letterIndicesForWord(text, 0),
      },
    ];
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Padlock'))).toBe(true);
  });

  it('accepts acyclic multi-chain padlock dependencies', () => {
    const text = 'ALPHA BRAVO CHARLIE';
    const generated = buildPuzzle({
      levelId: 'lvl_0009',
      dateKey: '2026-02-24',
      text,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    generated.puzzlePrivate.padlockChains = [
      {
        chainId: 1,
        keyIndices: letterIndicesForWord(text, 0),
        lockedIndices: letterIndicesForWord(text, 1),
      },
      {
        chainId: 2,
        keyIndices: letterIndicesForWord(text, 1),
        lockedIndices: letterIndicesForWord(text, 2),
      },
    ];
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(true);
  });

  it('rejects blind letter when all its occurrences are blind', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0010',
      dateKey: '2026-02-24',
      text: 'LETTER BETTER SETTER',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const letterIndices = generated.puzzlePrivate.tiles
      .filter((tile) => tile.isLetter && tile.char === 'T')
      .map((tile) => tile.index);
    generated.puzzlePrivate.blindIndices = letterIndices;
    const result = validatePuzzle(generated.puzzlePrivate);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Blind tile fairness'))).toBe(true);
  });
});
