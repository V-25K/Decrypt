import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import {
  getLastGeneratedChallengeDetails,
  publishLastGeneratedChallenge,
  rerollAndPublish,
} from '../core/admin';
import type { MenuItemRequest } from '@devvit/web/shared';
import { hasAdminAccess } from '../core/admin-auth';

export const menu = new Hono();

const requireAdmin = async (): Promise<UiResponse | null> => {
  const allowed = await hasAdminAccess({
    subredditName: context.subredditName,
    username: context.username,
  });
  if (allowed) {
    return null;
  }
  return { showToast: 'Moderator access required.' };
};

menu.post('/post-create', async (c) => {
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      200
    );
  }
});

menu.post('/mod-reroll', async (c) => {
  await c.req.json<MenuItemRequest>();
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  try {
    const result = await rerollAndPublish();
    return c.json<UiResponse>(
      {
        showToast: `Rerolled and published ${result.levelId}`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error rerolling puzzle: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: `Failed to reroll puzzle: ${reason}`,
      },
      200
    );
  }
});

menu.post('/mod-post-last-generated', async (c) => {
  await c.req.json<MenuItemRequest>();
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  try {
    const details = await getLastGeneratedChallengeDetails();
    const published = await publishLastGeneratedChallenge();
    if (published.alreadyPublished) {
      return c.json<UiResponse>(
        {
          showToast: `${published.levelId} was already posted.`,
          navigateTo: `https://reddit.com/comments/${published.postId}`,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        showToast: `Posted ${published.levelId}: ${details.challengeType} (${details.difficulty}/10)`,
        navigateTo: `https://reddit.com/comments/${published.postId}`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error posting last generated challenge: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: `Failed to post last generated challenge: ${reason}`,
      },
      200
    );
  }
});

menu.post('/mod-inject', async (c) => {
  await c.req.json<MenuItemRequest>();
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mod_inject_form',
        form: {
          fields: [
            {
              type: 'paragraph',
              name: 'text',
              label: 'Manual puzzle text',
              required: true,
              helpText:
                'Use multiple unique words. Minimum unique words and letters scale with difficulty. Letters, numbers, and punctuation are allowed.',
            },
            {
              type: 'select',
              name: 'difficulty',
              label: 'Difficulty Profile',
              required: true,
              multiSelect: false,
              defaultValue: ['standard'],
              options: [
                { label: 'Warmup (1-3)', value: 'warmup' },
                { label: 'Standard (4-6)', value: 'standard' },
                { label: 'Challenging (7-8)', value: 'challenging' },
                { label: 'Expert (9-10)', value: 'expert' },
              ],
              helpText: 'This controls puzzle tuning, not source complexity.',
            },
            {
              type: 'select',
              name: 'challengeType',
              label: 'Challenge Type',
              required: true,
              multiSelect: false,
              defaultValue: ['QUOTE'],
              options: [
                { label: 'Quote', value: 'QUOTE' },
                { label: 'Saying', value: 'SAYING' },
                { label: 'Proverb', value: 'PROVERB' },
                { label: 'Speech', value: 'SPEECH_LINE' },
                { label: 'Book / Literature', value: 'BOOK_LINE' },
                { label: 'Movie', value: 'MOVIE_LINE' },
                { label: 'TV', value: 'TV_LINE' },
                { label: 'Anime', value: 'ANIME_LINE' },
                { label: 'Lyric', value: 'LYRIC_LINE' },
              ],
            },
          ],
        },
      },
    },
    200
  );
});
