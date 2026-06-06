import { ImmutableGameState } from './ImmutableGameState';
import type { Puzzle } from './types';

export type ResetSelectionOptions = {
  resetSelection?: boolean;
};

export const isGuessableTileAtIndex = (
  puzzle: Puzzle | null,
  tileIndex: number
): boolean => {
  if (!puzzle) {
    return false;
  }
  const tile = puzzle.tiles[tileIndex];
  return Boolean(
    tile &&
      tile.isLetter &&
      !tile.isLocked &&
      tile.displayChar === '_'
  );
};

export const findAdjacentGuessableTileIndex = (
  puzzle: Puzzle | null,
  fromIndex: number,
  direction: 1 | -1
): number | null => {
  if (!puzzle) {
    return null;
  }
  const tileCount = puzzle.tiles.length;
  if (tileCount <= 0) {
    return null;
  }
  const startIndex =
    Number.isInteger(fromIndex) && fromIndex >= 0 && fromIndex < tileCount
      ? fromIndex
      : 0;
  for (let offset = 1; offset <= tileCount; offset += 1) {
    const index = (startIndex + offset * direction + tileCount) % tileCount;
    if (isGuessableTileAtIndex(puzzle, index)) {
      return index;
    }
  }
  return null;
};

export const findNextGuessableTileIndex = (
  puzzle: Puzzle | null,
  fromIndex: number
): number | null => findAdjacentGuessableTileIndex(puzzle, fromIndex, 1);

export const retainOrAdvanceSelectedTileIndex = (
  state: ImmutableGameState,
  puzzle: Puzzle | null
): number | null =>
  state.selectedTileIndex === null ||
  isGuessableTileAtIndex(puzzle, state.selectedTileIndex)
    ? state.selectedTileIndex
    : findNextGuessableTileIndex(puzzle, state.selectedTileIndex);

const retainOrClearSelectedTileIndex = (
  state: ImmutableGameState,
  puzzle: Puzzle | null,
  options: ResetSelectionOptions = {}
): number | null => {
  if (options.resetSelection || state.selectedTileIndex === null) {
    return null;
  }
  return isGuessableTileAtIndex(puzzle, state.selectedTileIndex)
    ? state.selectedTileIndex
    : null;
};

export const setSelectedTileInGameState = (
  state: ImmutableGameState,
  tileIndex: number | null
): ImmutableGameState => state.setSelectedTileIndex(tileIndex);

export const setPuzzleViewInGameState = (
  state: ImmutableGameState,
  puzzle: Puzzle | null,
  options: ResetSelectionOptions = {}
): ImmutableGameState =>
  state.update({
    puzzle,
    ...(options.resetSelection ? { selectedTileIndex: null } : {}),
  });

export const applyServerPuzzleViewToGameState = (
  state: ImmutableGameState,
  puzzle: Puzzle,
  correctGuessIndices: Set<number>,
  options: ResetSelectionOptions = {}
): ImmutableGameState =>
  state.update({
    puzzle,
    correctGuessIndices,
    selectedTileIndex: retainOrClearSelectedTileIndex(state, puzzle, options),
  });

export const clearTileFeedbackInGameState = (
  state: ImmutableGameState,
  options: ResetSelectionOptions = {}
): ImmutableGameState =>
  state.update({
    correctGuessIndices: new Set(),
    wrongGuessIndices: new Set(),
    ...(options.resetSelection ? { selectedTileIndex: null } : {}),
  });

export const addWrongGuessTileInGameState = (
  state: ImmutableGameState,
  tileIndex: number
): ImmutableGameState => {
  const next = new Set(state.wrongGuessIndices);
  next.add(tileIndex);
  return state.setWrongGuessIndices(next);
};

export const removeWrongGuessTileInGameState = (
  state: ImmutableGameState,
  tileIndex: number
): ImmutableGameState => {
  const next = new Set(state.wrongGuessIndices);
  next.delete(tileIndex);
  return state.setWrongGuessIndices(next);
};
