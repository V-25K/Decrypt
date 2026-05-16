import { isGuessableTileAtIndex } from './game-state-actions';
import type { Puzzle } from './types';

export type GuessQueueEntry = {
  levelId: string;
  tileIndex: number;
  letter: string;
};

export const filterGuessQueueForLevel = (
  entries: GuessQueueEntry[],
  levelId: string
): GuessQueueEntry[] => entries.filter((entry) => entry.levelId === levelId);

export const buildDispatchableGuessChunk = (
  entries: GuessQueueEntry[],
  puzzle: Puzzle | null
): GuessQueueEntry[] => {
  if (!puzzle || entries.length === 0) {
    return [];
  }
  const dispatchable: GuessQueueEntry[] = [];
  const seenTileIndices = new Set<number>();
  const seenCipherNumbers = new Set<number>();
  for (const entry of entries) {
    if (seenTileIndices.has(entry.tileIndex)) {
      continue;
    }
    if (!isGuessableTileAtIndex(puzzle, entry.tileIndex)) {
      continue;
    }
    const tile = puzzle.tiles[entry.tileIndex];
    const cipherNumber = tile?.cipherNumber;
    if (
      typeof cipherNumber === 'number' &&
      seenCipherNumbers.has(cipherNumber)
    ) {
      continue;
    }
    dispatchable.push(entry);
    seenTileIndices.add(entry.tileIndex);
    if (typeof cipherNumber === 'number') {
      seenCipherNumbers.add(cipherNumber);
    }
  }
  return dispatchable;
};
