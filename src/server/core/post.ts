import {
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
} from './puzzle-store';
import { generatePuzzleForDate, publishAndActivateDailyPost } from './generator';
import { redis } from '@devvit/web/server';
import { keyDailyPostCreateLock } from './keys';

const dailyPostCreateLockTtlMs = 180_000;

const createLockToken = (): string => `${Date.now()}:${crypto.randomUUID()}`;

const releaseLock = async (lockKey: string, lockToken: string): Promise<void> => {
  try {
    const transaction = await redis.watch(lockKey);
    const activeToken = await redis.get(lockKey);
    if (activeToken !== lockToken) {
      await transaction.unwatch();
      return;
    }
    await transaction.multi();
    await transaction.del(lockKey);
    await transaction.exec();
  } catch (error) {
    console.error('[createPost] Failed to release daily post create lock', error);
  }
};

export const createPost = async () => {
  const lockToken = createLockToken();
  const lockAcquired = await redis.set(keyDailyPostCreateLock, lockToken, {
    nx: true,
    expiration: new Date(Date.now() + dailyPostCreateLockTtlMs),
  });

  if (!lockAcquired) {
    throw new Error('Post creation already in progress. Please wait a moment.');
  }

  try {
    const pointer = await getDailyPointer();
    if (pointer) {
      const [puzzle, publishedPostId] = await Promise.all([
        getPuzzlePrivate(pointer),
        getPuzzlePublishedPostId(pointer),
      ]);
      if (puzzle && publishedPostId) {
        return { id: publishedPostId };
      }
      if (puzzle) {
        const postId = await publishAndActivateDailyPost({
          levelId: puzzle.levelId,
          dateKey: puzzle.dateKey,
          runAs: 'APP',
        });
        return { id: postId };
      }
    }

    const generated = await generatePuzzleForDate(new Date());
    const postId = await publishAndActivateDailyPost({
      ...generated,
      runAs: 'APP',
    });
    return { id: postId };
  } finally {
    await releaseLock(keyDailyPostCreateLock, lockToken);
  }
};
