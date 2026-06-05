import { context, reddit, redis } from '@devvit/web/server';
import { z } from 'zod';
import type {
  ChallengeType,
  DifficultyBreakdown,
  EndlessSort,
  PadlockChain,
  PuzzlePrivate,
  PuzzlePublic,
  UserProfile,
} from '../../shared/game';
import { dedupSignatureLookback } from '../../shared/puzzle-limits';
import type {
  CommunitySubmissionStatus,
} from '../../shared/community';
import {
  communitySubmissionSchema,
  communitySubmissionInputSchema,
  communityManualLayoutSchema,
  type CommunityManualLayout,
  type CommunityManualPadlock,
} from '../../shared/community';
import {
  buildAndSaveManualPuzzle,
  buildManualPuzzleWithSolverFallback,
  publishDailyPost,
} from './generator';
import {
  assessContentQuality,
  computePhraseDifficultyProfile,
  contentTokenSignature,
  containsDisallowedContent,
  difficultyToTier,
  isNearDuplicateSignature,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  maxPuzzleTotalLength,
  maxPuzzleWordLength,
  minPlayablePuzzleTotalLength,
  normalizeContent,
  rankDifficultyTiersForProfile,
  sanitizeAuthor,
  sanitizePhrase,
  type DifficultyTier,
  type HardnessBoundsByTier,
} from './content';
import { computeAdaptiveHardnessBounds } from './difficulty-calibration';
import { buildDifficultyBreakdown, difficultyModelVersion } from './difficulty-model';
import { getDecryptSettings } from './config';
import {
  getPuzzleMapping,
  getPuzzlePrivate,
  getPuzzlePublishedPostId,
  getRecentUsedSignatureEntries,
  getUsedSignatureOwner,
  peekNextLevelId,
  replacePuzzleDataInPlace,
} from './puzzle-store';
import { createValidationPipeline } from './validation-pipeline';
import { buildPuzzle, buildPublicPuzzle, estimateDifficultyFromObstructions } from './puzzle';
import { formatDateKey } from './serde';
import { getLevelEngagement, type LevelEngagement } from './engagement';
import { runDummySolver } from './dummy-solver';
import { validatePuzzle } from './validation';
import {
  keyCommunityApprovalLock,
  keyCommunityCreatorStats,
  keyCommunityPendingSignatures,
  keyCommunityPuzzlePlays,
  keyCommunityRemovedLevels,
  keyCommunitySubmission,
  keyCommunitySubmissionsApproved,
  keyCommunitySubmissionsByAuthor,
  keyCommunitySubmissionsByLevel,
  keyCommunitySubmissionsPending,
  keyCommunitySubmissionsRejected,
  keyCommunitySubmissionsRemoved,
  keyUserEndlessPlayed,
} from './keys';
import {
  getCompletedLevels,
  getFailedLevels,
  getUserProfile,
  saveUserProfile,
} from './state';

type CommunitySubmissionInput = z.infer<typeof communitySubmissionInputSchema>;

export type CommunitySubmission = z.infer<typeof communitySubmissionSchema>;

type CommunityPreviewResult = {
  valid: boolean;
  sanitizedTitle: string;
  sanitizedText: string;
  sanitizedAttribution: string;
  normalizedSig: string;
  tokenSig: string;
		  suggestedDifficulty: {
		    tier: DifficultyTier;
		    label: string;
		    estimatedDifficulty: number;
		    uniqueLetterCount: number;
		    cryptoHardness: number;
		    confidence?: number;
		    anchorDensity?: number;
		    solverSolvedRatio?: number;
		  };
	  reasons: string[];
	  suggestions: string[];
	  puzzlePreview: PuzzlePublic | null;
	  difficultyExplanation?: DifficultyBreakdown;
	};

type CommunityNotificationSummary = {
  creatorChangesRequestedCount: number;
  moderatorPendingReviewCount: number;
  moderatorRevisionReviewCount: number;
};

type CommunityEndlessCandidate = {
  submission: CommunitySubmission;
  levelId: string;
  approvedAt: number;
};

type CommunityEndlessScoredCandidate = CommunityEndlessCandidate & {
  engagement: LevelEngagement;
};

const hasRedisSortedSetScore = (score: unknown): boolean =>
  score !== null && score !== undefined;

const parseRedisSortedSetScore = (score: unknown): number | null => {
  if (typeof score === 'number' && Number.isFinite(score)) {
    return score;
  }
  if (typeof score === 'string' && score.trim().length > 0) {
    const parsed = Number(score);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const communityMinLength = minPlayablePuzzleTotalLength;
const communityMaxLength = maxPuzzleTotalLength;
const communityTitleMaxLength = 60;
const communityApprovalRewardCoins = 200;
const communityMakerFlair = 'Puzzle Maker';
const maxPendingCommunitySubmissionsPerUser = 3;
const approvalLockTtlMs = 120_000;
const defaultCommunityPreviewTitle = 'Can you decrypt this?';
const defaultCommunityTitle = 'Community Cipher';

const statusQueueKey = (status: CommunitySubmissionStatus): string | null => {
  if (status === 'pending') {
    return keyCommunitySubmissionsPending;
  }
  if (status === 'approved') {
    return keyCommunitySubmissionsApproved;
  }
  if (status === 'changes_requested') {
    return keyCommunitySubmissionsPending;
  }
  if (status === 'rejected') {
    return keyCommunitySubmissionsRejected;
  }
  if (status === 'removed') {
    return keyCommunitySubmissionsRemoved;
  }
  return null;
};

const assertUserId = (): string => {
  if (!context.userId) {
    throw new Error('User must be logged in.');
  }
  return context.userId;
};

const currentAuthorName = (): string => {
  const username = context.username?.trim();
  if (username && username.length > 0) {
    return username;
  }
  return 'unknown';
};

const getCreatorAvatarUrl = async (username: string): Promise<string | null> => {
  try {
    return (await reddit.getSnoovatarUrl(username)) ?? null;
  } catch (error) {
    console.warn('[community] Creator avatar lookup failed', {
      username,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const numberFromHash = (
  hash: Record<string, string>,
  field: string
): number | null => {
  const raw = hash[field];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const stringFromHash = (
  hash: Record<string, string>,
  field: string
): string | null => {
  const raw = hash[field];
  return raw === undefined || raw.length === 0 ? null : raw;
};

const parseManualLayoutHash = (
  hash: Record<string, string>
): CommunityManualLayout | null => {
  const raw = stringFromHash(hash, 'manualLayout');
  if (!raw) {
    return null;
  }
  try {
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = communityManualLayoutSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : null;
  } catch (_error) {
    return null;
  }
};

const parseSubmissionHash = (
  submissionId: string,
  hash: Record<string, string>
): CommunitySubmission | null => {
  if (Object.keys(hash).length === 0) {
    return null;
  }
  const parsed = communitySubmissionSchema.safeParse({
    submissionId,
	    authorId: hash.authorId,
	    authorName: hash.authorName,
	    title: stringFromHash(hash, 'title') ?? defaultCommunityTitle,
	    text: hash.text,
    normalizedSig: hash.normalizedSig,
    tokenSig: hash.tokenSig,
	    category: hash.category,
	    attribution: hash.attribution,
	    targetDifficulty: numberFromHash(hash, 'targetDifficulty'),
	    creationMode: stringFromHash(hash, 'creationMode') ?? 'auto',
	    manualLayout: parseManualLayoutHash(hash),
	    suggestedTier: hash.suggestedTier,
    status: hash.status,
    submittedAt: numberFromHash(hash, 'submittedAt'),
    reviewedBy: stringFromHash(hash, 'reviewedBy'),
    reviewedAt: numberFromHash(hash, 'reviewedAt'),
    rejectionReason: stringFromHash(hash, 'rejectionReason'),
    levelId: stringFromHash(hash, 'levelId'),
  });
  return parsed.success ? parsed.data : null;
};

const saveSubmission = async (submission: CommunitySubmission): Promise<void> => {
  await redis.hSet(keyCommunitySubmission(submission.submissionId), {
	    authorId: submission.authorId,
	    authorName: submission.authorName,
	    title: submission.title,
	    text: submission.text,
    normalizedSig: submission.normalizedSig,
    tokenSig: submission.tokenSig,
    category: submission.category,
	    attribution: submission.attribution,
	    targetDifficulty: `${submission.targetDifficulty}`,
	    creationMode: submission.creationMode,
	    manualLayout:
	      submission.manualLayout === null ? '' : JSON.stringify(submission.manualLayout),
	    suggestedTier: submission.suggestedTier,
    status: submission.status,
    submittedAt: `${submission.submittedAt}`,
    reviewedBy: submission.reviewedBy ?? '',
    reviewedAt: submission.reviewedAt === null ? '' : `${submission.reviewedAt}`,
    rejectionReason: submission.rejectionReason ?? '',
    levelId: submission.levelId ?? '',
  });
};

export const getCommunitySubmission = async (
  submissionId: string
): Promise<CommunitySubmission | null> => {
  const hash = await redis.hGetAll(keyCommunitySubmission(submissionId));
  return parseSubmissionHash(submissionId, hash);
};

const countPendingSubmissionsForAuthor = async (userId: string): Promise<number> => {
  const entries = await redis.zRange(keyCommunitySubmissionsByAuthor(userId), 0, -1, {
    by: 'rank',
    reverse: true,
  });
  let pending = 0;
  for (const entry of entries) {
    const submission = await getCommunitySubmission(entry.member);
    if (submission?.status === 'pending') {
      pending += 1;
    }
  }
  return pending;
};

const inferSuggestedTier = (
  text: string,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): DifficultyTier => {
  const profile = computePhraseDifficultyProfile(text);
  return (
    rankDifficultyTiersForProfile(profile, hardnessBoundsByTier)[0]?.tier ??
    difficultyToTier(5)
  );
};

const validateCommunityText = (params: {
  title: string;
  text: string;
  attribution: string;
}): {
  sanitizedTitle: string;
  sanitizedText: string;
  sanitizedAttribution: string;
  reasons: string[];
} => {
  const sanitizedTitle = sanitizePhrase(params.title);
  const sanitizedText = sanitizePhrase(params.text);
  const sanitizedAttribution = sanitizeAuthor(params.attribution);
  const reasons: string[] = [];

  if (!sanitizedTitle) {
    reasons.push('Challenge title is required.');
  } else if (sanitizedTitle.length > communityTitleMaxLength) {
    reasons.push(`Challenge title must be ${communityTitleMaxLength} characters or fewer.`);
  }
  if (containsDisallowedContent(sanitizedTitle)) {
    reasons.push('Challenge title contains disallowed content.');
  }
  if (sanitizedText.length < communityMinLength) {
    reasons.push(`Challenge text must be at least ${communityMinLength} characters.`);
  }
  if (sanitizedText.length > communityMaxLength) {
    reasons.push(`Challenge text must be ${communityMaxLength} characters or fewer.`);
  }
  if (sanitizedText.split(/\s+/g).some((word) => word.length > maxPuzzleWordLength)) {
    reasons.push(`Every word must fit within ${maxPuzzleWordLength} letter tiles.`);
  }
  if (containsDisallowedContent(sanitizedText)) {
    reasons.push('Challenge text contains disallowed content.');
  }
  reasons.push(...assessContentQuality(sanitizedText));
  if (!sanitizedAttribution || !looksLikeAllowedAuthor(sanitizedAttribution)) {
    reasons.push('Author / Source is required and must use letters, numbers, spaces, dots, apostrophes, or dashes.');
  } else if (sanitizedAttribution.length > maxPuzzleAuthorLength) {
    reasons.push(`Author / Source must be ${maxPuzzleAuthorLength} characters or fewer.`);
  }

  return {
    sanitizedTitle,
    sanitizedText,
    sanitizedAttribution,
    reasons,
  };
};

const getHardnessBounds = async (): Promise<
  Partial<HardnessBoundsByTier> | undefined
> => {
  try {
    return await computeAdaptiveHardnessBounds();
  } catch (error) {
    console.warn(
      `Community validation using default hardness bounds: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    );
    return undefined;
  }
};

const previousLevelId = (levelId: string): string | null => {
  const match = /^(.*?)(\d+)$/.exec(levelId);
  if (!match) {
    return null;
  }
  const prefix = match[1] ?? '';
  const numericText = match[2] ?? '';
  const numeric = Number(numericText);
  if (!Number.isFinite(numeric) || numeric <= 1) {
    return null;
  }
  return `${prefix}${`${numeric - 1}`.padStart(numericText.length, '0')}`;
};

const previousMappingForLevel = async (
  levelId: string
): Promise<Record<string, number> | null> => {
  const previousId = previousLevelId(levelId);
  return previousId ? await getPuzzleMapping(previousId) : null;
};

const duplicateReasons = async (params: {
  normalizedSig: string;
  tokenSig: string;
}): Promise<string[]> => {
  const reasons: string[] = [];
  const existingOwner = await getUsedSignatureOwner(params.normalizedSig);
  if (existingOwner) {
    reasons.push('This text already exists in the puzzle catalog.');
  }
  const pendingOwner = await redis.hGet(
    keyCommunityPendingSignatures,
    params.normalizedSig
  );
  if (pendingOwner) {
    reasons.push('This text is already waiting for review.');
  }
  const recent = await getRecentUsedSignatureEntries(dedupSignatureLookback);
  const nearDuplicate = isNearDuplicateSignature({
    candidateNormalizedSignature: params.normalizedSig,
    candidateTokenSignature: params.tokenSig,
    recent,
  });
  if (nearDuplicate.duplicate) {
    reasons.push(`This text is too close to existing content (${nearDuplicate.reason ?? 'near duplicate'}).`);
  }
  return reasons;
};

const exactDuplicateReasonForRevision = async (params: {
  normalizedSig: string;
  submissionId: string;
  allowedLevelId: string | null;
}): Promise<string | null> => {
  const existingOwner = await getUsedSignatureOwner(params.normalizedSig);
  if (existingOwner && existingOwner !== params.allowedLevelId) {
    return 'This text already exists in the puzzle catalog.';
  }
  const pendingOwner = await redis.hGet(
    keyCommunityPendingSignatures,
    params.normalizedSig
  );
  if (pendingOwner && pendingOwner !== params.submissionId) {
    return 'This text is already waiting for review.';
  }
  return null;
};

const uniqueSortedNumbers = (values: number[]): number[] =>
  Array.from(new Set(values.filter((value) => Number.isInteger(value) && value >= 0))).sort(
    (a, b) => a - b
  );

const normalizeManualPadlocks = (
  layout: CommunityManualLayout | null | undefined
): CommunityManualPadlock[] => {
  const sourcePadlocks =
    layout?.padlocks && layout.padlocks.length > 0
      ? layout.padlocks
      : (layout?.lockIndices && layout.lockIndices.length > 0) ||
          (layout?.lockKeyIndices && layout.lockKeyIndices.length > 0)
        ? [
	            {
	              padlockId: 1,
	              lockedIndices: layout?.lockIndices ?? [],
	              keyIndices: layout?.lockKeyIndices ?? [],
	            },
          ]
        : [];
  const usedIds = new Set<number>();
  let nextId = 1;
  return sourcePadlocks
    .map((padlock) => {
      let padlockId = padlock.padlockId;
      if (!Number.isInteger(padlockId) || padlockId <= 0 || usedIds.has(padlockId)) {
        while (usedIds.has(nextId)) {
          nextId += 1;
        }
        padlockId = nextId;
      }
      usedIds.add(padlockId);
      return {
        padlockId,
        lockedIndices: uniqueSortedNumbers(padlock.lockedIndices),
        keyIndices: uniqueSortedNumbers(padlock.keyIndices),
      };
    })
    .filter(
      (padlock) =>
        padlock.lockedIndices.length > 0 || padlock.keyIndices.length > 0
    );
};

const normalizeManualLayout = (
  layout: CommunityManualLayout | null | undefined
): CommunityManualLayout => {
  const padlocks = normalizeManualPadlocks(layout);
  return {
    prefilledIndices: uniqueSortedNumbers(layout?.prefilledIndices ?? []),
    prefilledWordIndices: uniqueSortedNumbers(layout?.prefilledWordIndices ?? []),
    blindIndices: uniqueSortedNumbers(layout?.blindIndices ?? []),
    lockIndices: uniqueSortedNumbers(
      padlocks.flatMap((padlock) => padlock.lockedIndices)
    ),
    lockKeyIndices: uniqueSortedNumbers(
      padlocks.flatMap((padlock) => padlock.keyIndices)
    ),
    padlocks,
  };
};

const communityTierLabel = (difficulty: number): string => {
  const tier = difficultyToTier(difficulty);
  return tier === 'warmup'
    ? 'Easy'
    : tier.charAt(0).toUpperCase() + tier.slice(1);
};

const buildCommunityTierFitMessage = (targetDifficulty: number): string => {
  const label = communityTierLabel(targetDifficulty);
  if (targetDifficulty <= 3) {
    return `This quote is too complex for ${label}. Try Medium, or use a shorter quote with more repeated letters.`;
  }
  if (targetDifficulty >= 9) {
    return `This quote is too gentle for ${label}. Try Hard, or use a quote with more varied letters and words.`;
  }
  return `This quote does not fit ${label}. Try a nearby tier, or edit the quote so the letter mix is easier to build.`;
};

const prefilledIndicesFromWords = (
  puzzle: PuzzlePrivate,
  wordIndices: number[]
): number[] => {
  const selectedWords = new Set(wordIndices);
  return puzzle.tiles
    .filter((tile) => tile.isLetter && selectedWords.has(tile.wordIndex))
    .map((tile) => tile.index);
};

const invalidManualTileIndices = (
  puzzle: PuzzlePrivate,
  indices: number[]
): number[] =>
  indices.filter((index) => {
    const tile = puzzle.tiles[index];
    return !tile || !tile.isLetter;
  });

const expandManualPadlockLocks = (
  puzzle: PuzzlePrivate,
  padlocks: CommunityManualPadlock[],
  prefilledIndices: number[],
  blindIndices: number[]
): CommunityManualPadlock[] => {
  const prefilledSet = new Set(prefilledIndices);
  const blindSet = new Set(blindIndices);
  return padlocks.map((padlock) => {
    const samePadlockKeySet = new Set(padlock.keyIndices);
    const otherBoundSet = new Set<number>();
    for (const other of padlocks) {
      for (const index of other.keyIndices) {
        otherBoundSet.add(index);
      }
      if (other.padlockId !== padlock.padlockId) {
        for (const index of other.lockedIndices) {
          otherBoundSet.add(index);
        }
      }
    }

    const expandedLocks: number[] = [];
    for (const index of padlock.lockedIndices) {
      const tile = puzzle.tiles[index];
      if (!tile || !tile.isLetter) {
        expandedLocks.push(index);
        continue;
      }
      for (const candidate of puzzle.tiles) {
        if (
          candidate.isLetter &&
          candidate.char === tile.char &&
          !prefilledSet.has(candidate.index) &&
          !blindSet.has(candidate.index) &&
          !samePadlockKeySet.has(candidate.index) &&
          !otherBoundSet.has(candidate.index)
        ) {
          expandedLocks.push(candidate.index);
        }
      }
    }
    return {
      ...padlock,
      lockedIndices: uniqueSortedNumbers(expandedLocks),
    };
  });
};

const validationReasonsForManualPuzzle = (puzzle: PuzzlePrivate): string[] =>
  validatePuzzle(puzzle).reasons.filter(
    (reason) => reason !== 'A multi-letter word is fully prefilled.'
  );

const blindTileFixReasons = (
  puzzle: PuzzlePrivate,
  blindIndices: number[]
): string[] => {
  const blindSet = new Set(blindIndices);
  const reasons: string[] = [];
  for (const index of blindIndices) {
    const tile = puzzle.tiles[index];
    if (!tile || !tile.isLetter) {
      continue;
    }
    const word = puzzle.words[tile.wordIndex];
    if (!word || word.length < 5) {
      reasons.push('Move ? marks out of very short words. Use them on words with 5 or more letters.');
      continue;
    }
    const hasVisibleMatch = puzzle.tiles.some(
      (other) =>
        other.index !== tile.index &&
        other.isLetter &&
        other.char === tile.char &&
        !blindSet.has(other.index)
    );
    if (!hasVisibleMatch) {
      reasons.push(
        `The ? on letter ${tile.char} needs another visible ${tile.char} elsewhere. Reveal or unmark one matching letter.`
      );
    }
  }
  return Array.from(new Set(reasons));
};

const creatorFriendlyValidationReasons = (
  puzzle: PuzzlePrivate,
  blindIndices: number[]
): string[] => {
  const reasons: string[] = [];
  for (const reason of validationReasonsForManualPuzzle(puzzle)) {
    if (reason === 'Blind tile fairness check failed.') {
      reasons.push(...blindTileFixReasons(puzzle, blindIndices));
      continue;
    }
    if (reason === 'No starter clue on board.') {
      reasons.push('Reveal at least one starting letter.');
      continue;
    }
    if (reason === 'Padlock chain locks its own key tiles.') {
      reasons.push('A padlock cannot use one of its own locked letters as the key. Move the key to an unlocked letter.');
      continue;
    }
    if (reason === 'Padlock dependency loop detected.') {
      reasons.push('Padlocks cannot depend on each other in a loop. Move one key to an unlocked letter.');
      continue;
    }
    reasons.push(reason);
  }
  return Array.from(new Set(reasons));
};

const buildManualLayoutPuzzlePreview = async (params: {
  text: string;
  attribution: string;
  category: ChallengeType;
  manualLayout: CommunityManualLayout;
  levelId?: string;
  previousMapping?: Record<string, number> | null;
}): Promise<{
  puzzle: PuzzlePublic | null;
  puzzlePrivate: PuzzlePrivate | null;
  reasons: string[];
}> => {
  try {
    const settings = await getDecryptSettings();
    const previewLevelId = params.levelId ?? (await peekNextLevelId());
    const base = buildPuzzle({
      levelId: previewLevelId,
      dateKey: formatDateKey(new Date()),
      text: params.text,
      author: params.attribution,
      challengeType: params.category,
      source: 'COMMUNITY',
      difficulty: 5,
      logicalPercent: settings.logicalCipherPercent,
      previousMapping:
        params.previousMapping === undefined
          ? await previousMappingForLevel(previewLevelId)
          : params.previousMapping,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: false,
    });
    const layout = normalizeManualLayout(params.manualLayout);
    const reasons: string[] = [];
    const legacyWordPrefills = prefilledIndicesFromWords(
      base.puzzlePrivate,
      layout.prefilledWordIndices
    );
    const prefilledIndices = uniqueSortedNumbers([
      ...layout.prefilledIndices,
      ...legacyWordPrefills,
    ]);
    if (prefilledIndices.length === 0) {
      reasons.push('Reveal at least one starting letter.');
    }
    if (layout.prefilledWordIndices.some((index) => index >= base.puzzlePrivate.words.length)) {
      reasons.push('One selected pre-revealed word no longer exists in this text.');
    }
    const invalidPrefills = invalidManualTileIndices(base.puzzlePrivate, prefilledIndices);
    if (invalidPrefills.length > 0) {
      reasons.push('Reveals can only be placed on letters.');
    }
    const invalidBlind = invalidManualTileIndices(base.puzzlePrivate, layout.blindIndices);
    if (invalidBlind.length > 0) {
      reasons.push('Question marks can only be placed on letters.');
    }
    const invalidLocks = invalidManualTileIndices(base.puzzlePrivate, layout.lockIndices);
    if (invalidLocks.length > 0) {
      reasons.push('Locks can only be placed on letters.');
    }
    const invalidKeys = invalidManualTileIndices(base.puzzlePrivate, layout.lockKeyIndices);
    if (invalidKeys.length > 0) {
      reasons.push('Lock keys can only be placed on letters.');
    }
    const prefilledSet = new Set(prefilledIndices);
    const blindIndices = layout.blindIndices.filter((index) => !prefilledSet.has(index));
    const blindSet = new Set(blindIndices);
    const manualPadlocks = expandManualPadlockLocks(
      base.puzzlePrivate,
      layout.padlocks,
      prefilledIndices,
      blindIndices
    );

    const duplicatePadlockTiles = new Set<number>();
    const seenPadlockTiles = new Set<number>();
    for (const index of manualPadlocks.flatMap((padlock) => [
      ...padlock.lockedIndices,
      ...padlock.keyIndices,
    ])) {
      if (seenPadlockTiles.has(index)) {
        duplicatePadlockTiles.add(index);
      }
      seenPadlockTiles.add(index);
    }
    if (duplicatePadlockTiles.size > 0) {
      reasons.push('Each tile can belong to only one padlock or key. Move the repeated padlock marks.');
    }

    const padlockChains: PadlockChain[] = [];
    for (const padlock of manualPadlocks) {
      const rawLockedSet = new Set(padlock.lockedIndices);
      const lockedIndices = padlock.lockedIndices.filter(
        (index) => !prefilledSet.has(index) && !blindSet.has(index)
      );
      const keyIndices = padlock.keyIndices.filter(
        (index) =>
          !prefilledSet.has(index) &&
          !rawLockedSet.has(index)
      );
      if (padlock.lockedIndices.length > 0 && keyIndices.length === 0) {
        reasons.push(`Lock ${padlock.padlockId} needs one or two key tiles.`);
      }
      if (padlock.keyIndices.length > 2) {
        reasons.push(`Lock ${padlock.padlockId} can use at most two key tiles.`);
      }
      if (padlock.keyIndices.length > 0 && lockedIndices.length === 0) {
        reasons.push(`Lock ${padlock.padlockId} needs at least one locked tile.`);
      }
      if (padlock.keyIndices.some((index) => rawLockedSet.has(index))) {
        reasons.push(`Lock ${padlock.padlockId} cannot use a locked tile as its own key.`);
      }
      if (lockedIndices.length > 0 && keyIndices.length > 0 && keyIndices.length <= 2) {
        padlockChains.push({
          chainId: padlock.padlockId,
          keyIndices,
          lockedIndices,
        });
      }
    }
    const lockIndices = uniqueSortedNumbers(
      padlockChains.flatMap((padlock) => padlock.lockedIndices)
    );
	    const estimatedDifficulty = estimateDifficultyFromObstructions({
	      ...base.puzzlePrivate,
	      prefilledIndices,
	      blindIndices,
	      lockIndices,
	      padlockChains,
	    });
	    const puzzleCandidate: PuzzlePrivate = {
	      ...base.puzzlePrivate,
	      prefilledIndices,
	      revealedIndices: prefilledIndices,
	      revealed_indices: prefilledIndices,
	      blindIndices,
	      lockIndices,
	      padlockChains,
	      goldIndex: null,
	      difficulty: estimatedDifficulty,
	    };
	    const difficultyBreakdown = buildDifficultyBreakdown(puzzleCandidate);
	    const puzzlePrivate: PuzzlePrivate = {
	      ...puzzleCandidate,
	      difficulty: difficultyBreakdown.calibratedDifficulty,
	      difficultyModelVersion,
	      difficultyBreakdown,
	    };
	    reasons.push(...creatorFriendlyValidationReasons(puzzlePrivate, blindIndices));
	    const solver = runDummySolver({
      puzzle: puzzlePrivate,
      revealedIndices: prefilledIndices,
      forbiddenIndices: blindIndices,
      requiredSolveRatio: 0.65,
      solverProfile: 'deep',
	    });
	    if (!solver.solvable || solver.blindGuessRequired || solver.solvedRatio < 0.65) {
	      reasons.push('This layout is too hard for the fairness checker. Add another revealed word or remove obstructions.');
	    }
	    return {
      puzzle: buildPublicPuzzle(puzzlePrivate, [], undefined, {
        disableFallbackStarter: true,
      }),
      puzzlePrivate: reasons.length === 0 ? puzzlePrivate : null,
      reasons,
    };
  } catch (error) {
    return {
      puzzle: null,
      puzzlePrivate: null,
      reasons: [
        error instanceof Error
          ? `Could not build a custom preview: ${error.message}`
          : 'Could not build a custom preview.',
      ],
    };
  }
};

const buildEphemeralPuzzlePreview = async (params: {
  text: string;
  attribution: string;
  category: ChallengeType;
  targetDifficulty: number;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}): Promise<{ puzzle: PuzzlePublic | null; reasons: string[] }> => {
  const pipeline = createValidationPipeline(params.hardnessBoundsByTier);
  const phase1 = pipeline.phase1(params.text, params.targetDifficulty);
  if (!phase1.valid) {
    return {
      puzzle: null,
      reasons: [buildCommunityTierFitMessage(params.targetDifficulty)],
    };
  }

  try {
    const [settings, previewLevelId] = await Promise.all([
      getDecryptSettings(),
      peekNextLevelId(),
    ]);
    const built = buildManualPuzzleWithSolverFallback({
      levelId: previewLevelId,
      dateKey: formatDateKey(new Date()),
      text: params.text,
      author: params.attribution,
      challengeType: params.category,
      source: 'COMMUNITY',
      difficulty: params.targetDifficulty,
      logicalPercent: settings.logicalCipherPercent,
      previousMapping: await previousMappingForLevel(previewLevelId),
    });
    const phase2 = pipeline.phase2(built.puzzlePrivate);
    if (!phase2.valid) {
      return {
        puzzle: null,
        reasons: phase2.reasons,
      };
    }
    return {
      puzzle: built.puzzlePublic,
      reasons: [],
    };
  } catch (error) {
    return {
      puzzle: null,
      reasons: [
        error instanceof Error
          ? `Could not build a fair preview: ${error.message}`
          : 'Could not build a fair preview.',
      ],
    };
  }
};

export const previewCommunitySubmission = async (
  input: CommunitySubmissionInput
): Promise<CommunityPreviewResult> => {
  const hardnessBoundsByTier = await getHardnessBounds();
  const { sanitizedTitle, sanitizedText, sanitizedAttribution, reasons } = validateCommunityText({
    title: input.title,
    text: input.text,
    attribution: input.attribution,
  });
  const normalizedSig = normalizeContent(sanitizedText);
  const tokenSig = contentTokenSignature(sanitizedText);
  const profile = computePhraseDifficultyProfile(sanitizedText);
  const duplicateFailures =
    normalizedSig.length > 0
      ? await duplicateReasons({ normalizedSig, tokenSig })
      : ['Challenge text cannot be empty after cleanup.'];
  const baseValid = reasons.length === 0 && duplicateFailures.length === 0;
  const manualLayout = normalizeManualLayout(input.manualLayout);
  const manualPreview =
    input.creationMode === 'manual' && baseValid
      ? await buildManualLayoutPuzzlePreview({
          text: sanitizedText,
          attribution: sanitizedAttribution,
          category: input.category,
          manualLayout,
        })
      : null;
  const preview =
    input.creationMode === 'manual'
      ? manualPreview ?? { puzzle: null, puzzlePrivate: null, reasons: [] }
      : baseValid
        ? await buildEphemeralPuzzlePreview({
            text: sanitizedText,
            attribution: sanitizedAttribution,
            category: input.category,
            targetDifficulty: input.targetDifficulty,
            hardnessBoundsByTier,
          })
        : { puzzle: null, reasons: [] };
  const allReasons = [...reasons, ...duplicateFailures, ...preview.reasons];
	  const difficultyExplanation =
	    input.creationMode === 'manual' && manualPreview?.puzzlePrivate?.difficultyBreakdown
	      ? manualPreview.puzzlePrivate.difficultyBreakdown
	      : null;
	  const estimatedDifficulty =
	    input.creationMode === 'manual' && manualPreview?.puzzlePrivate
	      ? manualPreview.puzzlePrivate.difficulty
	      : input.targetDifficulty;
  const suggestedTier =
    input.creationMode === 'manual'
      ? difficultyToTier(estimatedDifficulty)
      : inferSuggestedTier(sanitizedText, hardnessBoundsByTier);
		return {
		  valid: allReasons.length === 0,
	  sanitizedTitle,
	  sanitizedText,
    sanitizedAttribution,
    normalizedSig,
    tokenSig,
	    suggestedDifficulty: {
	      tier: suggestedTier,
	      label:
	        input.creationMode === 'manual'
	          ? `${suggestedTier} layout difficulty estimate`
	          : `${suggestedTier} text difficulty estimate`,
		      estimatedDifficulty,
		      uniqueLetterCount: profile.uniqueLetterCount,
		      cryptoHardness: profile.cryptoHardness,
		      confidence: difficultyExplanation?.difficultyConfidence,
		      anchorDensity: difficultyExplanation?.humanFeatures.anchorDensity,
		      solverSolvedRatio: difficultyExplanation?.fairnessSummary.solvedRatio,
		    },
	    reasons: allReasons,
	    suggestions:
	      allReasons.length === 0
	        ? [
	            ...(difficultyExplanation?.humanFeatures.revealedAnchorCoverage !== undefined &&
	            difficultyExplanation.humanFeatures.revealedAnchorCoverage < 0.35
	              ? ['Add one revealed anchor word or a common short word to make the solve path clearer.']
	              : []),
	            ...(difficultyExplanation?.humanFeatures.anchorDensity !== undefined &&
	            difficultyExplanation.humanFeatures.anchorDensity < 0.15
	              ? ['This text has few natural anchors. Remove one blind tile or reveal a common letter if it feels too hard.']
	              : []),
	          ]
	        : [
	            `Try a clear, attributed line between ${communityMinLength} and ${communityMaxLength} characters.`,
	          ],
	    puzzlePreview: preview.puzzle,
	    difficultyExplanation: difficultyExplanation ?? undefined,
	  };
};

export const submitCommunitySubmission = async (
  input: CommunitySubmissionInput
): Promise<CommunitySubmission> => {
  const userId = assertUserId();
  const pendingCount = await countPendingSubmissionsForAuthor(userId);
  if (pendingCount >= maxPendingCommunitySubmissionsPerUser) {
    throw new Error(
      `You already have ${maxPendingCommunitySubmissionsPerUser} submissions under review. Please wait for moderator review before sending another.`
    );
  }
  const preview = await previewCommunitySubmission(input);
  if (!preview.valid) {
    throw new Error(preview.reasons[0] ?? 'Submission is not valid.');
  }
  const submissionId = crypto.randomUUID();
  const submittedAt = Date.now();
  const reserved = await redis.hSetNX(
    keyCommunityPendingSignatures,
    preview.normalizedSig,
    submissionId
  );
  if (reserved !== 1) {
    throw new Error('This text is already waiting for review.');
  }
  const submission = communitySubmissionSchema.parse({
    submissionId,
	    authorId: userId,
	    authorName: currentAuthorName(),
	    title: preview.sanitizedTitle,
	    text: preview.sanitizedText,
    normalizedSig: preview.normalizedSig,
    tokenSig: preview.tokenSig,
	    category: input.category,
	    attribution: preview.sanitizedAttribution,
	    targetDifficulty:
	      input.creationMode === 'manual'
	        ? preview.suggestedDifficulty.estimatedDifficulty
	        : input.targetDifficulty,
	    creationMode: input.creationMode,
	    manualLayout:
	      input.creationMode === 'manual' ? normalizeManualLayout(input.manualLayout) : null,
	    suggestedTier: preview.suggestedDifficulty.tier,
    status: 'pending',
    submittedAt,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    levelId: null,
  });
  await saveSubmission(submission);
  await Promise.all([
    redis.zAdd(keyCommunitySubmissionsPending, {
      member: submissionId,
      score: submittedAt,
    }),
    redis.zAdd(keyCommunitySubmissionsByAuthor(userId), {
      member: submissionId,
      score: submittedAt,
    }),
    redis.hIncrBy(keyCommunityCreatorStats(userId), 'submitted', 1),
  ]);
  return submission;
};

const loadSubmissions = async (ids: string[]): Promise<CommunitySubmission[]> => {
  const submissions: CommunitySubmission[] = [];
  for (const submissionId of ids) {
    const submission = await getCommunitySubmission(submissionId);
    if (submission) {
      submissions.push(submission);
    }
  }
  return submissions;
};

export const listMyCommunitySubmissions = async (
  limit: number
): Promise<CommunitySubmission[]> => {
  const userId = assertUserId();
  const entries = await redis.zRange(
    keyCommunitySubmissionsByAuthor(userId),
    0,
    Math.max(0, limit - 1),
    { by: 'rank', reverse: true }
  );
  return await loadSubmissions(entries.map((entry) => entry.member));
};

export const listCommunitySubmissionsForReview = async (params: {
  status: CommunitySubmissionStatus;
  limit: number;
}): Promise<CommunitySubmission[]> => {
  const queueKey = statusQueueKey(params.status);
  if (!queueKey) {
    return [];
  }
  const entries = await redis.zRange(queueKey, 0, Math.max(0, params.limit - 1), {
    by: 'rank',
    reverse: params.status !== 'pending',
  });
  const submissions = await loadSubmissions(entries.map((entry) => entry.member));
  return submissions.filter((submission) => submission.status === params.status);
};

export const getCommunityNotificationSummary = async (params: {
  userId: string;
  isModerator: boolean;
}): Promise<CommunityNotificationSummary> => {
  const authorEntries = await redis.zRange(
    keyCommunitySubmissionsByAuthor(params.userId),
    0,
    -1,
    { by: 'rank', reverse: true }
  );
  const authorSubmissions = await loadSubmissions(
    authorEntries.map((entry) => entry.member)
  );
  const creatorChangesRequestedCount = authorSubmissions.filter(
    (submission) => submission.status === 'changes_requested'
  ).length;

  if (!params.isModerator) {
    return {
      creatorChangesRequestedCount,
      moderatorPendingReviewCount: 0,
      moderatorRevisionReviewCount: 0,
    };
  }

  const pendingEntries = await redis.zRange(keyCommunitySubmissionsPending, 0, -1, {
    by: 'rank',
    reverse: true,
  });
  const pendingSubmissions = await loadSubmissions(
    pendingEntries.map((entry) => entry.member)
  );
  const pendingReviewSubmissions = pendingSubmissions.filter(
    (submission) => submission.status === 'pending'
  );
  const moderatorRevisionReviewCount = pendingReviewSubmissions.filter(
    (submission) => submission.levelId !== null
  ).length;

  return {
    creatorChangesRequestedCount,
    moderatorPendingReviewCount: pendingReviewSubmissions.length,
    moderatorRevisionReviewCount,
  };
};

export const withdrawCommunitySubmission = async (
  submissionId: string
): Promise<CommunitySubmission> => {
  const userId = assertUserId();
  const submission = await getCommunitySubmission(submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.authorId !== userId) {
    throw new Error('Only the creator can withdraw this submission.');
  }
  if (submission.status !== 'pending' && submission.status !== 'changes_requested') {
    throw new Error('Only pending submissions or requested changes can be withdrawn.');
  }
  const next: CommunitySubmission = {
    ...submission,
    status: 'withdrawn',
    rejectionReason: null,
  };
  await saveSubmission(next);
  await Promise.all([
    redis.zRem(keyCommunitySubmissionsPending, [submissionId]),
    redis.hDel(keyCommunityPendingSignatures, [submission.normalizedSig]),
    redis.hIncrBy(keyCommunityCreatorStats(userId), 'withdrawn', 1),
  ]);
  return next;
};

const rewardCreatorOnApproval = async (
  submission: CommunitySubmission
): Promise<UserProfile> => {
  const profile = await getUserProfile(submission.authorId);
  const unlockedFlairs = profile.unlockedFlairs.includes(communityMakerFlair)
    ? profile.unlockedFlairs
    : [...profile.unlockedFlairs, communityMakerFlair];
  const nextProfile: UserProfile = {
    ...profile,
    coins: profile.coins + communityApprovalRewardCoins,
    unlockedFlairs,
  };
  await saveUserProfile(submission.authorId, nextProfile);
  await Promise.all([
    redis.hIncrBy(keyCommunityCreatorStats(submission.authorId), 'coinsEarned', communityApprovalRewardCoins),
    redis.hSet(keyCommunitySubmission(submission.submissionId), {
      approvalRewardPaidAt: `${Date.now()}`,
    }),
  ]);
  return nextProfile;
};

const buildApprovedCommunityPuzzle = async (
  submission: CommunitySubmission
): Promise<{
  levelId: string;
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
}> => {
  const duplicateOwner = await getUsedSignatureOwner(submission.normalizedSig);
  if (duplicateOwner) {
    throw new Error('Submission now duplicates an existing puzzle.');
  }
  const settings = await getDecryptSettings();
  const saved = await buildAndSaveManualPuzzle({
    signatureOwnerToken: `community:${submission.submissionId}`,
    normalizedSignature: submission.normalizedSig,
    tokenSignature: submission.tokenSig,
	    buildPreparedPuzzle: async ({ nextLevelId, previousMapping }) => {
	      if (submission.creationMode === 'manual' && submission.manualLayout) {
	        const built = await buildManualLayoutPuzzlePreview({
	          levelId: nextLevelId,
	          previousMapping,
	          text: submission.text,
	          attribution: submission.attribution,
	          category: submission.category,
	          manualLayout: submission.manualLayout,
	        });
	        if (!built.puzzlePrivate) {
	          throw new Error(built.reasons[0] ?? 'Custom layout is no longer valid.');
	        }
	        return {
	          puzzlePrivate: built.puzzlePrivate,
	          puzzlePublic: buildPublicPuzzle(built.puzzlePrivate, []),
	        };
	      }
	      const base = buildManualPuzzleWithSolverFallback({
	        levelId: nextLevelId,
	        dateKey: formatDateKey(new Date()),
	        text: submission.text,
	        author: submission.attribution,
	        challengeType: submission.category,
	        source: 'COMMUNITY',
	        difficulty: submission.targetDifficulty,
	        logicalPercent: settings.logicalCipherPercent,
	        previousMapping,
	      });
      return {
        puzzlePrivate: base.puzzlePrivate,
        puzzlePublic: buildPublicPuzzle(base.puzzlePrivate, []),
      };
    },
  });
  return {
    levelId: saved.levelId,
    puzzlePrivate: saved.puzzlePrivate,
    puzzlePublic: saved.puzzlePublic,
  };
};

const buildReplacementCommunityPuzzle = async (params: {
  submission: CommunitySubmission;
  existingPuzzle: PuzzlePrivate;
}): Promise<{
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
}> => {
  const previousMapping = await previousMappingForLevel(params.existingPuzzle.levelId);
  if (params.submission.creationMode === 'manual' && params.submission.manualLayout) {
    const built = await buildManualLayoutPuzzlePreview({
      levelId: params.existingPuzzle.levelId,
      previousMapping,
      text: params.submission.text,
      attribution: params.submission.attribution,
      category: params.submission.category,
      manualLayout: params.submission.manualLayout,
    });
    if (!built.puzzlePrivate) {
      throw new Error(built.reasons[0] ?? 'Custom layout is no longer valid.');
    }
    const puzzlePrivate: PuzzlePrivate = {
      ...built.puzzlePrivate,
      dateKey: params.existingPuzzle.dateKey,
      createdAt: params.existingPuzzle.createdAt,
      levelId: params.existingPuzzle.levelId,
    };
    return {
      puzzlePrivate,
      puzzlePublic: buildPublicPuzzle(puzzlePrivate, []),
    };
  }

  const settings = await getDecryptSettings();
  const built = buildManualPuzzleWithSolverFallback({
    levelId: params.existingPuzzle.levelId,
    dateKey: params.existingPuzzle.dateKey,
    text: params.submission.text,
    author: params.submission.attribution,
    challengeType: params.submission.category,
    source: 'COMMUNITY',
    difficulty: params.submission.targetDifficulty,
    logicalPercent: settings.logicalCipherPercent,
    previousMapping,
  });
  const puzzlePrivate: PuzzlePrivate = {
    ...built.puzzlePrivate,
    createdAt: params.existingPuzzle.createdAt,
    levelId: params.existingPuzzle.levelId,
  };
  return {
    puzzlePrivate,
    puzzlePublic: buildPublicPuzzle(puzzlePrivate, []),
  };
};

const replaceApprovedCommunityPuzzleInPlace = async (params: {
  submission: CommunitySubmission;
  existingPuzzle: PuzzlePrivate;
  previousNormalizedSignature: string;
}): Promise<void> => {
  const textChanged = sanitizePhrase(params.existingPuzzle.targetText) !== params.submission.text;
  if (textChanged) {
    const engagement = await getLevelEngagement(params.existingPuzzle.levelId);
    if (engagement.plays > 0) {
      throw new Error(
        'This puzzle has already been played. Remove it and submit the corrected version as a new challenge.'
      );
    }
    const replacement = await buildReplacementCommunityPuzzle({
      submission: params.submission,
      existingPuzzle: params.existingPuzzle,
    });
    await replacePuzzleDataInPlace({
      levelId: params.existingPuzzle.levelId,
      puzzlePrivate: replacement.puzzlePrivate,
      puzzlePublic: replacement.puzzlePublic,
      normalizedSignature: params.submission.normalizedSig,
      tokenSignature: params.submission.tokenSig,
      previousNormalizedSignature: params.previousNormalizedSignature,
    });
    return;
  }

  const puzzlePrivate: PuzzlePrivate = {
    ...params.existingPuzzle,
    author: params.submission.attribution,
    challengeType: params.submission.category,
  };
  await replacePuzzleDataInPlace({
    levelId: params.existingPuzzle.levelId,
    puzzlePrivate,
    puzzlePublic: buildPublicPuzzle(puzzlePrivate, []),
    normalizedSignature: params.submission.normalizedSig,
    tokenSignature: params.submission.tokenSig,
    previousNormalizedSignature: params.previousNormalizedSignature,
  });
};

const publishApprovedCommunityPost = async (
  submission: CommunitySubmission
): Promise<string | null> => {
  if (!submission.levelId) {
    return null;
  }
  const puzzle = await getPuzzlePrivate(submission.levelId);
  if (!puzzle) {
    throw new Error('Approved puzzle data not found.');
  }
  const creatorAvatarUrl = await getCreatorAvatarUrl(submission.authorName);
	  const postId = await publishDailyPost({
    levelId: submission.levelId,
    dateKey: puzzle.dateKey,
    runAs: 'APP',
    forceNewPost: true,
	    title: `${submission.title} by u/${submission.authorName}`,
	    postData: {
      levelId: submission.levelId,
      dateKey: puzzle.dateKey,
      mode: 'daily',
	      previewTitle: submission.title || defaultCommunityPreviewTitle,
	      creatorUsername: submission.authorName,
      ...(creatorAvatarUrl ? { creatorAvatarUrl } : {}),
    },
	    textFallbackText: `${submission.title} by u/${submission.authorName}. Open the interactive post to play.`,
	  });
  await redis.hSet(keyCommunitySubmission(submission.submissionId), {
    postId,
    postedAt: `${Date.now()}`,
  });
  return postId;
};

export const approveCommunitySubmission = async (
  submissionId: string
): Promise<CommunitySubmission> => {
  const reviewer = assertUserId();
  const lockKey = keyCommunityApprovalLock(submissionId);
  const lockToken = crypto.randomUUID();
  const lockAcquired = await redis.set(lockKey, lockToken, {
    nx: true,
    expiration: new Date(Date.now() + approvalLockTtlMs),
  });
  if (!lockAcquired) {
    throw new Error('Approval is already running for this submission.');
  }

  try {
    const submission = await getCommunitySubmission(submissionId);
    if (!submission) {
      throw new Error('Submission not found.');
    }
    if (submission.status === 'approved') {
      const rewardPaidAt = await redis.hGet(
        keyCommunitySubmission(submissionId),
        'approvalRewardPaidAt'
      );
      if (!rewardPaidAt) {
        await rewardCreatorOnApproval(submission);
      }
      await publishApprovedCommunityPost(submission);
      return submission;
    }
    if (submission.status !== 'pending') {
      throw new Error('Only pending submissions can be approved.');
    }
    const hardnessBoundsByTier = await getHardnessBounds();
    const pipeline = createValidationPipeline(hardnessBoundsByTier);
    const phase1 = pipeline.phase1(submission.text, submission.targetDifficulty);
    if (!phase1.valid) {
      throw new Error(phase1.reasons[0] ?? 'Submission no longer fits current difficulty bounds.');
    }
    const approvedAt = Date.now();
    const existingPuzzle = submission.levelId
      ? await getPuzzlePrivate(submission.levelId)
      : null;
    const previousNormalizedSignature =
      existingPuzzle?.targetText ? normalizeContent(existingPuzzle.targetText) : submission.normalizedSig;
    const built = existingPuzzle
      ? {
          levelId: existingPuzzle.levelId,
          puzzlePrivate: existingPuzzle,
          puzzlePublic: buildPublicPuzzle(existingPuzzle, []),
        }
      : await buildApprovedCommunityPuzzle(submission);
    if (existingPuzzle) {
      await replaceApprovedCommunityPuzzleInPlace({
        submission,
        existingPuzzle,
        previousNormalizedSignature,
      });
    }
    const next: CommunitySubmission = {
      ...submission,
      status: 'approved',
      reviewedBy: reviewer,
      reviewedAt: approvedAt,
      rejectionReason: null,
      levelId: built.levelId,
    };
    await saveSubmission(next);
	    await Promise.all([
	      redis.zRem(keyCommunitySubmissionsPending, [submissionId]),
	      redis.zAdd(keyCommunitySubmissionsApproved, {
	        member: submissionId,
	        score: approvedAt,
	      }),
      redis.hSet(keyCommunitySubmissionsByLevel, {
        [built.levelId]: submissionId,
      }),
      redis.hDel(keyCommunityRemovedLevels, [built.levelId]),
	      redis.hDel(keyCommunityPendingSignatures, [submission.normalizedSig]),
	      submission.levelId
	        ? Promise.resolve()
        : redis.hIncrBy(keyCommunityCreatorStats(submission.authorId), 'approved', 1),
    ]);
    const rewardPaidAt = await redis.hGet(
      keyCommunitySubmission(submissionId),
      'approvalRewardPaidAt'
    );
    if (!rewardPaidAt) {
      await rewardCreatorOnApproval(next);
    }
    const existingPostId = next.levelId
      ? await getPuzzlePublishedPostId(next.levelId)
      : null;
    if (!existingPostId) {
      await publishApprovedCommunityPost(next);
    }
    return next;
  } finally {
    const activeToken = await redis.get(lockKey);
    if (activeToken === lockToken) {
      await redis.del(lockKey);
    }
  }
};

export const rejectCommunitySubmission = async (params: {
  submissionId: string;
  reason: string;
}): Promise<CommunitySubmission> => {
  const reviewer = assertUserId();
  const submission = await getCommunitySubmission(params.submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.status !== 'pending') {
    throw new Error('Only pending submissions can be rejected.');
  }
  const reviewedAt = Date.now();
  const next: CommunitySubmission = {
    ...submission,
    status: 'rejected',
    reviewedBy: reviewer,
    reviewedAt,
    rejectionReason: params.reason.trim(),
  };
  await saveSubmission(next);
  await Promise.all([
    redis.zRem(keyCommunitySubmissionsPending, [params.submissionId]),
    redis.zAdd(keyCommunitySubmissionsRejected, {
      member: params.submissionId,
      score: reviewedAt,
    }),
    redis.hDel(keyCommunityPendingSignatures, [submission.normalizedSig]),
    redis.hIncrBy(keyCommunityCreatorStats(submission.authorId), 'rejected', 1),
  ]);
  return next;
};

export const requestCommunitySubmissionChanges = async (params: {
  submissionId: string;
  reason: string;
}): Promise<CommunitySubmission> => {
  const reviewer = assertUserId();
  const submission = await getCommunitySubmission(params.submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.status !== 'approved') {
    throw new Error('Only approved submissions can be sent back for changes.');
  }
  const reviewedAt = Date.now();
  const next: CommunitySubmission = {
    ...submission,
    status: 'changes_requested',
    reviewedBy: reviewer,
    reviewedAt,
    rejectionReason: params.reason.trim(),
  };
  await saveSubmission(next);
  await Promise.all([
    redis.zRem(keyCommunitySubmissionsApproved, [params.submissionId]),
    redis.zAdd(keyCommunitySubmissionsPending, {
      member: params.submissionId,
      score: reviewedAt,
    }),
  ]);
  return next;
};

export const submitRequestedCommunityEdit = async (params: {
  submissionId: string;
  title: string;
  text: string;
  attribution: string;
}): Promise<CommunitySubmission> => {
  const userId = assertUserId();
  const submission = await getCommunitySubmission(params.submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.authorId !== userId) {
    throw new Error('Only the creator can edit this submission.');
  }
  if (submission.status !== 'changes_requested') {
    throw new Error('Only submissions with requested changes can be edited.');
  }
  const validated = validateCommunityText({
    title: params.title,
    text: params.text,
    attribution: params.attribution,
  });
  if (validated.reasons.length > 0) {
    throw new Error(validated.reasons[0] ?? 'Revision is not valid.');
  }
  const normalizedSig = normalizeContent(validated.sanitizedText);
  const tokenSig = contentTokenSignature(validated.sanitizedText);
  if (normalizedSig.length === 0) {
    throw new Error('Challenge text cannot be empty after cleanup.');
  }
  const exactDuplicateReason = await exactDuplicateReasonForRevision({
    normalizedSig,
    submissionId: submission.submissionId,
    allowedLevelId: submission.levelId,
  });
  if (exactDuplicateReason) {
    throw new Error(exactDuplicateReason);
  }
  if (submission.levelId) {
    const existingPuzzle = await getPuzzlePrivate(submission.levelId);
    const textChanged = existingPuzzle
      ? sanitizePhrase(existingPuzzle.targetText) !== validated.sanitizedText
      : normalizedSig !== submission.normalizedSig;
    const engagement = await getLevelEngagement(submission.levelId);
    if (textChanged && engagement.plays > 0) {
      throw new Error(
        'This puzzle has already been played. Remove it and submit the corrected version as a new challenge.'
      );
    }
  }
  const submittedAt = Date.now();
  const next: CommunitySubmission = {
    ...submission,
    title: validated.sanitizedTitle,
    text: validated.sanitizedText,
    attribution: validated.sanitizedAttribution,
    normalizedSig,
    tokenSig,
    status: 'pending',
    submittedAt,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: 'Revision submitted for moderator review.',
  };
  await saveSubmission(next);
  await Promise.all([
    submission.normalizedSig === normalizedSig
      ? Promise.resolve()
      : redis.hDel(keyCommunityPendingSignatures, [submission.normalizedSig]),
    redis.hSet(keyCommunityPendingSignatures, {
      [normalizedSig]: submission.submissionId,
    }),
    redis.zAdd(keyCommunitySubmissionsPending, {
      member: submission.submissionId,
      score: submittedAt,
    }),
  ]);
  return next;
};

export const removeCommunityPuzzle = async (params: {
  submissionId: string;
  reason?: string;
}): Promise<CommunitySubmission> => {
  const reviewer = assertUserId();
  const submission = await getCommunitySubmission(params.submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.status !== 'approved') {
    throw new Error('Only approved submissions can be removed.');
  }
  const removedAt = Date.now();
  const next: CommunitySubmission = {
    ...submission,
    status: 'removed',
    reviewedBy: reviewer,
    reviewedAt: removedAt,
    rejectionReason: params.reason?.trim() ?? 'Removed by moderator.',
  };
  await saveSubmission(next);
	  await Promise.all([
	    redis.zRem(keyCommunitySubmissionsApproved, [params.submissionId]),
	    redis.zAdd(keyCommunitySubmissionsRemoved, {
	      member: params.submissionId,
	      score: removedAt,
	    }),
    submission.levelId
      ? redis.hSet(keyCommunityRemovedLevels, {
          [submission.levelId]: params.submissionId,
        })
      : Promise.resolve(),
	    redis.hIncrBy(keyCommunityCreatorStats(submission.authorId), 'removed', 1),
	  ]);
  return next;
};

export const getApprovedCommunityCount = async (): Promise<number> =>
  await redis.zCard(keyCommunitySubmissionsApproved);

export type CommunityEndlessSelection =
  | { levelId: string; reason: 'available' }
  | { levelId: null; reason: 'empty' | 'all_completed' };

export const getNextCommunityEndlessLevelId = async (params: {
  userId: string;
  categoryFilter?: ChallengeType | null;
  endlessSort?: EndlessSort;
}): Promise<CommunityEndlessSelection> => {
  const entries = await redis.zRange(keyCommunitySubmissionsApproved, 0, -1, {
    by: 'rank',
  });
  const approvedAtBySubmissionId = new Map<string, number>();
  for (const entry of entries) {
    approvedAtBySubmissionId.set(entry.member, parseRedisSortedSetScore(entry.score) ?? 0);
  }
  const submissions = await loadSubmissions(entries.map((entry) => entry.member));
  const candidates: CommunitySubmission[] = [];
  for (const submission of submissions) {
    if (!submission.levelId || submission.status !== 'approved') {
      continue;
    }
    if (params.categoryFilter && submission.category !== params.categoryFilter) {
      continue;
    }
    candidates.push(submission);
  }
  if (candidates.length === 0) {
    return { levelId: null, reason: 'empty' };
  }
  const [completed, failed] = await Promise.all([
    getCompletedLevels(params.userId),
    getFailedLevels(params.userId),
  ]);
  const openCandidates: CommunityEndlessCandidate[] = [];
  for (const submission of candidates) {
    const levelId = submission.levelId;
    if (!levelId) {
      continue;
    }
    const playedScore = await redis.zScore(
      keyUserEndlessPlayed(params.userId),
      levelId
    );
    if (
      !completed.has(levelId) &&
      !failed.has(levelId) &&
      !hasRedisSortedSetScore(playedScore)
    ) {
      openCandidates.push({
        submission,
        levelId,
        approvedAt:
          approvedAtBySubmissionId.get(submission.submissionId) ??
          submission.reviewedAt ??
          submission.submittedAt,
      });
    }
  }
  if (openCandidates.length === 0) {
    return { levelId: null, reason: 'all_completed' };
  }
  const sort = params.endlessSort ?? 'random';
  if (sort === 'random') {
    const selected = openCandidates[Math.floor(Math.random() * openCandidates.length)];
    return selected
      ? { levelId: selected.levelId, reason: 'available' }
      : { levelId: null, reason: 'empty' };
  }
  if (sort === 'latest' || sort === 'oldest') {
    openCandidates.sort((left, right) =>
      sort === 'latest'
        ? right.approvedAt - left.approvedAt
        : left.approvedAt - right.approvedAt
    );
    const selected = openCandidates[0];
    return selected
      ? { levelId: selected.levelId, reason: 'available' }
      : { levelId: null, reason: 'empty' };
  }
  const scoredCandidates: CommunityEndlessScoredCandidate[] = await Promise.all(
    openCandidates.map(async (candidate) => ({
      ...candidate,
      engagement: await getLevelEngagement(candidate.levelId),
    }))
  );
  scoredCandidates.sort((left, right) => {
    const winRateDelta =
      sort === 'win_rate_desc'
        ? right.engagement.winRatePct - left.engagement.winRatePct
        : left.engagement.winRatePct - right.engagement.winRatePct;
    if (winRateDelta !== 0) {
      return winRateDelta;
    }
    const playsDelta =
      sort === 'win_rate_desc'
        ? right.engagement.plays - left.engagement.plays
        : left.engagement.plays - right.engagement.plays;
    if (playsDelta !== 0) {
      return playsDelta;
    }
    return right.approvedAt - left.approvedAt;
  });
  const selected = scoredCandidates[0];
  return selected
    ? { levelId: selected.levelId, reason: 'available' }
    : { levelId: null, reason: 'empty' };
};

export const recordCommunityEndlessCompletion = async (params: {
  userId: string;
  levelId: string;
  meaningful: boolean;
}): Promise<void> => {
  await redis.zAdd(keyUserEndlessPlayed(params.userId), {
    member: params.levelId,
    score: Date.now(),
  });
  if (params.meaningful) {
    await redis.hIncrBy(keyCommunityPuzzlePlays(params.levelId), 'totalPlays', 1);
    const puzzle = await getPuzzlePrivate(params.levelId);
    if (puzzle?.source === 'COMMUNITY') {
      const approved = await listCommunitySubmissionsForReview({
        status: 'approved',
        limit: 500,
      });
      const owner = approved.find(
        (submission) => submission.levelId === params.levelId
      );
      if (owner) {
        await redis.hIncrBy(keyCommunityCreatorStats(owner.authorId), 'totalPlays', 1);
      }
    }
  }
};
