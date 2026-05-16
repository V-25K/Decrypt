import { describe, expect, it } from 'vitest';
import {
  buildActiveChallengeSessionPatch,
  buildCompleteChallengeSessionPatch,
  buildGameOverChallengeSessionPatch,
  buildRestoredOutcomeSessionPatch,
  challengeSessionReducer,
  initialChallengeSessionState,
} from './challenge-session-state';

describe('challengeSessionReducer', () => {
  it('patches challenge session fields', () => {
    const next = challengeSessionReducer(initialChallengeSessionState, {
      type: 'patch',
      changes: {
        levelId: 'daily-42',
        mode: 'daily',
        heartsRemaining: 1,
        isShieldActive: true,
      },
    });

    expect(next).toMatchObject({
      levelId: 'daily-42',
      mode: 'daily',
      heartsRemaining: 1,
      isShieldActive: true,
      isGameOver: false,
      isComplete: false,
    });
  });

  it('keeps completed sessions from also being game over', () => {
    const next = challengeSessionReducer(initialChallengeSessionState, {
      type: 'patch',
      changes: {
        isComplete: true,
        isGameOver: true,
      },
    });

    expect(next.isComplete).toBe(true);
    expect(next.isGameOver).toBe(false);
  });

  it('returns the same object when a patch does not change state', () => {
    const next = challengeSessionReducer(initialChallengeSessionState, {
      type: 'patch',
      changes: {
        mode: initialChallengeSessionState.mode,
      },
    });

    expect(next).toBe(initialChallengeSessionState);
  });

  it('builds an active attempt patch', () => {
    expect(
      buildActiveChallengeSessionPatch({
        heartsRemaining: 2,
        isShieldActive: true,
      })
    ).toEqual({
      heartsRemaining: 2,
      isShieldActive: true,
      isGameOver: false,
      isComplete: false,
    });
  });

  it('builds terminal outcome patches', () => {
    expect(buildGameOverChallengeSessionPatch(3)).toEqual({
      heartsRemaining: 3,
      isShieldActive: false,
      isComplete: false,
      isGameOver: true,
    });

    expect(buildCompleteChallengeSessionPatch(3)).toEqual({
      heartsRemaining: 3,
      isShieldActive: false,
      isComplete: true,
      isGameOver: false,
    });
  });

  it('builds a restored outcome patch', () => {
    expect(
      buildRestoredOutcomeSessionPatch({
        heartsRemaining: 3,
        isComplete: false,
        isGameOver: true,
      })
    ).toEqual({
      heartsRemaining: 3,
      isShieldActive: false,
      isComplete: false,
      isGameOver: true,
    });
  });
});
