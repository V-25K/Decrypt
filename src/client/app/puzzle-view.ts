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

// Builds the solved quote shown on the result screen. Prefers the server-
// authorized `solvedText` (the full decrypted line), which is the only correct
// source when the run ended in a loss, the player is viewing their own challenge,
// or they reopened an already-finished puzzle — in all of those the tiles are not
// fully revealed. The server only sends `solvedText` to entitled viewers, so this
// can never leak the answer mid-solve. Falls back to the revealed tiles for a
// fresh win, where every letter tile's `displayChar` already holds the solved
// letter (and non-letter tiles carry their literal character). We must NOT read a
// `words` array here — the plaintext answer is never shipped on a playable puzzle.
export const buildCompletionQuote = (puzzle: Puzzle): string => {
  if (puzzle.solvedText && puzzle.solvedText.length > 0) {
    return puzzle.solvedText;
  }
  return puzzle.tiles.map((tile) => tile.displayChar).join('');
};
