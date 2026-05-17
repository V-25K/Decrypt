import { resolveStateUpdate, type StateUpdate } from './state-update';
import type {
  HomeTab,
  LeaderboardTab,
  RankSummary,
  StatsTab,
} from './types';

export type LeaderboardStatsUiState = {
  homeTab: HomeTab;
  leaderboardTab: LeaderboardTab;
  rankSummary: RankSummary | null;
  statsTab: StatsTab;
};

export type LeaderboardStatsUiAction =
  | { type: 'setHomeTab'; update: StateUpdate<HomeTab> }
  | { type: 'setLeaderboardTab'; update: StateUpdate<LeaderboardTab> }
  | { type: 'setRankSummary'; update: StateUpdate<RankSummary | null> }
  | { type: 'setStatsTab'; update: StateUpdate<StatsTab> };

export const initialLeaderboardStatsUiState: LeaderboardStatsUiState = {
  homeTab: 'daily',
  leaderboardTab: 'daily',
  rankSummary: null,
  statsTab: 'daily',
};

export const leaderboardStatsUiReducer = (
  state: LeaderboardStatsUiState,
  action: LeaderboardStatsUiAction
): LeaderboardStatsUiState => {
  switch (action.type) {
    case 'setHomeTab':
      return {
        ...state,
        homeTab: resolveStateUpdate(state.homeTab, action.update),
      };
    case 'setLeaderboardTab':
      return {
        ...state,
        leaderboardTab: resolveStateUpdate(state.leaderboardTab, action.update),
      };
    case 'setRankSummary':
      return {
        ...state,
        rankSummary: resolveStateUpdate(state.rankSummary, action.update),
      };
    case 'setStatsTab':
      return {
        ...state,
        statsTab: resolveStateUpdate(state.statsTab, action.update),
      };
  }
};
