import { describe, expect, it } from 'vitest';
import {
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
});
