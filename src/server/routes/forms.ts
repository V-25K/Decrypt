import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import {
  injectAndPublishManualPuzzle,
  ManualChallengePreflightFailedError,
  preflightManualChallengeForPublish,
} from '../core/admin';
import { clearSubredditGameData } from '../core/playtest-reset';
import {
  difficultyToTier,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  sanitizeAuthor,
  sanitizePhrase,
} from '../core/content';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  challengeTypeSchema,
  challengeTypeSelectionHelpText,
  type ChallengeType,
} from '../../shared/game';
import { context } from '@devvit/web/server';
import { hasAdminAccess } from '../core/admin-auth';

type ModInjectFormRequest = {
  text: string;
  author?: unknown;
  challengeType?: unknown;
};

type ModInjectReviewFormRequest = {
  text: string;
  author?: unknown;
  difficulty?: unknown;
  challengeType?: unknown;
};

type ModClearSubredditDataFormRequest = {
  confirmation?: unknown;
};

type ManualPublishFailure = {
  name: string;
  levelId: string;
  dateKey: string;
};

const formatTierList = (tiers: string[]): string =>
  tiers.map((tier) => tier.charAt(0).toUpperCase() + tier.slice(1)).join(', ');

const formatTier = (tier: string): string =>
  tier.length > 0 ? tier.charAt(0).toUpperCase() + tier.slice(1) : tier;

const isDuplicateConflictReason = (reason: string | undefined): boolean =>
  typeof reason === 'string' && reason.startsWith('Text conflicts with existing content:');

const isTargetTierMismatchReason = (reason: string | undefined): boolean =>
  typeof reason === 'string' && reason.startsWith('Target tier ');

const isFairBuildFailureReason = (reason: string | undefined): boolean =>
  typeof reason === 'string' && reason.startsWith('Could not build a fair ');

const isBuildabilityVerificationReason = (reason: string | undefined): boolean =>
  typeof reason === 'string' && reason.startsWith('Could not verify buildability for this text');

const extractTraceId = (reason: string | undefined): string | null => {
  if (typeof reason !== 'string') {
    return null;
  }
  const match = reason.match(/\[trace ([a-f0-9]+)\]/i);
  return match?.[1] ?? null;
};

const buildValidationHint = (params: {
  targetTier?: string;
  naturalDifficulty: string;
  achievableTierRange: string[];
  reasons: string[];
  suggestions: string[];
}): string => {
  const primaryReason = params.reasons[0];
  if (isDuplicateConflictReason(primaryReason)) {
    return 'Quote already used or too similar.';
  }
  if (isFairBuildFailureReason(primaryReason)) {
    return `The game engine couldn't generate a solvable ${formatTier(
      params.naturalDifficulty
    )} board for this quote. Try a shorter quote or another tier.`;
  }
  if (isBuildabilityVerificationReason(primaryReason)) {
    const traceId = extractTraceId(primaryReason);
    if (traceId) {
      console.error(`Manual puzzle preview build failed. Trace ${traceId}.`);
    }
    return `The game engine couldn't preview this quote. Try again, or use a shorter quote.`;
  }
  if (isTargetTierMismatchReason(primaryReason)) {
    return `Selected ${formatTier(params.targetTier ?? params.naturalDifficulty)} doesn't fit. Best fit: ${formatTier(
      params.naturalDifficulty
    )}.`;
  }
  if (params.achievableTierRange.length === 0) {
    return "Quote doesn't fit supported tiers. Try another line.";
  }
  return `Best fit: ${formatTierList(params.achievableTierRange)}.`;
};

const formatPublishFailureToast = (params: {
  error?: string;
  levelId?: string;
  publishState?: 'published' | 'saved_for_retry' | 'rolled_back';
  cleanupPerformed?: boolean;
}): string | null => {
  if (!params.error) {
    return null;
  }

  const removedMatch = params.error.match(
    /Published post (\S+) for (\S+) is not usable because it was marked (removed|spam)(?: \(([^)]+)\))?\./
  );
  if (!removedMatch) {
    return params.error;
  }

  const [, postId, , reason, moderationDetails = ''] = removedMatch;
  let message = `Post ${postId}`;
  if (reason === 'spam') {
    message += ' was marked as spam.';
  } else if (moderationDetails.includes('removedByCategory=automod_filtered')) {
    message += ' was filtered by AutoMod.';
  } else if (moderationDetails.includes('removedByCategory=reddit')) {
    message += ' was filtered by Reddit.';
  } else {
    message += ' was removed.';
  }

  if (params.publishState === 'rolled_back' || params.cleanupPerformed) {
    return `${message} Puzzle rolled back.`;
  }
  if (params.publishState === 'saved_for_retry' && params.levelId) {
    return `${message} Puzzle saved for retry.`;
  }
  return message;
};

export const forms = new Hono();

const difficultyBandToValue: Record<string, number> = {
  warmup: 2,
  medium: 5,
  hard: 8,
  expert: 9,
  easy: 2,
  standard: 5,
  challenging: 8,
};

const challengeTypeOptions = challengeTypeDisplayOrder.map((value) => ({
  label: challengeTypeMetadata[value].label,
  value,
}));

const representativeDifficultyByTier = {
  warmup: 2,
  medium: 5,
  hard: 8,
  expert: 9,
} as const;

const representativeDifficultyForTierLabel = (tier: string): number => {
  switch (tier) {
    case 'warmup':
      return representativeDifficultyByTier.warmup;
    case 'medium':
      return representativeDifficultyByTier.medium;
    case 'hard':
      return representativeDifficultyByTier.hard;
    case 'expert':
      return representativeDifficultyByTier.expert;
    default:
      return representativeDifficultyByTier.medium;
  }
};

const normalizeLoose = (value: string): string =>
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

const parseDifficulty = (raw: unknown): number | null | undefined => {
  const value = firstValue(raw);
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'automatic' || normalized === 'recommended') {
    return undefined;
  }
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

const recommendTier = (tiers: string[], naturalDifficulty: string): string => {
  if (tiers.includes(naturalDifficulty)) {
    return naturalDifficulty;
  }
  if (tiers.length === 0) {
    return naturalDifficulty;
  }
  const tierOrder = ['warmup', 'medium', 'hard', 'expert'];
  const naturalIndex = tierOrder.indexOf(naturalDifficulty);
  return tiers.reduce((best, tier) => {
    const tierIndex = tierOrder.indexOf(tier);
    const bestIndex = tierOrder.indexOf(best);
    return Math.abs(tierIndex - naturalIndex) < Math.abs(bestIndex - naturalIndex) ? tier : best;
  }, tiers[0] ?? naturalDifficulty);
};

const formatTierRange = (tiers: string[]): string => {
  if (tiers.length === 0) {
    return 'None';
  }
  if (tiers.length === 1) {
    return formatTier(tiers[0] ?? '');
  }
  return `${formatTier(tiers[0] ?? '')} -> ${formatTier(tiers[tiers.length - 1] ?? '')}`;
};

const buildReviewSummary = (params: {
  text: string;
  validation: {
    naturalDifficulty: string;
    achievableTierRange: string[];
    textProfile: {
      cryptoHardness: number;
      uniqueLetterCount: number;
      totalLetters?: number;
      wordCount?: number;
    };
  };
}): string => {
  const recommendedTier = recommendTier(
    params.validation.achievableTierRange,
    params.validation.naturalDifficulty
  );
  const profile = params.validation.textProfile;
  const cryptoHardness = profile.cryptoHardness.toFixed(2);
  const hardnessCue =
    profile.cryptoHardness >= 0.72 || profile.uniqueLetterCount >= 19
      ? 'high letter variety'
      : profile.cryptoHardness <= 0.4 || profile.uniqueLetterCount <= 11
        ? 'clue-friendly repetition'
        : 'balanced letter mix';
  return [
    `"${params.text}"`,
    '',
    `Detected difficulty: ${formatTier(recommendedTier)}`,
    `Achievable range: ${formatTierRange(params.validation.achievableTierRange)}`,
    `Crypto hardness: ${cryptoHardness} - ${hardnessCue}`,
    `Unique letters: ${profile.uniqueLetterCount}`,
    `Total letters: ${profile.totalLetters ?? 0}`,
    `Word count: ${profile.wordCount ?? 0}`,
  ].join('\n');
};

const formatQuoteExcerpt = (text: string): string => {
  const compact = text.trim().replace(/\s+/g, ' ');
  if (compact.length <= 30) {
    return compact;
  }
  return `${compact.slice(0, 27)}...`;
};

const buildReviewFormResponse = (params: {
  text: string;
  author: string;
  challengeType: ChallengeType;
  validation: {
    naturalDifficulty: string;
    achievableTierRange: string[];
    textProfile: {
      cryptoHardness: number;
      uniqueLetterCount: number;
      totalLetters?: number;
      wordCount?: number;
    };
  };
}): UiResponse => {
  const recommendedTier = recommendTier(
    params.validation.achievableTierRange,
    params.validation.naturalDifficulty
  );
  return {
    showForm: {
      name: 'mod_inject_review_form',
      form: {
        title: 'Review Manual Puzzle',
        description:
          `Detected difficulty: ${formatTier(recommendedTier)}. ` +
          `Achievable range: ${formatTierRange(params.validation.achievableTierRange)}.`,
        acceptLabel: `Publish as ${formatTier(recommendedTier)}`,
        fields: [
          {
            type: 'paragraph',
            name: 'summary',
            label: 'Analysis',
            defaultValue: buildReviewSummary({
              text: params.text,
              validation: params.validation,
            }),
            disabled: true,
          },
          {
            type: 'paragraph',
            name: 'text',
            label: 'Manual puzzle text',
            defaultValue: params.text,
            disabled: true,
            helpText: 'To change the quote, go back to step 1 and analyze the new text.',
          },
          {
            type: 'string',
            name: 'author',
            label: 'Author',
            required: true,
            defaultValue: params.author,
          },
          {
            type: 'select',
            name: 'difficulty',
            label: 'Publish Tier',
            required: true,
            multiSelect: false,
            defaultValue: [recommendedTier],
            options: params.validation.achievableTierRange.map((tier) => ({
              label: `${formatTier(tier)} (${representativeDifficultyForTierLabel(tier)}/10)`,
              value: tier,
            })),
            helpText:
              'The list is bounded to tiers this quote can actually support. The recommended tier is selected by default.',
          },
          {
            type: 'select',
            name: 'challengeType',
            label: 'Challenge Type',
            required: true,
            multiSelect: false,
            defaultValue: [params.challengeType],
            options: [...challengeTypeOptions],
            helpText: challengeTypeSelectionHelpText,
          },
        ],
      },
    },
  };
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
    if (text !== normalizeLoose(rawText)) {
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
    if (author !== normalizeLoose(rawAuthor)) {
      return c.json<UiResponse>(
        {
          showToast: 'Author contains unsupported characters. Use letters, numbers, spaces, . \' and - only.',
        },
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
      challengeType,
    });
    if (!validation.valid) {
      return c.json<UiResponse>(
        {
          showToast: buildValidationHint({
            ...validation,
          }),
        },
        200
      );
    }
    return c.json<UiResponse>(
      buildReviewFormResponse({
        text,
        author,
        challengeType,
        validation,
      }),
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error injecting manual puzzle: ${reason}`);
    const publishFailure = getManualPublishFailure(error);
    return c.json<UiResponse>(
      {
        showToast: error instanceof ManualChallengePreflightFailedError
          ? buildValidationHint({
              ...(error.validation as {
                naturalDifficulty: string;
                achievableTierRange: string[];
                reasons: string[];
                suggestions: string[];
              }),
            })
          : publishFailure
          ? `Puzzle saved as ${publishFailure.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
          : `Failed to inject manual puzzle: ${reason}`,
      },
      200
    );
  }
});

forms.post('/mod-inject-review-submit', async (c) => {
  const allowed = await hasAdminAccess({
    subredditName: context.subredditName,
    username: context.username,
  });
  if (!allowed) {
    return c.json<UiResponse>({ showToast: 'Moderator access required.' }, 200);
  }
  try {
    const body = await c.req.json<ModInjectReviewFormRequest>();
    const rawText = firstValue(body.text);
    if (!rawText) {
      return c.json<UiResponse>({ showToast: 'Invalid puzzle text.' }, 200);
    }
    const text = sanitizePhrase(rawText);
    if (!text) {
      return c.json<UiResponse>({ showToast: 'Invalid puzzle text.' }, 200);
    }
    if (text !== normalizeLoose(rawText)) {
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
    if (author !== normalizeLoose(rawAuthor)) {
      return c.json<UiResponse>(
        {
          showToast: 'Author contains unsupported characters. Use letters, numbers, spaces, . \' and - only.',
        },
        200
      );
    }
    const difficulty = parseDifficulty(body.difficulty);
    if (typeof difficulty !== 'number') {
      return c.json<UiResponse>(
        { showToast: 'Choose a publish tier from the reviewed options.' },
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
          showToast: buildValidationHint({
            ...validation,
            targetTier: difficultyToTier(difficulty),
          }),
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
    if (!result.success || !result.postId) {
      return c.json<UiResponse>(
        {
          showToast:
            formatPublishFailureToast({
              error: result.error,
              levelId: result.levelId,
              publishState: result.publishState,
              cleanupPerformed: result.cleanupPerformed,
            }) ??
            (result.levelId
              ? `Puzzle saved as ${result.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
              : 'Manual puzzle publish failed before a usable Reddit post was created.'),
        },
        200
      );
    }
    return c.json<UiResponse>(
      {
        showToast: `${formatTier(difficultyToTier(result.difficulty ?? difficulty))} puzzle published${
          difficultyToTier(result.difficulty ?? difficulty) !== difficultyToTier(difficulty)
            ? ` (adjusted from ${formatTier(difficultyToTier(difficulty))})`
            : ''
        } - "${formatQuoteExcerpt(text)}"`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error publishing reviewed manual puzzle: ${reason}`);
    const publishFailure = getManualPublishFailure(error);
    return c.json<UiResponse>(
      {
        showToast: error instanceof ManualChallengePreflightFailedError
          ? buildValidationHint({
              ...(error.validation as {
                naturalDifficulty: string;
                achievableTierRange: string[];
                reasons: string[];
                suggestions: string[];
              }),
            })
          : publishFailure
          ? `Puzzle saved as ${publishFailure.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
          : `Failed to publish manual puzzle: ${reason}`,
      },
      200
    );
  }
});

forms.post('/mod-clear-subreddit-data-submit', async (c) => {
  const allowed = await hasAdminAccess({
    subredditName: context.subredditName,
    username: context.username,
  });
  if (!allowed) {
    return c.json<UiResponse>({ showToast: 'Moderator access required.' }, 200);
  }
  try {
    const body = await c.req.json<ModClearSubredditDataFormRequest>();
    const confirmation = firstValue(body.confirmation);
    if (confirmation !== 'CLEAR') {
      return c.json<UiResponse>(
        { showToast: 'Type CLEAR to confirm clearing subreddit game data.' },
        200
      );
    }
    const result = await clearSubredditGameData();
    return c.json<UiResponse>(
      {
        showToast:
          `Cleared subreddit game data for ${result.knownUsers} player(s), ` +
          `${result.sessions} session(s), and ${result.deletedKeys} key(s).`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error clearing subreddit game data: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: `Failed to clear subreddit game data: ${reason}`,
      },
      200
    );
  }
});
