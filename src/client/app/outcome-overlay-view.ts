import { formatStatDuration } from './game-formatters';
import type { RouterOutputs } from './types';

export type OutcomeOverlayView = {
  communityJoinLabel: string;
  completionSolveLabel: string;
  homePanelClass: string;
  pointsGainedLabel: string | null;
  ratingDeltaLabel: string | null;
  ratingDeltaTone: 'negative' | 'neutral' | 'positive';
};

export const getCommunityJoinLabel = ({
  joiningCommunity,
  communityJoinRecorded,
}: {
  joiningCommunity: boolean;
  communityJoinRecorded: boolean;
}): string => {
  if (joiningCommunity) {
    return 'Joining...';
  }
  return communityJoinRecorded ? 'Joined' : 'Subscribe';
};

const formatRatingDeltaLabel = (ratingDelta: number | null | undefined): string | null => {
  if (typeof ratingDelta !== 'number') {
    return null;
  }
  const prefix = ratingDelta > 0 ? '+' : '';
  return `${prefix}${ratingDelta} ELO`;
};

const formatPointsGainedLabel = (pointsGained: number | null | undefined): string | null => {
  if (typeof pointsGained !== 'number') {
    return null;
  }
  return `+${Math.max(0, pointsGained).toLocaleString('en-US')} pts`;
};

const getRatingDeltaTone = (
  ratingDelta: number | null | undefined
): OutcomeOverlayView['ratingDeltaTone'] => {
  if (typeof ratingDelta !== 'number' || ratingDelta === 0) {
    return 'neutral';
  }
  return ratingDelta > 0 ? 'positive' : 'negative';
};

export const getOutcomeOverlayView = ({
  communityJoinRecorded,
  completionPointsGained,
  completionRatingDelta,
  completionResult,
  completionSolveSeconds,
  deviceTier,
  failureRatingDelta,
  isComplete,
  joiningCommunity,
}: {
  communityJoinRecorded: boolean;
  completionPointsGained: number | null;
  completionRatingDelta: number | null;
  completionResult: RouterOutputs['game']['completeSession'] | null;
  completionSolveSeconds: number | null;
  deviceTier: 'mobile' | 'tablet' | 'desktop';
  failureRatingDelta: number | null;
  isComplete: boolean;
  joiningCommunity: boolean;
}): OutcomeOverlayView => {
  const outcomeRatingDelta = isComplete
    ? completionResult?.ratingDelta ?? completionRatingDelta
    : failureRatingDelta;
  const outcomePointsGained = isComplete
    ? completionResult?.score ?? completionPointsGained
    : 0;

  return {
    communityJoinLabel: getCommunityJoinLabel({
      joiningCommunity,
      communityJoinRecorded,
    }),
    completionSolveLabel: formatStatDuration(
      completionSolveSeconds ?? completionResult?.solveSeconds ?? null
    ),
    homePanelClass: deviceTier === 'mobile'
      ? 'mx-auto mt-3 w-full max-w-[340px] space-y-3'
      : 'mx-auto mt-4 w-full max-w-[520px] space-y-4',
    pointsGainedLabel: formatPointsGainedLabel(outcomePointsGained),
    ratingDeltaLabel: formatRatingDeltaLabel(outcomeRatingDelta),
    ratingDeltaTone: getRatingDeltaTone(outcomeRatingDelta),
  };
};
