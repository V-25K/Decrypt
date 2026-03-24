import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import {
  injectAndPublishManualPuzzle,
} from '../core/admin';
import { sanitizePhrase } from '../core/content';
import { challengeTypeSchema, type ChallengeType } from '../../shared/game';
import { context } from '@devvit/web/server';
import { hasAdminAccess } from '../core/admin-auth';

type ModInjectFormRequest = {
  text: string;
  difficulty?: unknown;
  challengeType?: unknown;
};

export const forms = new Hono();

const difficultyBandToValue: Record<string, number> = {
  warmup: 2,
  standard: 5,
  challenging: 8,
  expert: 9,
};

const firstValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const candidate = value[0];
    return typeof candidate === 'string' ? candidate : null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  return null;
};

const parseDifficulty = (raw: unknown): number => {
  const value = firstValue(raw);
  if (!value) {
    return 5;
  }
  const normalized = value.trim().toLowerCase();
  const fromBand = difficultyBandToValue[normalized];
  if (fromBand !== undefined) {
    return fromBand;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return Math.max(1, Math.min(10, Math.floor(numeric)));
  }
  return 5;
};

const parseChallengeType = (raw: unknown): ChallengeType => {
  const value = firstValue(raw);
  if (!value) {
    return 'QUOTE';
  }
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z _-]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim();
  const parsed = challengeTypeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : 'QUOTE';
};

forms.post('/mod-inject-submit', async (c) => {
  const allowed = await hasAdminAccess({
    subredditName: context.subredditName,
    username: context.username,
  });
  if (!allowed) {
    return c.json<UiResponse>({ showToast: 'Moderator access required.' }, 200);
  }
  try {
    const body = await c.req.json<ModInjectFormRequest>();
    const text = sanitizePhrase(body.text || '');
    if (!text) {
      return c.json<UiResponse>({ showToast: 'Invalid puzzle text.' }, 200);
    }
    const difficulty = parseDifficulty(body.difficulty);
    const challengeType = parseChallengeType(body.challengeType);
    const result = await injectAndPublishManualPuzzle({
      text,
      difficulty,
      challengeType,
    });
    return c.json<UiResponse>(
      {
        showToast: `Manual puzzle published: ${result.levelId}`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error injecting manual puzzle: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: `Failed to inject manual puzzle: ${reason}`,
      },
      200
    );
  }
});
