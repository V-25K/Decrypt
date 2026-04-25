import {
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
} from './puzzle-store';
import { generatePuzzleForDate, publishAndActivateDailyPost } from './generator';

export const createPost = async () => {
  const pointer = await getDailyPointer();
  if (pointer) {
    const puzzle = await getPuzzlePrivate(pointer);
    const publishedPostId = await getPuzzlePublishedPostId(pointer);
    if (puzzle && !publishedPostId) {
      const postId = await publishAndActivateDailyPost({
        levelId: puzzle.levelId,
        dateKey: puzzle.dateKey,
        runAs: 'APP',
      });
      return { id: postId };
    }
  }

  const generated = await generatePuzzleForDate(new Date(), { allowSelectionRefill: true });
  const postId = await publishAndActivateDailyPost({
    ...generated,
    runAs: 'APP',
  });
  return { id: postId };
};
