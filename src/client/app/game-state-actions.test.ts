import { describe, expect, it } from 'vitest';
import {
  addWrongGuessTileInGameState,
  applyServerPuzzleViewToGameState,
  clearTileFeedbackInGameState,
  findAdjacentGuessableTileIndex,
  findNextGuessableTileIndex,
  isGuessableTileAtIndex,
  removeWrongGuessTileInGameState,
  retainOrAdvanceSelectedTileIndex,
  setPuzzleViewInGameState,
} from './game-state-actions';
import { ImmutableGameState } from './ImmutableGameState';
import type { Puzzle, PuzzlePublicTile } from './types';

const tile = (
  index: number,
  overrides: Partial<PuzzlePublicTile> = {}
): PuzzlePublicTile => ({
  index,
  char: '_',
  displayChar: '_',
  cipherNumber: index + 1,
  isLetter: true,
  isLocked: false,
  isSessionRevealed: false,
  ...overrides,
});

const puzzle = (tiles: PuzzlePublicTile[]): Puzzle => ({
  levelId: 'daily-1',
  quote: 'ABC',
  normalizedQuote: 'ABC',
  tiles,
  heartsMax: 3,
  difficulty: 2,
  challengeType: 'daily',
});

describe('game-state-actions', () => {
  it('identifies and navigates guessable tiles', () => {
    const view = puzzle([
      tile(0, { displayChar: 'A' }),
      tile(1, { isLocked: true }),
      tile(2),
      tile(3, { isLetter: false }),
    ]);

    expect(isGuessableTileAtIndex(view, 0)).toBe(false);
    expect(isGuessableTileAtIndex(view, 2)).toBe(true);
    expect(findAdjacentGuessableTileIndex(view, 0, 1)).toBe(2);
    expect(findAdjacentGuessableTileIndex(view, 0, -1)).toBe(2);
    expect(findNextGuessableTileIndex(view, 0)).toBe(2);
  });

  it('sets puzzle view and can reset selection', () => {
    const view = puzzle([tile(0), tile(1)]);
    const state = ImmutableGameState.fromPuzzle(view).setSelectedTileIndex(1);
    const next = setPuzzleViewInGameState(state, view, { resetSelection: true });

    expect(next.puzzle).toBe(view);
    expect(next.selectedTileIndex).toBeNull();
  });

  it('applies server puzzle view with restored correct feedback', () => {
    const firstView = puzzle([tile(0), tile(1)]);
    const nextView = puzzle([tile(0), tile(1, { displayChar: 'B' })]);
    const state = ImmutableGameState.fromPuzzle(firstView).setSelectedTileIndex(1);
    const next = applyServerPuzzleViewToGameState(
      state,
      nextView,
      new Set([1])
    );

    expect(next.puzzle).toBe(nextView);
    expect(next.correctGuessIndices.has(1)).toBe(true);
    expect(next.selectedTileIndex).toBeNull();
  });

  it('retains or advances selection after local reveals', () => {
    const firstView = puzzle([tile(0), tile(1)]);
    const nextView = puzzle([tile(0, { displayChar: 'A' }), tile(1)]);
    const state = ImmutableGameState.fromPuzzle(firstView).setSelectedTileIndex(0);

    expect(retainOrAdvanceSelectedTileIndex(state, nextView)).toBe(1);
  });

  it('clears and flashes tile feedback', () => {
    const state = ImmutableGameState.empty()
      .addCorrectGuessIndex(1)
      .setSelectedTileIndex(1);
    const wrong = addWrongGuessTileInGameState(state, 2);
    const unflashed = removeWrongGuessTileInGameState(wrong, 2);
    const cleared = clearTileFeedbackInGameState(unflashed, {
      resetSelection: true,
    });

    expect(wrong.wrongGuessIndices.has(2)).toBe(true);
    expect(unflashed.wrongGuessIndices.has(2)).toBe(false);
    expect(cleared.correctGuessIndices.size).toBe(0);
    expect(cleared.selectedTileIndex).toBeNull();
  });
});
