import { beforeEach, describe, expect, it } from 'vitest';
import {
  getStorageKey,
  consumeExpandedChallengeModeIntent,
  migrateSessionStorageForUser,
  persistCorrectGuessIndices,
  persistOutcomeState,
  readCorrectGuessIndices,
  readOutcomeState,
  setExpandedChallengeModeIntent,
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
  ratingDelta: null,
  pointsGained: null,
  savedAt: 123456,
  ...overrides,
});

describe('game storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
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

  it('passes the expanded challenge mode intent once', () => {
    setExpandedChallengeModeIntent('endless', 'PROVERB', 'latest');

    expect(consumeExpandedChallengeModeIntent()).toEqual({
      mode: 'endless',
      categoryFilter: 'PROVERB',
      endlessSort: 'latest',
      dailyArchive: false,
      excludeLevelId: null,
      ignorePostLevel: false,
    });
    expect(consumeExpandedChallengeModeIntent()).toBeNull();
  });

  it('passes daily archive expanded intent once', () => {
    setExpandedChallengeModeIntent('daily', null, 'random', true, 'lvl_current');

    expect(consumeExpandedChallengeModeIntent()).toEqual({
      mode: 'daily',
      categoryFilter: null,
      endlessSort: 'random',
      dailyArchive: true,
      excludeLevelId: 'lvl_current',
      ignorePostLevel: false,
    });
  });

  it('passes daily expanded intent that ignores the post level once', () => {
    setExpandedChallengeModeIntent(
      'daily',
      null,
      'random',
      false,
      'lvl_removed',
      true
    );

    expect(consumeExpandedChallengeModeIntent()).toEqual({
      mode: 'daily',
      categoryFilter: null,
      endlessSort: 'random',
      dailyArchive: false,
      excludeLevelId: 'lvl_removed',
      ignorePostLevel: true,
    });
  });

  it('falls back to local storage for expanded challenge intents', () => {
    setExpandedChallengeModeIntent('daily', null, 'random', true, 'lvl_current');
    sessionStorage.clear();

    expect(consumeExpandedChallengeModeIntent()).toEqual({
      mode: 'daily',
      categoryFilter: null,
      endlessSort: 'random',
      dailyArchive: true,
      excludeLevelId: 'lvl_current',
      ignorePostLevel: false,
    });
    expect(consumeExpandedChallengeModeIntent()).toBeNull();
  });
});
