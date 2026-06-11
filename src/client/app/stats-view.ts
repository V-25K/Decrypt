import {
  computeAverageSolveSeconds,
  formatRankLabel,
  formatStatDuration,
} from './game-formatters';
import { startingGlobalRating } from '../../shared/rating';
import type {
  LeaderboardTab,
  Profile,
  RankSummary,
  StatsTab,
} from './types';

export type StatsCard = {
  label: string;
  value: string;
};

export type StatsView = {
  activeLeaderboardRank: number | null;
  // At-a-glance strip shown above the card grid on every tab.
  heroCards: StatsCard[];
  visibleStatsCards: StatsCard[];
};

const profileNumber = (
  value: number | undefined,
  fallback = 0
): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const getStatsView = ({
  leaderboardTab,
  profile,
  rankSummary,
  statsTab,
}: {
  leaderboardTab: LeaderboardTab;
  profile: Profile;
  rankSummary: RankSummary | null;
  statsTab: StatsTab;
}): StatsView => {
  const activeLeaderboardRank =
    leaderboardTab === 'daily'
      ? rankSummary?.dailyRank ?? null
      : rankSummary?.globalRank ?? null;
  const dailyAvgSolveSeconds = computeAverageSolveSeconds(
    profile.dailySolveTimeTotalSec,
    profile.dailyModeClears
  );
  const globalRating = profileNumber(profile.globalRating, startingGlobalRating);
  const globalScore = profileNumber(profile.globalScore);
  const ratingGames = profileNumber(profile.ratingGames);
  const ratingWins = profileNumber(profile.ratingWins);
  const ratingLosses = profileNumber(profile.ratingLosses);
  const globalWinStreak = profileNumber(profile.globalWinStreak);
  const bestGlobalRank = profileNumber(profile.bestGlobalRank);
  const totalModeClears = profile.dailyModeClears + profile.endlessModeClears;
  const globalAvgSolveSeconds = computeAverageSolveSeconds(
    profile.dailySolveTimeTotalSec + profile.endlessSolveTimeTotalSec,
    totalModeClears
  );
  const ratedWinRate =
    ratingGames > 0
      ? `${Math.round((ratingWins / ratingGames) * 100)}%`
      : '--';
  const endlessAvgSolveSeconds = computeAverageSolveSeconds(
    profile.endlessSolveTimeTotalSec,
    profile.endlessModeClears
  );
  const dailyStatCards: StatsCard[] = [
    { label: 'Levels Cleared', value: profile.dailyModeClears.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(dailyAvgSolveSeconds) },
    { label: 'Current Streak', value: profile.dailyCurrentStreak.toLocaleString() },
    { label: 'Flawless Wins', value: profile.dailyFlawlessWins.toLocaleString() },
    { label: 'Speed Wins', value: profile.dailySpeedWins.toLocaleString() },
    { label: 'Challenges Played', value: profile.dailyChallengesPlayed.toLocaleString() },
    { label: 'First Try Wins', value: profile.dailyFirstTryWins.toLocaleString() },
  ];
  const endlessStatCards: StatsCard[] = [
    { label: 'Levels Cleared', value: profile.endlessModeClears.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(endlessAvgSolveSeconds) },
    { label: 'Current Streak', value: profile.endlessCurrentStreak.toLocaleString() },
    { label: 'Flawless Wins', value: profile.endlessFlawlessWins.toLocaleString() },
    { label: 'Speed Wins', value: profile.endlessSpeedWins.toLocaleString() },
    { label: 'Challenges Played', value: profile.endlessChallengesPlayed.toLocaleString() },
    { label: 'First Try Wins', value: profile.endlessFirstTryWins.toLocaleString() },
  ];
  const globalStatCards: StatsCard[] = [
    { label: 'Total Points', value: globalScore.toLocaleString() },
    { label: 'Rated Games', value: ratingGames.toLocaleString() },
    { label: 'Rated Wins', value: ratingWins.toLocaleString() },
    { label: 'Rated Losses', value: ratingLosses.toLocaleString() },
    { label: 'Challenges Cleared', value: profile.totalLevelsCompleted.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(globalAvgSolveSeconds) },
    { label: 'Words Solved', value: profileNumber(profile.totalWordsSolved).toLocaleString() },
    { label: 'Logic Ciphers Solved', value: profileNumber(profile.logicTasksCompleted).toLocaleString() },
  ];
  const activeStatsCards =
    statsTab === 'daily'
      ? dailyStatCards
      : statsTab === 'endless'
        ? endlessStatCards
        : globalStatCards;
  const activeStatsRank =
    statsTab === 'global'
      ? rankSummary?.globalRank ?? null
      : statsTab === 'endless'
        ? rankSummary?.endlessRank ?? null
        : rankSummary?.dailyRank ?? null;
  const globalStatsCards: StatsCard[] = [
    { label: 'Quest Completed', value: profile.questsCompleted.toLocaleString() },
    { label: 'Current Rank', value: formatRankLabel(activeStatsRank) },
    {
      label: statsTab === 'global' ? 'Best Global Rank' : 'Best Overall Rank',
      value: formatRankLabel(
        statsTab === 'global'
          ? bestGlobalRank
          : rankSummary?.bestOverallRank ?? profile.bestOverallRank
      ),
    },
  ];
  // Stable across tabs: the player's headline numbers at a glance.
  const heroCards: StatsCard[] = [
    { label: 'Rating', value: globalRating.toLocaleString() },
    { label: 'Win Rate', value: ratedWinRate },
    { label: 'Win Streak', value: globalWinStreak.toLocaleString() },
  ];

  return {
    activeLeaderboardRank,
    heroCards,
    visibleStatsCards: [...activeStatsCards, ...globalStatsCards],
  };
};
