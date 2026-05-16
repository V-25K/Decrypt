import {
  persistCorrectGuessIndices,
  readCorrectGuessIndices,
} from './game-storage';
import type { Puzzle } from './types';

type ReadRestoredCorrectGuessFeedbackParams = {
  userId: string | null;
  levelId: string;
  view: Puzzle;
};

export const readRestoredCorrectGuessFeedback = ({
  userId,
  levelId,
  view,
}: ReadRestoredCorrectGuessFeedbackParams): Set<number> => {
  if (!userId) {
    return new Set();
  }
  const storedIndices = readCorrectGuessIndices(userId, levelId);
  if (storedIndices.length === 0) {
    return new Set();
  }
  const validIndices = storedIndices.filter((index) => {
    const tile = view.tiles[index];
    return Boolean(tile && tile.isLetter && tile.displayChar !== '_');
  });
  const restored = new Set(validIndices);
  persistCorrectGuessIndices(userId, levelId, restored);
  return restored;
};
