import type { PadlockChain, PuzzlePrivate } from '../../shared/game.ts';
import { topCommonWords } from './common-word-ranks.ts';
import {
  computePhraseDifficultyProfile,
  sanitizePhrase,
  validateQuoteStructure,
  type DifficultyTier,
} from './content.ts';
import {
  buildDifficultyBreakdown,
  difficultyModelVersion,
  estimateDifficultyV2,
} from './difficulty-model.ts';
import {
  englishFrequencyOrder,
  runDummySolver,
  suffixHints,
} from './dummy-solver.ts';
import {
  applyAdjustment,
  buildPuzzle,
  chooseGoldIndex,
  computeObstructionBudget,
  computeObstructionBudgetSpent,
  tryAddBlindTile,
  tryAddPadlock,
  type Adjustment,
  type PuzzleDifficultyContext,
} from './puzzle.ts';
import { deriveSeed, mulberry32 } from './rng.ts';
import { solverBandForTier, type TierSolverBand } from './solver-thresholds.ts';
import { validatePuzzle } from './validation.ts';

// Bump whenever fitting logic changes so cached layouts from older code
// are never replayed against newer expectations.
export const tierFitLayoutVersion = 'v1';

export type FittedLayout = {
  prefilledIndices: number[];
  blindIndices: number[];
  padlockChains: PadlockChain[];
  goldIndex: number | null;
  seedKey: string;
  difficulty: number;
  layoutVersion: string;
};

export type TierFitSummary = {
  solverRatio: number;
  revealCount: number;
  blindCount: number;
  padlockCount: number;
  estimatedDifficulty: number;
  ceilingExceeded: boolean;
};

export type TierInfeasibleReason =
  | 'TEXT_INVALID'
  | 'TOO_SIMPLE_FOR_TIER'
  | 'COULD_NOT_REACH_BAND'
  | 'BUILD_FAILED';

export type TierFitOutcome =
  | {
      fitted: true;
      puzzlePrivate: PuzzlePrivate;
      layout: FittedLayout;
      summary: TierFitSummary;
    }
  | {
      fitted: false;
      reasonCode: TierInfeasibleReason;
      detail: string;
    };

export const representativeDifficultyForTier = (tier: DifficultyTier): number => {
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

export const tierFitSeedKey = (tier: DifficultyTier): string =>
  `fit:${tierFitLayoutVersion}:${tier}`;

// Reveals are the universal difficulty knob: a complex line stays fair at an
// easy tier when enough high-information letters start revealed. These caps
// scale with the line instead of the fixed legacy 4/2/1/1 wall.
export const maxRevealsForFit = (
  tier: DifficultyTier,
  uniqueLetterCount: number
): number => {
  if (tier === 'warmup') {
    return Math.min(10, Math.max(3, Math.ceil(uniqueLetterCount * 0.5)));
  }
  if (tier === 'medium') {
    return Math.max(2, Math.ceil(uniqueLetterCount * 0.33));
  }
  if (tier === 'hard') {
    return Math.max(1, Math.ceil(uniqueLetterCount * 0.2));
  }
  return Math.max(1, Math.ceil(uniqueLetterCount * 0.12));
};

export const tierDisplayName = (tier: DifficultyTier): string => {
  if (tier === 'warmup') {
    return 'Easy';
  }
  if (tier === 'medium') {
    return 'Medium';
  }
  if (tier === 'hard') {
    return 'Hard';
  }
  return 'Expert';
};

const expertMinUniqueLetters = 14;
const expertMinTotalLetters = 45;
const hardMinUniqueLetters = 10;

const structuralTierBlock = (params: {
  tier: DifficultyTier;
  uniqueLetterCount: number;
  totalLetters: number;
}): string | null => {
  if (params.tier === 'expert') {
    if (params.uniqueLetterCount < expertMinUniqueLetters) {
      return `Expert needs at least ${expertMinUniqueLetters} different letters; this line has ${params.uniqueLetterCount}.`;
    }
    if (params.totalLetters < expertMinTotalLetters) {
      return `Expert needs a longer line (at least ${expertMinTotalLetters} letters); this one has ${params.totalLetters}.`;
    }
    return null;
  }
  if (params.tier === 'hard' && params.uniqueLetterCount < hardMinUniqueLetters) {
    return `Hard needs at least ${hardMinUniqueLetters} different letters; this line has ${params.uniqueLetterCount}.`;
  }
  return null;
};

const englishFrequencyBonus = new Map<string, number>(
  englishFrequencyOrder.map((letter, index) => [
    letter,
    (englishFrequencyOrder.length - index) / englishFrequencyOrder.length,
  ])
);

type RevealCandidate = {
  char: string;
  index: number;
  score: number;
};

/**
 * Ranks unrevealed cipher letters by how much information revealing them gives
 * a human solver: phrase frequency, English frequency, and whether they unlock
 * the classic anchors (one-letter words, THE/AND-style common short words,
 * common suffixes). Deterministic: ties break on letter order.
 */
export const rankRevealCandidates = (
  puzzle: PuzzlePrivate,
  excludedIndices: ReadonlySet<number>
): RevealCandidate[] => {
  const blocked = new Set<number>([
    ...puzzle.prefilledIndices,
    ...puzzle.blindIndices,
    ...(puzzle.lockIndices ?? []),
    ...excludedIndices,
  ]);
  const revealedChars = new Set(
    puzzle.prefilledIndices
      .map((index) => puzzle.tiles[index]?.char)
      .filter((char): char is string => typeof char === 'string')
  );

  const anchorChars = new Set<string>();
  const suffixChars = new Set<string>();
  const oneLetterWordChars = new Set<string>();
  for (const word of puzzle.words) {
    if (word.length === 1) {
      oneLetterWordChars.add(word);
    }
    if (word.length <= 3 && topCommonWords.has(word)) {
      for (const char of word) {
        anchorChars.add(char);
      }
    }
    for (const suffix of suffixHints) {
      if (word.length > suffix.length && word.endsWith(suffix)) {
        for (const char of suffix) {
          suffixChars.add(char);
        }
      }
    }
  }

  const byChar = new Map<string, { firstIndex: number; frequency: number }>();
  for (const tile of puzzle.tiles) {
    if (!tile.isLetter || blocked.has(tile.index) || revealedChars.has(tile.char)) {
      continue;
    }
    const existing = byChar.get(tile.char);
    if (existing) {
      existing.frequency += 1;
      existing.firstIndex = Math.min(existing.firstIndex, tile.index);
    } else {
      byChar.set(tile.char, { firstIndex: tile.index, frequency: 1 });
    }
  }

  const candidates: RevealCandidate[] = [];
  for (const [char, entry] of byChar.entries()) {
    let score =
      entry.frequency + (englishFrequencyBonus.get(char) ?? 0) * 2;
    if (oneLetterWordChars.has(char)) {
      score += 3;
    }
    if (anchorChars.has(char)) {
      score += 2;
    }
    if (suffixChars.has(char)) {
      score += 1.5;
    }
    candidates.push({ char, index: entry.firstIndex, score });
  }
  candidates.sort(
    (a, b) => b.score - a.score || a.char.localeCompare(b.char)
  );
  return candidates;
};

// Enough headroom to strip a heavily obstructed base board AND add the
// reveals an off-profile line needs (each mutation costs one solver run of
// a few ms; the worst case stays far below the 30s request limit).
const maxFitMutations = 24;
// Branch expansions are the deterministic budget (same result on any
// machine, any load); the time cap is only a pathological-input guard and
// must be generous enough to never bind first — if it does, layouts become
// machine-speed-dependent and cached vs re-fit boards can diverge.
const fitSolverBudget = { maxSearchMs: 2000, maxBranchExpansions: 1200 } as const;
const ceilingEpsilon = 0.02;

type BandPlacement = {
  ratio: number;
  belowFloor: boolean;
  aboveCeiling: boolean;
  blindGuessRequired: boolean;
};

const placeInBand = (puzzle: PuzzlePrivate, band: TierSolverBand): BandPlacement => {
  // Floor semantics match the legacy build gate exactly: the solver targets
  // the floor and must reach it without blind guessing. Asking for a higher
  // target up front makes the solver search to exhaustion and report blind
  // guesses that a floor-targeted run never needs.
  const floorRun = runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    requiredSolveRatio: band.floor,
    solverProfile: 'standard',
    maxSearchMs: fitSolverBudget.maxSearchMs,
    maxBranchExpansions: fitSolverBudget.maxBranchExpansions,
  });
  const belowFloor =
    !floorRun.solvable ||
    floorRun.blindGuessRequired ||
    floorRun.solvedRatio < band.floor;
  if (belowFloor || band.ceiling >= 1) {
    return {
      ratio: floorRun.solvedRatio,
      belowFloor,
      aboveCeiling: false,
      blindGuessRequired: floorRun.blindGuessRequired,
    };
  }
  // Best-effort ceiling probe: only a clean solve beyond the ceiling counts
  // as "too easy" — stalling on the way up means the tier still has bite.
  const ceilingRun = runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    requiredSolveRatio: Math.min(1, band.ceiling + ceilingEpsilon),
    solverProfile: 'standard',
    maxSearchMs: fitSolverBudget.maxSearchMs,
    maxBranchExpansions: fitSolverBudget.maxBranchExpansions,
  });
  const aboveCeiling =
    ceilingRun.solvable &&
    !ceilingRun.blindGuessRequired &&
    ceilingRun.solvedRatio > band.ceiling + ceilingEpsilon;
  return {
    ratio: Math.max(floorRun.solvedRatio, ceilingRun.solvedRatio),
    belowFloor: false,
    aboveCeiling,
    blindGuessRequired: false,
  };
};

const withRecomputedDifficulty = (
  puzzle: PuzzlePrivate,
  difficulty: number
): PuzzlePrivate => {
  const candidate: PuzzlePrivate = { ...puzzle, difficulty };
  const breakdown = buildDifficultyBreakdown(candidate);
  return {
    ...candidate,
    difficultyModelVersion,
    difficultyBreakdown: breakdown,
  };
};

/**
 * Fits a board for the given line to the target tier's solver band by
 * searching over reveals (information-ranked) and obstructions, instead of
 * rejecting lines whose text profile doesn't match the tier. Deterministic
 * for a given (text, tier): same seeds, same candidate order, same board.
 */
export const fitBoardToTier = (params: {
  text: string;
  tier: DifficultyTier;
  dateKey: string;
  author: string;
  challengeType: PuzzlePrivate['challengeType'];
  logicalPercent: number;
  levelId?: string;
}): TierFitOutcome => {
  const normalizedText = sanitizePhrase(params.text);
  const structure = validateQuoteStructure(normalizedText);
  if (!structure.valid) {
    return {
      fitted: false,
      reasonCode: 'TEXT_INVALID',
      detail: structure.reasons[0] ?? 'This line cannot become a puzzle yet.',
    };
  }

  const profile = computePhraseDifficultyProfile(normalizedText);
  const blockReason = structuralTierBlock({
    tier: params.tier,
    uniqueLetterCount: profile.uniqueLetterCount,
    totalLetters: profile.totalLetters,
  });
  if (blockReason) {
    return {
      fitted: false,
      reasonCode: 'TOO_SIMPLE_FOR_TIER',
      detail: blockReason,
    };
  }

  const difficulty = representativeDifficultyForTier(params.tier);
  const seedKey = tierFitSeedKey(params.tier);
  const band = solverBandForTier(params.tier);
  const rng = mulberry32(deriveSeed(seedKey, normalizedText));

  let basePuzzle: PuzzlePrivate;
  try {
    basePuzzle = buildPuzzle({
      levelId: params.levelId ?? `fit-${params.tier}`,
      seedKey,
      dateKey: params.dateKey,
      text: normalizedText,
      author: params.author,
      challengeType: params.challengeType,
      source: 'COMMUNITY',
      difficulty,
      logicalPercent: params.logicalPercent,
      previousMapping: null,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    }).puzzlePrivate;
  } catch (error) {
    return {
      fitted: false,
      reasonCode: 'BUILD_FAILED',
      detail:
        error instanceof Error ? error.message : 'Board build failed unexpectedly.',
    };
  }

  const difficultyContext: PuzzleDifficultyContext = {
    tier: params.tier,
    difficulty,
    cipherType: basePuzzle.cipherType,
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
  const budgetTotal = computeObstructionBudget(difficultyContext).total;
  const revealCap = maxRevealsForFit(params.tier, profile.uniqueLetterCount);

  const applyValidated = (
    puzzle: PuzzlePrivate,
    adjustment: Adjustment
  ): PuzzlePrivate | null => {
    const next = applyAdjustment(puzzle, adjustment);
    return validatePuzzle(next).valid ? next : null;
  };

  // The raw base board can start structurally unfair (no starter clue, an
  // unfair blind tile, a self-locking padlock). Repair it before fitting:
  // seed a reveal if possible, then strip obstructions until valid — the
  // fitting loop can re-add obstructions it can afford.
  let current = basePuzzle;
  if (!validatePuzzle(current).valid) {
    const seedCandidates = rankRevealCandidates(current, new Set());
    for (const candidate of seedCandidates) {
      const repaired = applyValidated(current, {
        type: 'add_prefill',
        impact: 0,
        cost: 0,
        data: candidate.index,
        description: `seed reveal ${candidate.char}`,
      });
      if (repaired) {
        current = repaired;
        break;
      }
    }
  }
  while (
    !validatePuzzle(current).valid &&
    (current.blindIndices.length > 0 || current.padlockChains.length > 0)
  ) {
    const blindIndex = current.blindIndices[current.blindIndices.length - 1];
    if (blindIndex !== undefined) {
      current = applyAdjustment(current, {
        type: 'remove_blind',
        impact: 0,
        cost: 0,
        data: blindIndex,
        description: 'repair: remove blind tile',
      });
      continue;
    }
    const chain = current.padlockChains[current.padlockChains.length - 1];
    if (chain) {
      current = applyAdjustment(current, {
        type: 'remove_padlock',
        impact: 0,
        cost: 0,
        data: chain,
        description: 'repair: remove padlock',
      });
    }
  }
  if (!validatePuzzle(current).valid && current.prefilledIndices.length === 0) {
    const seedCandidates = rankRevealCandidates(current, new Set());
    const seedIndex = seedCandidates[0]?.index;
    if (seedIndex !== undefined) {
      current = applyAdjustment(current, {
        type: 'add_prefill',
        impact: 0,
        cost: 0,
        data: seedIndex,
        description: 'repair: seed reveal',
      });
    }
  }
  if (!validatePuzzle(current).valid) {
    return {
      fitted: false,
      reasonCode: 'BUILD_FAILED',
      detail:
        validatePuzzle(current).reasons[0] ?? 'Board build failed unexpectedly.',
    };
  }

  const bannedRevealIndices = new Set<number>();
  let placement = placeInBand(current, band);
  let ceilingExceeded = placement.aboveCeiling;

  for (
    let mutation = 0;
    mutation < maxFitMutations && (placement.belowFloor || placement.aboveCeiling);
    mutation += 1
  ) {
    let next: PuzzlePrivate | null = null;

    if (placement.belowFloor) {
      if (current.prefilledIndices.length < revealCap) {
        const candidates = rankRevealCandidates(current, bannedRevealIndices);
        for (const candidate of candidates) {
          next = applyValidated(current, {
            type: 'add_prefill',
            impact: 0,
            cost: 0,
            data: candidate.index,
            description: `reveal ${candidate.char}`,
          });
          if (next) {
            break;
          }
          bannedRevealIndices.add(candidate.index);
        }
      }
      if (!next && current.blindIndices.length > 0) {
        const blindIndex = current.blindIndices[current.blindIndices.length - 1];
        if (blindIndex !== undefined) {
          next = applyValidated(current, {
            type: 'remove_blind',
            impact: 0,
            cost: 0,
            data: blindIndex,
            description: 'remove blind tile',
          });
        }
      }
      if (!next && current.padlockChains.length > 0) {
        const chain = current.padlockChains[current.padlockChains.length - 1];
        if (chain) {
          next = applyValidated(current, {
            type: 'remove_padlock',
            impact: 0,
            cost: 0,
            data: chain,
            description: 'remove padlock',
          });
        }
      }
    } else {
      // Above the ceiling: make it harder, cheapest information loss first.
      if (current.prefilledIndices.length > 1) {
        const ranked = rankRevealCandidates(
          { ...current, prefilledIndices: [] },
          new Set()
        );
        const valueByIndex = new Map(
          ranked.map((candidate) => [candidate.index, candidate.score])
        );
        const removable = [...current.prefilledIndices].sort(
          (a, b) => (valueByIndex.get(a) ?? 0) - (valueByIndex.get(b) ?? 0)
        );
        for (const index of removable) {
          next = applyValidated(current, {
            type: 'remove_prefill',
            impact: 0,
            cost: 0,
            data: index,
            description: 'remove reveal',
          });
          if (next) {
            break;
          }
        }
      }
      if (!next && computeObstructionBudgetSpent(current) < budgetTotal) {
        const blindIndex = tryAddBlindTile(current);
        if (blindIndex !== null) {
          next = applyValidated(current, {
            type: 'add_blind',
            impact: 0,
            cost: 0,
            data: blindIndex,
            description: 'add blind tile',
          });
        }
        if (!next) {
          const padlock = tryAddPadlock(current, rng);
          if (padlock) {
            next = applyValidated(current, {
              type: 'add_padlock',
              impact: 0,
              cost: 0,
              data: padlock,
              description: 'add padlock',
            });
          }
        }
      }
      if (!next) {
        // Best effort: accept an easier-than-target board rather than fail.
        ceilingExceeded = true;
        break;
      }
    }

    if (!next) {
      break;
    }
    current = next;
    placement = placeInBand(current, band);
    ceilingExceeded = placement.aboveCeiling;
  }

  if (placement.belowFloor) {
    return {
      fitted: false,
      reasonCode: 'COULD_NOT_REACH_BAND',
      detail: `${tierDisplayName(params.tier)} doesn't work for this line — its words are too unusual to solve without guessing.`,
    };
  }

  // Fresh rng: the gold tile must depend only on the final layout, not on
  // how many draws the fitting path happened to consume along the way.
  const goldRng = mulberry32(deriveSeed(`${seedKey}:gold`, normalizedText));
  const goldIndex = chooseGoldIndex(
    current.tiles,
    current.prefilledIndices,
    current.blindIndices,
    goldRng,
    current.lockIndices ?? []
  );
  const fitted = withRecomputedDifficulty(
    { ...current, goldIndex },
    difficulty
  );
  const finalValidation = validatePuzzle(fitted);
  if (!finalValidation.valid) {
    return {
      fitted: false,
      reasonCode: 'COULD_NOT_REACH_BAND',
      detail:
        finalValidation.reasons[0] ??
        `${tierDisplayName(params.tier)} doesn't work for this line — its words are too unusual to solve without guessing.`,
    };
  }

  return {
    fitted: true,
    puzzlePrivate: fitted,
    layout: {
      prefilledIndices: [...fitted.prefilledIndices].sort((a, b) => a - b),
      blindIndices: [...fitted.blindIndices].sort((a, b) => a - b),
      padlockChains: fitted.padlockChains,
      goldIndex: fitted.goldIndex ?? null,
      seedKey,
      difficulty,
      layoutVersion: tierFitLayoutVersion,
    },
    summary: {
      solverRatio: placement.ratio,
      revealCount: fitted.prefilledIndices.length,
      blindCount: fitted.blindIndices.length,
      padlockCount: fitted.padlockChains.length,
      estimatedDifficulty: estimateDifficultyV2(fitted),
      ceilingExceeded,
    },
  };
};
