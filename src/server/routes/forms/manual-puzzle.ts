import { Hono, type Context } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import {
  injectAndPublishManualPuzzle,
  ManualChallengePreflightFailedError,
  publishFittedManualPuzzle,
  type ManualChallengeValidationResult,
} from '../../core/admin';
import { fitLineToTiers } from '../../core/board-fit-service';
import {
  computePhraseDifficultyProfile,
  difficultyToTier,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  sanitizeAuthor,
  sanitizePhrase,
} from '../../core/content';
import { createValidationPipeline } from '../../core/validation-pipeline';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  challengeTypeSchema,
  challengeTypeSelectionHelpText,
  type ChallengeType,
} from '../../../shared/game';
import { rejectWithoutAdminAccess } from './shared/auth';
import { firstValue, normalizeLoose } from './shared/parse';

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

type ManualPublishFailure = {
  name: string;
  levelId: string;
  dateKey: string;
};

type ManualPuzzleFormValues = {
  text: string;
  author: string;
  challengeType: ChallengeType;
};

type ManualPuzzleFormParseResult =
  | { valid: true; values: ManualPuzzleFormValues }
  | { valid: false; response: UiResponse };

type ManualPuzzleRequestParseResult<TBody> =
  | { valid: true; body: TBody; values: ManualPuzzleFormValues }
  | { valid: false; response: UiResponse };

type ManualPublishResult = Awaited<ReturnType<typeof injectAndPublishManualPuzzle>>;

// Mods see the same tier names players do: warmup displays as Easy.
const formatTier = (tier: string): string =>
  tier === 'warmup'
    ? 'Easy'
    : tier.length > 0
      ? tier.charAt(0).toUpperCase() + tier.slice(1)
      : tier;

const formatTierList = (tiers: string[]): string =>
  tiers.map((tier) => formatTier(tier)).join(', ');

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
    return `Couldn't make a fair ${formatTier(
      params.naturalDifficulty
    )} board from this quote. Try a shorter quote or another tier.`;
  }
  if (isBuildabilityVerificationReason(primaryReason)) {
    const traceId = extractTraceId(primaryReason);
    if (traceId) {
      console.error(`Manual puzzle preview build failed. Trace ${traceId}.`);
    }
    return `Couldn't preview this quote. Try again, or use a shorter quote.`;
  }
  if (isTargetTierMismatchReason(primaryReason)) {
    return `Selected ${formatTier(params.targetTier ?? params.naturalDifficulty)} doesn't fit. Best fit: ${formatTier(
      params.naturalDifficulty
    )}.`;
  }
  if (params.achievableTierRange.length === 0) {
    return "This quote can't become a puzzle yet. Try another line.";
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
  excludedTierNotes?: string[];
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
    ...(params.excludedTierNotes && params.excludedTierNotes.length > 0
      ? ['', 'Not available:', ...params.excludedTierNotes.map((note) => `- ${note}`)]
      : []),
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
  excludedTierNotes?: string[];
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
        acceptLabel: 'Publish Selected Tier',
        fields: [
          {
            type: 'paragraph',
            name: 'summary',
            label: 'Analysis',
            defaultValue: buildReviewSummary({
              text: params.text,
              validation: params.validation,
              ...(params.excludedTierNotes
                ? { excludedTierNotes: params.excludedTierNotes }
                : {}),
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

const buildManualPreflightHint = (validation: ManualChallengeValidationResult): string =>
  buildValidationHint(validation);

const parseManualPuzzleFormValues = (body: {
  text: unknown;
  author?: unknown;
  challengeType?: unknown;
}): ManualPuzzleFormParseResult => {
  const rawText = firstValue(body.text);
  if (!rawText) {
    return { valid: false, response: { showToast: 'Invalid puzzle text.' } };
  }
  const text = sanitizePhrase(rawText);
  if (!text) {
    return { valid: false, response: { showToast: 'Invalid puzzle text.' } };
  }
  if (text !== normalizeLoose(rawText)) {
    return {
      valid: false,
      response: {
        showToast:
          'Puzzle text contains unsupported characters. Use letters, numbers, spaces, and , . \' ! ? ; : ( ) - only.',
      },
    };
  }
  const rawAuthor = firstValue(body.author);
  if (!rawAuthor) {
    return {
      valid: false,
      response: { showToast: 'Invalid author. Use letters, numbers, spaces, . \' and - (max 28).' },
    };
  }
  const author = parseAuthor(body.author);
  if (!author) {
    return {
      valid: false,
      response: { showToast: 'Invalid author. Use letters, numbers, spaces, . \' and - (max 28).' },
    };
  }
  if (author !== normalizeLoose(rawAuthor)) {
    return {
      valid: false,
      response: {
        showToast: 'Author contains unsupported characters. Use letters, numbers, spaces, . \' and - only.',
      },
    };
  }
  const challengeType = parseChallengeType(body.challengeType);
  if (!challengeType) {
    return {
      valid: false,
      response: {
        showToast: 'Invalid challenge type. Please re-open the form and choose a valid type.',
      },
    };
  }
  return {
    valid: true,
    values: {
      text,
      author,
      challengeType,
    },
  };
};

const readManualPuzzleRequest = async <TBody extends {
  text: unknown;
  author?: unknown;
  challengeType?: unknown;
}>(
  c: Context
): Promise<ManualPuzzleRequestParseResult<TBody>> => {
  const body = await c.req.json<TBody>();
  const parsedForm = parseManualPuzzleFormValues(body);
  if (!parsedForm.valid) {
    return { valid: false, response: parsedForm.response };
  }
  return {
    valid: true,
    body,
    values: parsedForm.values,
  };
};

const buildManualPublishErrorResponse = (params: {
  error: unknown;
  actionLabel: string;
  fallbackPrefix: string;
}): UiResponse => {
  const reason = params.error instanceof Error ? params.error.message : 'Unknown error';
  console.error(`Error ${params.actionLabel} manual puzzle: ${reason}`);
  const publishFailure = getManualPublishFailure(params.error);
  return {
    showToast: params.error instanceof ManualChallengePreflightFailedError
      ? buildManualPreflightHint(params.error.validation)
      : publishFailure
      ? `Puzzle saved as ${publishFailure.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
      : `${params.fallbackPrefix}: ${reason}`,
  };
};

const handleManualPuzzleRequest = async <TBody extends {
  text: unknown;
  author?: unknown;
  challengeType?: unknown;
}>(
  c: Context,
  params: {
    actionLabel: string;
    fallbackPrefix: string;
    onValid: (request: {
      body: TBody;
      values: ManualPuzzleFormValues;
    }) => Promise<Response>;
  }
): Promise<Response> => {
  const accessDenied = await rejectWithoutAdminAccess(c);
  if (accessDenied) {
    return accessDenied;
  }
  try {
    const parsedRequest = await readManualPuzzleRequest<TBody>(c);
    if (!parsedRequest.valid) {
      return c.json<UiResponse>(parsedRequest.response, 200);
    }
    return await params.onValid(parsedRequest);
  } catch (error) {
    return c.json<UiResponse>(
      buildManualPublishErrorResponse({
        error,
        actionLabel: params.actionLabel,
        fallbackPrefix: params.fallbackPrefix,
      }),
      200
    );
  }
};

const buildManualPublishFailureToast = (result: ManualPublishResult): string =>
  formatPublishFailureToast({
    error: result.error,
    levelId: result.levelId,
    publishState: result.publishState,
    cleanupPerformed: result.cleanupPerformed,
  }) ??
  (result.levelId
    ? `Puzzle saved as ${result.levelId} but post publish failed. Use "Post Last Generated Challenge" to retry.`
    : 'Manual puzzle publish failed before a usable Reddit post was created.');

const buildManualPublishSuccessToast = (params: {
  result: ManualPublishResult;
  text: string;
  requestedDifficulty: number;
}): string => {
  const achievedTier = difficultyToTier(params.result.difficulty ?? params.requestedDifficulty);
  const requestedTier = difficultyToTier(params.requestedDifficulty);
  const adjustmentSuffix =
    achievedTier !== requestedTier ? ` (adjusted from ${formatTier(requestedTier)})` : '';
  return `${formatTier(achievedTier)} puzzle published${adjustmentSuffix} - "${formatQuoteExcerpt(
    params.text
  )}"`;
};

const buildManualPublishResultResponse = (params: {
  result: ManualPublishResult;
  text: string;
  requestedDifficulty: number;
}): UiResponse => {
  if (!params.result.success || !params.result.postId) {
    return { showToast: buildManualPublishFailureToast(params.result) };
  }
  return {
    showToast: buildManualPublishSuccessToast(params),
  };
};

export const manualPuzzleRoutes = new Hono();

manualPuzzleRoutes.post('/mod-inject-submit', async (c) => {
  return handleManualPuzzleRequest<ModInjectFormRequest>(c, {
    actionLabel: 'injecting',
    fallbackPrefix: 'Failed to inject manual puzzle',
    onValid: async ({ values }) => {
      const { text, author, challengeType } = values;
      // Step 1 builds and caches an actual board per achievable tier, so the
      // tier list offered in step 2 can never fail at publish time.
      const report = await fitLineToTiers({ text, author, challengeType });
      if (!report.textValid) {
        return c.json<UiResponse>(
          {
            showToast:
              report.reasons[0] ?? "This line can't become a puzzle yet. Try another quote.",
          },
          200
        );
      }
      const pipeline = createValidationPipeline();
      const dup = await pipeline.duplicate(text);
      if (dup.duplicate) {
        return c.json<UiResponse>(
          { showToast: 'Quote already used or too similar. Try another line.' },
          200
        );
      }
      const feasibleTiers = report.tiers
        .filter((entry) => entry.feasible)
        .map((entry) => entry.tier);
      if (feasibleTiers.length === 0) {
        const firstReason = report.tiers.find((entry) => entry.reason)?.reason;
        return c.json<UiResponse>(
          {
            showToast:
              firstReason ?? "This line can't become a puzzle yet. Try another quote.",
          },
          200
        );
      }
      const excludedTierNotes = report.tiers
        .filter((entry) => !entry.feasible)
        .map((entry) => entry.reason ?? `${formatTier(entry.tier)} is not available for this quote.`);
      return c.json<UiResponse>(
        buildReviewFormResponse({
          text,
          author,
          challengeType,
          validation: {
            naturalDifficulty: report.suggestedTier,
            achievableTierRange: feasibleTiers,
            textProfile: computePhraseDifficultyProfile(text),
          },
          ...(excludedTierNotes.length > 0 ? { excludedTierNotes } : {}),
        }),
        200
      );
    },
  });
});

manualPuzzleRoutes.post('/mod-inject-review-submit', async (c) => {
  return handleManualPuzzleRequest<ModInjectReviewFormRequest>(c, {
    actionLabel: 'publishing reviewed',
    fallbackPrefix: 'Failed to publish manual puzzle',
    onValid: async ({ body, values }) => {
      const { text, author, challengeType } = values;
      const difficulty = parseDifficulty(body.difficulty);
      if (typeof difficulty !== 'number') {
        return c.json<UiResponse>(
          { showToast: 'Choose a publish tier from the reviewed options.' },
          200
        );
      }
      // Publishes the cached board fitted in step 1 verbatim — no
      // re-preflight, no difficulty adjustment, no reseeded rebuild.
      const result = await publishFittedManualPuzzle({
        text,
        author,
        tier: difficultyToTier(difficulty),
        challengeType,
      });
      return c.json<UiResponse>(
        buildManualPublishResultResponse({
          result,
          text,
          requestedDifficulty: difficulty,
        }),
        200
      );
    },
  });
});
