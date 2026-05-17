import type { PuzzleRenderToken } from '../utils';
import type {
  PowerupType,
  Puzzle,
} from './types';

export type PowerupValidity = {
  valid: boolean;
  reason: string | null;
};

export const getPowerupValidityForPuzzle = ({
  isShieldActive,
  item,
  puzzle,
  tokens,
}: {
  isShieldActive: boolean;
  item: PowerupType;
  puzzle: Puzzle | null;
  tokens: readonly PuzzleRenderToken<Puzzle['tiles'][number]>[];
}): PowerupValidity => {
  if (!puzzle) {
    return { valid: false, reason: 'Level data is unavailable.' };
  }

  const unrevealedUnlockedTiles = puzzle.tiles.filter(
    (tile) => tile.isLetter && tile.displayChar === '_' && !tile.isLocked
  );
  const unlockedIncompleteWords = tokens.filter(
    (token) =>
      token.type === 'word' &&
      token.tiles.some(
        (tile) =>
          tile.isLetter &&
          tile.displayChar === '_' &&
          !tile.isLocked &&
          !tile.isBlind
      )
  );

  switch (item) {
    case 'hammer':
      return unrevealedUnlockedTiles.length === 0
        ? { valid: false, reason: 'No unlocked tiles left to reveal.' }
        : { valid: true, reason: null };
    case 'wand':
      return unlockedIncompleteWords.length === 0
        ? { valid: false, reason: 'No unlocked words available.' }
        : { valid: true, reason: null };
    case 'rocket':
      return unrevealedUnlockedTiles.length < 3
        ? { valid: false, reason: 'Not enough unlocked tiles for Rocket.' }
        : { valid: true, reason: null };
    case 'shield':
      return isShieldActive
        ? { valid: false, reason: 'Shield is already active.' }
        : { valid: true, reason: null };
  }
};
