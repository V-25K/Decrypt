import {
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
} from './puzzle-store';
import { generatePuzzleForDate, publishDailyPost } from './generator';

export const createPost = async () => {
  const pointer = await getDailyPointer();
  if (pointer) {
    const puzzle = await getPuzzlePrivate(pointer);
    const publishedPostId = await getPuzzlePublishedPostId(pointer);
    if (puzzle && !publishedPostId) {
      const postId = await publishDailyPost({
        levelId: puzzle.levelId,
        dateKey: puzzle.dateKey,
      });
      return { id: postId };
    }
  }

  const generated = await generatePuzzleForDate(new Date());
  const postId = await publishDailyPost(generated);
  return { id: postId };
};
