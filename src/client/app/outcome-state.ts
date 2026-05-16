import type { PersistedOutcomeState } from './game-storage';
import type { RouterOutputs } from './types';

type CompletionResult = RouterOutputs['game']['completeSession'];

type BuildCompleteOutcomeStateParams = {
  levelId: string;
  completion: CompletionResult | null;
  solveSeconds: number | null;
  savedAt?: number;
};

export const buildPersistedCompleteOutcomeState = ({
  levelId,
  completion,
  solveSeconds,
  savedAt = Date.now(),
}: BuildCompleteOutcomeStateParams): PersistedOutcomeState => ({
  levelId,
  isComplete: true,
  isGameOver: false,
  completion,
  solveSeconds,
  savedAt,
});

export const buildPersistedGameOverOutcomeState = (
  levelId: string,
  savedAt = Date.now()
): PersistedOutcomeState => ({
  levelId,
  isComplete: false,
  isGameOver: true,
  completion: null,
  solveSeconds: null,
  savedAt,
});

export const isPersistedOutcomeForLevel = (
  outcome: PersistedOutcomeState | null,
  levelId: string
): outcome is PersistedOutcomeState => outcome !== null && outcome.levelId === levelId;

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
