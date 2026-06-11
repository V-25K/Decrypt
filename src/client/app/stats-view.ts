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
} from './types';

export type StatsCard = {
  label: string;
  value: string;
};

export type StatsView = {
  activeLeaderboardRank: number | null;
  // At-a-glance strip shown above the card grid.
  heroCards: StatsCard[];
  visibleStatsCards: StatsCard[];
};

const profileNumber = (
  value: number | undefined,
  fallback = 0
): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

// One curated "overall" set: lifetime numbers across daily + endless + rated
// play. Mode-by-mode splits were three tabs of near-duplicate cards; the
// meaningful story fits on one screen.
export const getStatsView = ({
  leaderboardTab,
  profile,
  rankSummary,
}: {
  leaderboardTab: LeaderboardTab;
  profile: Profile;
  rankSummary: RankSummary | null;
}): StatsView => {
  const activeLeaderboardRank =
    leaderboardTab === 'daily'
      ? rankSummary?.dailyRank ?? null
      : rankSummary?.globalRank ?? null;
  const globalRating = profileNumber(profile.globalRating, startingGlobalRating);
  const globalScore = profileNumber(profile.globalScore);
  const ratingGames = profileNumber(profile.ratingGames);
  const ratingWins = profileNumber(profile.ratingWins);
  const globalWinStreak = profileNumber(profile.globalWinStreak);
  const totalModeClears = profile.dailyModeClears + profile.endlessModeClears;
  const overallAvgSolveSeconds = computeAverageSolveSeconds(
    profile.dailySolveTimeTotalSec + profile.endlessSolveTimeTotalSec,
    totalModeClears
  );
  const ratedWinRate =
    ratingGames > 0
      ? `${Math.round((ratingWins / ratingGames) * 100)}%`
      : '--';

  const heroCards: StatsCard[] = [
    { label: 'Rating', value: globalRating.toLocaleString() },
    { label: 'Win Rate', value: ratedWinRate },
    { label: 'Win Streak', value: globalWinStreak.toLocaleString() },
  ];

  const visibleStatsCards: StatsCard[] = [
    { label: 'Challenges Cleared', value: profile.totalLevelsCompleted.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(overallAvgSolveSeconds) },
    { label: 'Current Streak', value: profileNumber(profile.currentStreak).toLocaleString() },
    { label: 'Flawless Wins', value: profileNumber(profile.flawlessWins).toLocaleString() },
    { label: 'Speed Wins', value: profileNumber(profile.speedWins).toLocaleString() },
    { label: 'Words Solved', value: profileNumber(profile.totalWordsSolved).toLocaleString() },
    { label: 'Logic Ciphers Solved', value: profileNumber(profile.logicTasksCompleted).toLocaleString() },
    { label: 'Total Points', value: globalScore.toLocaleString() },
    { label: 'Quest Completed', value: profile.questsCompleted.toLocaleString() },
    { label: 'Current Rank', value: formatRankLabel(rankSummary?.globalRank ?? null) },
    {
      label: 'Best Overall Rank',
      value: formatRankLabel(rankSummary?.bestOverallRank ?? profile.bestOverallRank),
    },
  ];

  return {
    activeLeaderboardRank,
    heroCards,
    visibleStatsCards,
  };
};
