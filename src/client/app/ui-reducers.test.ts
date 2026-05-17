import { describe, expect, it } from 'vitest';
import {
  initialLeaderboardStatsUiState,
  leaderboardStatsUiReducer,
} from './leaderboard-stats-ui-state';
import {
  initialQuestUiState,
  questUiReducer,
} from './quest-ui-state';
import {
  initialUiOverlayState,
  uiOverlayReducer,
} from './ui-overlay-state';

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
