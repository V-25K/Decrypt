import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import {
  formatModeratorRerollError,
  publishLastGeneratedChallenge,
  rerollAndPublish,
} from '../core/admin';
import { hasAdminAccess } from '../core/admin-auth';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  challengeTypeSelectionHelpText,
} from '../../shared/game';

export const menu = new Hono();

const requireAdmin = async (): Promise<UiResponse | null> => {
  let allowed = false;
  try {
    allowed = await hasAdminAccess({
      subredditName: context.subredditName,
      username: context.username,
    });
  } catch (_error) {
    return { showToast: 'Unable to verify moderator access right now. Please try again.' };
  }
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

menu.post('/mod-clear-subreddit-data', async (c) => {
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mod_clear_subreddit_data_form',
        form: {
          title: 'Clear Subreddit Game Data',
          description:
            'This permanently clears Decrypt player progress, sessions, puzzle keys, and related subreddit data. Type CLEAR to continue.',
          acceptLabel: 'Clear Data',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'string',
              name: 'confirmation',
              label: 'Confirmation',
              required: true,
              placeholder: 'CLEAR',
              helpText: 'This action cannot be undone.',
            },
          ],
        },
      },
    },
    200
  );
});

menu.post('/mod-reroll', async (c) => {
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
    const modMessage = formatModeratorRerollError(error);
    console.error(`Error rerolling puzzle: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: modMessage,
      },
      200
    );
  }
});

menu.post('/mod-post-last-generated', async (c) => {
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  try {
    const published = await publishLastGeneratedChallenge();
    if (published.alreadyPublished) {
      return c.json<UiResponse>(
        {
          showToast: `${published.levelId} was already posted.`,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        showToast: `Posted ${published.levelId}: ${published.challengeType} (${published.difficulty}/10)`,
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
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mod_inject_form',
        form: {
          title: 'Inject Manual Puzzle',
          description: 'Step 1 of 2. Submit the quote first; Decrypt will analyze it and recommend the best tier before publish.',
          acceptLabel: 'Analyze Quote',
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
              type: 'string',
              name: 'author',
              label: 'Author',
              required: true,
              helpText: 'Displayed as the quote/challenge author (max 28 characters).',
            },
            {
              type: 'select',
              name: 'challengeType',
              label: 'Challenge Type',
              required: true,
              multiSelect: false,
              defaultValue: ['QUOTE'],
              options: challengeTypeDisplayOrder.map((value) => ({
                label: challengeTypeMetadata[value].label,
                value,
              })),
              helpText: challengeTypeSelectionHelpText,
            },
          ],
        },
      },
    },
    200
  );
});
