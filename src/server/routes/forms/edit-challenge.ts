import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { applyChallengeEdit } from '../../core/admin';
import { sanitizePhrase } from '../../core/content';
import { rejectWithoutAdminAccess } from './shared/auth';
import { firstValue, normalizeLoose } from './shared/parse';

// The level ID and difficulty tier are display-only in the edit form, so the
// submit only carries the editable fields.
type ModEditChallengeFormRequest = {
  levelId?: unknown;
  text?: unknown;
  author?: unknown;
};

export const editChallengeRoutes = new Hono();

editChallengeRoutes.post('/mod-edit-challenge-submit', async (c) => {
  const accessDenied = await rejectWithoutAdminAccess(c);
  if (accessDenied) {
    return accessDenied;
  }
  try {
    const body = await c.req.json<ModEditChallengeFormRequest>();
    const levelId = firstValue(body.levelId);
    if (!levelId) {
      return c.json<UiResponse>(
        { showToast: 'Could not tell which challenge to edit. Re-open the menu and try again.' },
        200
      );
    }
    const rawText = firstValue(body.text);
    if (!rawText) {
      return c.json<UiResponse>({ showToast: 'Challenge text cannot be empty.' }, 200);
    }
    const text = sanitizePhrase(rawText);
    if (!text || text !== normalizeLoose(rawText)) {
      return c.json<UiResponse>(
        {
          showToast:
            "Challenge text contains unsupported characters. Use letters, numbers, spaces, and , . ' ! ? ; : ( ) - only.",
        },
        200
      );
    }
    const author = firstValue(body.author);
    if (!author) {
      return c.json<UiResponse>({ showToast: 'Author cannot be empty.' }, 200);
    }
    const result = await applyChallengeEdit({ levelId, text, author });
    return c.json<UiResponse>({ showToast: result.message }, 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error editing challenge: ${reason}`);
    return c.json<UiResponse>(
      { showToast: `Failed to edit challenge: ${reason}` },
      200
    );
  }
});
