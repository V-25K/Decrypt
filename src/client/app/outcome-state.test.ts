import { describe, expect, it } from 'vitest';
import {
  buildPersistedCompleteOutcomeState,
  buildPersistedGameOverOutcomeState,
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
