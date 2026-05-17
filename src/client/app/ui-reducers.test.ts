import { describe, expect, it } from 'vitest';
import {
  appRuntimeReducer,
  initialAppRuntimeState,
} from './app-runtime-state';
import {
  guessWorkReducer,
  initialGuessWorkState,
} from './guess-work-state';
import {
  initialLeaderboardStatsUiState,
  leaderboardStatsUiReducer,
} from './leaderboard-stats-ui-state';
import {
  createInitialLayoutTimingState,
  layoutTimingReducer,
} from './layout-timing-state';
import {
  initialQuestUiState,
  questUiReducer,
} from './quest-ui-state';
import {
  initialUiOverlayState,
  uiOverlayReducer,
} from './ui-overlay-state';

describe('appRuntimeReducer', () => {
  it('updates bootstrap runtime state while preserving unrelated fields', () => {
    const busy = appRuntimeReducer(initialAppRuntimeState, {
      type: 'setBusy',
      update: true,
    });
    const withError = appRuntimeReducer(busy, {
      type: 'setBootstrapError',
      update: 'No puzzle',
    });
    const retried = appRuntimeReducer(withError, {
      type: 'incrementBootstrapAttempt',
    });

    expect(retried).toMatchObject({
      bootstrapAttempt: 1,
      bootstrapError: 'No puzzle',
      busy: true,
      loading: true,
    });
  });

  it('returns the same runtime state for no-op updates', () => {
    const next = appRuntimeReducer(initialAppRuntimeState, {
      type: 'setLoading',
      update: initialAppRuntimeState.loading,
    });

    expect(next).toBe(initialAppRuntimeState);
  });
});

describe('guessWorkReducer', () => {
  it('tracks pending guesses immutably and clears revealed entries', () => {
    const pending = guessWorkReducer(initialGuessWorkState, {
      type: 'markPendingGuess',
      letter: 'A',
      tileIndex: 2,
    });
    const withSecondPending = guessWorkReducer(pending, {
      type: 'markPendingGuess',
      letter: 'B',
      tileIndex: 3,
    });
    const cleared = guessWorkReducer(withSecondPending, {
      type: 'clearPendingGuessEntries',
      revealedTiles: [{ index: 3, letter: 'B' }],
      tileIndex: 2,
    });

    expect(pending).not.toBe(initialGuessWorkState);
    expect(pending.pendingGuessByTile.get(2)).toBe('A');
    expect(initialGuessWorkState.pendingGuessByTile.size).toBe(0);
    expect(cleared.pendingGuessByTile.size).toBe(0);
  });

  it('syncs queue count and reset clears all guess work', () => {
    const inFlight = guessWorkReducer(initialGuessWorkState, {
      type: 'setGuessInFlight',
      update: true,
    });
    const queued = guessWorkReducer(inFlight, {
      type: 'syncQueuedGuessCount',
      queuedGuessCount: 3,
    });
    const reset = guessWorkReducer(queued, { type: 'reset' });

    expect(queued).toMatchObject({
      guessInFlight: true,
      queuedGuessCount: 3,
    });
    expect(reset).toBe(initialGuessWorkState);
  });
});

describe('layoutTimingReducer', () => {
  it('updates viewport, clock, and puzzle fit while preserving unrelated fields', () => {
    const initial = createInitialLayoutTimingState({
      headerNowTs: 100,
      viewportWidth: 320,
    });
    const withViewport = layoutTimingReducer(initial, {
      type: 'setViewportWidth',
      viewportWidth: 640,
    });
    const withClock = layoutTimingReducer(withViewport, {
      type: 'setHeaderNowTs',
      headerNowTs: 200,
    });
    const fitted = layoutTimingReducer(withClock, {
      type: 'setPuzzleFit',
      isPuzzleVerticallyCentered: false,
      puzzleScale: 0.75,
    });

    expect(fitted).toEqual({
      headerNowTs: 200,
      isPuzzleVerticallyCentered: false,
      puzzleScale: 0.75,
      viewportWidth: 640,
    });
  });

  it('returns the same layout timing state for no-op updates', () => {
    const initial = createInitialLayoutTimingState({
      headerNowTs: 100,
      viewportWidth: 320,
    });

    expect(
      layoutTimingReducer(initial, {
        type: 'setViewportWidth',
        viewportWidth: 320,
      })
    ).toBe(initial);
  });
});

describe('uiOverlayReducer', () => {
  it('updates overlay dialogs and supports updater functions', () => {
    const withHelp = uiOverlayReducer(initialUiOverlayState, {
      type: 'setHelpOpen',
      update: true,
    });
    expect(withHelp.isHelpOpen).toBe(true);

    const toggled = uiOverlayReducer(withHelp, {
      type: 'setHelpOpen',
      update: (previous) => !previous,
    });
    expect(toggled.isHelpOpen).toBe(false);

    const withBuyDialog = uiOverlayReducer(toggled, {
      type: 'setBuyDialog',
      update: { item: 'hammer', quantity: 1 },
    });
    expect(withBuyDialog.buyDialog).toEqual({ item: 'hammer', quantity: 1 });
  });
});

describe('questUiReducer', () => {
  it('updates quest UI state', () => {
    const state = questUiReducer(initialQuestUiState, {
      type: 'setQuestError',
      update: 'No quests',
    });

    expect(state.questError).toBe('No quests');
    expect(
      questUiReducer(state, {
        type: 'setQuestTab',
        update: 'milestone',
      }).questTab
    ).toBe('milestone');
  });
});

describe('leaderboardStatsUiReducer', () => {
  it('updates leaderboard, stats, and home tabs', () => {
    const withLeaderboard = leaderboardStatsUiReducer(
      initialLeaderboardStatsUiState,
      {
        type: 'setLeaderboardTab',
        update: 'endless',
      }
    );
    const withStats = leaderboardStatsUiReducer(withLeaderboard, {
      type: 'setStatsTab',
      update: 'endless',
    });
    const withHome = leaderboardStatsUiReducer(withStats, {
      type: 'setHomeTab',
      update: 'endless',
    });

    expect(withHome).toMatchObject({
      homeTab: 'endless',
      leaderboardTab: 'endless',
      statsTab: 'endless',
    });
  });
});
