import { describe, expect, it } from 'vitest';
import {
  buildGuessSessionPatch,
  getRevealedIndicesForAnimation,
  getRevealedTilesFromGuessResult,
  isLockedGuessResult,
  removePendingGuessEntries,
  shouldRefreshPuzzleViewAfterGuess,
  type RevealedGuessTile,
} from './guess-result';

describe('guess result helpers', () => {
  it('detects locked tile results', () => {
    expect(isLockedGuessResult({ errorCode: 'TILE_LOCKED' })).toBe(true);
    expect(isLockedGuessResult({ errorCode: 'WRONG_GUESS' })).toBe(false);
    expect(isLockedGuessResult({ errorCode: null })).toBe(false);
  });

  it('normalizes revealed tiles', () => {
    const revealedTiles: RevealedGuessTile[] = [{ index: 2, letter: 'A' }];

    expect(getRevealedTilesFromGuessResult({ revealedTiles })).toBe(revealedTiles);
    expect(getRevealedTilesFromGuessResult({ revealedTiles: null })).toEqual([]);
  });

  it('prefers revealed tile indices over fallback indices for animation', () => {
    expect(
      getRevealedIndicesForAnimation(
        { revealedIndices: [5] },
        [
          { index: 1, letter: 'A' },
          { index: 3, letter: 'A' },
        ]
      )
    ).toEqual([1, 3]);

    expect(getRevealedIndicesForAnimation({ revealedIndices: [5] }, [])).toEqual([
      5,
    ]);
  });

  it('removes the submitted tile and any revealed companion tiles from pending guesses', () => {
    const previous = new Map([
      [1, 'A'],
      [2, 'B'],
      [3, 'A'],
    ]);

    const next = removePendingGuessEntries(previous, 1, [{ index: 3, letter: 'A' }]);

    expect(next).not.toBe(previous);
    expect([...next.entries()]).toEqual([[2, 'B']]);
  });

  it('preserves pending guess map identity when nothing changes', () => {
    const empty = new Map<number, string>();
    const unchanged = new Map([[4, 'A']]);

    expect(removePendingGuessEntries(empty, 1, [])).toBe(empty);
    expect(removePendingGuessEntries(unchanged, 1, [])).toBe(unchanged);
  });

  it('builds the challenge session patch for guess outcomes', () => {
    expect(
      buildGuessSessionPatch({
        heartsRemaining: 2,
        shieldConsumed: true,
        isLevelComplete: false,
        isGameOver: true,
      })
    ).toEqual({
      heartsRemaining: 2,
      isShieldActive: false,
      isGameOver: true,
    });

    expect(
      buildGuessSessionPatch({
        heartsRemaining: 0,
        shieldConsumed: false,
        isLevelComplete: true,
        isGameOver: true,
      })
    ).toEqual({ heartsRemaining: 0 });
  });

  it('refreshes puzzle view when locks change', () => {
    expect(
      shouldRefreshPuzzleViewAfterGuess({
        newlyUnlockedChainIds: ['chain-1'],
        lockProgressChanged: false,
      })
    ).toBe(true);
    expect(
      shouldRefreshPuzzleViewAfterGuess({
        newlyUnlockedChainIds: [],
        lockProgressChanged: true,
      })
    ).toBe(true);
    expect(
      shouldRefreshPuzzleViewAfterGuess({
        newlyUnlockedChainIds: [],
        lockProgressChanged: false,
      })
    ).toBe(false);
  });
});
