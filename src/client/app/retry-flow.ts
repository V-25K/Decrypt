import { getDailyRetryQuote } from '../../shared/game-balance';
import type { RetryDialogState } from './types';

export type RetryAction =
  | 'none'
  | 'open-heart-purchase'
  | 'open-paid-daily-retry'
  | 'restart-level';

type RetryActionParams = {
  levelId: string;
  mode: 'daily' | 'endless';
  isGameOver: boolean;
  requiresPaidRetry: boolean;
  hasInfiniteHearts: boolean;
  currentLives: number;
};

type BuildRetryDialogStateParams = {
  coins: number;
  nextDailyRetryCost: number;
  nextDailyRetryScoreFactor: number;
  dailyRetryCount: number;
  puzzleDifficulty: number | undefined;
  difficultyLabel: string;
};

export const formatRetryPenaltyLabel = (factor: number): string => {
  const penaltyPct = Math.max(0, Math.round((1 - factor) * 100));
  return penaltyPct <= 0 ? 'No penalty' : `-${penaltyPct}% score`;
};

export const getRetryAction = ({
  levelId,
  mode,
  isGameOver,
  requiresPaidRetry,
  hasInfiniteHearts,
  currentLives,
}: RetryActionParams): RetryAction => {
  if (!levelId) {
    return 'none';
  }

  const needsHeartPurchase = !hasInfiniteHearts && currentLives <= 0;
  if (mode === 'daily' && isGameOver && requiresPaidRetry) {
    return needsHeartPurchase ? 'open-heart-purchase' : 'open-paid-daily-retry';
  }

  return needsHeartPurchase ? 'open-heart-purchase' : 'restart-level';
};

export const buildRetryDialogState = ({
  coins,
  nextDailyRetryCost,
  nextDailyRetryScoreFactor,
  dailyRetryCount,
  puzzleDifficulty,
  difficultyLabel,
}: BuildRetryDialogStateParams): RetryDialogState | null => {
  if (nextDailyRetryCost < 1) {
    return null;
  }

  const followUpRetryQuote = getDailyRetryQuote({
    retryCount: dailyRetryCount + 1,
    difficulty: puzzleDifficulty,
  });

  return {
    cost: nextDailyRetryCost,
    penaltyLabel: formatRetryPenaltyLabel(nextDailyRetryScoreFactor),
    nextPenaltyLabel: formatRetryPenaltyLabel(
      followUpRetryQuote.nextRetryScoreFactor
    ),
    nextCost: followUpRetryQuote.nextRetryCost,
    coins,
    difficulty: puzzleDifficulty || 5,
    difficultyLabel,
  };
};
