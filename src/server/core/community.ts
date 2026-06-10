import { context, reddit, redis } from '@devvit/web/server';
import { z } from 'zod';
import type {
  ChallengeEvaluationSummary,
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
  fittedLayoutSchema,
  type CommunityFittedLayout,
  type CommunityLineFitReport,
  type CommunityManualLayout,
  type CommunityManualPadlock,
} from '../../shared/community';
import { fitLineToTiers, getCachedFittedLayout } from './board-fit-service';
import { applyFittedLayoutToBasePuzzle } from './board-layout';
import { rankRevealCandidates, tierDisplayName } from './tier-fitter';
import { solverBandForTier } from './solver-thresholds';
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
import { buildChallengeEvaluation, getChallengeEvaluation } from './challenge-evaluation';
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
import { logWarn } from './log';
import { runDummySolver } from './dummy-solver';
import { validatePuzzle } from './validation';
import {
  keyCommunityAcclaimAwarded,
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
  keyCommunityVotes,
  keyLevelQualifiedPlayers,
  keyUserEndlessPlayed,
} from './keys';
import {
  getCompletedLevels,
  getFailedLevels,
  getUserProfile,
  saveUserProfile,
} from './state';
import {
  acclaimProgress,
  isAcclaimed,
  type AcclaimProgress,
} from '../../shared/acclaim';
import { updateQuestProgressOnAcclaim } from './quests';

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
  challengeEvaluationSummary?: ChallengeEvaluationSummary;
  manualLayoutGuidance?: ManualLayoutGuidance;
  // The exact fitted board behind an auto-mode preview. Persisted on the
  // submission so approval publishes the board the creator saw. Internal —
  // stripped by the preview response schema before reaching the client.
  fittedLayout: CommunityFittedLayout | null;
};

type ManualLayoutGuidance = {
  status: 'aligned' | 'too_easy' | 'too_hard' | 'unfair';
  targetTier: DifficultyTier;
  estimatedTier: DifficultyTier;
  messages: string[];
  suggestedActions: string[];
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

type CommunityEndlessMatchedCandidate = CommunityEndlessCandidate & {
  effectiveDifficulty: number;
  matchScore: number;
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
    logWarn('community', 'creator avatar lookup failed', { username, error });
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

const parseFittedLayoutHash = (
  hash: Record<string, string>
): CommunityFittedLayout | null => {
  const raw = stringFromHash(hash, 'fittedLayout');
  if (!raw) {
    return null;
  }
  try {
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = fittedLayoutSchema.safeParse(parsedJson);
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
	    fittedLayout: parseFittedLayoutHash(hash),
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
	    fittedLayout:
	      submission.fittedLayout === null ? '' : JSON.stringify(submission.fittedLayout),
	    suggestedTier: submission.suggestedTier,
    status: submission.status,
    submittedAt: `${submission.submittedAt}`,
    reviewedBy: submission.reviewedBy ?? '',
    reviewedAt: submission.reviewedAt === null ? '' : `${submission.reviewedAt}`,
    rejectionReason: submission.rejectionReason ?? '',
    levelId: submission.levelId ?? '',
  });
};

const getCommunitySubmission = async (
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
    logWarn('community', 'validation using default hardness bounds', { error });
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
    reasons.push('That quote is already in the game — try a different line.');
  }
  const pendingOwner = await redis.hGet(
    keyCommunityPendingSignatures,
    params.normalizedSig
  );
  if (pendingOwner) {
    reasons.push('This quote is already waiting for review.');
  }
  const recent = await getRecentUsedSignatureEntries(dedupSignatureLookback);
  const nearDuplicate = isNearDuplicateSignature({
    candidateNormalizedSignature: params.normalizedSig,
    candidateTokenSignature: params.tokenSig,
    recent,
  });
  if (nearDuplicate.duplicate) {
    // Keep this actionable and free of internal scoring jargon.
    reasons.push('A very similar quote already exists — try a different line or rephrase it.');
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

export const buildCommunityTierFitMessage = (targetDifficulty: number): string => {
  const label = communityTierLabel(targetDifficulty);
  return `${label} isn’t available for this line. Pick a tier with a check mark, or try a different quote.`;
};

const creatorFriendlyBuildError = (
  error: unknown,
  targetDifficulty: number
): string => {
  const label = communityTierLabel(targetDifficulty);
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('DUMMY_SOLVER_UNSATISFIED') ||
    message.toLowerCase().includes('solver')
  ) {
    return `Couldn’t make a fair ${label} board from this line. Try another tier, or a line with more everyday words.`;
  }
  if (
    message.toLowerCase().includes('validation failed') ||
    message.toLowerCase().includes('board')
  ) {
    return `Couldn’t finish a ${label} board for this line. Try another tier, or tweak the quote a little.`;
  }
  return `Couldn’t get this ${label} board ready. Try the preview again, or edit the line.`;
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

const describeManualTile = (puzzle: PuzzlePrivate, index: number): string | null => {
  const tile = puzzle.tiles[index];
  if (!tile || !tile.isLetter) {
    return null;
  }
  const word = puzzle.words[tile.wordIndex];
  return word ? `${tile.char} in "${word}"` : tile.char;
};

const firstDescribedTile = (
  puzzle: PuzzlePrivate,
  indices: number[]
): string | null => {
  for (const index of indices) {
    const description = describeManualTile(puzzle, index);
    if (description) {
      return description;
    }
  }
  return null;
};

// When the fairness solver stalls, point at the single most useful fix from
// the solver's own reveal ranking instead of a vague "make it easier".
const manualFairnessAdvice = (puzzle: PuzzlePrivate): string => {
  const top = rankRevealCandidates(puzzle, new Set())[0];
  if (!top) {
    return 'Players would get stuck on this board. Remove a hidden tile or a lock.';
  }
  const frequency = puzzle.tiles.filter(
    (tile) => tile.isLetter && tile.char === top.char
  ).length;
  const description = describeManualTile(puzzle, top.index) ?? top.char;
  return frequency > 1
    ? `Players would get stuck on this board. Reveal the ${description} — ${top.char} appears ${frequency} times.`
    : `Players would get stuck on this board. Reveal the ${description}, or remove a hidden tile or a lock.`;
};

const suggestedStarterReveal = (puzzle: PuzzlePrivate): string => {
  const blocked = new Set([
    ...puzzle.prefilledIndices,
    ...puzzle.blindIndices,
    ...(puzzle.lockIndices ?? []),
  ]);
  const candidates = puzzle.tiles
    .filter((tile) => tile.isLetter && !blocked.has(tile.index))
    .sort((left, right) => {
      const leftWordLength = puzzle.words[left.wordIndex]?.length ?? 0;
      const rightWordLength = puzzle.words[right.wordIndex]?.length ?? 0;
      return rightWordLength - leftWordLength || left.index - right.index;
    });
  const description =
    candidates[0] ? describeManualTile(puzzle, candidates[0].index) : null;
  return description
    ? `Reveal ${description}.`
    : 'Add one starter reveal on an unsolved letter.';
};

const suggestedBlindTile = (puzzle: PuzzlePrivate): string => {
  const blocked = new Set([
    ...puzzle.prefilledIndices,
    ...puzzle.blindIndices,
    ...(puzzle.lockIndices ?? []),
  ]);
  for (const tile of puzzle.tiles) {
    if (!tile.isLetter || blocked.has(tile.index)) {
      continue;
    }
    const hasVisibleMatch = puzzle.tiles.some(
      (other) =>
        other.index !== tile.index &&
        other.isLetter &&
        other.char === tile.char &&
        !blocked.has(other.index)
    );
    if (hasVisibleMatch) {
      const description = describeManualTile(puzzle, tile.index);
      if (description) {
        return `Add a ? to ${description}.`;
      }
    }
  }
  return 'Add one ? to a repeated letter, then update the preview.';
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
  guidancePuzzlePrivate: PuzzlePrivate | null;
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
    const manualPadlocks = layout.padlocks;

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
      if (padlock.lockedIndices.length > 1) {
        reasons.push(`Lock ${padlock.padlockId} can lock only one tile.`);
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
      if (
        lockedIndices.length > 0 &&
        padlock.lockedIndices.length <= 1 &&
        keyIndices.length > 0 &&
        keyIndices.length <= 2
      ) {
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
      forbiddenIndices: [...blindIndices, ...lockIndices],
      requiredSolveRatio: 0.65,
      solverProfile: 'deep',
      // Branch expansions only: the fairness verdict must not flip with CPU
      // load, or the preview and "Fix it for me" would disagree.
      maxSearchMs: 60_000,
      maxBranchExpansions: 5000,
	    });
	    if (!solver.solvable || solver.blindGuessRequired || solver.solvedRatio < 0.65) {
	      reasons.push(manualFairnessAdvice(puzzlePrivate));
	    }
	    return {
	      puzzle: buildPublicPuzzle(puzzlePrivate, [], undefined, {
	        disableFallbackStarter: true,
	      }),
	      puzzlePrivate: reasons.length === 0 ? puzzlePrivate : null,
	      guidancePuzzlePrivate: puzzlePrivate,
	      reasons,
	    };
	  } catch (error) {
	    return {
	      puzzle: null,
	      puzzlePrivate: null,
	      guidancePuzzlePrivate: null,
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
}): Promise<{
  puzzle: PuzzlePublic | null;
  puzzlePrivate: PuzzlePrivate | null;
  guidancePuzzlePrivate: PuzzlePrivate | null;
  fittedLayout: CommunityFittedLayout | null;
  reasons: string[];
}> => {
  const tier = difficultyToTier(params.targetDifficulty);
  const empty = {
    puzzle: null,
    puzzlePrivate: null,
    guidancePuzzlePrivate: null,
    fittedLayout: null,
  };
  try {
    // In the normal flow the client's live tier check already fitted and
    // cached this line, so both calls below are cache hits.
    const report = await fitLineToTiers({
      text: params.text,
      author: params.attribution,
      challengeType: params.category,
    });
    const entry = report.tiers.find((candidate) => candidate.tier === tier);
    if (!entry?.feasible) {
      return {
        ...empty,
        reasons: [entry?.reason ?? buildCommunityTierFitMessage(params.targetDifficulty)],
      };
    }
    const layout = await getCachedFittedLayout({
      text: params.text,
      tier,
      author: params.attribution,
      challengeType: params.category,
    });
    if (!layout) {
      return {
        ...empty,
        reasons: [buildCommunityTierFitMessage(params.targetDifficulty)],
      };
    }
    const [settings, previewLevelId] = await Promise.all([
      getDecryptSettings(),
      peekNextLevelId(),
    ]);
    const base = buildPuzzle({
      levelId: previewLevelId,
      dateKey: formatDateKey(new Date()),
      text: params.text,
      author: params.attribution,
      challengeType: params.category,
      source: 'COMMUNITY',
      difficulty: layout.difficulty,
      logicalPercent: settings.logicalCipherPercent,
      previousMapping: await previousMappingForLevel(previewLevelId),
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: false,
    });
    const puzzlePrivate = applyFittedLayoutToBasePuzzle({
      basePuzzle: base.puzzlePrivate,
      layout,
    });
    const validation = validatePuzzle(puzzlePrivate);
    if (!validation.valid) {
      return { ...empty, reasons: validation.reasons };
    }
    return {
      puzzle: buildPublicPuzzle(puzzlePrivate, []),
      puzzlePrivate,
      guidancePuzzlePrivate: puzzlePrivate,
      fittedLayout: layout,
      reasons: [],
    };
  } catch (error) {
    return {
      ...empty,
      reasons: [creatorFriendlyBuildError(error, params.targetDifficulty)],
    };
  }
};

const tierRank = (tier: DifficultyTier): number => {
  if (tier === 'warmup') {
    return 0;
  }
  if (tier === 'medium') {
    return 1;
  }
  if (tier === 'hard') {
    return 2;
  }
  return 3;
};

const buildManualLayoutGuidance = (params: {
  targetTier: DifficultyTier;
  estimatedTier: DifficultyTier;
  difficultyExplanation: DifficultyBreakdown | null;
  puzzlePrivate: PuzzlePrivate | null;
  layoutReasons?: string[];
}): ManualLayoutGuidance => {
  const fairness = params.difficultyExplanation?.fairnessSummary;
  const fairnessFailed =
    fairness !== undefined && (!fairness.solvable || fairness.blindGuessRequired);
  const layoutFailed = (params.layoutReasons?.length ?? 0) > 0;
  const blindCount = params.puzzlePrivate?.blindIndices.length ?? 0;
  const padlockCount = params.puzzlePrivate?.padlockChains.length ?? 0;
  const prefilledCount = params.puzzlePrivate?.prefilledIndices.length ?? 0;
  const blindDescription = params.puzzlePrivate
    ? firstDescribedTile(params.puzzlePrivate, params.puzzlePrivate.blindIndices)
    : null;
  const lockDescription = params.puzzlePrivate
    ? firstDescribedTile(params.puzzlePrivate, params.puzzlePrivate.lockIndices ?? [])
    : null;
  const prefilledDescription = params.puzzlePrivate
    ? firstDescribedTile(params.puzzlePrivate, params.puzzlePrivate.prefilledIndices)
    : null;
  const anchorCoverage =
    params.difficultyExplanation?.humanFeatures.revealedAnchorCoverage ?? 0;
  const suggestedActions: string[] = [];

  if (params.puzzlePrivate && anchorCoverage < 0.35) {
    suggestedActions.push(suggestedStarterReveal(params.puzzlePrivate));
  }
  if (blindCount > 0) {
    suggestedActions.push(
      blindDescription ? `Remove the ? from ${blindDescription}.` : 'Remove one ? tile.'
    );
  }
  if (padlockCount > 0) {
    suggestedActions.push(
      lockDescription ? `Remove the padlock from ${lockDescription}.` : 'Remove one padlock.'
    );
  }

  if (fairnessFailed || layoutFailed) {
    return {
      status: 'unfair',
      targetTier: params.targetTier,
      estimatedTier: params.estimatedTier,
      messages:
        params.layoutReasons && params.layoutReasons.length > 0
          ? params.layoutReasons.slice(0, 3)
          : ['Players would get stuck on this board.'],
      suggestedActions:
        suggestedActions.length > 0
          ? suggestedActions
          : ['Reveal one starting letter before sharing.'],
    };
  }

  const targetRank = tierRank(params.targetTier);
  const estimatedRank = tierRank(params.estimatedTier);
  if (estimatedRank > targetRank) {
    return {
      status: 'too_hard',
      targetTier: params.targetTier,
      estimatedTier: params.estimatedTier,
      messages: [
        `This board plays like ${tierDisplayName(params.estimatedTier)}, not ${tierDisplayName(params.targetTier)}.`,
      ],
	      suggestedActions: [
	        ...(suggestedActions.length > 0
	          ? suggestedActions
	          : params.puzzlePrivate
	            ? [suggestedStarterReveal(params.puzzlePrivate)]
	            : ['Reveal one starting letter.']),
	        `Or share it as ${tierDisplayName(params.estimatedTier)} — it’s ready as is.`,
	      ],
	    };
	  }
  if (estimatedRank < targetRank) {
    return {
      status: 'too_easy',
      targetTier: params.targetTier,
      estimatedTier: params.estimatedTier,
	      messages: [
	        `This board plays like ${tierDisplayName(params.estimatedTier)}, not ${tierDisplayName(params.targetTier)}.`,
	      ],
	      suggestedActions: [
	        ...(prefilledCount > 1
	          ? [
	              prefilledDescription
	                ? `Remove the starter reveal from ${prefilledDescription}.`
	                : 'Remove one starter reveal.',
	            ]
	          : []),
	        params.puzzlePrivate
	          ? suggestedBlindTile(params.puzzlePrivate)
	          : 'Add one ? tile only if the preview stays solvable.',
	        `Or share it as ${tierDisplayName(params.estimatedTier)} — it’s ready as is.`,
	      ],
	    };
  }

  return {
    status: 'aligned',
    targetTier: params.targetTier,
    estimatedTier: params.estimatedTier,
    messages: ['This board matches your target difficulty. Ready to share!'],
    suggestedActions: [],
  };
};

const tierLabelForDifficulty = (difficulty: number): string =>
  difficulty <= 3 ? 'Easy' : difficulty <= 5 ? 'Medium' : difficulty <= 8 ? 'Hard' : 'Expert';

// Copy style guide for everything players read (see copy-tone.test.ts for
// the enforced word list):
// - Second person, present tense, at most two short sentences.
// - Lead with the fix, then (optionally) the why: "Reveal one more letter."
//   not "Validation failed because...".
// - Engine jargon never reaches players: no "solver", "fairness checker",
//   "tier bounds", "hardness", "validation", "obstruction", "budget",
//   "engine", "buildability". Tiers are Easy/Medium/Hard/Expert only.
// - Never blame the player or the quote; say what works instead.
// - Buttons are verbs.
//
// Turn internal engine strings into plain, friendly, minimal copy.
// Unknown / already-friendly reasons pass through unchanged.
export const humanizeCommunityReason = (
  raw: string,
  context: { tierLabel: string; creationMode: 'auto' | 'manual' }
): string => {
  const reason = raw.trim();
  const isFairnessOrBuildFailure =
    reason === 'Blind tile fairness check failed.' ||
    reason === 'No starter clue on board.' ||
    reason === 'This layout is not fair enough to publish as-is.' ||
    reason.startsWith('Could not build a fair') ||
    reason.startsWith('Target tier');
  if (isFairnessOrBuildFailure) {
    return context.creationMode === 'manual'
      ? 'This board isn’t solvable yet. Reveal a letter, or remove a hidden tile or lock.'
      : `${context.tierLabel} isn’t available for this line. Pick a tier with a check mark, or try a different quote.`;
  }
  if (
    reason.startsWith('Could not verify buildability') ||
    reason.startsWith('Could not build a custom preview')
  ) {
    return 'Couldn’t build a preview for this line. Try again, or use a different quote.';
  }
  if (reason === 'A multi-letter word is fully prefilled.') {
    return 'A whole word is revealed — hide a letter or two so there’s something to solve.';
  }
  if (
    reason === 'Padlock chain locks its own key tiles.' ||
    reason === 'Padlock dependency loop detected.'
  ) {
    return 'These locks can’t be opened. Make sure each lock’s key isn’t inside another lock.';
  }
  if (reason.startsWith('Word length exceeds')) {
    return `One word is too long for the board (max ${maxPuzzleWordLength} letters).`;
  }
  if (reason.startsWith('Total challenge length exceeds')) {
    return `This line is too long (max ${maxPuzzleTotalLength} characters).`;
  }
  return reason;
};

// Player-facing "Try this" tips. Auto mode must never reference board tools
// (blind tiles, reveals, anchors) the player cannot edit — only the text.
const buildCommunitySuggestions = (params: {
  creationMode: 'auto' | 'manual';
  difficultyExplanation:
    | { humanFeatures: { revealedAnchorCoverage?: number; anchorDensity?: number } }
    | null
    | undefined;
}): string[] => {
  const human = params.difficultyExplanation?.humanFeatures;
  const anchorDensity = human?.anchorDensity;
  const revealedAnchorCoverage = human?.revealedAnchorCoverage;
  if (params.creationMode === 'manual') {
    const tips: string[] = [];
    if (revealedAnchorCoverage !== undefined && revealedAnchorCoverage < 0.35) {
      tips.push('Reveal one common short word so players have a foothold.');
    }
    if (anchorDensity !== undefined && anchorDensity < 0.15) {
      tips.push(
        'Few natural anchors here — remove a blind tile or reveal a common letter if it plays too hard.'
      );
    }
    return tips;
  }
  // Auto mode: the engine builds the board, so talk about the quote itself.
  if (anchorDensity !== undefined && anchorDensity < 0.15) {
    return [
      'This line uses few familiar words. A phrase with a couple of common words is easier and more fun to crack.',
    ];
  }
  return [];
};

/**
 * Live tier availability for the create form: every tier is checked by
 * actually building a board (cached by text), so the tiers offered to the
 * player can never fail later at preview or submit.
 */
export const fitCommunityLine = async (input: {
  text: string;
}): Promise<CommunityLineFitReport> => {
  const sanitizedText = sanitizePhrase(input.text);
  const report = await fitLineToTiers({ text: sanitizedText });
  return {
    textValid: report.textValid,
    reasons: report.reasons,
    suggestedTier: report.suggestedTier,
    tiers: report.tiers.map((entry) => ({
      tier: entry.tier,
      label: tierDisplayName(entry.tier),
      feasible: entry.feasible,
      reason: entry.reason,
      summary: entry.summary
        ? {
            revealCount: entry.summary.revealCount,
            blindCount: entry.summary.blindCount,
            padlockCount: entry.summary.padlockCount,
          }
        : null,
    })),
  };
};

const manualLayoutFromPuzzle = (puzzle: PuzzlePrivate): CommunityManualLayout =>
  normalizeManualLayout({
    prefilledIndices: puzzle.prefilledIndices,
    prefilledWordIndices: [],
    blindIndices: puzzle.blindIndices,
    lockIndices: puzzle.padlockChains.flatMap((chain) => chain.lockedIndices),
    lockKeyIndices: puzzle.padlockChains.flatMap((chain) => chain.keyIndices),
    padlocks: puzzle.padlockChains.map((chain) => ({
      padlockId: chain.chainId,
      lockedIndices: chain.lockedIndices,
      keyIndices: chain.keyIndices,
    })),
  });

const manualLayoutIsFair = (puzzle: PuzzlePrivate): boolean => {
  if (!validatePuzzle(puzzle).valid) {
    return false;
  }
  const solver = runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    forbiddenIndices: [...puzzle.blindIndices, ...(puzzle.lockIndices ?? [])],
    requiredSolveRatio: 0.65,
    solverProfile: 'deep',
    // Branch expansions only — a wall-clock cap would make the fairness
    // verdict depend on CPU load, so "Fix it for me" could churn a board
    // it had just declared fair.
    maxSearchMs: 60_000,
    maxBranchExpansions: 5000,
  });
  return solver.solvable && !solver.blindGuessRequired && solver.solvedRatio >= 0.65;
};

/**
 * "Fix it for me" for the advanced builder: minimally adjusts the player's
 * layout until it passes the manual fairness check — best reveals first,
 * then stripping hidden tiles, then locks — and reports every change made.
 */
export const autoFixCommunityManualLayout = async (input: {
  text: string;
  manualLayout: CommunityManualLayout;
}): Promise<{
  success: boolean;
  message: string;
  fixedLayout: CommunityManualLayout | null;
  changes: string[];
}> => {
  const sanitizedText = sanitizePhrase(input.text);
  const preview = await buildManualLayoutPuzzlePreview({
    text: sanitizedText,
    attribution: 'Preview',
    category: 'QUOTE',
    manualLayout: normalizeManualLayout(input.manualLayout),
  });
  const initialBoard = preview.guidancePuzzlePrivate;
  if (!initialBoard) {
    return {
      success: false,
      message:
        preview.reasons[0] ?? 'Couldn’t read this board. Update the preview and try again.',
      fixedLayout: null,
      changes: [],
    };
  }
  let current: PuzzlePrivate = initialBoard;
  const changes: string[] = [];
  const maxRepairSteps = 10;
  const preferRevealSteps = 6;
  for (let attempt = 0; attempt < maxRepairSteps && !manualLayoutIsFair(current); attempt += 1) {
    if (attempt < preferRevealSteps) {
      const reveal = rankRevealCandidates(current, new Set())[0];
      if (reveal) {
        const prefilledIndices = uniqueSortedNumbers([
          ...current.prefilledIndices,
          reveal.index,
        ]);
        const next: PuzzlePrivate = {
          ...current,
          prefilledIndices,
          revealedIndices: prefilledIndices,
          revealed_indices: prefilledIndices,
        };
        if (validatePuzzle(next).valid) {
          changes.push(
            `Revealed the ${describeManualTile(current, reveal.index) ?? reveal.char}.`
          );
          current = next;
          continue;
        }
      }
    }
    const blindIndex: number | undefined =
      current.blindIndices[current.blindIndices.length - 1];
    if (blindIndex !== undefined) {
      changes.push(
        `Removed the ? from the ${describeManualTile(current, blindIndex) ?? 'hidden tile'}.`
      );
      current = {
        ...current,
        blindIndices: current.blindIndices.filter((index) => index !== blindIndex),
      };
      continue;
    }
    const chain: PadlockChain | undefined =
      current.padlockChains[current.padlockChains.length - 1];
    if (chain) {
      changes.push(
        `Removed the lock on the ${firstDescribedTile(current, chain.lockedIndices) ?? 'tile'}.`
      );
      const removedLocks = new Set(chain.lockedIndices);
      current = {
        ...current,
        padlockChains: current.padlockChains.filter(
          (candidate) => candidate.chainId !== chain.chainId
        ),
        lockIndices: (current.lockIndices ?? []).filter(
          (index) => !removedLocks.has(index)
        ),
      };
      continue;
    }
    break;
  }
  if (!manualLayoutIsFair(current)) {
    return {
      success: false,
      message:
        'Couldn’t fix this board automatically. Try revealing more letters or removing locks.',
      fixedLayout: null,
      changes: [],
    };
  }
  if (changes.length === 0) {
    return {
      success: true,
      message: 'This board is already fair — no changes needed.',
      fixedLayout: manualLayoutFromPuzzle(current),
      changes: [],
    };
  }
  return {
    success: true,
    message: 'Fixed! Review the changes below, then update the preview.',
    fixedLayout: manualLayoutFromPuzzle(current),
    changes,
  };
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
	      ? {
	          ...(manualPreview ?? {
	            puzzle: null,
	            puzzlePrivate: null,
	            guidancePuzzlePrivate: null,
	            reasons: [],
	          }),
	          fittedLayout: null,
	        }
	      : baseValid
	        ? await buildEphemeralPuzzlePreview({
            text: sanitizedText,
            attribution: sanitizedAttribution,
            category: input.category,
            targetDifficulty: input.targetDifficulty,
          })
	        : {
	            puzzle: null,
	            puzzlePrivate: null,
	            guidancePuzzlePrivate: null,
	            fittedLayout: null,
	            reasons: [],
	          };
  const allReasons = [...reasons, ...duplicateFailures, ...preview.reasons];
  const previewPrivate = preview.puzzlePrivate;
  const guidancePrivate =
    input.creationMode === 'manual'
      ? (preview.guidancePuzzlePrivate ?? previewPrivate)
      : previewPrivate;
  const estimatedDifficulty =
    input.creationMode === 'manual' && guidancePrivate
      ? guidancePrivate.difficulty
      : input.targetDifficulty;
  const suggestedTier =
    input.creationMode === 'manual'
      ? difficultyToTier(estimatedDifficulty)
      : inferSuggestedTier(sanitizedText, hardnessBoundsByTier);
  const challengeEvaluation =
    guidancePrivate === null
      ? null
      : buildChallengeEvaluation({
          puzzle: guidancePrivate,
          targetDifficulty: estimatedDifficulty,
          targetTier: suggestedTier,
          optimizerSummary: {
            mode: 'preview',
            candidatesEvaluated: 0,
            searchDepth: 0,
            selectedScore: null,
            reasons: ['Community preview only; no layout was saved or mutated.'],
          },
        });
  const difficultyExplanation =
    challengeEvaluation?.difficultyBreakdown ??
    previewPrivate?.difficultyBreakdown ??
    null;
	  const manualLayoutGuidance =
	    input.creationMode === 'manual'
	      ? buildManualLayoutGuidance({
	          targetTier: difficultyToTier(input.targetDifficulty),
	          estimatedTier: suggestedTier,
	          difficultyExplanation,
	          puzzlePrivate: guidancePrivate,
	          layoutReasons: preview.reasons,
	        })
      : undefined;

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
    reasons: allReasons.map((reason) =>
      humanizeCommunityReason(reason, {
        tierLabel: tierLabelForDifficulty(input.targetDifficulty),
        creationMode: input.creationMode,
      })
    ),
    // No generic "try a clear line" filler — when invalid, the reason above
    // already says what to fix. Only show actionable tips on a valid preview.
    suggestions:
      allReasons.length === 0
        ? buildCommunitySuggestions({
            creationMode: input.creationMode,
            difficultyExplanation,
          })
        : [],
    puzzlePreview: preview.puzzle,
    difficultyExplanation: difficultyExplanation ?? undefined,
    challengeEvaluationSummary: challengeEvaluation?.summary,
    manualLayoutGuidance,
    fittedLayout: preview.fittedLayout,
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
	    fittedLayout: input.creationMode === 'auto' ? preview.fittedLayout : null,
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

// Approval grants prestige only — the Puzzle Maker flair. All creator coin
// payout comes from acclaim (the creator quest milestones), so approving a
// challenge never mints currency by itself.
const grantCreatorFlairOnApproval = async (
  submission: CommunitySubmission
): Promise<UserProfile> => {
  const profile = await getUserProfile(submission.authorId);
  if (profile.unlockedFlairs.includes(communityMakerFlair)) {
    return profile;
  }
  const nextProfile: UserProfile = {
    ...profile,
    unlockedFlairs: [...profile.unlockedFlairs, communityMakerFlair],
  };
  await saveUserProfile(submission.authorId, nextProfile);
  return nextProfile;
};

/**
 * Rebuilds the exact board the creator previewed by applying their persisted
 * fitted layout to a fresh base. Null means the layout no longer produces a
 * fair board (should not happen — the apply path is deterministic — but the
 * caller falls back to a fresh fit rather than failing the approval).
 */
const buildAutoPuzzleFromFittedLayout = (params: {
  levelId: string;
  dateKey: string;
  previousMapping: Record<string, number> | null;
  submission: Pick<CommunitySubmission, 'text' | 'attribution' | 'category'>;
  layout: CommunityFittedLayout;
  logicalPercent: number;
}): PuzzlePrivate | null => {
  const base = buildPuzzle({
    levelId: params.levelId,
    dateKey: params.dateKey,
    text: params.submission.text,
    author: params.submission.attribution,
    challengeType: params.submission.category,
    source: 'COMMUNITY',
    difficulty: params.layout.difficulty,
    logicalPercent: params.logicalPercent,
    previousMapping: params.previousMapping,
    skipSolvabilityCheck: true,
    applyObstructionsOnSkip: false,
  });
  const puzzlePrivate = applyFittedLayoutToBasePuzzle({
    basePuzzle: base.puzzlePrivate,
    layout: params.layout,
  });
  if (!validatePuzzle(puzzlePrivate).valid) {
    return null;
  }
  const band = solverBandForTier(difficultyToTier(params.layout.difficulty));
  const solver = runDummySolver({
    puzzle: puzzlePrivate,
    revealedIndices: puzzlePrivate.prefilledIndices,
    requiredSolveRatio: band.floor,
    solverProfile: 'standard',
    maxSearchMs: 2000,
    maxBranchExpansions: 1200,
  });
  if (!solver.solvable || solver.blindGuessRequired || solver.solvedRatio < band.floor) {
    return null;
  }
  return puzzlePrivate;
};

const buildAutoPuzzleFromSubmissionLayout = async (params: {
  levelId: string;
  dateKey: string;
  previousMapping: Record<string, number> | null;
  submission: CommunitySubmission;
  logicalPercent: number;
}): Promise<PuzzlePrivate | null> => {
  if (!params.submission.fittedLayout) {
    return null;
  }
  const fromStored = buildAutoPuzzleFromFittedLayout({
    levelId: params.levelId,
    dateKey: params.dateKey,
    previousMapping: params.previousMapping,
    submission: params.submission,
    layout: params.submission.fittedLayout,
    logicalPercent: params.logicalPercent,
  });
  if (fromStored) {
    return fromStored;
  }
  const freshLayout = await getCachedFittedLayout({
    text: params.submission.text,
    tier: difficultyToTier(params.submission.fittedLayout.difficulty),
    author: params.submission.attribution,
    challengeType: params.submission.category,
  });
  if (!freshLayout) {
    return null;
  }
  return buildAutoPuzzleFromFittedLayout({
    levelId: params.levelId,
    dateKey: params.dateKey,
    previousMapping: params.previousMapping,
    submission: params.submission,
    layout: freshLayout,
    logicalPercent: params.logicalPercent,
  });
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
	      const fromLayout = await buildAutoPuzzleFromSubmissionLayout({
	        levelId: nextLevelId,
	        dateKey: formatDateKey(new Date()),
	        previousMapping,
	        submission,
	        logicalPercent: settings.logicalCipherPercent,
	      });
	      if (fromLayout) {
	        return {
	          puzzlePrivate: fromLayout,
	          puzzlePublic: buildPublicPuzzle(fromLayout, []),
	        };
	      }
	      // Legacy submissions (no fitted layout) rebuild the old way.
		      let base: ReturnType<typeof buildManualPuzzleWithSolverFallback>;
		      try {
		        base = buildManualPuzzleWithSolverFallback({
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
		      } catch (error) {
		        throw new Error(
		          creatorFriendlyBuildError(error, submission.targetDifficulty)
		        );
		      }
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
  const fromLayout = await buildAutoPuzzleFromSubmissionLayout({
    levelId: params.existingPuzzle.levelId,
    dateKey: params.existingPuzzle.dateKey,
    previousMapping,
    submission: params.submission,
    logicalPercent: settings.logicalCipherPercent,
  });
  if (fromLayout) {
    const puzzlePrivate: PuzzlePrivate = {
      ...fromLayout,
      createdAt: params.existingPuzzle.createdAt,
    };
    return {
      puzzlePrivate,
      puzzlePublic: buildPublicPuzzle(puzzlePrivate, []),
    };
  }
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
      await grantCreatorFlairOnApproval(submission);
      await publishApprovedCommunityPost(submission);
      return submission;
    }
    if (submission.status !== 'pending') {
      throw new Error('Only pending submissions can be approved.');
    }
    const hardnessBoundsByTier = await getHardnessBounds();
    const pipeline = createValidationPipeline(hardnessBoundsByTier);
    // Submissions that carry their own board (a fitted layout from the auto
    // flow, or a manual layout) were already verified by actually building
    // that board, and approval re-validates it again when applying the
    // layout. Re-running the legacy text-profile gate here would reject
    // boards the fitter proved playable ("crypto hardness is outside...").
    const carriesOwnBoard =
      submission.fittedLayout !== null ||
      (submission.creationMode === 'manual' && submission.manualLayout !== null);
    const phase1 = carriesOwnBoard
      ? pipeline.phase1Structural(submission.text)
      : pipeline.phase1(submission.text, submission.targetDifficulty);
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
    await grantCreatorFlairOnApproval(next);
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

const getCommunitySubmissionForStatus = async (params: {
  submissionId: string;
  status: CommunitySubmission['status'];
  statusError: string;
}): Promise<CommunitySubmission> => {
  const submission = await getCommunitySubmission(params.submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }
  if (submission.status !== params.status) {
    throw new Error(params.statusError);
  }
  return submission;
};

export const rejectCommunitySubmission = async (params: {
  submissionId: string;
  reason: string;
}): Promise<CommunitySubmission> => {
  const reviewer = assertUserId();
  const submission = await getCommunitySubmissionForStatus({
    submissionId: params.submissionId,
    status: 'pending',
    statusError: 'Only pending submissions can be rejected.',
  });
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
  const submission = await getCommunitySubmissionForStatus({
    submissionId: params.submissionId,
    status: 'approved',
    statusError: 'Only approved submissions can be sent back for changes.',
  });
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
  manualLayout?: CommunityManualLayout | null;
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
  // Manual submissions can also correct their board layout in the revision.
  // Re-validate the (possibly new) layout against the revised text so a mod's
  // "fix the unfair lock" request is actually actionable, and recompute the
  // difficulty/tier the same way the original manual submit does. Auto
  // submissions ignore any provided layout and keep manualLayout null.
  let nextManualLayout = submission.manualLayout;
  let nextTargetDifficulty = submission.targetDifficulty;
  let nextSuggestedTier = submission.suggestedTier;
  if (submission.creationMode === 'manual') {
    const revisedLayout = normalizeManualLayout(
      params.manualLayout ?? submission.manualLayout
    );
    const manualPreview = await buildManualLayoutPuzzlePreview({
      text: validated.sanitizedText,
      attribution: validated.sanitizedAttribution,
      category: submission.category,
      manualLayout: revisedLayout,
    });
    if (!manualPreview.puzzlePrivate || manualPreview.reasons.length > 0) {
      throw new Error(
        manualPreview.reasons[0] ??
          'The board layout no longer fits this text. Adjust the locks, blinds, or reveals and try again.'
      );
    }
    const guidancePrivate =
      manualPreview.guidancePuzzlePrivate ?? manualPreview.puzzlePrivate;
    nextManualLayout = revisedLayout;
    nextTargetDifficulty = guidancePrivate.difficulty;
    nextSuggestedTier = difficultyToTier(guidancePrivate.difficulty);
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
  // Auto submissions with a stored fitted board: a text edit moves tile
  // positions, so re-derive the layout for the revised text at the same
  // tier. Legacy auto submissions (no layout) keep the rebuild-on-approve
  // path untouched.
  let nextFittedLayout = submission.fittedLayout;
  if (submission.creationMode === 'auto' && submission.fittedLayout) {
    nextFittedLayout = await getCachedFittedLayout({
      text: validated.sanitizedText,
      tier: difficultyToTier(submission.targetDifficulty),
      author: validated.sanitizedAttribution,
      challengeType: submission.category,
    });
    if (!nextFittedLayout) {
      throw new Error(buildCommunityTierFitMessage(submission.targetDifficulty));
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
    manualLayout: nextManualLayout,
    fittedLayout: nextFittedLayout,
    targetDifficulty: nextTargetDifficulty,
    suggestedTier: nextSuggestedTier,
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
  const submission = await getCommunitySubmissionForStatus({
    submissionId: params.submissionId,
    status: 'approved',
    statusError: 'Only approved submissions can be removed.',
  });
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

const ENDLESS_MATCH_TOP_RANDOM_POOL = 3;
const ENDLESS_MATCH_CLOSE_SCORE_WINDOW = 0.45;
const ENDLESS_SHADOW_READY_MIN_PLAYS = 30;
const ENDLESS_SHADOW_READY_MAX_UNCERTAINTY = 0.5;

const clampEndlessDifficulty = (value: number): number =>
  Math.min(10, Math.max(1, value));

const ratingToEndlessTargetDifficulty = (
  playerRating: number | null | undefined
): number | null => {
  if (typeof playerRating !== 'number' || !Number.isFinite(playerRating)) {
    return null;
  }
  return clampEndlessDifficulty(Math.round((playerRating - 350) / 45));
};

const shadowSnapshotIsReadyForEndless = (snapshot: {
  itemUncertainty: number;
  itemPlayCount: number;
}): boolean =>
  snapshot.itemPlayCount >= ENDLESS_SHADOW_READY_MIN_PLAYS &&
  snapshot.itemUncertainty <= ENDLESS_SHADOW_READY_MAX_UNCERTAINTY;

const getCommunityEndlessEffectiveDifficulty = async (
  candidate: CommunityEndlessCandidate
): Promise<number> => {
  const evaluation = await getChallengeEvaluation(candidate.levelId);
  const submissionDifficulty = candidate.submission.targetDifficulty;
  const staticDifficulty =
    evaluation?.difficultyBreakdown.staticDifficulty ?? submissionDifficulty;
  const calibratedDifficulty =
    evaluation?.difficultyBreakdown.calibratedDifficulty ?? staticDifficulty;
  const modelDifficulty = staticDifficulty * 0.35 + calibratedDifficulty * 0.65;
  const shadow = evaluation?.shadowRatingSnapshot;
  if (shadow && shadowSnapshotIsReadyForEndless(shadow)) {
    const shadowWeight = (1 - shadow.itemUncertainty) * 0.6;
    return clampEndlessDifficulty(
      modelDifficulty * (1 - shadowWeight) +
        shadow.itemDifficultyRating * shadowWeight
    );
  }
  return clampEndlessDifficulty(modelDifficulty);
};

const scoreCommunityEndlessCandidateForRating = async (params: {
  candidate: CommunityEndlessCandidate;
  targetDifficulty: number;
}): Promise<CommunityEndlessMatchedCandidate> => {
  const effectiveDifficulty = await getCommunityEndlessEffectiveDifficulty(
    params.candidate
  );
  const matchGap = Math.abs(effectiveDifficulty - params.targetDifficulty);
  const tierGap =
    difficultyToTier(Math.round(effectiveDifficulty)) ===
    difficultyToTier(params.targetDifficulty)
      ? 0
      : 0.55;
  return {
    ...params.candidate,
    effectiveDifficulty,
    matchScore: matchGap + tierGap,
  };
};

const selectCommunityEndlessMatchForRating = async (params: {
  candidates: CommunityEndlessCandidate[];
  playerRating: number;
}): Promise<CommunityEndlessCandidate | null> => {
  const targetDifficulty = ratingToEndlessTargetDifficulty(params.playerRating);
  if (targetDifficulty === null) {
    return null;
  }
  const scored = await Promise.all(
    params.candidates.map((candidate) =>
      scoreCommunityEndlessCandidateForRating({
        candidate,
        targetDifficulty,
      })
    )
  );
  scored.sort((left, right) => {
    const scoreDelta = left.matchScore - right.matchScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return right.approvedAt - left.approvedAt;
  });
  const bestScore = scored[0]?.matchScore;
  if (bestScore === undefined) {
    return null;
  }
  const closeMatches = scored
    .filter(
      (candidate) =>
        candidate.matchScore <= bestScore + ENDLESS_MATCH_CLOSE_SCORE_WINDOW
    )
    .slice(0, ENDLESS_MATCH_TOP_RANDOM_POOL);
  return closeMatches[Math.floor(Math.random() * closeMatches.length)] ?? null;
};

export const getNextCommunityEndlessLevelId = async (params: {
  userId: string;
  categoryFilter?: ChallengeType | null;
  endlessSort?: EndlessSort;
  playerRating?: number | null;
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
    const ratingMatched =
      params.playerRating === undefined || params.playerRating === null
        ? null
        : await selectCommunityEndlessMatchForRating({
            candidates: openCandidates,
            playerRating: params.playerRating,
          });
    const selected =
      ratingMatched ??
      openCandidates[Math.floor(Math.random() * openCandidates.length)];
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

// ---------------------------------------------------------------------------
// Creator Acclaim — like/dislike voting on community challenges and the merit
// gate that credits a creator's lifetimeAcclaimedChallenges milestone.
// Threshold math lives in src/shared/acclaim.ts.
// ---------------------------------------------------------------------------

type CommunityVote = 'like' | 'dislike' | 'clear';
type ResolvedVote = 'like' | 'dislike' | null;

const communityVoteToValue = (vote: CommunityVote): '1' | '-1' | null =>
  vote === 'like' ? '1' : vote === 'dislike' ? '-1' : null;

const tallyCommunityVotes = (
  voteHash: Record<string, string>
): { likes: number; dislikes: number } => {
  let likes = 0;
  let dislikes = 0;
  for (const value of Object.values(voteHash)) {
    if (value === '1') {
      likes += 1;
    } else if (value === '-1') {
      dislikes += 1;
    }
  }
  return { likes, dislikes };
};

const getCommunityLevelAuthorId = async (
  levelId: string
): Promise<string | null> => {
  const submissionId = await redis.hGet(keyCommunitySubmissionsByLevel, levelId);
  if (!submissionId) {
    return null;
  }
  const submission = await getCommunitySubmission(submissionId);
  return submission?.authorId ?? null;
};

// Qualified plays from real players, excluding the creator's own plays.
const getCommunityQualifiedPlayCount = async (
  levelId: string,
  excludeUserId: string | null
): Promise<number> => {
  const total = await redis.zCard(keyLevelQualifiedPlayers(levelId));
  if (!excludeUserId) {
    return total;
  }
  const creatorScore = await redis.zScore(
    keyLevelQualifiedPlayers(levelId),
    excludeUserId
  );
  const creatorCounted =
    creatorScore === undefined || creatorScore === null ? 0 : 1;
  return Math.max(0, total - creatorCounted);
};

// Credits the creator's acclaim milestone the first time a level clears the bar.
const evaluateCommunityAcclaim = async (params: {
  levelId: string;
  authorId: string | null;
  likes: number;
  dislikes: number;
}): Promise<void> => {
  if (!params.authorId) {
    return;
  }
  const qualifiedPlays = await getCommunityQualifiedPlayCount(
    params.levelId,
    params.authorId
  );
  if (
    !isAcclaimed({
      qualifiedPlays,
      likes: params.likes,
      dislikes: params.dislikes,
    })
  ) {
    return;
  }
  const claimed = await redis.set(
    keyCommunityAcclaimAwarded(params.levelId),
    '1',
    { nx: true }
  );
  if (!claimed) {
    return; // already credited for this level
  }
  await redis.hIncrBy(keyCommunityCreatorStats(params.authorId), 'acclaimed', 1);
  await updateQuestProgressOnAcclaim({ userId: params.authorId });
};

export const recordCommunityVote = async (params: {
  levelId: string;
  vote: CommunityVote;
}): Promise<{ likes: number; dislikes: number; myVote: ResolvedVote }> => {
  const userId = assertUserId();
  const puzzle = await getPuzzlePrivate(params.levelId);
  if (!puzzle || puzzle.source !== 'COMMUNITY') {
    throw new Error('Voting is only available on community challenges.');
  }
  const authorId = await getCommunityLevelAuthorId(params.levelId);
  if (authorId && authorId === userId) {
    throw new Error("You can't vote on your own challenge.");
  }
  const votesKey = keyCommunityVotes(params.levelId);
  const desired = communityVoteToValue(params.vote);
  const priorRaw = await redis.hGet(votesKey, userId);
  const prior = priorRaw === '1' || priorRaw === '-1' ? priorRaw : null;
  if (desired !== prior) {
    if (desired === null) {
      await redis.hDel(votesKey, [userId]);
    } else {
      await redis.hSet(votesKey, { [userId]: desired });
    }
  }
  const { likes, dislikes } = tallyCommunityVotes(await redis.hGetAll(votesKey));
  await evaluateCommunityAcclaim({
    levelId: params.levelId,
    authorId,
    likes,
    dislikes,
  });
  const myVote: ResolvedVote =
    desired === '1' ? 'like' : desired === '-1' ? 'dislike' : null;
  return { likes, dislikes, myVote };
};

export const getCommunityVoteState = async (
  levelId: string
): Promise<{
  isCommunity: boolean;
  isOwnChallenge: boolean;
  likes: number;
  dislikes: number;
  myVote: ResolvedVote;
}> => {
  const userId = context.userId;
  const puzzle = await getPuzzlePrivate(levelId);
  if (!puzzle || puzzle.source !== 'COMMUNITY') {
    return {
      isCommunity: false,
      isOwnChallenge: false,
      likes: 0,
      dislikes: 0,
      myVote: null,
    };
  }
  const authorId = await getCommunityLevelAuthorId(levelId);
  const voteHash = await redis.hGetAll(keyCommunityVotes(levelId));
  const { likes, dislikes } = tallyCommunityVotes(voteHash);
  const myRaw = userId ? voteHash[userId] : undefined;
  const myVote: ResolvedVote =
    myRaw === '1' ? 'like' : myRaw === '-1' ? 'dislike' : null;
  return {
    isCommunity: true,
    isOwnChallenge: Boolean(userId && authorId && userId === authorId),
    likes,
    dislikes,
    myVote,
  };
};

// Per-level acclaim progress for the creator's "My Ciphers" view (B5).
export const getCommunityLevelAcclaimProgress = async (params: {
  levelId: string;
  authorId: string;
}): Promise<AcclaimProgress> => {
  const [qualifiedPlays, voteHash] = await Promise.all([
    getCommunityQualifiedPlayCount(params.levelId, params.authorId),
    redis.hGetAll(keyCommunityVotes(params.levelId)),
  ]);
  const { likes, dislikes } = tallyCommunityVotes(voteHash);
  return acclaimProgress({ qualifiedPlays, likes, dislikes });
};

// Acclaim progress for every published (approved) challenge the caller owns,
// so "My Ciphers" can show the journey toward the reward.
export const getMyCommunityCreatorProgress = async (): Promise<{
  levels: Array<{
    levelId: string;
    acclaimed: boolean;
    progress: AcclaimProgress;
  }>;
}> => {
  const userId = assertUserId();
  const submissions = await listMyCommunitySubmissions(50);
  const approved = submissions.filter(
    (submission): submission is CommunitySubmission & { levelId: string } =>
      submission.status === 'approved' &&
      typeof submission.levelId === 'string' &&
      submission.levelId.length > 0
  );
  const levels = await Promise.all(
    approved.map(async (submission) => {
      const [progress, awarded] = await Promise.all([
        getCommunityLevelAcclaimProgress({
          levelId: submission.levelId,
          authorId: userId,
        }),
        redis.get(keyCommunityAcclaimAwarded(submission.levelId)),
      ]);
      return {
        levelId: submission.levelId,
        acclaimed: awarded === '1',
        progress,
      };
    })
  );
  return { levels };
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
        // A play can push a level over the qualified-play floor; re-check acclaim
        // using the current vote tally so a play-driven crossing also credits.
        const { likes, dislikes } = tallyCommunityVotes(
          await redis.hGetAll(keyCommunityVotes(params.levelId))
        );
        await evaluateCommunityAcclaim({
          levelId: params.levelId,
          authorId: owner.authorId,
          likes,
          dislikes,
        });
      }
    }
  }
};
