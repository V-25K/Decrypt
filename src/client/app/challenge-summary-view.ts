import {
  getChallengeBackgroundAsset,
  getStableChallengeBackgroundIndex,
} from './challenge-backgrounds';
import {
  formatChallengeType,
  formatDifficultyLabel,
} from './game-formatters';
import type { Puzzle } from './types';

export type ChallengeSummaryView = {
  backgroundAsset: string;
  backgroundClass: string;
  backgroundIndex: number;
  challengeTypeLabel: string;
  difficultyLabel: string;
  formattedLevel: string;
};

export const formatLevelNumber = (rawLevelId: string): string => {
  const match = rawLevelId.match(/(\d+)$/);
  if (!match || !match[1]) {
    return rawLevelId;
  }
  return `${Number(match[1])}`;
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
