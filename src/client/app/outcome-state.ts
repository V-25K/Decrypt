import type { PersistedOutcomeState } from './game-storage';
import type { RouterOutputs } from './types';

type CompletionResult = RouterOutputs['game']['completeSession'];

type BuildCompleteOutcomeStateParams = {
  levelId: string;
  completion: CompletionResult | null;
  solveSeconds: number | null;
  ratingDelta?: number | null;
  pointsGained?: number | null;
  savedAt?: number;
};

export const buildPersistedCompleteOutcomeState = ({
  levelId,
  completion,
  ratingDelta,
  pointsGained,
  solveSeconds,
  savedAt = Date.now(),
}: BuildCompleteOutcomeStateParams): PersistedOutcomeState => ({
  levelId,
  isComplete: true,
  isGameOver: false,
  completion,
  solveSeconds,
  ratingDelta: ratingDelta ?? completion?.ratingDelta ?? null,
  pointsGained: pointsGained ?? completion?.score ?? null,
  savedAt,
});

export const buildPersistedGameOverOutcomeState = (
  levelId: string,
  savedAt = Date.now(),
  ratingDelta: number | null = null
): PersistedOutcomeState => ({
  levelId,
  isComplete: false,
  isGameOver: true,
  completion: null,
  solveSeconds: null,
  ratingDelta,
  pointsGained: null,
  savedAt,
});

export const isPersistedOutcomeForLevel = (
  outcome: PersistedOutcomeState | null,
  levelId: string
): outcome is PersistedOutcomeState => outcome !== null && outcome.levelId === levelId;

type BootstrapOutcomeDecisionParams = {
  persistedOutcome: PersistedOutcomeState | null;
  levelId: string;
  requiresPaidRetry: boolean;
  alreadyCompleted: boolean;
};

export type BootstrapOutcomeDecision =
  | {
      branch: 'restore-persisted';
      persistedOutcome: PersistedOutcomeState;
      shouldClearStalePersisted: false;
    }
  | {
      branch: 'show-paid-retry' | 'already-completed' | 'start-session';
      persistedOutcome: null;
      shouldClearStalePersisted: boolean;
    };

export const getBootstrapOutcomeDecision = ({
  persistedOutcome,
  levelId,
  requiresPaidRetry,
  alreadyCompleted,
}: BootstrapOutcomeDecisionParams): BootstrapOutcomeDecision => {
  if (isPersistedOutcomeForLevel(persistedOutcome, levelId)) {
    return {
      branch: 'restore-persisted',
      persistedOutcome,
      shouldClearStalePersisted: false,
    };
  }

  const shouldClearStalePersisted = persistedOutcome !== null;
  if (requiresPaidRetry && !alreadyCompleted) {
    return {
      branch: 'show-paid-retry',
      persistedOutcome: null,
      shouldClearStalePersisted,
    };
  }

  if (alreadyCompleted) {
    return {
      branch: 'already-completed',
      persistedOutcome: null,
      shouldClearStalePersisted,
    };
  }

  return {
    branch: 'start-session',
    persistedOutcome: null,
    shouldClearStalePersisted,
  };
};

type LoadLevelOutcomeDecisionParams = {
  mode: 'daily' | 'endless';
  requiresPaidRetry: boolean;
  alreadyCompleted: boolean;
};

export type LoadLevelOutcomeDecision =
  | 'already-completed'
  | 'show-paid-retry'
  | 'start-session';

export const getLoadLevelOutcomeDecision = ({
  mode,
  requiresPaidRetry,
  alreadyCompleted,
}: LoadLevelOutcomeDecisionParams): LoadLevelOutcomeDecision => {
  if (alreadyCompleted) {
    return 'already-completed';
  }

  if (mode === 'daily' && requiresPaidRetry) {
    return 'show-paid-retry';
  }

  return 'start-session';
};

export const resolveCompletionSolveSeconds = (
  completion: Pick<CompletionResult, 'solveSeconds'> | null | undefined,
  fallbackSolveSeconds: number | null
): number | null =>
  typeof completion?.solveSeconds === 'number'
    ? completion.solveSeconds
    : fallbackSolveSeconds;

export const resolvePersistedOutcomeSolveSeconds = (
  outcome: Pick<PersistedOutcomeState, 'solveSeconds'> & {
    completion: Pick<CompletionResult, 'solveSeconds'> | null;
  }
): number | null =>
  outcome.solveSeconds ?? resolveCompletionSolveSeconds(outcome.completion, null);
