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
};

export type AppViewState = {
  layoutTestId: string;
  isHomeScreen: boolean;
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
}: AppViewStateParams): AppViewState => {
  const isHomeScreen = activeScreen === 'home';
  const isShopScreen = activeScreen === 'shop';
  const isQuestScreen = activeScreen === 'quest';
  const isStatsScreen = activeScreen === 'stats';
  const isLeaderboardScreen = activeScreen === 'leaderboard';
  const isHubScreen =
    isHomeScreen ||
    isShopScreen ||
    isQuestScreen ||
    isStatsScreen ||
    isLeaderboardScreen;
  const showOutcomeOverlay = isChallengeScreen && (isGameOver || isComplete);

  return {
    layoutTestId: isInlineMode ? 'layout-inline' : 'layout-expanded-stacked',
    isHomeScreen,
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
