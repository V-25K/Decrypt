import {
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
} from './puzzle-store';
import { generatePuzzleForDate, publishAndActivateDailyPost } from './generator';
import { redis } from '@devvit/web/server';
import { keyPuzzlePublishLock } from './keys';

export const createPost = async () => {
  const pointer = await getDailyPointer();
  if (pointer) {
    const lockKey = keyPuzzlePublishLock(pointer);
    const lockAcquired = await redis.set(lockKey, 'locked', {
      nx: true,
      expiration: new Date(Date.now() + 60000),
    });

    if (!lockAcquired) {
      throw new Error('Post creation already in progress. Please wait a moment.');
    }

    try {
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
    } finally {
      await redis.del(lockKey);
    }
  }

  const generated = await generatePuzzleForDate(new Date(), { allowSelectionRefill: true });
  const postId = await publishAndActivateDailyPost({
    ...generated,
    runAs: 'APP',
  });
  return { id: postId };
};
