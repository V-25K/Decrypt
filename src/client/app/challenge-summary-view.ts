import {
  getChallengeBackgroundAsset,
  getStableChallengeBackgroundIndex,
} from './challenge-backgrounds';
import {
  formatChallengeType,
  formatDifficultyLabel,
} from './game-formatters';
import { formatLevelNumber } from './level-number';
import type { Puzzle } from './types';

export { formatLevelNumber } from './level-number';

export type ChallengeSummaryView = {
  backgroundAsset: string;
  backgroundClass: string;
  backgroundIndex: number;
  challengeTypeLabel: string;
  difficultyLabel: string;
  formattedLevel: string;
};

export const getChallengeSummaryView = ({
  levelId,
  puzzle,
}: {
  levelId: string;
  puzzle: Puzzle | null;
}): ChallengeSummaryView => {
  const backgroundKey = puzzle?.levelId || levelId;
  const backgroundIndex = getStableChallengeBackgroundIndex(backgroundKey);

  return {
    backgroundAsset: getChallengeBackgroundAsset(backgroundIndex),
    backgroundClass: `challenge-backdrop-img-${backgroundIndex + 1}`,
    backgroundIndex,
    challengeTypeLabel: formatChallengeType(puzzle?.challengeType),
    difficultyLabel: formatDifficultyLabel(puzzle?.difficulty),
    formattedLevel: formatLevelNumber(levelId),
  };
};
