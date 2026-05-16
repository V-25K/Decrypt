import { describe, expect, it } from 'vitest';
import {
  buildPersistedCompleteOutcomeState,
  buildPersistedGameOverOutcomeState,
  getBootstrapOutcomeDecision,
  isPersistedOutcomeForLevel,
  resolveCompletionSolveSeconds,
  resolvePersistedOutcomeSolveSeconds,
} from './outcome-state';
import type { PersistedOutcomeState } from './game-storage';

const completion = { solveSeconds: 42 };

describe('outcome state helpers', () => {
  it('builds a completed persisted outcome state', () => {
    expect(
      buildPersistedCompleteOutcomeState({
        levelId: 'daily-1',
        completion: null,
        solveSeconds: 73,
        savedAt: 123,
      })
    ).toEqual({
      levelId: 'daily-1',
      isComplete: true,
      isGameOver: false,
      completion: null,
      solveSeconds: 73,
      savedAt: 123,
    });
  });

  it('builds a game-over persisted outcome state', () => {
    expect(buildPersistedGameOverOutcomeState('daily-1', 456)).toEqual({
      levelId: 'daily-1',
      isComplete: false,
      isGameOver: true,
      completion: null,
      solveSeconds: null,
      savedAt: 456,
    });
  });

  it('detects persisted outcomes that belong to the active level', () => {
    const outcome = buildPersistedGameOverOutcomeState('daily-1', 1);

    expect(isPersistedOutcomeForLevel(outcome, 'daily-1')).toBe(true);
    expect(isPersistedOutcomeForLevel(outcome, 'daily-2')).toBe(false);
    expect(isPersistedOutcomeForLevel(null, 'daily-1')).toBe(false);
  });

  it('chooses to restore a persisted outcome for the active level', () => {
    const outcome = buildPersistedGameOverOutcomeState('daily-1', 1);

    expect(
      getBootstrapOutcomeDecision({
        persistedOutcome: outcome,
        levelId: 'daily-1',
        requiresPaidRetry: true,
        alreadyCompleted: false,
      })
    ).toEqual({
      branch: 'restore-persisted',
      persistedOutcome: outcome,
      shouldClearStalePersisted: false,
    });
  });

  it('clears stale persisted outcomes before choosing the server branch', () => {
    const outcome = buildPersistedGameOverOutcomeState('daily-old', 1);

    expect(
      getBootstrapOutcomeDecision({
        persistedOutcome: outcome,
        levelId: 'daily-1',
        requiresPaidRetry: true,
        alreadyCompleted: false,
      })
    ).toEqual({
      branch: 'show-paid-retry',
      persistedOutcome: null,
      shouldClearStalePersisted: true,
    });
  });

  it('chooses the already-completed branch after paid retry is ruled out', () => {
    expect(
      getBootstrapOutcomeDecision({
        persistedOutcome: null,
        levelId: 'daily-1',
        requiresPaidRetry: true,
        alreadyCompleted: true,
      })
    ).toEqual({
      branch: 'already-completed',
      persistedOutcome: null,
      shouldClearStalePersisted: false,
    });
  });

  it('chooses to start a session when there is no restoration branch', () => {
    expect(
      getBootstrapOutcomeDecision({
        persistedOutcome: null,
        levelId: 'daily-1',
        requiresPaidRetry: false,
        alreadyCompleted: false,
      })
    ).toEqual({
      branch: 'start-session',
      persistedOutcome: null,
      shouldClearStalePersisted: false,
    });
  });

  it('resolves completion solve seconds before fallback seconds', () => {
    expect(resolveCompletionSolveSeconds(completion, 99)).toBe(42);
    expect(resolveCompletionSolveSeconds(null, 99)).toBe(99);
  });

  it('resolves persisted solve seconds before embedded completion seconds', () => {
    const persisted: PersistedOutcomeState = {
      levelId: 'daily-1',
      isComplete: true,
      isGameOver: false,
      completion: null,
      solveSeconds: 64,
      savedAt: 1,
    };

    expect(resolvePersistedOutcomeSolveSeconds(persisted)).toBe(64);
    expect(
      resolvePersistedOutcomeSolveSeconds({
        ...persisted,
        completion,
        solveSeconds: null,
      })
    ).toBe(42);
  });
});
