import {
  getAutoDailyLevelIdsForDate,
  getPuzzleMapping,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
  getStagedLevelId,
  clearStagedLevelId,
  deletePuzzleData,
  peekNextLevelId,
  reserveUsedSignature,
  clearUsedSignature,
} from './puzzle-store';
import {
  activateDailyPuzzle,
  buildAndSaveManualPuzzle,
  buildManualPuzzleWithSolverFallback,
  generatePuzzleForDate,
  injectManualPuzzle,
  PuzzleGenerationFailedError,
  PuzzleGenerationInProgressError,
  PuzzlePublishCommitError,
  PuzzlePublishInProgressError,
  publishAndActivateDailyPost,
} from './generator';
import type { ChallengeType, DifficultyBreakdown, PuzzlePrivate, PuzzlePublic } from '../../shared/game';
import {
  containsDisallowedContent,
  computePhraseDifficultyProfile,
  difficultyToTier,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  normalizeContent,
  rankDifficultyTiersForProfile,
  sanitizeAuthor,
  sanitizePhrase,
  type PhraseDifficultyProfile,
  type DifficultyTier,
  type HardnessBoundsByTier,
} from './content';
import {
  buildPublicPuzzle,
  adjustPuzzleDifficulty,
  computeObstructionBudget,
  computeObstructionBudgetSpent,
  type PuzzleDifficultyContext,
} from './puzzle';
import { computeAdaptiveHardnessBounds } from './difficulty-calibration';
import { buildDifficultyBreakdown } from './difficulty-model';
import { getDecryptSettings } from './config';
import { deriveSeed, mulberry32 } from './rng';
import { formatDateKey } from './serde';
import { trackDifficultyAdjustment } from './metrics';
import { createValidationPipeline } from './validation-pipeline';

// Manual Challenge Types
export type ManualChallengeRequest = {
  text: string;
  author: string;
  targetDifficulty?: number;
  challengeType: ChallengeType;
};

export type ManualChallengeFeedback = {
  textProfile: PhraseDifficultyProfile;
  naturalDifficulty: DifficultyTier;
  achievableTierRange: DifficultyTier[];
  budgetUsed: number;
  budgetTotal: number;
  adjustmentsMade: string[];
  suggestions?: string[];
  difficultyExplanation?: DifficultyBreakdown;
};

export type ManualChallengeResult = {
  success: boolean;
  puzzle?: {
    puzzlePrivate: PuzzlePrivate;
    puzzlePublic: PuzzlePublic;
  };
  feedback: ManualChallengeFeedback;
  error?: string;
};

export type ManualChallengeValidationResult = {
  valid: boolean;
  textProfile: PhraseDifficultyProfile;
  naturalDifficulty: DifficultyTier;
  achievableTierRange: DifficultyTier[];
  reasons: string[];
  suggestions: string[];
  difficultyExplanation?: DifficultyBreakdown;
};

export class ManualPuzzlePublishFailedError extends Error {
  readonly levelId: string;
  readonly dateKey: string;
  override readonly cause: unknown;
  readonly recoverable: boolean;

  constructor(params: { levelId: string; dateKey: string; cause?: unknown }) {
    const detail = params.cause instanceof Error ? params.cause.message : 'unknown publish failure';
    super(
      `Manual puzzle ${params.levelId} was saved for ${params.dateKey}, but publish failed: ${detail}`
    );
    this.name = 'ManualPuzzlePublishFailedError';
    this.levelId = params.levelId;
    this.dateKey = params.dateKey;
    this.cause = params.cause;
    this.recoverable =
      params.cause instanceof PuzzlePublishCommitError ||
      params.cause instanceof PuzzlePublishInProgressError;
  }
}

export class ManualChallengePreflightFailedError extends Error {
  readonly validation: ManualChallengeValidationResult;

  constructor(validation: ManualChallengeValidationResult) {
    super(validation.reasons[0] ?? 'Manual challenge preflight failed.');
    this.name = 'ManualChallengePreflightFailedError';
    this.validation = validation;
  }
}

const normalizeManualAuthor = (input: string): string | null => {
  const normalized = sanitizeAuthor(input);
  if (!normalized) {
    return null;
  }
  if (!looksLikeAllowedAuthor(normalized)) {
    return null;
  }
  if (containsDisallowedContent(normalized)) {
    return null;
  }
  if (normalized.length > maxPuzzleAuthorLength) {
    return null;
  }
  return normalized;
};

const previousLevelId = (levelId: string): string | null => {
  const match = levelId.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }
  const prefix = match[1] ?? '';
  const numeric = Number(match[2]);
  if (!Number.isFinite(numeric) || numeric <= 1) {
    return null;
  }
  const width = (match[2] ?? '').length;
  const previous = `${numeric - 1}`.padStart(width, '0');
  return `${prefix}${previous}`;
};

const previousMappingForLevel = async (
  levelId: string
): Promise<Record<string, number> | null> => {
  const previousId = previousLevelId(levelId);
  if (!previousId) {
    return null;
  }
  return await getPuzzleMapping(previousId);
};

const publishSavedManualPuzzle = async (params: {
  levelId: string;
  dateKey: string;
}): Promise<string> => {
  try {
    console.log('[publishSavedManualPuzzle] Starting publish', {
      levelId: params.levelId,
      dateKey: params.dateKey,
    });
    const postId = await publishAndActivateDailyPost({
      ...params,
      runAs: 'APP',
      forceNewPost: true,
    });
    console.log('[publishSavedManualPuzzle] Published successfully', {
      levelId: params.levelId,
      postId,
    });
    return postId;
  } catch (error) {
    console.error('[publishSavedManualPuzzle] Publish failed', {
      levelId: params.levelId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ManualPuzzlePublishFailedError({
      levelId: params.levelId,
      dateKey: params.dateKey,
      cause: error,
    });
  }
};

type ManualPublishCompletionResult = {
  success: boolean;
  levelId?: string;
  dateKey?: string;
  postId?: string;
  error?: string;
  publishState: 'published' | 'saved_for_retry' | 'rolled_back';
  recoverable: boolean;
  cleanupPerformed: boolean;
};

const rollbackSavedManualPuzzle = async (params: {
  levelId: string;
  dateKey: string;
}): Promise<boolean> => {
  const savedPuzzle = await getPuzzlePrivate(params.levelId);
  if (!savedPuzzle) {
    return true;
  }
  const signature = normalizeContent(savedPuzzle.targetText);
  await deletePuzzleData({
    levelId: params.levelId,
    dateKey: params.dateKey,
    signature: signature.length > 0 ? signature : undefined,
  });
  return true;
};

export const completeSavedManualPuzzlePublish = async (params: {
  levelId: string;
  dateKey: string;
}): Promise<ManualPublishCompletionResult> => {
  try {
    const postId = await publishSavedManualPuzzle(params);
    return {
      success: true,
      levelId: params.levelId,
      dateKey: params.dateKey,
      postId,
      publishState: 'published',
      recoverable: false,
      cleanupPerformed: false,
    };
  } catch (error) {
    if (error instanceof ManualPuzzlePublishFailedError && !error.recoverable) {
      try {
        await rollbackSavedManualPuzzle(params);
        return {
          success: false,
          error: `${error.message} The saved puzzle was rolled back to avoid leaving an unpublished orphan.`,
          publishState: 'rolled_back',
          recoverable: false,
          cleanupPerformed: true,
        };
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : 'unknown cleanup failure';
        return {
          success: false,
          levelId: params.levelId,
          dateKey: params.dateKey,
          error: `${error.message} Automatic rollback failed: ${cleanupMessage}`,
          publishState: 'saved_for_retry',
          recoverable: true,
          cleanupPerformed: false,
        };
      }
    }
    return {
      success: false,
      levelId: params.levelId,
      dateKey: params.dateKey,
      error:
        error instanceof Error
          ? error.message
          : 'Publish failed after saving puzzle',
      publishState: 'saved_for_retry',
      recoverable: true,
      cleanupPerformed: false,
    };
  }
};

export const formatModeratorRerollError = (error: unknown): string => {
  if (error instanceof PuzzleGenerationInProgressError) {
    return 'Another daily generation is already running. Please try again in a moment.';
  }
  if (error instanceof PuzzleGenerationFailedError) {
    if (error.reason.includes('candidate pool empty')) {
      return 'Could not reroll a puzzle right now because the AI candidate pool was empty for the required difficulty and challenge type. A refill was attempted, but no valid candidate was produced. Please try again in a minute.';
    }
    if (error.reason.includes('No daily challenge type slots remain')) {
      return 'Could not reroll a puzzle because all daily challenge type slots for today have already been used.';
    }
    if (error.reason.includes('Generated puzzle validation failed')) {
      return 'Could not reroll a puzzle because generated candidates failed final puzzle validation. Please try again shortly.';
    }
    return `Could not reroll a puzzle right now: ${error.reason}`;
  }
  if (error instanceof Error) {
    return `Could not reroll a puzzle right now: ${error.message}`;
  }
  return 'Could not reroll a puzzle right now due to an unknown error.';
};

const findPendingGeneratedChallenge = async (): Promise<{
  levelId: string;
  puzzle: PuzzlePrivate;
  postId: string | null;
  cameFromStagedPointer: boolean;
} | null> => {
  const stagedLevelId = await getStagedLevelId();
  let publishedFallback: {
    levelId: string;
    puzzle: PuzzlePrivate;
    postId: string;
    cameFromStagedPointer: boolean;
  } | null = null;
  const inspectedLevelIds = new Set<string>();

  if (stagedLevelId) {
    const stagedPuzzle = await getPuzzlePrivate(stagedLevelId);
    if (!stagedPuzzle) {
      await clearStagedLevelId();
    } else {
      inspectedLevelIds.add(stagedLevelId);
      const stagedPostId = await getPuzzlePublishedPostId(stagedLevelId);
      if (!stagedPostId) {
        return {
          levelId: stagedLevelId,
          puzzle: stagedPuzzle,
          postId: null,
          cameFromStagedPointer: true,
        };
      }
      publishedFallback = {
        levelId: stagedLevelId,
        puzzle: stagedPuzzle,
        postId: stagedPostId,
        cameFromStagedPointer: true,
      };
    }
  }

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const candidateDateKeys = [formatDateKey(tomorrow), formatDateKey(new Date())];

  for (const dateKey of candidateDateKeys) {
    const levelIds = await getAutoDailyLevelIdsForDate(dateKey);
    for (let index = levelIds.length - 1; index >= 0; index -= 1) {
      const levelId = levelIds[index];
      if (!levelId || inspectedLevelIds.has(levelId)) {
        continue;
      }
      inspectedLevelIds.add(levelId);
      const puzzle = await getPuzzlePrivate(levelId);
      if (!puzzle) {
        continue;
      }
      const postId = await getPuzzlePublishedPostId(levelId);
      if (!postId) {
        return {
          levelId,
          puzzle,
          postId: null,
          cameFromStagedPointer: false,
        };
      }
      if (!publishedFallback) {
        publishedFallback = {
          levelId,
          puzzle,
          postId,
          cameFromStagedPointer: false,
        };
      }
    }
  }

  return publishedFallback;
};


export const rerollAndPublish = async (): Promise<{
  levelId: string;
  dateKey: string;
  postId: string;
}> => {
  const generated = await generatePuzzleForDate(new Date());
  const postId = await publishAndActivateDailyPost({
    ...generated,
    runAs: 'APP',
  });
  return {
    ...generated,
    postId,
  };
};



export const publishLastGeneratedChallenge = async (): Promise<{
  levelId: string;
  dateKey: string;
  difficulty: number;
  challengeType: string;
  postId: string;
  alreadyPublished: boolean;
}> => {
  const challenge = await findPendingGeneratedChallenge();
  if (!challenge) {
    throw new Error('No generated daily challenge is waiting to be posted.');
  }
  if (challenge.postId) {
    await activateDailyPuzzle(challenge.levelId);
    if (challenge.cameFromStagedPointer) {
      await clearStagedLevelId();
    }
    return {
      levelId: challenge.levelId,
      dateKey: challenge.puzzle.dateKey,
      difficulty: challenge.puzzle.difficulty,
      challengeType: challenge.puzzle.challengeType,
      postId: challenge.postId,
      alreadyPublished: true,
    };
  }
  const postId = await publishAndActivateDailyPost({
    levelId: challenge.levelId,
    dateKey: challenge.puzzle.dateKey,
    runAs: 'APP',
  });
  if (challenge.cameFromStagedPointer) {
    await clearStagedLevelId();
  }
  return {
    levelId: challenge.levelId,
    dateKey: challenge.puzzle.dateKey,
    difficulty: challenge.puzzle.difficulty,
    challengeType: challenge.puzzle.challengeType,
    postId,
    alreadyPublished: false,
  };
};

export const injectAndPublishManualPuzzle = async (params: {
  text: string;
  author: string;
  difficulty?: number;
  challengeType: ChallengeType;
  allowAdjustment?: boolean;
  skipPreflight?: boolean;
}): Promise<{
  success: boolean;
  levelId?: string;
  dateKey?: string;
  postId?: string;
  difficulty?: number;
  error?: string;
  publishState?: 'published' | 'saved_for_retry' | 'rolled_back';
  recoverable?: boolean;
  cleanupPerformed?: boolean;
}> => {
  // Default to false for backward compatibility (original behavior)
  const allowAdjustment = params.allowAdjustment ?? false;
  const author = normalizeManualAuthor(params.author);
  if (!author) {
    return {
      success: false,
      error: `Invalid author. Use letters, numbers, spaces, . ' and - (max ${maxPuzzleAuthorLength}).`,
    };
  }

  try {
    if (allowAdjustment) {
      // Use new flow with adjustment
      const result = await injectManualChallengeWithAdjustment({
        text: params.text,
        author,
        targetDifficulty: params.difficulty,
        challengeType: params.challengeType,
        allowAdjustment: true,
        skipPreflight: params.skipPreflight,
      });

      if (!result.success || !result.puzzle) {
        return {
          success: false,
          error: result.error ?? 'Failed to inject manual challenge with adjustment',
        };
      }

      const publishResult = await completeSavedManualPuzzlePublish({
        levelId: result.puzzle.puzzlePrivate.levelId,
        dateKey: result.puzzle.puzzlePrivate.dateKey,
      });
      return {
        ...publishResult,
        difficulty: result.puzzle.puzzlePrivate.difficulty,
      };
    }

    // Original flow without adjustment
    if (typeof params.difficulty !== 'number') {
      return {
        success: false,
        error: 'Difficulty is required when automatic adjustment is disabled.',
      };
    }
    const generated = await injectManualPuzzle({
      text: params.text,
      difficulty: params.difficulty,
      challengeType: params.challengeType,
      author,
    });

    const publishResult = await completeSavedManualPuzzlePublish(generated);
    return {
      ...publishResult,
      difficulty: params.difficulty,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during manual puzzle injection',
    };
  }
};

export const retryPublishManualPuzzle = async (params: {
  levelId: string;
}): Promise<{
  success: boolean;
  postId?: string;
  error?: string;
}> => {
  try {
    // Check if puzzle exists and is not already published
    const existingPostId = await getPuzzlePublishedPostId(params.levelId);
    if (existingPostId) {
      return {
        success: false,
        error: `Puzzle ${params.levelId} is already published with post ID: ${existingPostId}`,
      };
    }

    const puzzle = await getPuzzlePrivate(params.levelId);
    if (!puzzle) {
      return {
        success: false,
        error: `Puzzle ${params.levelId} not found`,
      };
    }

    const postId = await publishSavedManualPuzzle({
      levelId: params.levelId,
      dateKey: puzzle.dateKey,
    });

    return {
      success: true,
      postId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry publishing puzzle',
    };
  }
};

// Helper Functions for Manual Challenge Validation

/**
 * Infers the best-fit text tier based on the current soft scoring model.
 */
const inferNaturalTier = (
  profile: PhraseDifficultyProfile,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>,
  candidateTiers: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert']
): DifficultyTier =>
  rankDifficultyTiersForProfile(profile, hardnessBoundsByTier, candidateTiers)[0]?.tier ?? 'medium';

const representativeDifficultyForTier = (tier: DifficultyTier): number => {
  if (tier === 'warmup') {
    return 2;
  }
  if (tier === 'medium') {
    return 5;
  }
  if (tier === 'hard') {
    return 8;
  }
  return 9;
};

const tierOrder: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert'];

const collectStructurallyValidTiers = (params: {
  text: string;
  pipeline: ReturnType<typeof createValidationPipeline>;
}): {
  validTiers: DifficultyTier[];
  tierResults: Record<DifficultyTier, ReturnType<ReturnType<typeof createValidationPipeline>['phase1']>>;
} => {
  const tierResults = {
    warmup: params.pipeline.phase1(params.text, representativeDifficultyForTier('warmup')),
    medium: params.pipeline.phase1(params.text, representativeDifficultyForTier('medium')),
    hard: params.pipeline.phase1(params.text, representativeDifficultyForTier('hard')),
    expert: params.pipeline.phase1(params.text, representativeDifficultyForTier('expert')),
  };
  const validTiers = tierOrder.filter((tier) => tierResults[tier].valid);
  return {
    validTiers,
    tierResults,
  };
};

const orderTiersByFit = (
  profile: PhraseDifficultyProfile,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>,
  candidateTiers: DifficultyTier[] = tierOrder
): DifficultyTier[] =>
  rankDifficultyTiersForProfile(profile, hardnessBoundsByTier, candidateTiers).map(
    (entry) => entry.tier
  );

const choosePreferredOrRecommendedTier = (params: {
  achievableTiers: DifficultyTier[];
  preferredDifficulty?: number;
  fallbackTier: DifficultyTier;
}): DifficultyTier => {
  const [firstAchievableTier, ...remainingAchievableTiers] = params.achievableTiers;
  if (!firstAchievableTier) {
    return params.fallbackTier;
  }
  const preferredTier =
    typeof params.preferredDifficulty === 'number'
      ? difficultyToTier(params.preferredDifficulty)
      : null;
  if (preferredTier && params.achievableTiers.includes(preferredTier)) {
    return preferredTier;
  }
  if (!preferredTier) {
    return firstAchievableTier;
  }
  const preferredIndex = tierOrder.indexOf(preferredTier);
  if (preferredIndex < 0) {
    return firstAchievableTier;
  }
  return remainingAchievableTiers.reduce((closestTier, candidateTier) => {
    const closestDistance = Math.abs(tierOrder.indexOf(closestTier) - preferredIndex);
    const candidateDistance = Math.abs(tierOrder.indexOf(candidateTier) - preferredIndex);
    return candidateDistance < closestDistance ? candidateTier : closestTier;
  }, firstAchievableTier);
};

/**
 * Generates actionable suggestions for text modification when target difficulty is unreachable.
 */
const generateSuggestions = (
  profile: PhraseDifficultyProfile,
  targetDifficulty: number,
  naturalTier: DifficultyTier
): string[] => {
  const suggestions: string[] = [];
  const targetTier = difficultyToTier(targetDifficulty);

  const targetRank = tierOrder.indexOf(targetTier);
  const naturalRank = tierOrder.indexOf(naturalTier);
  const needsEasierText = targetRank < naturalRank;

  if (
    targetTier === 'warmup' &&
    (naturalTier !== 'warmup' ||
      profile.cryptoHardness > 0.33 ||
      profile.uniqueLetterCount > 8)
  ) {
    suggestions.push(
      `Text crypto hardness (${profile.cryptoHardness.toFixed(2)}) is too high for warmup tier.`
    );
    suggestions.push(
      `Use text with more repeated letters and common words (currently ${profile.uniqueLetterCount} unique letters).`
    );
    if (profile.oneLetterWordCount === 0) {
      suggestions.push('Add one-letter words (A, I) to provide starter clues.');
    }
  }

  if (
    targetTier === 'expert' &&
    (naturalTier !== 'expert' ||
      profile.cryptoHardness < 0.78 ||
      profile.uniqueLetterCount < 19)
  ) {
    suggestions.push(
      `Text crypto hardness (${profile.cryptoHardness.toFixed(2)}) is too low for expert tier.`
    );
    suggestions.push(
      `Use text with more unique letters and varied vocabulary (currently ${profile.uniqueLetterCount} unique letters).`
    );
    suggestions.push('Avoid repeated words and common suffixes that provide clues.');
  }

  if (targetTier === 'medium' || targetTier === 'hard') {
    const direction = needsEasierText ? 'decrease' : 'increase';
    suggestions.push(
      `Text is naturally ${naturalTier} tier. ${direction === 'increase' ? 'Add' : 'Remove'} unique letters to reach ${targetTier} tier.`
    );
  }

  if (targetTier === 'hard' || targetTier === 'expert') {
    if (profile.uniqueWordCount < 6 || profile.uniqueWordRatio < 0.75) {
      suggestions.push('Use more unique words if you want the text itself to carry more difficulty.');
    }
  }

  if (targetTier === 'warmup' || targetTier === 'medium') {
    if (profile.repeatedWordRatio > 0.35 && profile.cryptoHardness < 0.45) {
      suggestions.push('Repetitive lines can still work here, but the board will need more generous starter clues.');
    }
  }

  return suggestions;
};

const duplicateFailureResult = (params: {
  profile: PhraseDifficultyProfile;
  naturalTier: DifficultyTier;
  achievableTierRange: DifficultyTier[];
  reason: string;
}): ManualChallengeValidationResult => ({
  valid: false,
  textProfile: params.profile,
  naturalDifficulty: params.naturalTier,
  achievableTierRange: params.achievableTierRange,
  reasons: [`Text conflicts with existing content: ${params.reason}.`],
  suggestions: ['Use a different quote; this one matches recent or reserved content too closely.'],
});

const formatTierList = (tiers: DifficultyTier[]): string =>
  tiers.length > 0 ? tiers.join(', ') : 'none';

const formatFairBuildFailureReason = (params: {
  targetTier: DifficultyTier;
  naturalTier: DifficultyTier;
  targetProbeFailure: string;
  achievableTierRange: DifficultyTier[];
}): string => {
  if (params.targetProbeFailure === 'Max iterations reached without convergence') {
    return `Could not build a fair ${params.targetTier} puzzle for this text. Natural fit: ${params.naturalTier}. Preview build already produced a fair ${params.naturalTier} board, but tuning it to ${params.targetTier} did not converge within 5 adjustment steps. Achievable tiers from preview: ${formatTierList(params.achievableTierRange)}.`;
  }

  return `Could not build a fair ${params.targetTier} puzzle for this text. Natural fit: ${params.naturalTier}. ${params.targetProbeFailure}. Achievable tiers from preview: ${formatTierList(params.achievableTierRange)}.`;
};

const previewProbeReason = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown preview failure';

const describePreviewError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    value: String(error),
  };
};

const buildPreviewBasePuzzle = async (params: {
  text: string;
  challengeType: ChallengeType;
  buildTier: DifficultyTier;
  settings: Awaited<ReturnType<typeof getDecryptSettings>>;
  previewLevelId: string;
  previousMapping: Record<string, number> | null;
  dateKey: string;
}) => {
  return buildManualPuzzleWithSolverFallback({
    levelId: params.previewLevelId,
    dateKey: params.dateKey,
    text: params.text,
    author: 'PREVIEW',
    challengeType: params.challengeType,
    source: 'MANUAL_INJECTED',
    difficulty: representativeDifficultyForTier(params.buildTier),
    logicalPercent: params.settings.logicalCipherPercent,
    previousMapping: params.previousMapping,
  });
};

const probeTargetTierAchievability = async (params: {
  traceId?: string;
  basePuzzle: PuzzlePrivate;
  baseBudget: ReturnType<typeof computeObstructionBudget>;
  targetTier: DifficultyTier;
  text: string;
  pipeline: ReturnType<typeof createValidationPipeline>;
}): Promise<{ valid: boolean; reason?: string }> => {
  const targetDifficulty = representativeDifficultyForTier(params.targetTier);
  const tracePrefix = params.traceId ? `[manual-preflight:${params.traceId}]` : '[manual-preflight]';
  if (difficultyToTier(params.basePuzzle.difficulty) === params.targetTier) {
    const validation = params.pipeline.phase2(params.basePuzzle);
    console.log(`${tracePrefix} phase2 validation without adjustment`, {
      levelId: params.basePuzzle.levelId,
      targetTier: params.targetTier,
      valid: validation.valid,
      reasonCount: validation.reasons.length,
    });
    return validation.valid
      ? { valid: true }
      : { valid: false, reason: validation.reasons.join('; ') };
  }

  try {
    console.log(`${tracePrefix} probing achievable tier`, {
      levelId: params.basePuzzle.levelId,
      fromDifficulty: params.basePuzzle.difficulty,
      targetTier: params.targetTier,
      targetDifficulty,
      budget: params.baseBudget,
    });
    const adjusted = await adjustPuzzleDifficulty({
      basePuzzle: params.basePuzzle,
      targetDifficulty,
      budget: { ...params.baseBudget },
      maxIterations: 5,
      rng: mulberry32(deriveSeed(params.basePuzzle.levelId, params.text)),
      traceLabel: `${tracePrefix}[probe:${params.targetTier}]`,
    });

    if (!adjusted.success || !adjusted.puzzle) {
      console.warn(`${tracePrefix} tier probe failed before phase2`, {
        levelId: params.basePuzzle.levelId,
        targetTier: params.targetTier,
        reason: adjusted.reason ?? 'Difficulty adjustment failed',
        budgetUsed: adjusted.budgetUsed,
        budgetTotal: adjusted.budgetTotal,
        achievableTierRange: adjusted.achievableTierRange,
      });
      return {
        valid: false,
        reason: adjusted.reason ?? 'Difficulty adjustment failed',
      };
    }

    const validation = params.pipeline.phase2(adjusted.puzzle);
    console.log(`${tracePrefix} tier probe phase2 validation`, {
      levelId: adjusted.puzzle.levelId,
      targetTier: params.targetTier,
      adjustedDifficulty: adjusted.puzzle.difficulty,
      valid: validation.valid,
      reasonCount: validation.reasons.length,
      budgetUsed: adjusted.budgetUsed,
      budgetTotal: adjusted.budgetTotal,
    });
    return validation.valid
      ? { valid: true }
      : { valid: false, reason: validation.reasons.join('; ') };
  } catch (error) {
    console.error(`${tracePrefix} tier probe threw`, {
      levelId: params.basePuzzle.levelId,
      targetTier: params.targetTier,
      error: describePreviewError(error),
    });
    return {
      valid: false,
      reason: previewProbeReason(error),
    };
  }
};

export const preflightManualChallengeForPublish = async (params: {
  text: string;
  difficulty?: number;
  challengeType?: ChallengeType;
}): Promise<ManualChallengeValidationResult> => {
  const traceId = crypto.randomUUID().slice(0, 8);
  const tracePrefix = `[manual-preflight:${traceId}]`;
  let hardnessBoundsByTier: Partial<HardnessBoundsByTier> | undefined = undefined;

  try {
    hardnessBoundsByTier = await computeAdaptiveHardnessBounds();
  } catch (error) {
    console.error(
      `Manual challenge validation: hardness calibration fallback to defaults due to error: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    );
  }

  const text = sanitizePhrase(params.text);
  const profile = computePhraseDifficultyProfile(text);
  const naturalTier = inferNaturalTier(profile, hardnessBoundsByTier);
  const pipeline = createValidationPipeline(hardnessBoundsByTier);
  console.log(`${tracePrefix} starting`, {
    requestedDifficulty: params.difficulty ?? null,
    requestedTier:
      typeof params.difficulty === 'number' ? difficultyToTier(params.difficulty) : null,
    challengeType: params.challengeType ?? 'QUOTE',
    textLength: text.length,
    totalLetters: profile.totalLetters,
    uniqueLetters: profile.uniqueLetterCount,
    wordCount: profile.wordCount,
    cryptoHardness: Number(profile.cryptoHardness.toFixed(4)),
    naturalTier,
  });
  const { validTiers, tierResults } = collectStructurallyValidTiers({
    text,
    pipeline,
  });
  console.log(`${tracePrefix} phase1 complete`, {
    validTiers,
    tierResults: Object.fromEntries(
      Object.entries(tierResults).map(([tier, result]) => [
        tier,
        {
          valid: result.valid,
          reasons: result.reasons,
        },
      ])
    ),
  });

  if (validTiers.length === 0) {
    const naturalPhase1 = tierResults[naturalTier];
    console.warn(`${tracePrefix} no structurally valid tiers`, {
      naturalTier,
      reasons: naturalPhase1.reasons,
    });
    return {
      valid: false,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: [],
      reasons: naturalPhase1.valid
        ? ['Text does not satisfy any supported difficulty tier.']
        : naturalPhase1.reasons,
      suggestions: generateSuggestions(profile, params.difficulty ?? 5, naturalTier),
    };
  }

  const heuristicRange = orderTiersByFit(profile, hardnessBoundsByTier, validTiers);
  const selectedTier = choosePreferredOrRecommendedTier({
    achievableTiers: heuristicRange,
    preferredDifficulty: params.difficulty,
    fallbackTier: naturalTier,
  });
  const selectedDifficulty = representativeDifficultyForTier(selectedTier);
  console.log(`${tracePrefix} heuristic range`, {
    heuristicRange,
    selectedTier,
  });
  const duplicate = await pipeline.duplicate(text);
  if (duplicate.duplicate) {
    console.warn(`${tracePrefix} duplicate rejection`, {
      reason: duplicate.reason ?? 'duplicate',
      normalizedSignature: duplicate.normalizedSignature,
      tokenSignature: duplicate.tokenSignature,
    });
    return duplicateFailureResult({
      profile,
      naturalTier,
      achievableTierRange: heuristicRange,
      reason: duplicate.reason ?? 'duplicate',
    });
  }

  try {
    console.log(`${tracePrefix} loading preview dependencies`);
    const settings = await getDecryptSettings();
    console.log(`${tracePrefix} settings loaded`, {
      logicalCipherPercent: settings.logicalCipherPercent,
    });
    const previewLevelId = await peekNextLevelId();
    console.log(`${tracePrefix} preview level reserved`, {
      previewLevelId,
    });
    const previousMapping = await previousMappingForLevel(previewLevelId);
    console.log(`${tracePrefix} previous mapping loaded`, {
      previewLevelId,
      hasPreviousMapping: previousMapping !== null,
      previousMappingEntries: previousMapping ? Object.keys(previousMapping).length : 0,
    });
    const dateKey = formatDateKey(new Date());
    const buildTier =
      validTiers.includes(naturalTier) ? naturalTier : heuristicRange[0] ?? validTiers[0] ?? naturalTier;
    console.log(`${tracePrefix} building preview base puzzle`, {
      previewLevelId,
      dateKey,
      buildTier,
      challengeType: params.challengeType ?? 'QUOTE',
    });
    const baseBuilt = await buildPreviewBasePuzzle({
      text,
      challengeType: params.challengeType ?? 'QUOTE',
      buildTier,
      settings,
      previewLevelId,
      previousMapping,
      dateKey,
    });
    console.log(`${tracePrefix} preview base puzzle built`, {
      levelId: baseBuilt.puzzlePrivate.levelId,
      difficulty: baseBuilt.puzzlePrivate.difficulty,
      cipherType: baseBuilt.puzzlePrivate.cipherType,
      blindCount: baseBuilt.puzzlePrivate.blindIndices.length,
      prefilledCount: baseBuilt.puzzlePrivate.prefilledIndices.length,
      padlockCount: baseBuilt.puzzlePrivate.padlockChains.length,
    });
    const context: PuzzleDifficultyContext = {
      tier: buildTier,
      difficulty: representativeDifficultyForTier(buildTier),
      cipherType: baseBuilt.puzzlePrivate.cipherType,
      totalLetters: profile.totalLetters,
      wordCount: profile.wordCount,
      uniqueWordCount: profile.uniqueWordCount,
      uniqueWordRatio: profile.uniqueWordRatio,
      repeatedWordRatio: profile.repeatedWordRatio,
      phraseUniqueLetters: profile.uniqueLetterCount,
      phraseOneLetterWords: profile.oneLetterWordCount,
      phraseSuffixCount: profile.commonSuffixCount,
      cryptoHardness: profile.cryptoHardness,
    };
    const baseBudgetTemplate = computeObstructionBudget(context);
    const baseBudget = {
      ...baseBudgetTemplate,
      spent: Math.min(
        baseBudgetTemplate.total,
        computeObstructionBudgetSpent(baseBuilt.puzzlePrivate)
      ),
    };
    console.log(`${tracePrefix} preview obstruction budget computed`, {
      buildTier,
      baseBudget,
      budgetRemaining: Math.max(0, baseBudget.total - baseBudget.spent),
    });
    console.log(`${tracePrefix} probing tier`, {
      tier: selectedTier,
      heuristicRange,
    });
    const probe = await probeTargetTierAchievability({
      traceId,
      basePuzzle: baseBuilt.puzzlePrivate,
      baseBudget,
      targetTier: selectedTier,
      text,
      pipeline,
    });
    console.log(`${tracePrefix} probe result`, {
      tier: selectedTier,
      valid: probe.valid,
      reason: probe.reason,
    });

    const isAchievable = probe.valid;
    const targetProbeFailure = probe.reason ?? null;
    console.log(`${tracePrefix} preflight complete`, {
      targetTier: selectedTier,
      achievableTierRange: heuristicRange,
      isAchievable,
      targetProbeFailure,
    });
    return {
      valid: isAchievable,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: heuristicRange,
      reasons: isAchievable
        ? []
        : targetProbeFailure
          ? [
              formatFairBuildFailureReason({
                targetTier: selectedTier,
                naturalTier,
                targetProbeFailure,
                achievableTierRange: heuristicRange,
              }),
            ]
          : [],
      suggestions: isAchievable ? [] : generateSuggestions(profile, selectedDifficulty, naturalTier),
      difficultyExplanation: baseBuilt.puzzlePrivate.difficultyBreakdown,
    };
  } catch (error) {
    console.error(`${tracePrefix} preview build failed`, {
      requestedDifficulty: params.difficulty ?? null,
      requestedTier: selectedTier,
      naturalTier,
      heuristicRange,
      error: describePreviewError(error),
    });
    return {
      valid: false,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: heuristicRange,
      reasons: [`Could not verify buildability for this text [trace ${traceId}]: ${previewProbeReason(error)}.`],
      suggestions: ['Try again in a moment, or use a different quote if the problem persists.'],
    };
  }
};

/**
 * Validates a manual challenge text without building or saving the puzzle.
 * Returns detailed feedback on text suitability and achievable difficulty range.
 */
export const validateManualChallenge = async (params: {
  text: string;
  difficulty?: number;
}): Promise<ManualChallengeValidationResult> => {
  let hardnessBoundsByTier: Partial<HardnessBoundsByTier> | undefined = undefined;

  try {
    hardnessBoundsByTier = await computeAdaptiveHardnessBounds();
  } catch (error) {
    console.error(
      `Manual challenge validation: hardness calibration fallback to defaults due to error: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    );
  }

  const text = sanitizePhrase(params.text);
  const profile = computePhraseDifficultyProfile(text);
  const naturalTier = inferNaturalTier(profile, hardnessBoundsByTier);
  const pipeline = createValidationPipeline(hardnessBoundsByTier);
  const { validTiers, tierResults } = collectStructurallyValidTiers({
    text,
    pipeline,
  });

  if (validTiers.length === 0) {
    const naturalPhase1 = tierResults[naturalTier];
    return {
      valid: false,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: [],
      reasons: naturalPhase1.valid
        ? ['Text does not satisfy any supported difficulty tier.']
        : naturalPhase1.reasons,
        suggestions: generateSuggestions(profile, params.difficulty ?? 5, naturalTier),
      };
  }

  const achievableRange = orderTiersByFit(profile, hardnessBoundsByTier, validTiers);
  const selectedTier = choosePreferredOrRecommendedTier({
    achievableTiers: achievableRange,
    preferredDifficulty: params.difficulty,
    fallbackTier: naturalTier,
  });

  return {
    valid: achievableRange.length > 0,
    textProfile: profile,
    naturalDifficulty: naturalTier,
    achievableTierRange: achievableRange,
    reasons: [],
    suggestions:
      achievableRange.length > 0
        ? []
        : generateSuggestions(
            profile,
            representativeDifficultyForTier(selectedTier),
            naturalTier
          ),
  };
};

/**
 * Injects a manual challenge with automatic difficulty adjustment.
 * Builds the puzzle, adjusts obstructions to match target difficulty, and saves it.
 */
export const injectManualChallengeWithAdjustment = async (params: {
  text: string;
  author: string;
  targetDifficulty?: number;
  challengeType: ChallengeType;
  allowAdjustment: boolean;
  skipPreflight?: boolean;
}): Promise<ManualChallengeResult> => {
  const text = sanitizePhrase(params.text);
  const profile = computePhraseDifficultyProfile(text);
  let hardnessBoundsByTier: Partial<HardnessBoundsByTier> | undefined = undefined;
  try {
    hardnessBoundsByTier = await computeAdaptiveHardnessBounds();
  } catch (error) {
    console.error(
      `Manual challenge injection: hardness calibration fallback to defaults due to error: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    );
  }
  const naturalTier = inferNaturalTier(profile, hardnessBoundsByTier);
  const author = normalizeManualAuthor(params.author);
  if (!author) {
    return {
      success: false,
      feedback: {
        textProfile: profile,
        naturalDifficulty: naturalTier,
        achievableTierRange: [],
        budgetUsed: 0,
        budgetTotal: 0,
        adjustmentsMade: [],
      },
      error: `Invalid author. Use letters, numbers, spaces, . ' and - (max ${maxPuzzleAuthorLength}).`,
    };
  }

  if (!params.skipPreflight) {
    const preflight = await preflightManualChallengeForPublish({
      text,
      difficulty: params.targetDifficulty,
      challengeType: params.challengeType,
    });
    if (!preflight.valid) {
      return {
        success: false,
        feedback: {
          textProfile: preflight.textProfile,
          naturalDifficulty: preflight.naturalDifficulty,
          achievableTierRange: preflight.achievableTierRange,
          budgetUsed: 0,
          budgetTotal: 0,
          adjustmentsMade: [],
          suggestions: preflight.suggestions,
        },
        error: preflight.reasons.join('; '),
      };
    }
  }

  const settings = await getDecryptSettings();
  const pipeline = createValidationPipeline(hardnessBoundsByTier);
  const { validTiers, tierResults } = collectStructurallyValidTiers({
    text,
    pipeline,
  });
  const naturalPhase1 = tierResults[naturalTier];
  const achievableRange = orderTiersByFit(profile, hardnessBoundsByTier, validTiers);
  const targetTier = choosePreferredOrRecommendedTier({
    achievableTiers: achievableRange,
    preferredDifficulty: params.targetDifficulty,
    fallbackTier: naturalTier,
  });
  const selectedDifficulty = representativeDifficultyForTier(targetTier);

  if (validTiers.length === 0) {
    return {
      success: false,
      feedback: {
        textProfile: profile,
        naturalDifficulty: naturalTier,
        achievableTierRange: [],
        budgetUsed: 0,
        budgetTotal: 0,
        adjustmentsMade: [],
        suggestions: generateSuggestions(profile, params.targetDifficulty ?? 5, naturalTier),
      },
      error: naturalPhase1.valid
        ? 'Text does not satisfy any supported difficulty tier.'
        : naturalPhase1.reasons.join('; '),
    };
  }

  if (!params.allowAdjustment) {
    const directPhase1 = pipeline.phase1(text, selectedDifficulty);
    if (!directPhase1.valid) {
      return {
        success: false,
        feedback: {
          textProfile: profile,
          naturalDifficulty: naturalTier,
          achievableTierRange: achievableRange,
          budgetUsed: 0,
          budgetTotal: 0,
          adjustmentsMade: [],
          suggestions: generateSuggestions(profile, selectedDifficulty, naturalTier),
        },
        error: directPhase1.reasons.join('; '),
      };
    }
  }

  let signatureOwnerToken = `pending:${crypto.randomUUID()}`;
  const dup = await pipeline.duplicate(text);

  if (dup.duplicate) {
    return {
      success: false,
      feedback: {
        textProfile: profile,
        naturalDifficulty: naturalTier,
        achievableTierRange: [],
        budgetUsed: 0,
        budgetTotal: 0,
        adjustmentsMade: [],
      },
      error: `Text ${dup.reason ?? 'duplicate'}`,
    };
  }

  // Reserve signature
  const reserved = await reserveUsedSignature(dup.normalizedSignature, signatureOwnerToken);
  if (!reserved) {
    return {
      success: false,
      feedback: {
        textProfile: profile,
        naturalDifficulty: naturalTier,
        achievableTierRange: [],
        budgetUsed: 0,
        budgetTotal: 0,
        adjustmentsMade: [],
      },
      error: 'Text already used in another challenge',
    };
  }

  let saved = false;
  let latestFeedback: ManualChallengeFeedback = {
    textProfile: profile,
    naturalDifficulty: naturalTier,
    achievableTierRange: achievableRange,
    budgetUsed: 0,
    budgetTotal: 0,
    adjustmentsMade: [],
  };

  try {
    const dateKey = formatDateKey(new Date());
    const buildTier =
      validTiers.includes(naturalTier) ? naturalTier : validTiers[0] ?? naturalTier;
    const baseDifficulty = params.allowAdjustment
      ? representativeDifficultyForTier(buildTier)
      : selectedDifficulty;
    const savedPuzzle = await buildAndSaveManualPuzzle({
      signatureOwnerToken,
      normalizedSignature: dup.normalizedSignature,
      tokenSignature: dup.tokenSignature,
      buildPreparedPuzzle: async ({ nextLevelId, previousMapping }) => {
        const basePuzzle = buildManualPuzzleWithSolverFallback({
          levelId: nextLevelId,
          dateKey,
          text,
          author,
          challengeType: params.challengeType,
          source: 'MANUAL_INJECTED',
          difficulty: baseDifficulty,
          logicalPercent: settings.logicalCipherPercent,
          previousMapping,
        });
        const rng = mulberry32(deriveSeed(basePuzzle.puzzlePrivate.levelId, text));

        if (!params.allowAdjustment) {
          const phase2 = pipeline.phase2(basePuzzle.puzzlePrivate);
          if (!phase2.valid) {
            latestFeedback = {
              ...latestFeedback,
              achievableTierRange: achievableRange,
            };
            throw new Error(phase2.reasons.join('; '));
          }
          return {
            puzzlePrivate: basePuzzle.puzzlePrivate,
            puzzlePublic: basePuzzle.puzzlePublic,
          };
        }

        const basePhase2 = pipeline.phase2(basePuzzle.puzzlePrivate);
        if (
          difficultyToTier(basePuzzle.puzzlePrivate.difficulty) === targetTier &&
          basePhase2.valid
        ) {
          latestFeedback = {
            textProfile: profile,
            naturalDifficulty: naturalTier,
            achievableTierRange: [targetTier],
            budgetUsed: 0,
            budgetTotal: 0,
            adjustmentsMade: [],
            difficultyExplanation:
              basePuzzle.puzzlePrivate.difficultyBreakdown ??
              buildDifficultyBreakdown(basePuzzle.puzzlePrivate),
          };
          return {
            puzzlePrivate: basePuzzle.puzzlePrivate,
            puzzlePublic: basePuzzle.puzzlePublic,
          };
        }

        const context: PuzzleDifficultyContext = {
          tier: buildTier,
          difficulty: baseDifficulty,
          cipherType: basePuzzle.puzzlePrivate.cipherType,
          totalLetters: profile.totalLetters,
          wordCount: profile.wordCount,
          uniqueWordCount: profile.uniqueWordCount,
          uniqueWordRatio: profile.uniqueWordRatio,
          repeatedWordRatio: profile.repeatedWordRatio,
          phraseUniqueLetters: profile.uniqueLetterCount,
          phraseOneLetterWords: profile.oneLetterWordCount,
          phraseSuffixCount: profile.commonSuffixCount,
          cryptoHardness: profile.cryptoHardness,
        };

        const budgetTemplate = computeObstructionBudget(context);
        const budget = {
          ...budgetTemplate,
          spent: Math.min(
            budgetTemplate.total,
            computeObstructionBudgetSpent(basePuzzle.puzzlePrivate)
          ),
        };
        const adjusted = await adjustPuzzleDifficulty({
          basePuzzle: basePuzzle.puzzlePrivate,
          targetDifficulty: selectedDifficulty,
          budget,
          maxIterations: 5,
          rng,
          traceLabel: `[inject-manual-adjustment][target:${targetTier}]`,
        });

        trackDifficultyAdjustment({
          success: adjusted.success,
          iterations: adjusted.adjustmentLog.length,
          budgetUsed: adjusted.budgetUsed,
          budgetTotal: adjusted.budgetTotal,
        });

        latestFeedback = {
          textProfile: profile,
          naturalDifficulty: naturalTier,
          achievableTierRange: adjusted.achievableTierRange,
          budgetUsed: adjusted.budgetUsed,
          budgetTotal: adjusted.budgetTotal,
          adjustmentsMade: adjusted.adjustmentLog,
          difficultyExplanation: adjusted.puzzle
            ? buildDifficultyBreakdown(adjusted.puzzle)
            : undefined,
          suggestions:
            !adjusted.success || !adjusted.puzzle
              ? generateSuggestions(profile, selectedDifficulty, naturalTier)
              : undefined,
        };

        if (!adjusted.success || !adjusted.puzzle) {
          throw new Error(
            formatFairBuildFailureReason({
              targetTier,
              naturalTier,
              targetProbeFailure: adjusted.reason ?? 'Difficulty adjustment failed',
              achievableTierRange: adjusted.achievableTierRange,
            })
          );
        }

        const phase2 = pipeline.phase2(adjusted.puzzle);
        if (!phase2.valid) {
          throw new Error(phase2.reasons.join('; '));
        }

        return {
          puzzlePrivate: adjusted.puzzle,
          puzzlePublic: buildPublicPuzzle(adjusted.puzzle, []),
        };
      },
    });
    signatureOwnerToken = savedPuzzle.signatureOwnerToken;
    saved = true;

    return {
      success: true,
      puzzle: {
        puzzlePrivate: savedPuzzle.puzzlePrivate,
        puzzlePublic: savedPuzzle.puzzlePublic,
      },
      feedback: latestFeedback,
    };
  } catch (error) {
    if (!saved) {
      await clearUsedSignature(dup.normalizedSignature, signatureOwnerToken);
    }

    return {
      success: false,
      feedback: latestFeedback,
      error: error instanceof Error ? error.message : 'Unknown error during puzzle injection',
    };
  }
};
