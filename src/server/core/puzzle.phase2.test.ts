import { describe, expect, it } from 'vitest';
import { buildPuzzle } from './puzzle';

describe('phase2 reveal bootstrap rules', () => {
  const sourceText = 'PATTERNS REPEAT WHEN LETTERS REPEAT AGAIN';

  it('uses easy reveal count range of 6-10', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2201',
      dateKey: '2026-03-06',
      text: sourceText,
      author: 'UNKNOWN',
      difficulty: 2,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const count = generated.puzzlePrivate.prefilledIndices.length;
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(10);
  });

  it('reveals at least five unique starter letters on easy when available', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2201b',
      dateKey: '2026-03-06',
      text: 'AAAAA BBBBB CCCCC DDDDD EEEEE FFFFF GGGGG HHHHH',
      author: 'UNKNOWN',
      difficulty: 2,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const uniqueStarterLetters = new Set(
      generated.puzzlePrivate.prefilledIndices
        .map((index) => generated.puzzlePrivate.tiles[index])
        .filter((tile): tile is (typeof generated.puzzlePrivate.tiles)[number] => Boolean(tile && tile.isLetter))
        .map((tile) => tile.char)
    );
    expect(uniqueStarterLetters.size).toBeGreaterThanOrEqual(5);
  });

  it('uses medium reveal count range of 3-5', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2202',
      dateKey: '2026-03-06',
      text: sourceText,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const count = generated.puzzlePrivate.prefilledIndices.length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
  });

  it('uses hard reveal count range tuned by quote length', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2203',
      dateKey: '2026-03-06',
      text: sourceText,
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const count = generated.puzzlePrivate.prefilledIndices.length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(3);
  });

  it('guarantees at least one reveal in the first quarter when possible', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2204',
      dateKey: '2026-03-06',
      text: sourceText,
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const firstQuarterMaxIndex = Math.max(
      0,
      Math.floor(generated.puzzlePrivate.targetText.length * 0.25) - 1
    );
    expect(
      generated.puzzlePrivate.prefilledIndices.some((index) => index <= firstQuarterMaxIndex)
    ).toBe(true);
  });

  it('does not reveal both ends of a long word', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_2205',
      dateKey: '2026-03-06',
      text: 'ALPHABETICAL PATTERNS REPEAT AGAIN',
      author: 'UNKNOWN',
      difficulty: 2,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const firstWordLetterIndices = generated.puzzlePrivate.tiles
      .filter((tile) => tile.isLetter && tile.wordIndex === 0)
      .map((tile) => tile.index)
      .sort((a, b) => a - b);
    const firstWordStart = firstWordLetterIndices[0];
    const firstWordEnd = firstWordLetterIndices[firstWordLetterIndices.length - 1];
    if (firstWordStart === undefined || firstWordEnd === undefined) {
      throw new Error('Expected first word indices');
    }

    const selected = new Set(generated.puzzlePrivate.prefilledIndices);
    expect(selected.has(firstWordStart) && selected.has(firstWordEnd)).toBe(false);
  });
});
