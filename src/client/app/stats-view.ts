import {
  computeAverageSolveSeconds,
  formatRankLabel,
  formatStatDuration,
} from './game-formatters';
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
      : rankSummary?.endlessRank ?? null;
  const dailyAvgSolveSeconds = computeAverageSolveSeconds(
    profile.dailySolveTimeTotalSec,
    profile.dailyModeClears
  );
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
  const activeStatsCards = statsTab === 'daily' ? dailyStatCards : endlessStatCards;
  const activeStatsRank =
    statsTab === 'daily'
      ? rankSummary?.dailyRank ?? null
      : rankSummary?.endlessRank ?? null;
  const globalStatsCards: StatsCard[] = [
    { label: 'Quest Completed', value: profile.questsCompleted.toLocaleString() },
    { label: 'Current Rank', value: formatRankLabel(activeStatsRank) },
    {
      label: 'All-Time Best Ranking',
      value: formatRankLabel(rankSummary?.bestOverallRank ?? profile.bestOverallRank),
    },
  ];

  return {
    activeLeaderboardRank,
    visibleStatsCards: [...activeStatsCards, ...globalStatsCards],
  };
};
