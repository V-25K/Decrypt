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
  const dailyStatCards: StatsCard[] = [
    { label: 'Levels Cleared', value: profile.dailyModeClears.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(dailyAvgSolveSeconds) },
    { label: 'Current Streak', value: profile.dailyCurrentStreak.toLocaleString() },
    { label: 'Flawless Wins', value: profile.dailyFlawlessWins.toLocaleString() },
    { label: 'Speed Wins', value: profile.dailySpeedWins.toLocaleString() },
    { label: 'Challenges Played', value: profile.dailyChallengesPlayed.toLocaleString() },
    { label: 'First Try Wins', value: profile.dailyFirstTryWins.toLocaleString() },
  ];
  const globalStatCards: StatsCard[] = [
    { label: 'Rating', value: globalRating.toLocaleString() },
    { label: 'Total Points', value: globalScore.toLocaleString() },
    { label: 'Rated Games', value: ratingGames.toLocaleString() },
    { label: 'Win Rate', value: ratedWinRate },
    { label: 'Rated Wins', value: ratingWins.toLocaleString() },
    { label: 'Rated Losses', value: ratingLosses.toLocaleString() },
    { label: 'Win Streak', value: globalWinStreak.toLocaleString() },
    { label: 'Challenges Cleared', value: profile.totalLevelsCompleted.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(globalAvgSolveSeconds) },
  ];
  const activeStatsCards = statsTab === 'daily' ? dailyStatCards : globalStatCards;
  const activeStatsRank =
    statsTab === 'daily'
      ? rankSummary?.dailyRank ?? null
      : rankSummary?.globalRank ?? null;
  const globalStatsCards: StatsCard[] = [
    { label: 'Quest Completed', value: profile.questsCompleted.toLocaleString() },
    { label: 'Current Rank', value: formatRankLabel(activeStatsRank) },
    {
      label: statsTab === 'daily' ? 'Best Overall Rank' : 'Best Global Rank',
      value: formatRankLabel(
        statsTab === 'daily'
          ? rankSummary?.bestOverallRank ?? profile.bestOverallRank
          : bestGlobalRank
      ),
    },
  ];

  return {
    activeLeaderboardRank,
    visibleStatsCards: [...activeStatsCards, ...globalStatsCards],
  };
};
