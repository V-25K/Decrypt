import {
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
  getStagedLevelId,
  clearStagedLevelId,
} from './puzzle-store';
import {
  generatePuzzleForDate,
  injectManualPuzzle,
  publishDailyPost,
} from './generator';
import type { ChallengeType } from '../../shared/game';
import { activateEndlessCatalog, getEndlessCatalogStatus } from './endless-catalog';
import { auditBundledEndlessStagingCollisions } from './endless-audit';

export const rerollAndPublish = async (): Promise<{
  levelId: string;
  dateKey: string;
  postId: string;
}> => {
  const generated = await generatePuzzleForDate(new Date());
  const postId = await publishDailyPost(generated);
  return {
    ...generated,
    postId,
  };
};

export const getLastGeneratedChallengeDetails = async (): Promise<{
  levelId: string;
  dateKey: string;
  difficulty: number;
  challengeType: string;
  author: string;
  text: string;
  wordCount: number;
  characterCount: number;
  alreadyPosted: boolean;
  postId: string | null;
}> => {
  const stagedLevelId = await getStagedLevelId();
  if (!stagedLevelId) {
    throw new Error('No generated daily challenge is waiting to be posted.');
  }
  const puzzle = await getPuzzlePrivate(stagedLevelId);
  if (!puzzle) {
    throw new Error('The last generated daily challenge could not be found.');
  }
  const postId = await getPuzzlePublishedPostId(stagedLevelId);
  return {
    levelId: stagedLevelId,
    dateKey: puzzle.dateKey,
    difficulty: puzzle.difficulty,
    challengeType: puzzle.challengeType,
    author: puzzle.author,
    text: puzzle.targetText,
    wordCount: puzzle.words.length,
    characterCount: puzzle.targetText.length,
    alreadyPosted: postId !== null,
    postId,
  };
};

export const publishLastGeneratedChallenge = async (): Promise<{
  levelId: string;
  dateKey: string;
  postId: string;
  alreadyPublished: boolean;
}> => {
  const stagedLevelId = await getStagedLevelId();
  if (!stagedLevelId) {
    throw new Error('No generated daily challenge is waiting to be posted.');
  }
  const puzzle = await getPuzzlePrivate(stagedLevelId);
  if (!puzzle) {
    throw new Error('The last generated daily challenge could not be found.');
  }
  const existingPostId = await getPuzzlePublishedPostId(stagedLevelId);
  if (existingPostId) {
    await clearStagedLevelId();
    return {
      levelId: stagedLevelId,
      dateKey: puzzle.dateKey,
      postId: existingPostId,
      alreadyPublished: true,
    };
  }
  const postId = await publishDailyPost({
    levelId: stagedLevelId,
    dateKey: puzzle.dateKey,
  });
  await clearStagedLevelId();
  return {
    levelId: stagedLevelId,
    dateKey: puzzle.dateKey,
    postId,
    alreadyPublished: false,
  };
};

export const injectAndPublishManualPuzzle = async (params: {
  text: string;
  difficulty: number;
  challengeType: ChallengeType;
}) => {
  const generated = await injectManualPuzzle({
    text: params.text,
    difficulty: params.difficulty,
    challengeType: params.challengeType,
    author: 'MODERATOR',
  });
  const postId = await publishDailyPost(generated);
  return {
    ...generated,
    postId,
  };
};

export const getEndlessCatalogAdminStatus = async () => {
  return await getEndlessCatalogStatus();
};

export const activateEndlessCatalogVersion = async (catalogVersion: string) => {
  return await activateEndlessCatalog(catalogVersion);
};

export const getEndlessStagingCollisionReport = async () => {
  return await auditBundledEndlessStagingCollisions();
};
