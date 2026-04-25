import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import {
  injectAndPublishManualPuzzle,
  ManualChallengePreflightFailedError,
  preflightManualChallengeForPublish,
} from '../core/admin';
import {
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  sanitizeAuthor,
  sanitizePhrase,
} from '../core/content';
import { challengeTypeSchema, type ChallengeType } from '../../shared/game';
import { context } from '@devvit/web/server';
import { hasAdminAccess } from '../core/admin-auth';

type ModInjectFormRequest = {
  text: string;
  author?: unknown;
  difficulty?: unknown;
  challengeType?: unknown;
};

type ManualPublishFailure = {
  name: string;
  levelId: string;
  dateKey: string;
};

const formatTierList = (tiers: string[]): string =>
  tiers.map((tier) => tier.charAt(0).toUpperCase() + tier.slice(1)).join(', ');

const buildValidationHint = (params: {
  naturalDifficulty: string;
  achievableTierRange: string[];
  reasons: string[];
  suggestions: string[];
}): string => {
  if (params.achievableTierRange.length === 0) {
    const primary = params.reasons[0] ?? 'Try a different quote.';
    const secondary =
      params.suggestions.find((suggestion) => suggestion !== primary) ?? null;
    return secondary
      ? `This text doesn't currently fit any supported tier. ${primary} ${secondary}`
      : `This text doesn't currently fit any supported tier. ${primary}`;
  }
  const achievable =
    params.achievableTierRange.length > 0
      ? formatTierList(params.achievableTierRange)
      : 'none';
  const detail = params.suggestions[0] ?? params.reasons[0] ?? 'Try a different quote.';
  return `This text is naturally ${params.naturalDifficulty}. Achievable tiers: ${achievable}. ${detail}`;
};

export const forms = new Hono();

const difficultyBandToValue: Record<string, number> = {
  warmup: 2,
  medium: 5,
  hard: 7,
  expert: 9,
  easy: 2,
  standard: 5,
  challenging: 7,
};

const normalizeLooseText = (value: string): string =>
  value.toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeLooseAuthor = (value: string): string =>
  value.toUpperCase().replace(/\s+/g, ' ').trim();

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

const parseDifficulty = (raw: unknown): number | null => {
  const value = firstValue(raw);
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const fromBand = difficultyBandToValue[normalized];
  if (fromBand !== undefined) {
    return fromBand;
  }
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 10) {
    return numeric;
  }
  return null;
};

const parseChallengeType = (raw: unknown): ChallengeType | null => {
  const value = firstValue(raw);
  if (!value) {
    return null;
  }
  const normalizedCandidate = value
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .trim();
  const normalized = normalizedCandidate
    .toUpperCase()
    .replace(/[^A-Z _-]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim();
  if (normalized !== normalizedCandidate) {
    return null;
  }
  const parsed = challengeTypeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
};

const parseAuthor = (raw: unknown): string | null => {
  const value = firstValue(raw);
  if (!value) {
    return null;
  }
  const normalized = sanitizeAuthor(value);
  if (!normalized) {
    return null;
  }
  if (!looksLikeAllowedAuthor(normalized)) {
    return null;
  }
  if (normalized.length > maxPuzzleAuthorLength) {
    return null;
  }
  return normalized;
};

const getManualPublishFailure = (error: unknown): ManualPublishFailure | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const name = Reflect.get(error, 'name');
  const levelId = Reflect.get(error, 'levelId');
  const dateKey = Reflect.get(error, 'dateKey');
  if (
    name !== 'ManualPuzzlePublishFailedError' ||
    typeof levelId !== 'string' ||
    typeof dateKey !== 'string'
  ) {
    return null;
  }
  return { name, levelId, dateKey };
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
    const rawText = firstValue(body.text);
    if (!rawText) {
      return c.json<UiResponse>({ showToast: 'Invalid puzzle text.' }, 200);
    }
    const text = sanitizePhrase(rawText);
    if (!text) {
      return c.json<UiResponse>({ showToast: 'Invalid puzzle text.' }, 200);
    }
    if (text !== normalizeLooseText(rawText)) {
      return c.json<UiResponse>(
        {
          showToast:
            'Puzzle text contains unsupported characters. Use letters, numbers, spaces, and , . \' ! ? ; : ( ) - only.',
        },
        200
      );
    }
    const rawAuthor = firstValue(body.author);
    if (!rawAuthor) {
      return c.json<UiResponse>(
        { showToast: 'Invalid author. Use letters, numbers, spaces, . \' and - (max 28).' },
        200
      );
    }
    const author = parseAuthor(body.author);
    if (!author) {
      return c.json<UiResponse>(
        { showToast: 'Invalid author. Use letters, numbers, spaces, . \' and - (max 28).' },
        200
      );
    }
    if (author !== normalizeLooseAuthor(rawAuthor)) {
      return c.json<UiResponse>(
        {
          showToast: 'Author contains unsupported characters. Use letters, numbers, spaces, . \' and - only.',
        },
        200
      );
    }
    const difficulty = parseDifficulty(body.difficulty);
    if (!difficulty) {
      return c.json<UiResponse>(
        { showToast: 'Invalid difficulty. Choose Warmup, Medium, Hard, or Expert.' },
        200
      );
    }
    const challengeType = parseChallengeType(body.challengeType);
    if (!challengeType) {
      return c.json<UiResponse>(
        { showToast: 'Invalid challenge type. Please re-open the form and choose a valid type.' },
        200
      );
    }
    const validation = await preflightManualChallengeForPublish({
      text,
      difficulty,
      challengeType,
    });
    if (!validation.valid) {
      return c.json<UiResponse>(
        {
          showToast: buildValidationHint(validation),
        },
        200
      );
    }
    const result = await injectAndPublishManualPuzzle({
      text,
      author,
      difficulty,
      challengeType,
      allowAdjustment: true,
      skipPreflight: true,
    });
    if (!result.postId) {
      throw new Error(
        `Manual puzzle ${result.levelId} was saved but the Reddit post could not be created. Use "Post Last Generated Challenge" to retry publishing.`
      );
    }
    return c.json<UiResponse>(
      {
        showToast: `Manual puzzle published: ${result.levelId}`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error injecting manual puzzle: ${reason}`);
    const publishFailure = getManualPublishFailure(error);
    return c.json<UiResponse>(
      {
        showToast: error instanceof ManualChallengePreflightFailedError
          ? buildValidationHint(error.validation)
          : publishFailure
          ? `Puzzle saved as ${publishFailure.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
          : `Failed to inject manual puzzle: ${reason}`,
      },
      200
    );
  }
});
