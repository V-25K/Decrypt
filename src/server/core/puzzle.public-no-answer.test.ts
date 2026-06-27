import { describe, expect, it } from 'vitest';
import { buildPublicPuzzle, buildPuzzle, reconstructSolvedText } from './puzzle';

// Regression guard for the answer-leak fix: the PUBLIC puzzle payload that ships
// to the client must never contain the decrypted solution. Previously the
// plaintext rode along in a `words` array, defeating the per-tile masking.
describe('public puzzle never leaks the answer', () => {
  const { puzzlePublic, puzzlePrivate } = buildPuzzle({
    levelId: 'lvl_0001',
    dateKey: '2026-06-27',
    text: 'HELLO WORLD THIS IS SECRET',
    author: 'TESTER',
    difficulty: 4,
    logicalPercent: 0,
    // Skip the solver so the test is fast and deterministic; we only care about
    // what buildPublicPuzzle exposes, which is identical on this path.
    skipSolvabilityCheck: true,
  });

  it('does not expose a plaintext `words` array', () => {
    expect('words' in puzzlePublic).toBe(false);
  });

  it('does not contain any complete solved word in the serialized payload', () => {
    const serialized = JSON.stringify(puzzlePublic);
    for (const word of puzzlePrivate.words) {
      if (word.length >= 2) {
        expect(serialized.includes(word)).toBe(false);
      }
    }
  });

  it('masks every non-prefilled letter tile as "_"', () => {
    const prefilled = new Set(puzzlePrivate.prefilledIndices);
    const hiddenLetters = puzzlePublic.tiles.filter(
      (tile) => tile.isLetter && !prefilled.has(tile.index)
    );
    expect(hiddenLetters.length).toBeGreaterThan(0);
    for (const tile of hiddenLetters) {
      expect(tile.displayChar).toBe('_');
    }
  });

  it('omits `solvedText` on the default (playable) build', () => {
    expect(puzzlePublic.solvedText).toBeUndefined();
  });
});

// The result screen (losses, self-created, reloaded-complete) needs the full
// decrypted line. The server attaches it ONLY when the caller has verified the
// viewer is entitled — never on a playable puzzle.
describe('authorized solution reveal', () => {
  const { puzzlePrivate } = buildPuzzle({
    levelId: 'lvl_0001',
    dateKey: '2026-06-27',
    text: 'HELLO WORLD',
    author: 'TESTER',
    difficulty: 4,
    logicalPercent: 0,
    skipSolvabilityCheck: true,
  });

  it('attaches the full line only when revealSolution is set', () => {
    const masked = buildPublicPuzzle(puzzlePrivate, [], []);
    expect(masked.solvedText).toBeUndefined();

    const revealed = buildPublicPuzzle(puzzlePrivate, [], [], {
      revealSolution: true,
    });
    expect(revealed.solvedText).toBe(reconstructSolvedText(puzzlePrivate));
    // The reveal really is the decrypted answer, with word spacing intact…
    expect(revealed.solvedText).toBe('HELLO WORLD');
    // …yet the tiles themselves stay masked (the grid is unchanged).
    const hiddenLetters = revealed.tiles.filter(
      (tile) => tile.isLetter && tile.displayChar === '_'
    );
    expect(hiddenLetters.length).toBeGreaterThan(0);
  });
});
