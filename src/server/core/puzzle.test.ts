import { describe, expect, it } from 'vitest';
import {
  buildPublicPuzzle,
  buildPuzzle,
  chooseGoldIndex,
  normalizePadlockChains,
} from './puzzle';

describe('puzzle', () => {
  it('always generates at least one prefilled starter clue for high difficulty', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0099',
      dateKey: '2026-02-26',
      text: 'ONLY THE BRAVE TRY AGAIN',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    expect(generated.puzzlePrivate.prefilledIndices.length).toBeGreaterThan(0);
  });

  it('shows a fallback starter letter for legacy zero-prefilled puzzles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0100',
      dateKey: '2026-02-26',
      text: 'SOLVE THIS IF YOU CAN',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    generated.puzzlePrivate.prefilledIndices = [];
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const visibleLetterCount = view.tiles.filter(
      (tile) => tile.isLetter && tile.displayChar !== '_'
    ).length;

    expect(visibleLetterCount).toBeGreaterThan(0);
  });

  it('normalizes legacy word-index padlock chains into tile-index chains', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0101',
      dateKey: '2026-02-26',
      text: 'LOCK KEY OPEN',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const normalized = normalizePadlockChains({
      tiles: generated.puzzlePrivate.tiles,
      padlockChains: [{ keyWordIndex: 0, lockedWordIndex: 1 }],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.keyIndices.length).toBeGreaterThan(0);
    expect(normalized[0]?.lockedIndices.length).toBeGreaterThan(0);
  });

  it('keeps punctuation pre-visible in public puzzle tiles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0102',
      dateKey: '2026-02-26',
      text: 'WINTER IS COMING!',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const punctuationTile = view.tiles.find((tile) => !tile.isLetter && tile.displayChar === '!');

    expect(punctuationTile).toBeTruthy();
  });

  it('keeps numbers pre-visible and unencrypted', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0103',
      dateKey: '2026-02-26',
      text: 'AGENT 007 REPORTS IN',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const sevenTile = view.tiles.find((tile) => !tile.isLetter && tile.displayChar === '7');

    expect(sevenTile).toBeTruthy();
    expect(sevenTile?.cipherNumber ?? null).toBeNull();
  });

  it('is deterministic for same level and quote input', () => {
    const first = buildPuzzle({
      levelId: 'lvl_0450',
      dateKey: '2026-02-26',
      text: 'EVERY CODE HIDES A CLUE, AND EVERY CLUE REWARDS PATIENCE.',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 35,
      skipSolvabilityCheck: true,
    });
    const second = buildPuzzle({
      levelId: 'lvl_0450',
      dateKey: '2026-02-26',
      text: 'EVERY CODE HIDES A CLUE, AND EVERY CLUE REWARDS PATIENCE.',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 35,
      skipSolvabilityCheck: true,
    });

    expect(first.puzzlePrivate.cipherType).toBe(second.puzzlePrivate.cipherType);
    expect(first.puzzlePrivate.shiftAmount).toBe(second.puzzlePrivate.shiftAmount);
    expect(first.puzzlePrivate.mapping).toEqual(second.puzzlePrivate.mapping);
    expect(first.puzzlePrivate.goldIndex).toBe(second.puzzlePrivate.goldIndex);
  });

  it('blind picks do not repeat the same letter in one selection pass', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0106',
      dateKey: '2026-02-26',
      text: 'APPLE BERRY CHERRY DELTA',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });
    const blindLetters = generated.puzzlePrivate.blindIndices
      .map((index) => generated.puzzlePrivate.tiles[index])
      .filter((tile): tile is (typeof generated.puzzlePrivate.tiles)[number] => Boolean(tile))
      .map((tile) => tile.char);
    expect(new Set(blindLetters).size).toBe(blindLetters.length);
  });

  it('chooses gold index using rng across candidate pool', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0107',
      dateKey: '2026-02-26',
      text: 'ALPHA BETA GAMMA DELTA EPSILON',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const tiles = generated.puzzlePrivate.tiles;
    const candidates = tiles.filter((tile) => tile.isLetter).map((tile) => tile.index);
    const picked = chooseGoldIndex(tiles, [], [], () => 0.9999);
    const lastCandidate = candidates[candidates.length - 1];
    expect(picked).toBe(lastCandidate);
  });

  it('returns null gold index when all letters are blocked', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0108',
      dateKey: '2026-02-26',
      text: 'ALPHA BETA',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const allLetterIndices = generated.puzzlePrivate.tiles
      .filter((tile) => tile.isLetter)
      .map((tile) => tile.index);
    const picked = chooseGoldIndex(
      generated.puzzlePrivate.tiles,
      allLetterIndices,
      [],
      () => 0
    );
    expect(picked).toBeNull();
  });

  it('defaults source to UNKNOWN_LEGACY when not provided', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0104',
      dateKey: '2026-02-26',
      text: 'STONE TONES LEAST STEAL STALE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    expect(generated.puzzlePrivate.source).toBe('UNKNOWN_LEGACY');
  });

  it('stores explicit source on generated puzzles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0105',
      dateKey: '2026-02-26',
      text: 'STONE TONES LEAST STEAL STALE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      source: 'AUTO_DAILY',
    });
    expect(generated.puzzlePrivate.source).toBe('AUTO_DAILY');
  });
});
