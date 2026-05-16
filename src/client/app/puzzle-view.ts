import type { Puzzle } from './types';

export type RevealedTile = {
  index: number;
  letter: string;
};

export const applyRevealedTiles = (
  puzzle: Puzzle | null,
  revealedTiles: RevealedTile[]
): Puzzle | null => {
  if (!puzzle || revealedTiles.length === 0) {
    return puzzle;
  }
  const revealMap = new Map<number, string>();
  for (const tile of revealedTiles) {
    revealMap.set(tile.index, tile.letter);
  }
  const nextTiles = puzzle.tiles.map((tile) => {
    const letter = revealMap.get(tile.index);
    if (!letter) {
      return tile;
    }
    return {
      ...tile,
      displayChar: letter,
      isSessionRevealed: true,
    };
  });
  return { ...puzzle, tiles: nextTiles };
};

export const hasAvailableLetters = (puzzle: Puzzle | null): boolean => {
  if (!puzzle) {
    return false;
  }
  return puzzle.tiles.some(
    (tile) => tile.isLetter && tile.displayChar === '_' && !tile.isLocked
  );
};

export const countRemainingLetters = (puzzle: Puzzle | null): number => {
  if (!puzzle) {
    return 10;
  }
  return puzzle.tiles.filter(
    (tile) => tile.isLetter && tile.displayChar === '_'
  ).length;
};

export const buildCompletionQuote = (puzzle: Puzzle): string => {
  const solvedLetters = puzzle.words.join('');
  let letterCursor = 0;
  const rebuilt = puzzle.tiles
    .map((tile) => {
      if (!tile.isLetter) {
        return tile.displayChar;
      }
      const nextLetter = solvedLetters.charAt(letterCursor);
      letterCursor += 1;
      return nextLetter || tile.displayChar;
    })
    .join('');
  return rebuilt.trim().length > 0 ? rebuilt : puzzle.words.join(' ');
};
