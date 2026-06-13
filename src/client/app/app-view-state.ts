import type {
  AppScreen,
  HomeTab,
} from './types';

export type AppViewStateParams = {
  activeScreen: AppScreen;
  isChallengeScreen: boolean;
  isComplete: boolean;
  isGameOver: boolean;
  isInlineMode: boolean;
  mode: HomeTab;
  requiresPaidRetry: boolean;
  // The viewer opened their own community challenge: show the solution as a
  // result screen (no win treatment, no rewards) instead of a playable board.
  isOwnChallengeReveal?: boolean;
};

export type AppViewState = {
  layoutTestId: string;
  isHomeScreen: boolean;
  isCommunityScreen: boolean;
  isShopScreen: boolean;
  isQuestScreen: boolean;
  isStatsScreen: boolean;
  isLeaderboardScreen: boolean;
  isHubScreen: boolean;
  showOutcomeOverlay: boolean;
  showChallengeBackdrop: boolean;
  showSuccessOverlay: boolean;
  isDailyComplete: boolean;
  showPaidDailyRetryCta: boolean;
};

export const getAppViewState = ({
  activeScreen,
  isChallengeScreen,
  isComplete,
  isGameOver,
  isInlineMode,
  mode,
  requiresPaidRetry,
  isOwnChallengeReveal = false,
}: AppViewStateParams): AppViewState => {
  const isHomeScreen = activeScreen === 'home';
  const isCommunityScreen = activeScreen === 'community';
  const isShopScreen = activeScreen === 'shop';
  const isQuestScreen = activeScreen === 'quest';
  const isStatsScreen = activeScreen === 'stats';
  const isLeaderboardScreen = activeScreen === 'leaderboard';
  const isHubScreen =
    isHomeScreen ||
    isCommunityScreen ||
    isShopScreen ||
    isQuestScreen ||
    isStatsScreen ||
    isLeaderboardScreen;
  const showOutcomeOverlay =
    isChallengeScreen && (isGameOver || isComplete || isOwnChallengeReveal);

  return {
    layoutTestId: isInlineMode ? 'layout-inline' : 'layout-expanded-stacked',
    isHomeScreen,
    isCommunityScreen,
    isShopScreen,
    isQuestScreen,
    isStatsScreen,
    isLeaderboardScreen,
    isHubScreen,
    showOutcomeOverlay,
    showChallengeBackdrop: isChallengeScreen && !showOutcomeOverlay,
    showSuccessOverlay: isComplete,
    isDailyComplete: mode === 'daily' && isComplete,
    showPaidDailyRetryCta: mode === 'daily' && isGameOver && requiresPaidRetry,
  };
};
