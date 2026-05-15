import { beforeEach, describe, expect, it } from 'vitest';
import {
  getStorageKey,
  migrateSessionStorageForUser,
  persistCorrectGuessIndices,
  persistOutcomeState,
  readCorrectGuessIndices,
  readOutcomeState,
  type PersistedOutcomeState,
} from './game-storage';

const makeOutcomeState = (
  overrides: Partial<PersistedOutcomeState> = {}
): PersistedOutcomeState => ({
  levelId: 'level-1',
  isComplete: true,
  isGameOver: false,
  completion: null,
  solveSeconds: 42,
  savedAt: 123456,
  ...overrides,
});

describe('game storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('namespaces persisted outcome state by user', () => {
    const state = makeOutcomeState();

    persistOutcomeState('user-a', state);

    expect(sessionStorage.getItem(getStorageKey('user-a', 'challenge-outcome-v1'))).not.toBeNull();
    expect(readOutcomeState('user-a')).toEqual(state);
    expect(readOutcomeState('user-b')).toBeNull();
  });

  it('namespaces correct guess indices by user and level', () => {
    persistCorrectGuessIndices('user-a', 'level-1', [3, 1, 3, -1]);
    persistCorrectGuessIndices('user-b', 'level-1', [4]);

    expect(readCorrectGuessIndices('user-a', 'level-1')).toEqual([1, 3]);
    expect(readCorrectGuessIndices('user-b', 'level-1')).toEqual([4]);
    expect(readCorrectGuessIndices('user-a', 'level-2')).toEqual([]);
  });

  it('migrates legacy session storage into the active user namespace once', () => {
    const outcome = makeOutcomeState({ levelId: 'legacy-level' });
    sessionStorage.setItem('decrypt-challenge-outcome-v1', JSON.stringify(outcome));
    sessionStorage.setItem('decrypt-correct-guess-tiles-v1:legacy-level', JSON.stringify([5, 2]));

    migrateSessionStorageForUser('user-a');

    expect(readOutcomeState('user-a')).toEqual(outcome);
    expect(readCorrectGuessIndices('user-a', 'legacy-level')).toEqual([2, 5]);
    expect(sessionStorage.getItem('decrypt-challenge-outcome-v1')).toBeNull();
    expect(sessionStorage.getItem('decrypt-correct-guess-tiles-v1:legacy-level')).toBeNull();

    const scopedOutcome = makeOutcomeState({ levelId: 'scoped-level' });
    persistOutcomeState('user-a', scopedOutcome);
    sessionStorage.setItem('decrypt-challenge-outcome-v1', JSON.stringify(outcome));

    migrateSessionStorageForUser('user-a');

    expect(readOutcomeState('user-a')).toEqual(scopedOutcome);
    expect(sessionStorage.getItem('decrypt-challenge-outcome-v1')).toBeNull();
  });
});
