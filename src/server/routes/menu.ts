import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import {
  formatModeratorRerollError,
  prepareChallengeEdit,
  publishLastGeneratedChallenge,
  rerollAndPublish,
} from '../core/admin';
import { tierDisplayName } from '../core/tier-fitter';
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
  const subredditName = (context.subredditName ?? '').trim();
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mod_clear_subreddit_data_form',
        form: {
          title: 'Clear Subreddit Game Data',
          description:
            'This permanently clears Decrypt player progress, sessions, puzzle keys, community submissions/ciphers, and related subreddit data. Two confirmations are required.',
          acceptLabel: 'Clear Data',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'string',
              name: 'confirmation',
              label: 'Confirmation',
              required: true,
              placeholder: 'CLEAR',
              helpText: 'Type CLEAR to acknowledge the action cannot be undone.',
            },
            {
              type: 'string',
              name: 'subredditConfirmation',
              label: 'Subreddit name',
              required: true,
              placeholder: subredditName || 'subreddit name',
              helpText: `Type the exact subreddit name (${subredditName || 'this subreddit'}) to confirm you are wiping the right install.`,
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

menu.post('/mod-edit-challenge', async (c) => {
  const deny = await requireAdmin();
  if (deny) {
    return c.json<UiResponse>(deny, 200);
  }
  const body = await c.req.json<MenuItemRequest>();
  const prepared = await prepareChallengeEdit(body.targetId);
  if (!prepared.ok) {
    return c.json<UiResponse>({ showToast: prepared.error }, 200);
  }
  const edit = prepared.context;
  const tierOptions = (['warmup', 'medium', 'hard', 'expert'] as const).map(
    (tier) => ({ label: tierDisplayName(tier), value: tier })
  );
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mod_edit_challenge_form',
        form: {
          title: 'Edit Challenge',
          description: edit.boardLocked
            ? `${edit.plays} player(s) already played this board, so the text and tier are locked. You can still fix the author credit.`
            : 'Change the text, author, or tier. The board is rebuilt and checked before anything is saved.',
          acceptLabel: 'Save Changes',
          fields: [
            {
              type: 'string',
              name: 'levelId',
              label: 'Challenge ID',
              defaultValue: edit.levelId,
              disabled: true,
            },
            {
              type: 'paragraph',
              name: 'text',
              label: 'Challenge text',
              defaultValue: edit.text,
              disabled: edit.boardLocked,
              ...(edit.boardLocked
                ? { helpText: 'Locked: players already solved this board.' }
                : {}),
            },
            {
              type: 'string',
              name: 'author',
              label: 'Author',
              required: true,
              defaultValue: edit.author,
            },
            {
              type: 'select',
              name: 'difficulty',
              label: 'Tier',
              required: true,
              multiSelect: false,
              defaultValue: [edit.tier],
              options: tierOptions,
              disabled: edit.boardLocked,
              ...(edit.boardLocked
                ? { helpText: 'Locked: players already solved this board.' }
                : {}),
            },
          ],
        },
      },
    },
    200
  );
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
