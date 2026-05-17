import { formatStatDuration } from './game-formatters';
import type { RouterOutputs } from './types';

export type OutcomeOverlayView = {
  communityJoinLabel: string;
  completionSolveLabel: string;
  homePanelClass: string;
  outcomeSubtitle: string;
  outcomeTitle: string;
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

export const getOutcomeOverlayView = ({
  communityJoinRecorded,
  completionResult,
  completionSolveSeconds,
  deviceTier,
  isComplete,
  joiningCommunity,
}: {
  communityJoinRecorded: boolean;
  completionResult: RouterOutputs['game']['completeSession'] | null;
  completionSolveSeconds: number | null;
  deviceTier: 'mobile' | 'tablet' | 'desktop';
  isComplete: boolean;
  joiningCommunity: boolean;
}): OutcomeOverlayView => ({
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
  outcomeSubtitle: isComplete
    ? completionResult?.rewardNotice ?? ''
    : 'Try again!',
  outcomeTitle: isComplete ? 'Challenge Completed' : 'Challenge Failed',
});
