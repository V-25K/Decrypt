import {
  getAutoDailyLevelIdsForDate,
  getPuzzleMapping,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
  getStagedLevelId,
  clearStagedLevelId,
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
  publishAndActivateDailyPost,
} from './generator';
import type { ChallengeType, PuzzlePrivate, PuzzlePublic } from '../../shared/game';
import { activateEndlessCatalog, getEndlessCatalogStatus } from './endless-catalog';
import { auditBundledEndlessStagingCollisions } from './endless-audit';
import {
  computePhraseDifficultyProfile,
  difficultyToTier,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
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
  type PuzzleDifficultyContext,
} from './puzzle';
import { computeAdaptiveHardnessBounds } from './difficulty-calibration';
import { getDecryptSettings } from './config';
import { deriveSeed, mulberry32 } from './rng';
import { formatDateKey } from './serde';
import { trackDifficultyAdjustment } from './metrics';
import { createValidationPipeline } from './validation-pipeline';

// Manual Challenge Types
export type ManualChallengeRequest = {
  text: string;
  author: string;
  targetDifficulty: number;
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
};

export class ManualPuzzlePublishFailedError extends Error {
  readonly levelId: string;
  readonly dateKey: string;

  constructor(params: { levelId: string; dateKey: string; cause?: unknown }) {
    const detail = params.cause instanceof Error ? params.cause.message : 'unknown publish failure';
    super(
      `Manual puzzle ${params.levelId} was saved for ${params.dateKey}, but publish failed: ${detail}`
    );
    this.name = 'ManualPuzzlePublishFailedError';
    this.levelId = params.levelId;
    this.dateKey = params.dateKey;
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
    return await publishAndActivateDailyPost({
      ...params,
      runAs: 'APP',
    });
  } catch (error) {
    throw new ManualPuzzlePublishFailedError({
      levelId: params.levelId,
      dateKey: params.dateKey,
      cause: error,
    });
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
  const generated = await generatePuzzleForDate(new Date(), {
    allowSelectionRefill: true,
  });
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
  difficulty: number;
  challengeType: ChallengeType;
  allowAdjustment?: boolean;
  skipPreflight?: boolean;
}) => {
  // Default to false for backward compatibility (original behavior)
  const allowAdjustment = params.allowAdjustment ?? false;
  const author = normalizeManualAuthor(params.author);
  if (!author) {
    throw new Error(
      `Invalid author. Use letters, numbers, spaces, . ' and - (max ${maxPuzzleAuthorLength}).`
    );
  }
  
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
      throw new Error(result.error ?? 'Failed to inject manual challenge with adjustment');
    }
    
    const postId = await publishSavedManualPuzzle({
      levelId: result.puzzle.puzzlePrivate.levelId,
      dateKey: result.puzzle.puzzlePrivate.dateKey,
    });
    
    return {
      levelId: result.puzzle.puzzlePrivate.levelId,
      dateKey: result.puzzle.puzzlePrivate.dateKey,
      postId,
    };
  }
  
  // Original flow without adjustment
  const generated = await injectManualPuzzle({
    text: params.text,
    difficulty: params.difficulty,
    challengeType: params.challengeType,
    author,
  });
  const postId = await publishSavedManualPuzzle(generated);
  return {
    ...generated,
    postId,
  };
};

export const getEndlessCatalogAdminStatus = async () => {
  return await getEndlessCatalogStatus();
};

export const activateEndlessCatalogVersion = async (catalogVersion: string) => {
  return await activateEndlessCatalog(catalogVersion);
};

export const getEndlessStagingCollisionReport = async () => {
  return await auditBundledEndlessStagingCollisions();
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

  if (targetTier === naturalTier) {
    return suggestions;
  }

  const targetRank = tierOrder.indexOf(targetTier);
  const naturalRank = tierOrder.indexOf(naturalTier);
  const needsEasierText = targetRank < naturalRank;

  if (targetTier === 'warmup' && naturalTier !== 'warmup') {
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

  if (targetTier === 'expert' && naturalTier !== 'expert') {
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
    if (profile.totalLength < 32) {
      suggestions.push('Use a slightly longer line if you want more room for harder board tuning.');
    }
    if (profile.uniqueWordRatio < 0.75) {
      suggestions.push('Use more unique words if you want the text itself to carry more difficulty.');
    }
  }

  if (targetTier === 'warmup' || targetTier === 'medium') {
    if (profile.totalLength > 38 && profile.cryptoHardness < 0.45) {
      suggestions.push('Longer repetitive lines can still work here, but the board will need more generous starter clues.');
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

const previewProbeReason = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown preview failure';

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
  basePuzzle: PuzzlePrivate;
  baseBudget: ReturnType<typeof computeObstructionBudget>;
  targetTier: DifficultyTier;
  text: string;
  pipeline: ReturnType<typeof createValidationPipeline>;
}): Promise<{ valid: boolean; reason?: string }> => {
  const targetDifficulty = representativeDifficultyForTier(params.targetTier);
  if (difficultyToTier(params.basePuzzle.difficulty) === params.targetTier) {
    const validation = params.pipeline.phase2(params.basePuzzle);
    return validation.valid
      ? { valid: true }
      : { valid: false, reason: validation.reasons.join('; ') };
  }

  try {
    const adjusted = await adjustPuzzleDifficulty({
      basePuzzle: params.basePuzzle,
      targetDifficulty,
      budget: { ...params.baseBudget },
      maxIterations: 5,
      rng: mulberry32(deriveSeed(params.basePuzzle.levelId, params.text)),
    });

    if (!adjusted.success || !adjusted.puzzle) {
      return {
        valid: false,
        reason: adjusted.reason ?? 'Difficulty adjustment failed',
      };
    }

    const validation = params.pipeline.phase2(adjusted.puzzle);
    return validation.valid
      ? { valid: true }
      : { valid: false, reason: validation.reasons.join('; ') };
  } catch (error) {
    return {
      valid: false,
      reason: previewProbeReason(error),
    };
  }
};

export const preflightManualChallengeForPublish = async (params: {
  text: string;
  difficulty: number;
  challengeType?: ChallengeType;
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
      suggestions: generateSuggestions(profile, params.difficulty, naturalTier),
    };
  }

  const heuristicRange = orderTiersByFit(profile, hardnessBoundsByTier, validTiers);
  const duplicate = await pipeline.duplicate(text, `preflight:${crypto.randomUUID()}`);
  if (duplicate.duplicate) {
    return duplicateFailureResult({
      profile,
      naturalTier,
      achievableTierRange: heuristicRange,
      reason: duplicate.reason ?? 'duplicate',
    });
  }

  const targetTier = difficultyToTier(params.difficulty);
  if (!heuristicRange.includes(targetTier)) {
    return {
      valid: false,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: heuristicRange,
      reasons: [
        `Target tier ${targetTier} not achievable with this text. Achievable tiers: ${heuristicRange.join(', ')}`,
      ],
      suggestions: generateSuggestions(profile, params.difficulty, naturalTier),
    };
  }

  try {
    const settings = await getDecryptSettings();
    const previewLevelId = await peekNextLevelId();
    const previousMapping = await previousMappingForLevel(previewLevelId);
    const dateKey = formatDateKey(new Date());
    const buildTier =
      validTiers.includes(naturalTier) ? naturalTier : heuristicRange[0] ?? validTiers[0] ?? naturalTier;
    const baseBuilt = await buildPreviewBasePuzzle({
      text,
      challengeType: params.challengeType ?? 'QUOTE',
      buildTier,
      settings,
      previewLevelId,
      previousMapping,
      dateKey,
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
    const baseBudget = computeObstructionBudget(context);
    const actualAchievableRange: DifficultyTier[] = [];

    for (const tier of heuristicRange) {
      const probe = await probeTargetTierAchievability({
        basePuzzle: baseBuilt.puzzlePrivate,
        baseBudget,
        targetTier: tier,
        text,
        pipeline,
      });
      if (probe.valid) {
        actualAchievableRange.push(tier);
      }
    }

    const isAchievable = actualAchievableRange.includes(targetTier);
    return {
      valid: isAchievable,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: actualAchievableRange,
      reasons: isAchievable
        ? []
        : [
            `Target tier ${targetTier} not achievable with this text. Achievable tiers: ${actualAchievableRange.join(', ') || 'none'}`,
          ],
      suggestions: isAchievable ? [] : generateSuggestions(profile, params.difficulty, naturalTier),
    };
  } catch (error) {
    return {
      valid: false,
      textProfile: profile,
      naturalDifficulty: naturalTier,
      achievableTierRange: heuristicRange,
      reasons: [`Could not verify buildability for this text: ${previewProbeReason(error)}.`],
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
  difficulty: number;
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
      suggestions: generateSuggestions(profile, params.difficulty, naturalTier),
    };
  }

  const achievableRange = orderTiersByFit(profile, hardnessBoundsByTier, validTiers);
  const targetTier = difficultyToTier(params.difficulty);
  const isAchievable = achievableRange.includes(targetTier);
  
  return {
    valid: isAchievable,
    textProfile: profile,
    naturalDifficulty: naturalTier,
    achievableTierRange: achievableRange,
    reasons: isAchievable 
      ? [] 
      : [`Target tier ${targetTier} not achievable with this text. Achievable tiers: ${achievableRange.join(', ')}`],
    suggestions: isAchievable ? [] : generateSuggestions(profile, params.difficulty, naturalTier),
  };
};

/**
 * Injects a manual challenge with automatic difficulty adjustment.
 * Builds the puzzle, adjusts obstructions to match target difficulty, and saves it.
 */
export const injectManualChallengeWithAdjustment = async (params: {
  text: string;
  author: string;
  targetDifficulty: number;
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
  const targetTier = difficultyToTier(params.targetDifficulty);

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
        suggestions: generateSuggestions(profile, params.targetDifficulty, naturalTier),
      },
      error: naturalPhase1.valid
        ? 'Text does not satisfy any supported difficulty tier.'
        : naturalPhase1.reasons.join('; '),
    };
  }

  if (!params.allowAdjustment) {
    const directPhase1 = pipeline.phase1(text, params.targetDifficulty);
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
          suggestions: generateSuggestions(profile, params.targetDifficulty, naturalTier),
        },
        error: directPhase1.reasons.join('; '),
      };
    }
  } else if (!achievableRange.includes(targetTier)) {
    return {
      success: false,
      feedback: {
        textProfile: profile,
        naturalDifficulty: naturalTier,
        achievableTierRange: achievableRange,
        budgetUsed: 0,
        budgetTotal: 0,
        adjustmentsMade: [],
          suggestions: generateSuggestions(profile, params.targetDifficulty, naturalTier),
        },
      error: `Target tier ${targetTier} not achievable with this text. Achievable tiers: ${achievableRange.join(', ')}`,
    };
  }
  
  let signatureOwnerToken = `pending:${crypto.randomUUID()}`;
  const dup = await pipeline.duplicate(text, signatureOwnerToken);
  
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
      : params.targetDifficulty;
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

        const budget = computeObstructionBudget(context);
        const adjusted = await adjustPuzzleDifficulty({
          basePuzzle: basePuzzle.puzzlePrivate,
          targetDifficulty: params.targetDifficulty,
          budget,
          maxIterations: 5,
          rng,
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
          suggestions:
            !adjusted.success || !adjusted.puzzle
              ? generateSuggestions(profile, params.targetDifficulty, naturalTier)
              : undefined,
        };

        if (!adjusted.success || !adjusted.puzzle) {
          throw new Error(adjusted.reason ?? 'Difficulty adjustment failed');
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
