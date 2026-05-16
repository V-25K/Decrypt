import type { ChallengeSessionState } from './challenge-session-state';

export type RevealedGuessTile = {
  index: number;
  letter: string;
};

export type GuessResultSnapshot = {
  errorCode?: string | null;
  isCorrect: boolean;
  revealedTiles?: RevealedGuessTile[] | null;
  revealedIndices: number[];
  heartsRemaining: number;
  shieldConsumed: boolean;
  isLevelComplete: boolean;
  isGameOver: boolean;
  newlyUnlockedChainIds: readonly unknown[];
  lockProgressChanged: boolean;
};

export const isLockedGuessResult = (
  result: Pick<GuessResultSnapshot, 'errorCode'>
): boolean => result.errorCode === 'TILE_LOCKED';

export const getRevealedTilesFromGuessResult = (
  result: Pick<GuessResultSnapshot, 'revealedTiles'>
): RevealedGuessTile[] =>
  Array.isArray(result.revealedTiles) ? result.revealedTiles : [];

export const getRevealedIndicesForAnimation = (
  result: Pick<GuessResultSnapshot, 'revealedIndices'>,
  revealedTiles: RevealedGuessTile[]
): number[] =>
  revealedTiles.length > 0
    ? revealedTiles.map((tile) => tile.index)
    : result.revealedIndices;

export const removePendingGuessEntries = (
  previous: Map<number, string>,
  tileIndex: number,
  revealedTiles: RevealedGuessTile[]
): Map<number, string> => {
  if (previous.size === 0) {
    return previous;
  }

  const next = new Map(previous);
  let changed = next.delete(tileIndex);

  for (const tile of revealedTiles) {
    changed = next.delete(tile.index) || changed;
  }

  return changed ? next : previous;
};

export const buildGuessSessionPatch = (
  result: Pick<
    GuessResultSnapshot,
    'heartsRemaining' | 'shieldConsumed' | 'isLevelComplete' | 'isGameOver'
  >
): Partial<ChallengeSessionState> => {
  const changes: Partial<ChallengeSessionState> = {
    heartsRemaining: result.heartsRemaining,
  };

  if (result.shieldConsumed) {
    changes.isShieldActive = false;
  }

  if (!result.isLevelComplete && result.isGameOver) {
    changes.isGameOver = true;
  }

  return changes;
};

export const shouldRefreshPuzzleViewAfterGuess = (
  result: Pick<
    GuessResultSnapshot,
    'newlyUnlockedChainIds' | 'lockProgressChanged'
  >
): boolean => result.newlyUnlockedChainIds.length > 0 || result.lockProgressChanged;
