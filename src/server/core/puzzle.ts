import type {
  PadlockChain,
  PuzzlePrivate,
  PuzzlePublic,
  PuzzleTile,
  StoredPadlockChain,
} from '../../shared/game.ts';
import { puzzlePrivateSchema, puzzlePublicSchema } from '../../shared/game.ts';
import { chooseCipherType, buildCipherMapping, invertCipherMapping } from './cipher.ts';
import {
  computePhraseDifficultyProfile,
  difficultyToTier,
  maxPuzzleTotalLength,
  sanitizePhrase,
} from './content.ts';
import { runDummySolver } from './dummy-solver.ts';
import { checkPadlockStatus } from './gameplay.ts';
import { deriveSeed, mulberry32, shuffleWithRng, type Rng } from './rng.ts';

const isLetter = (char: string): boolean => /^[A-Z]$/.test(char);

const solveRatioThreshold = (difficulty: number): number => {
  if (difficulty <= 3) {
    return 0.9;
  }
  if (difficulty <= 7) {
    return 0.8;
  }
  if (difficulty >= 9) {
    return 0.65;
  }
  return 0.7;
};

// Obstruction Budget Types
export type ObstructionBudget = {
  total: number;
  spent: number;
};

export type PuzzleDifficultyContext = {
  tier: ReturnType<typeof difficultyToTier>;
  difficulty: number;
  cipherType: 'shift' | 'random' | 'reverse';
  phraseUniqueLetters: number;
  phraseOneLetterWords: number;
  phraseSuffixCount: number;
  cryptoHardness: number;
  totalLetters?: number;
  wordCount?: number;
  uniqueWordCount?: number;
  uniqueWordRatio?: number;
  repeatedWordRatio?: number;
};

export type ObstructionInventory = {
  padlockChains: PadlockChain[];
  blindIndices: number[];
  prefilledIndices: number[];
  lockIndices: number[];
};

// Obstruction Budget Cost Constants
export const BLIND_TILE_COST = 8;
export const PADLOCK_CHAIN_COST = 18;
export const PADLOCK_KEY_EASY_DISCOUNT = 4;
export const PREFILL_REMOVAL_COST = 5;

export const ObstructionCosts = {
  BLIND_TILE: BLIND_TILE_COST,
  PADLOCK_CHAIN: PADLOCK_CHAIN_COST,
  PADLOCK_KEY_EASY_DISCOUNT,
  PREFILL_REMOVAL: PREFILL_REMOVAL_COST,
} as const;

// Difficulty Adjustment Types
export type DifficultyTier = 'warmup' | 'medium' | 'hard' | 'expert';

export type Adjustment = {
  type: 'add_padlock' | 'add_blind' | 'remove_prefill' | 'remove_blind' | 'remove_padlock' | 'add_prefill';
  impact: number;
  cost: number;
  data: unknown;
  description: string;
};

export type DifficultyAdjustmentResult = {
  success: boolean;
  puzzle: PuzzlePrivate | null;
  achievedDifficulty: number;
  achievableTierRange: DifficultyTier[];
  adjustmentLog: string[];
  budgetUsed: number;
  budgetTotal: number;
  reason?: string;
};

export type DifficultyAdjustmentContext = {
  currentTier: DifficultyTier;
  targetTier: DifficultyTier;
  gapMagnitude: number;
  budget: ObstructionBudget;
  inventory: ObstructionInventory;
  constraints: FairnessConstraints;
};

export type FairnessConstraints = {
  minStarterClues: number;
  maxLockedRatio: number;
  maxBlindsPerWord: number;
  requireNonSingletonBlinds: boolean;
  preventCircularPadlocks: boolean;
};

/**
 * Computes the obstruction budget for a puzzle based on difficulty tier and text properties.
 * 
 * Budget Formula:
 * - Base budget: warmup=20, medium=50, hard=85, expert=110
 * - Hardness discount: harder text reduces extra obstruction budget
 * - Helper / repetition bonus: easier text earns more obstruction budget so it can still be tuned upward
 * - Length bonus: longer lines can absorb more board obstructions fairly
 * 
 * @param context - The puzzle difficulty context including tier, crypto hardness, and helper counts
 * @returns ObstructionBudget with total points and spent points (initially 0)
 */
export const computeObstructionBudget = (
  context: PuzzleDifficultyContext
): ObstructionBudget => {
  const baseBudget =
    context.tier === 'warmup' ? 20 : context.tier === 'medium' ? 50 : context.tier === 'hard' ? 85 : 110;
  const totalLetters = context.totalLetters ?? Math.max(context.phraseUniqueLetters * 2, 0);
  const repeatedWordRatio =
    context.repeatedWordRatio ?? Math.max(0, 1 - (context.uniqueWordRatio ?? 1));
  const hardnessDiscount = context.cryptoHardness * 25;
  const helperBonus =
    context.phraseOneLetterWords * 3 + context.phraseSuffixCount * 2;
  const repetitionBonus = repeatedWordRatio * 12;
  const lengthBonus = Math.max(-6, Math.min(14, (totalLetters - 24) * 0.8));
  const total = Math.max(
    0,
    Math.round(baseBudget + helperBonus + repetitionBonus + lengthBonus - hardnessDiscount)
  );
  return {
    total,
    spent: 0,
  };
};

/**
 * Spends budget points by incrementing the spent counter.
 * Will not exceed the total budget.
 * 
 * @param budget - The budget to modify (mutated in place)
 * @param amount - The amount to spend (must be positive)
 */
export const spendBudget = (budget: ObstructionBudget, amount: number): void => {
  if (amount <= 0) {
    return;
  }
  budget.spent = Math.min(budget.total, budget.spent + amount);
};

/**
 * Returns the remaining budget points available.
 * 
 * @param budget - The budget to check
 * @returns The remaining budget (total - spent), minimum 0
 */
export const remainingBudget = (budget: ObstructionBudget): number =>
  Math.max(0, budget.total - budget.spent);

const parseTiles = (text: string): { tiles: PuzzleTile[]; words: string[] } => {
  const tiles: PuzzleTile[] = [];
  const words: string[] = [];
  let currentWord = '';
  let wordIndex = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    const letter = isLetter(char);

    tiles.push({
      index: i,
      char,
      isLetter: letter,
      wordIndex,
    });

    if (char === ' ') {
      if (currentWord.length > 0) {
        words.push(currentWord);
        currentWord = '';
        wordIndex += 1;
      }
      continue;
    }

    if (letter) {
      currentWord += char;
    } else if (currentWord.length > 0) {
      words.push(currentWord);
      currentWord = '';
      wordIndex += 1;
    }
  }

  if (currentWord.length > 0) {
    words.push(currentWord);
  }

  return { tiles, words };
};

const uniqueSortedIndices = (indices: number[]): number[] =>
  Array.from(new Set(indices)).sort((a, b) => a - b);

const countFullyPrefilledWords = (params: {
  tiles: PuzzleTile[];
  words: string[];
  prefilledIndices: number[];
}): number => {
  const prefilledSet = new Set(params.prefilledIndices);
  let count = 0;
  for (let wordIndex = 0; wordIndex < params.words.length; wordIndex += 1) {
    const letterIndices = params.tiles
      .filter((tile) => tile.isLetter && tile.wordIndex === wordIndex)
      .map((tile) => tile.index);
    if (
      letterIndices.length > 0 &&
      letterIndices.every((index) => prefilledSet.has(index))
    ) {
      count += 1;
    }
  }
  return count;
};

const allLetterIndicesForWord = (tiles: PuzzleTile[], wordIndex: number): number[] =>
  tiles
    .filter((tile) => tile.isLetter && tile.wordIndex === wordIndex)
    .map((tile) => tile.index);

export const normalizePadlockChains = (params: {
  tiles: PuzzleTile[];
  padlockChains: StoredPadlockChain[];
}): PadlockChain[] => {
  const letterIndexSet = new Set(
    params.tiles.filter((tile) => tile.isLetter).map((tile) => tile.index)
  );
  const usedChainIds = new Set<number>();
  let nextChainId = 1;

  const allocateChainId = (preferredId: number | null): number => {
    if (preferredId !== null && preferredId > 0 && !usedChainIds.has(preferredId)) {
      usedChainIds.add(preferredId);
      return preferredId;
    }
    while (usedChainIds.has(nextChainId)) {
      nextChainId += 1;
    }
    usedChainIds.add(nextChainId);
    return nextChainId;
  };

  const normalized: PadlockChain[] = [];
  for (const chain of params.padlockChains) {
    const keyIndices =
      'chainId' in chain
        ? uniqueSortedIndices(chain.keyIndices.filter((index) => letterIndexSet.has(index)))
        : allLetterIndicesForWord(params.tiles, chain.keyWordIndex);
    const lockedIndices =
      'chainId' in chain
        ? uniqueSortedIndices(
          chain.lockedIndices.filter((index) => letterIndexSet.has(index))
        )
        : allLetterIndicesForWord(params.tiles, chain.lockedWordIndex);

    if (keyIndices.length === 0 || lockedIndices.length === 0) {
      continue;
    }

    normalized.push({
      chainId: allocateChainId('chainId' in chain ? chain.chainId : null),
      keyIndices,
      lockedIndices,
    });
  }

  return normalized;
};

const choosePrefilledIndices = (params: {
  tiles: PuzzleTile[];
  targetText: string;
  context: PuzzleDifficultyContext;
  budget: ObstructionBudget;
  rng: Rng;
}): number[] => {
  const letterTiles = params.tiles.filter((tile) => tile.isLetter);
  if (letterTiles.length === 0) {
    return [];
  }

  const tier = params.context.tier;
  const revealRange =
    tier === 'warmup'
      ? [6, 10]
      : tier === 'medium'
        ? [4, 7]
        : tier === 'hard'
          ? [3, 5]
          : [2, 4];
  const minReveals = revealRange[0];
  const maxReveals = revealRange[1];
  if (minReveals === undefined || maxReveals === undefined) {
    return [];
  }

  const wordCount = new Set(letterTiles.map((tile) => tile.wordIndex)).size;
  const baseTarget = Math.round(
    minReveals + (maxReveals - minReveals) * (1 - params.context.cryptoHardness)
  );
  const budgetTotal = params.budget.total;
  const cipherBonus = params.context.cipherType === 'random' ? 1 : 0;
  const budgetAdjustment = budgetTotal < 25 ? 1 : budgetTotal > 70 ? -1 : 0;
  const computedTarget = baseTarget + cipherBonus + budgetAdjustment;
  const targetRevealCount = Math.max(minReveals, Math.min(maxReveals, computedTarget));
  const maxPrefillByLetters = Math.max(
    1,
    Math.ceil(Math.min(1, letterTiles.length / maxPuzzleTotalLength) * letterTiles.length * 0.35) +
      1
  );
  const maxPrefillByWords = wordCount + 2;
  const cappedTargetRevealCount = Math.max(
    1,
    Math.min(targetRevealCount, maxPrefillByLetters, maxPrefillByWords, letterTiles.length)
  );

  const letterFrequency = new Map<string, number>();
  for (const tile of letterTiles) {
    letterFrequency.set(tile.char, (letterFrequency.get(tile.char) ?? 0) + 1);
  }

  const lettersByWordIndex = new Map<number, number[]>();
  for (const tile of letterTiles) {
    const existing = lettersByWordIndex.get(tile.wordIndex) ?? [];
    existing.push(tile.index);
    lettersByWordIndex.set(tile.wordIndex, existing);
  }
  for (const entry of lettersByWordIndex.values()) {
    entry.sort((a, b) => a - b);
  }

  const longWordThreshold = 6;
  const firstQuarterIndex = Math.max(0, Math.floor(params.targetText.length * 0.25) - 1);

  type Candidate = {
    index: number;
    char: string;
    frequency: number;
    oneLetterWord: boolean;
    touchesApostrophe: boolean;
    wordStart: number;
    wordEnd: number;
    wordLength: number;
    isLongWordEdge: boolean;
    tieBreaker: number;
  };

  const candidates: Candidate[] = letterTiles.map((tile) => {
    const wordIndices = lettersByWordIndex.get(tile.wordIndex) ?? [tile.index];
    const wordStart = wordIndices[0] ?? tile.index;
    const wordEnd = wordIndices[wordIndices.length - 1] ?? tile.index;
    const wordLength = wordIndices.length;
    const leftChar = tile.index > 0 ? params.targetText.charAt(tile.index - 1) : '';
    const rightChar =
      tile.index + 1 < params.targetText.length
        ? params.targetText.charAt(tile.index + 1)
        : '';

    return {
      index: tile.index,
      char: tile.char,
      frequency: letterFrequency.get(tile.char) ?? 0,
      oneLetterWord: wordLength === 1,
      touchesApostrophe: leftChar === "'" || rightChar === "'",
      wordStart,
      wordEnd,
      wordLength,
      isLongWordEdge:
        wordLength >= longWordThreshold && (tile.index === wordStart || tile.index === wordEnd),
      tieBreaker: params.rng(),
    };
  });

  candidates.sort((a, b) => {
    if (a.frequency !== b.frequency) {
      return b.frequency - a.frequency;
    }
    if (a.oneLetterWord !== b.oneLetterWord) {
      return a.oneLetterWord ? -1 : 1;
    }
    if (a.touchesApostrophe !== b.touchesApostrophe) {
      return a.touchesApostrophe ? -1 : 1;
    }
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return a.tieBreaker - b.tieBreaker;
  });

  const selected = new Set<number>();
  const selectedLetters = new Set<string>();

  const chooseAnchorWordIndices = (): number[] => {
    const totalLetters = params.context.totalLetters ?? letterTiles.length;
    const repeatedWordRatio =
      params.context.repeatedWordRatio ??
      Math.max(0, 1 - (params.context.uniqueWordRatio ?? 1));
    const generosityScore =
      (1 - params.context.cryptoHardness) * 0.55 +
      repeatedWordRatio * 0.25 +
      Math.min(1, totalLetters / 40) * 0.2;
    const allowAnchorReveal =
      tier === 'warmup' ||
      (tier === 'medium' && generosityScore >= 0.5) ||
      (tier === 'hard' && generosityScore >= 0.82);
    if (!allowAnchorReveal) {
      return [];
    }

    const candidates = [...lettersByWordIndex.entries()]
      .map(([wordIndex, indices]) => ({
        wordIndex,
        indices,
        length: indices.length,
        normalizedStart:
          params.targetText.length > 0 ? (indices[0] ?? 0) / params.targetText.length : 1,
      }))
      .filter((entry) => entry.length >= 2 && entry.length <= Math.max(4, cappedTargetRevealCount))
      .sort((a, b) => {
        const aLengthPenalty = Math.abs(a.length - (tier === 'warmup' ? 3 : 4));
        const bLengthPenalty = Math.abs(b.length - (tier === 'warmup' ? 3 : 4));
        if (aLengthPenalty !== bLengthPenalty) {
          return aLengthPenalty - bLengthPenalty;
        }
        return a.normalizedStart - b.normalizedStart;
      });

    return candidates[0]?.indices ?? [];
  };

  const canSelect = (candidate: Candidate): boolean => {
    if (selected.has(candidate.index)) {
      return false;
    }
    if (!candidate.isLongWordEdge) {
      return true;
    }
    const oppositeEdge =
      candidate.index === candidate.wordStart ? candidate.wordEnd : candidate.wordStart;
    return !selected.has(oppositeEdge);
  };

  const selectCandidate = (candidate: Candidate): boolean => {
    if (!canSelect(candidate)) {
      return false;
    }
    selected.add(candidate.index);
    selectedLetters.add(candidate.char);
    return true;
  };

  const minUnique = tier === 'warmup' ? 4 : tier === 'expert' ? 2 : 3;
  const uniqueRevealTarget = Math.min(
    letterFrequency.size,
    Math.max(minUnique, Math.min(cappedTargetRevealCount, letterFrequency.size))
  );

  for (const index of chooseAnchorWordIndices()) {
    const tile = params.tiles[index];
    if (!tile || !tile.isLetter) {
      continue;
    }
    selected.add(index);
    selectedLetters.add(tile.char);
  }

  const earlyCandidate = candidates.find(
    (candidate) => candidate.index <= firstQuarterIndex && canSelect(candidate)
  );
  if (earlyCandidate) {
    selectCandidate(earlyCandidate);
  }

  const hasLongWordReveal = (): boolean =>
    candidates.some(
      (candidate) =>
        candidate.wordLength >= longWordThreshold && selected.has(candidate.index)
    );
  if (!hasLongWordReveal()) {
    const longWordCandidate = candidates.find(
      (candidate) => candidate.wordLength >= longWordThreshold && canSelect(candidate)
    );
    if (longWordCandidate && selected.size < cappedTargetRevealCount) {
      selectCandidate(longWordCandidate);
    }
  }

  for (const candidate of candidates) {
    if (
      selected.size >= cappedTargetRevealCount ||
      selectedLetters.size >= uniqueRevealTarget
    ) {
      break;
    }
    if (selectedLetters.has(candidate.char)) {
      continue;
    }
    selectCandidate(candidate);
  }

  for (const candidate of candidates) {
    if (selected.size >= cappedTargetRevealCount) {
      break;
    }
    selectCandidate(candidate);
  }

  const selectedIndices = Array.from(selected.values()).sort((a, b) => a - b);
  return selectedIndices;
};

const letterIndicesByChar = (tiles: PuzzleTile[]): Map<string, number[]> => {
  const byLetter = new Map<string, number[]>();
  for (const tile of tiles) {
    if (!tile.isLetter) {
      continue;
    }
    const existing = byLetter.get(tile.char) ?? [];
    existing.push(tile.index);
    byLetter.set(tile.char, existing);
  }
  return byLetter;
};

const choosePadlockObstruction = (params: {
  basePuzzle: PuzzlePrivate;
  prefilledIndices: number[];
  budget: ObstructionBudget;
  rng: Rng;
}): { lockIndices: number[]; padlockChains: PadlockChain[] } => {
  const byLetter = letterIndicesByChar(params.basePuzzle.tiles);
  const letterTiles = params.basePuzzle.tiles.filter((tile) => tile.isLetter);
  const totalLetters = letterTiles.length;
  const wordLetterCounts = new Map<number, number>();
  for (const tile of letterTiles) {
    wordLetterCounts.set(tile.wordIndex, (wordLetterCounts.get(tile.wordIndex) ?? 0) + 1);
  }
  const longWordIndices = new Set(
    [...wordLetterCounts.entries()]
      .filter(([, count]) => count >= 6)
      .map(([wordIndex]) => wordIndex)
  );
  const tier = difficultyToTier(params.basePuzzle.difficulty);
  const baseMaxLockedRatio =
    tier === 'warmup' ? 0.2 : tier === 'medium' ? 0.25 : tier === 'hard' ? 0.3 : 0.35;
  const maxLockedRatio =
    params.basePuzzle.cipherType === 'shift'
      ? Math.max(0.15, baseMaxLockedRatio - 0.05)
      : baseMaxLockedRatio;
  const lockSolveThreshold =
    tier === 'warmup' ? 0.7 : tier === 'medium' ? 0.6 : tier === 'hard' ? 0.5 : 0.45;
  const lockCandidateLimit =
    tier === 'warmup' ? 4 : tier === 'medium' ? 6 : tier === 'hard' ? 8 : 10;
  const lockSolverBudgetMs =
    tier === 'warmup' ? 10 : tier === 'medium' ? 12 : tier === 'hard' ? 14 : 16;
  const lockSolverBranchLimit =
    tier === 'warmup' ? 500 : tier === 'medium' ? 700 : tier === 'hard' ? 900 : 1100;
  const revealedLetters = new Set(
    params.prefilledIndices
      .map((index) => params.basePuzzle.tiles[index])
      .filter((tile): tile is PuzzleTile => Boolean(tile && tile.isLetter))
      .map((tile) => tile.char)
  );

  const maxLockedCount =
    totalLetters > 0 ? Math.floor(totalLetters * maxLockedRatio) : 0;
  const maxChainsByTier =
    tier === 'warmup' ? 1 : tier === 'medium' ? 2 : tier === 'hard' ? 3 : 4;
  const maxChainsBySize = totalLetters >= 36 ? 3 : 2;
  const maxChainsByCipher =
    params.basePuzzle.cipherType === 'shift'
      ? Math.max(1, Math.min(maxChainsByTier, maxChainsBySize) - 1)
      : Math.min(maxChainsByTier, maxChainsBySize);
  const targetChainCount = Math.min(
    maxChainsByCipher,
    Math.floor(remainingBudget(params.budget) / PADLOCK_CHAIN_COST)
  );
  if (targetChainCount <= 0) {
    return { lockIndices: [], padlockChains: [] };
  }

  const pickChain = (pickParams: {
    chainId: number;
    usedLetters: Set<string>;
    existingLockedIndices: Set<number>;
  }): { lockIndices: number[]; chain: PadlockChain; keyLetterFrequency: number } | null => {
    const minLockOccurrences = 2;
    const maxLockOccurrences = Math.max(5, Math.ceil(totalLetters * 0.18));
    const lockLetterCandidates = [...byLetter.entries()]
      .filter(
        ([letter, indices]) =>
          !revealedLetters.has(letter) &&
          !pickParams.usedLetters.has(letter) &&
          indices.length >= minLockOccurrences &&
          indices.length <= maxLockOccurrences
      )
      .map(([letter]) => letter);

    const lockTargetFrequency = Math.max(2, Math.min(7, Math.round(totalLetters * 0.12)));
    const orderedCandidates = shuffleWithRng(lockLetterCandidates, params.rng).sort((a, b) => {
      const aCount = byLetter.get(a)?.length ?? 0;
      const bCount = byLetter.get(b)?.length ?? 0;
      const aDistance = Math.abs(aCount - lockTargetFrequency);
      const bDistance = Math.abs(bCount - lockTargetFrequency);
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      return aCount - bCount;
    });
    for (const lockLetter of orderedCandidates.slice(0, lockCandidateLimit)) {
      const lockIndices = byLetter.get(lockLetter) ?? [];
      if (lockIndices.length === 0) {
        continue;
      }
      if (
        totalLetters > 0 &&
        lockIndices.length + pickParams.existingLockedIndices.size > maxLockedCount
      ) {
        continue;
      }

      const keyTargetFrequency = Math.max(2, Math.min(6, Math.round(totalLetters * 0.1)));
      const keyCandidates = shuffleWithRng([...byLetter.entries()], params.rng)
        .filter(([letter, indices]) => {
          if (letter === lockLetter) {
            return false;
          }
          if (revealedLetters.has(letter)) {
            return false;
          }
          if (pickParams.usedLetters.has(letter)) {
            return false;
          }
          return indices.length >= 2;
        })
        .sort((a, b) => {
          const aDistance = Math.abs(a[1].length - keyTargetFrequency);
          const bDistance = Math.abs(b[1].length - keyTargetFrequency);
          if (aDistance !== bDistance) {
            return aDistance - bDistance;
          }
          return a[1].length - b[1].length;
        });
      const keyLetter = keyCandidates[0]?.[0];

      if (!keyLetter) {
        continue;
      }

      const keyIndices = byLetter.get(keyLetter) ?? [];
      if (keyIndices.length === 0) {
        continue;
      }
      if (keyIndices.some((index) => pickParams.existingLockedIndices.has(index))) {
        continue;
      }

      const lockedWordCounts = new Map<number, number>();
      for (const index of pickParams.existingLockedIndices) {
        const tile = params.basePuzzle.tiles[index];
        if (tile && tile.isLetter) {
          lockedWordCounts.set(tile.wordIndex, (lockedWordCounts.get(tile.wordIndex) ?? 0) + 1);
        }
      }
      for (const index of lockIndices) {
        const tile = params.basePuzzle.tiles[index];
        if (!tile || !tile.isLetter) {
          continue;
        }
        const next = (lockedWordCounts.get(tile.wordIndex) ?? 0) + 1;
        lockedWordCounts.set(tile.wordIndex, next);
      }
      let violatesPerWordCap = false;
      for (const [wordIndex, lockedCount] of lockedWordCounts.entries()) {
        const wordLength = wordLetterCounts.get(wordIndex) ?? 0;
        if (wordLength > 0 && lockedCount > Math.floor(wordLength * 0.5)) {
          violatesPerWordCap = true;
          break;
        }
      }
      if (violatesPerWordCap) {
        continue;
      }
      if (longWordIndices.size > 0) {
        const lockedWordSet = new Set(lockedWordCounts.keys());
        const hasUnlockedLongWord = [...longWordIndices.values()].some(
          (wordIndex) => !lockedWordSet.has(wordIndex)
        );
        if (!hasUnlockedLongWord) {
          continue;
        }
      }

      const combinedLockedIndices = [
        ...pickParams.existingLockedIndices,
        ...lockIndices,
      ];
      const solver = runDummySolver({
        puzzle: params.basePuzzle,
        revealedIndices: params.prefilledIndices,
        forbiddenIndices: combinedLockedIndices,
        requiredSolveRatio: lockSolveThreshold,
        maxSearchMs: lockSolverBudgetMs,
        maxBranchExpansions: lockSolverBranchLimit,
      });
      if (solver.solvedRatio < lockSolveThreshold) {
        continue;
      }

      return {
        lockIndices: [...lockIndices].sort((a, b) => a - b),
        chain: {
          chainId: pickParams.chainId,
          keyIndices: [...keyIndices].sort((a, b) => a - b),
          lockedIndices: [...lockIndices].sort((a, b) => a - b),
        },
        keyLetterFrequency: keyIndices.length,
      };
    }

    return null;
  };

  const usedLetters = new Set<string>();
  const lockedIndexSet = new Set<number>();
  const chains: PadlockChain[] = [];

  for (let chainId = 1; chainId <= targetChainCount; chainId += 1) {
    const selection = pickChain({
      chainId,
      usedLetters,
      existingLockedIndices: lockedIndexSet,
    });
    if (!selection) {
      break;
    }
    for (const index of selection.lockIndices) {
      lockedIndexSet.add(index);
    }
    const keyLetter = params.basePuzzle.tiles[selection.chain.keyIndices[0] ?? -1]?.char;
    if (keyLetter) {
      usedLetters.add(keyLetter);
    }
    const lockLetter = params.basePuzzle.tiles[selection.lockIndices[0] ?? -1]?.char;
    if (lockLetter) {
      usedLetters.add(lockLetter);
    }
    chains.push(selection.chain);
    const chainCost =
      PADLOCK_CHAIN_COST -
      (selection.keyLetterFrequency >= 5 ? PADLOCK_KEY_EASY_DISCOUNT : 0);
    spendBudget(params.budget, chainCost);
  }

  return {
    lockIndices: [...lockedIndexSet].sort((a, b) => a - b),
    padlockChains: chains,
  };
};

const chooseBlindIndices = (params: {
  tiles: PuzzleTile[];
  targetText: string;
  prefilledIndices: number[];
  lockIndices: number[];
  difficulty: number;
  budget: ObstructionBudget;
}): number[] => {
  const tier = difficultyToTier(params.difficulty);
  const maxBlinds = tier === 'warmup' ? 1 : tier === 'medium' ? 2 : tier === 'hard' ? 4 : 5;
  const continuousLengthFactor = Math.max(0, (params.targetText.length - 12) / 10);
  const budgetCap = Math.floor(remainingBudget(params.budget) / BLIND_TILE_COST);
  const blindCount = Math.min(maxBlinds, Math.round(continuousLengthFactor), budgetCap);
  if (blindCount <= 0) {
    return [];
  }

  const blocked = new Set([...params.prefilledIndices, ...params.lockIndices]);
  const byLetter = letterIndicesByChar(params.tiles);
  const lockedWordSet = new Set<number>();
  for (const index of params.lockIndices) {
    const tile = params.tiles[index];
    if (tile && tile.isLetter) {
      lockedWordSet.add(tile.wordIndex);
    }
  }
  const blindCountsByWord = new Map<number, number>();
  const letterCounts = new Map<string, number>(
    [...byLetter.entries()].map(([letter, indices]) => [letter, indices.length] as const)
  );
  const wordLetterCounts = new Map<number, number>();
  for (const tile of params.tiles) {
    if (!tile.isLetter) {
      continue;
    }
    wordLetterCounts.set(tile.wordIndex, (wordLetterCounts.get(tile.wordIndex) ?? 0) + 1);
  }
  const rarityOrder = 'QZJXKVBPYGFWMUCLDRHSNIOATE'.split('');
  const rarityRank = new Map(rarityOrder.map((letter, index) => [letter, index] as const));

  const orderedLetters = [...byLetter.entries()]
    .sort((a, b) => {
      if (a[1].length !== b[1].length) {
        return a[1].length - b[1].length;
      }
      const aRank = rarityRank.get(a[0]) ?? 999;
      const bRank = rarityRank.get(b[0]) ?? 999;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([letter]) => letter);

  const selected: number[] = [];
  const maxBlindsPerWord = tier === 'medium' ? 1 : 2;
  let usedSingletonFallback = false;
  for (const letter of orderedLetters) {
    const indices = byLetter.get(letter) ?? [];
    for (const index of indices) {
      if (blocked.has(index)) {
        continue;
      }
      const tile = params.tiles[index];
      if (!tile || !tile.isLetter) {
        continue;
      }
      if (lockedWordSet.has(tile.wordIndex)) {
        continue;
      }
      const wordLength = wordLetterCounts.get(tile.wordIndex) ?? 0;
      if (wordLength < 5) {
        continue;
      }
      const wordBlindCount = blindCountsByWord.get(tile.wordIndex) ?? 0;
      if (wordBlindCount >= maxBlindsPerWord) {
        continue;
      }
      const letterCount = letterCounts.get(tile.char) ?? 0;
      if (letterCount < 2) {
        if (tier !== 'expert' || usedSingletonFallback) {
          continue;
        }
        usedSingletonFallback = true;
      }
      selected.push(index);
      blocked.add(index);
      blindCountsByWord.set(tile.wordIndex, wordBlindCount + 1);
      spendBudget(params.budget, BLIND_TILE_COST);
      if (selected.length >= blindCount) {
        return selected.sort((a, b) => a - b);
      }
      break;
    }
  }
  return selected.sort((a, b) => a - b);
};

export const chooseGoldIndex = (
  tiles: PuzzleTile[],
  prefilledIndices: number[],
  blindIndices: number[],
  rng: Rng,
  lockIndices: number[] = []
): number | null => {
  const blocked = new Set([...prefilledIndices, ...blindIndices, ...lockIndices]);
  const byLetter = letterIndicesByChar(tiles);
  const candidates = tiles.filter((tile) => tile.isLetter && !blocked.has(tile.index));
  if (candidates.length === 0) {
    return null;
  }
  const targetFrequency = 3;
  const scored = candidates.map((tile) => {
    const frequency = byLetter.get(tile.char)?.length ?? 0;
    const distance = Math.abs(frequency - targetFrequency);
    return {
      index: tile.index,
      distance,
      tieBreaker: rng(),
    };
  });
  scored.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.tieBreaker - b.tieBreaker;
  });
  return scored[0]?.index ?? null;
};

const computeTimingTargets = (params: {
  targetText: string;
  difficulty: number;
  cryptoHardness: number;
  padlockChainCount: number;
  blindCount: number;
  prefilledCount?: number;
  fullyPrefilledWordCount?: number;
}): {
  targetTimeSeconds: number;
  starThresholds: { '3_star': number; '2_star': number; '1_star': number };
} => {
  const base = params.targetText.length * 2 + 30;
  const difficultyAdjustment = Math.round((params.difficulty - 5) * 2);
  const hardnessAdjustment = Math.round(params.cryptoHardness * 8);
  const obstructionAdjustment = params.padlockChainCount * 8 + params.blindCount * 4;
  const revealAdjustment =
    -Math.round((params.prefilledCount ?? 0) * 0.6) -
    Math.round((params.fullyPrefilledWordCount ?? 0) * 3);
  const targetTimeSeconds = Math.max(
    20,
    base + difficultyAdjustment + hardnessAdjustment + obstructionAdjustment + revealAdjustment
  );
  return {
    targetTimeSeconds,
    starThresholds: {
      '3_star': targetTimeSeconds,
      '2_star': targetTimeSeconds * 1.5,
      '1_star': targetTimeSeconds * 2,
    },
  };
};

export const buildPublicPuzzle = (
  puzzle: PuzzlePrivate,
  revealedIndices: number[],
  sessionRevealedIndices?: number[]
): PuzzlePublic => {
  const lockSet = new Set(puzzle.lockIndices ?? []);
  const prefilledSet = new Set(puzzle.prefilledIndices);
  const sessionRevealedSet = new Set(sessionRevealedIndices ?? []);
  const revealedSet = new Set([...puzzle.prefilledIndices, ...revealedIndices]);
  if (revealedSet.size === 0) {
    const initialPadlockStatus = checkPadlockStatus(puzzle, revealedSet);
    const nonBlindStarter = puzzle.tiles.find(
      (tile) =>
        tile.isLetter &&
        !puzzle.blindIndices.includes(tile.index) &&
        !initialPadlockStatus.lockedIndexSet.has(tile.index)
    );
    const fallbackStarter = puzzle.tiles.find(
      (tile) => tile.isLetter && !puzzle.blindIndices.includes(tile.index)
    );
    if (nonBlindStarter) {
      revealedSet.add(nonBlindStarter.index);
    } else if (fallbackStarter) {
      revealedSet.add(fallbackStarter.index);
    }
  }
  const currentPadlockStatus = checkPadlockStatus(puzzle, revealedSet);
  const lockMetaByIndex = new Map<
    number,
    { chainId: number; remainingKeys: number; totalKeys: number }
  >();
  for (const chain of puzzle.padlockChains) {
    const letterToIndices = new Map<string, number[]>();
    for (const index of chain.keyIndices) {
      const tile = puzzle.tiles[index];
      if (!tile || !tile.isLetter) {
        continue;
      }
      const existing = letterToIndices.get(tile.char) ?? [];
      existing.push(index);
      letterToIndices.set(tile.char, existing);
    }
    let totalKeys = letterToIndices.size;
    let remainingKeys = 0;
    for (const indices of letterToIndices.values()) {
      if (!indices.some((index) => revealedSet.has(index))) {
        remainingKeys += 1;
      }
    }
    if (totalKeys === 0) {
      remainingKeys = chain.keyIndices.filter((index) => !revealedSet.has(index))
        .length;
      totalKeys = Math.max(0, remainingKeys);
    }
    for (const lockedIndex of chain.lockedIndices) {
      if (lockMetaByIndex.has(lockedIndex)) {
        continue;
      }
      lockMetaByIndex.set(lockedIndex, {
        chainId: chain.chainId,
        remainingKeys,
        totalKeys,
      });
    }
  }

  const tiles = puzzle.tiles.map((tile) => {
    if (!tile.isLetter) {
      return {
        index: tile.index,
        isLetter: false,
        displayChar: tile.char,
        cipherNumber: null,
        isBlind: false,
        isGold: false,
        isLocked: false,
        isSessionRevealed: false,
      };
    }

    const shouldReveal = revealedSet.has(tile.index);
    const isBlind = puzzle.blindIndices.includes(tile.index);
    const isGold = puzzle.goldIndex === tile.index;
    const cipherNumber = puzzle.mapping[tile.char];
    const isLocked = currentPadlockStatus.lockedIndexSet.has(tile.index);
    const lockMeta = lockMetaByIndex.get(tile.index);

    return {
      index: tile.index,
      isLetter: true,
      displayChar: shouldReveal ? tile.char : '_',
      cipherNumber,
      isBlind,
      isGold,
      isLocked,
      isSessionRevealed:
        sessionRevealedSet.has(tile.index) && !prefilledSet.has(tile.index),
      hasLock: lockSet.has(tile.index),
      lockChainId: isLocked ? lockMeta?.chainId ?? null : null,
      lockRemainingKeys: isLocked ? lockMeta?.remainingKeys : undefined,
      lockTotalKeys: isLocked ? lockMeta?.totalKeys : undefined,
    };
  });

  const parsed = puzzlePublicSchema.parse({
    levelId: puzzle.levelId,
    dateKey: puzzle.dateKey,
    author: puzzle.author,
    challengeType: puzzle.challengeType,
    words: puzzle.words,
    tiles,
    difficulty: puzzle.difficulty,
    heartsMax: 3,
  });

  return parsed;
};

export const buildPuzzle = (params: {
  levelId: string;
  seedKey?: string;
  dateKey: string;
  text: string;
  author: string;
  challengeType?: PuzzlePrivate['challengeType'];
  source?: PuzzlePrivate['source'];
  difficulty: number;
  logicalPercent: number;
  previousMapping?: Record<string, number> | null;
  skipSolvabilityCheck?: boolean;
  applyObstructionsOnSkip?: boolean;
}): { puzzlePrivate: PuzzlePrivate; puzzlePublic: PuzzlePublic } => {
  const normalizedText = sanitizePhrase(params.text);
  const { tiles, words } = parseTiles(normalizedText);
  const seed = deriveSeed(params.seedKey ?? params.levelId, normalizedText);
  const rng = mulberry32(seed);
  const cipherSelection = chooseCipherType(params.logicalPercent, rng);
  const cipherBuilt = buildCipherMapping({
    cipherType: cipherSelection.cipherType,
    shiftAmount: cipherSelection.shiftAmount,
    rng,
    previousMapping: params.previousMapping ?? null,
  });
  const mapping = cipherBuilt.mapping;
  const reverseMapping = invertCipherMapping(mapping);
  const phraseProfile = computePhraseDifficultyProfile(normalizedText);
  const difficultyContext: PuzzleDifficultyContext = {
    tier: difficultyToTier(params.difficulty),
    difficulty: params.difficulty,
    cipherType: cipherSelection.cipherType,
    totalLetters: phraseProfile.totalLetters,
    wordCount: phraseProfile.wordCount,
    uniqueWordCount: phraseProfile.uniqueWordCount,
    uniqueWordRatio: phraseProfile.uniqueWordRatio,
    repeatedWordRatio: phraseProfile.repeatedWordRatio,
    phraseUniqueLetters: phraseProfile.uniqueLetterCount,
    phraseOneLetterWords: phraseProfile.oneLetterWordCount,
    phraseSuffixCount: phraseProfile.commonSuffixCount,
    cryptoHardness: phraseProfile.cryptoHardness,
  };

  const maxRevealAttempts = params.skipSolvabilityCheck ? 1 : 5;
  const createdAt = Date.now();
  for (let attempt = 0; attempt < maxRevealAttempts; attempt += 1) {
    const budget = computeObstructionBudget(difficultyContext);
    const prefilledIndices = choosePrefilledIndices({
      tiles,
      targetText: normalizedText,
      context: difficultyContext,
      budget,
      rng,
    });
    const baselinePrefill =
      difficultyContext.tier === 'warmup'
        ? 8
        : difficultyContext.tier === 'medium'
          ? 5
          : difficultyContext.tier === 'hard'
            ? 4
            : 3;
    const removedPrefillCount = Math.max(0, baselinePrefill - prefilledIndices.length);
    spendBudget(budget, removedPrefillCount * PREFILL_REMOVAL_COST);
    const phase2Puzzle = puzzlePrivateSchema.parse({
      levelId: params.levelId,
      dateKey: params.dateKey,
      targetText: normalizedText,
      author: params.author,
      challengeType: params.challengeType ?? 'QUOTE',
      source: params.source ?? 'UNKNOWN_LEGACY',
      cipherType: cipherSelection.cipherType,
      shiftAmount: cipherSelection.cipherType === 'shift' ? cipherBuilt.shiftAmount : null,
      mapping,
      reverseMapping,
      tiles,
      words,
      prefilledIndices,
      revealedIndices: prefilledIndices,
      revealed_indices: prefilledIndices,
      lockIndices: [],
      blindIndices: [],
      goldIndex: chooseGoldIndex(tiles, prefilledIndices, [], rng),
      padlockChains: [],
      difficulty: params.difficulty,
      cryptoHardness: difficultyContext.cryptoHardness,
      isLogical: cipherSelection.cipherType !== 'random',
      createdAt,
    });

    const applyObstructions =
      !params.skipSolvabilityCheck || params.applyObstructionsOnSkip === true;
    const requiredRatio = solveRatioThreshold(params.difficulty);
    if (!params.skipSolvabilityCheck) {
      const solver = runDummySolver({
        puzzle: phase2Puzzle,
        revealedIndices: prefilledIndices,
        requiredSolveRatio: requiredRatio,
      });
      if (!solver.solvable || solver.blindGuessRequired || solver.solvedRatio < requiredRatio) {
        continue;
      }
    } else if (!applyObstructions) {
      const baseTiming = computeTimingTargets({
        targetText: normalizedText,
        difficulty: params.difficulty,
        cryptoHardness: difficultyContext.cryptoHardness,
        padlockChainCount: 0,
        blindCount: 0,
        prefilledCount: prefilledIndices.length,
        fullyPrefilledWordCount: countFullyPrefilledWords({
          tiles,
          words,
          prefilledIndices,
        }),
      });
      const puzzlePrivate = puzzlePrivateSchema.parse({
        ...phase2Puzzle,
        targetTimeSeconds: baseTiming.targetTimeSeconds,
        starThresholds: baseTiming.starThresholds,
      });
      const puzzlePublic = buildPublicPuzzle(puzzlePrivate, []);
      return { puzzlePrivate, puzzlePublic };
    }

    const lockSelection = choosePadlockObstruction({
      basePuzzle: phase2Puzzle,
      prefilledIndices,
      budget,
      rng,
    });
    const blindIndices = chooseBlindIndices({
      tiles,
      targetText: normalizedText,
      prefilledIndices,
      lockIndices: lockSelection.lockIndices,
      difficulty: params.difficulty,
      budget,
    });
    const finalTiming = computeTimingTargets({
      targetText: normalizedText,
      difficulty: params.difficulty,
      cryptoHardness: difficultyContext.cryptoHardness,
      padlockChainCount: lockSelection.padlockChains.length,
      blindCount: blindIndices.length,
      prefilledCount: prefilledIndices.length,
      fullyPrefilledWordCount: countFullyPrefilledWords({
        tiles,
        words,
        prefilledIndices,
      }),
    });

    const puzzlePrivate = puzzlePrivateSchema.parse({
      ...phase2Puzzle,
      lockIndices: lockSelection.lockIndices,
      blindIndices,
      goldIndex: chooseGoldIndex(
        tiles,
        prefilledIndices,
        blindIndices,
        rng,
        lockSelection.lockIndices
      ),
      padlockChains: lockSelection.padlockChains,
      targetTimeSeconds: finalTiming.targetTimeSeconds,
      starThresholds: finalTiming.starThresholds,
    });
    const puzzlePublic = buildPublicPuzzle(puzzlePrivate, []);
    return { puzzlePrivate, puzzlePublic };
  }

  throw new Error('DUMMY_SOLVER_UNSATISFIED');
};

/**
 * Adjusts puzzle difficulty by iteratively modifying obstructions to match target difficulty tier.
 * 
 * Algorithm:
 * 1. Measure current difficulty and compare to target
 * 2. Select best adjustment based on impact/cost ratio
 * 3. Apply adjustment and validate fairness constraints
 * 4. Iterate until target reached or max iterations exceeded (5)
 * 
 * Adjustment priority (difficulty impact per budget cost):
 * - Increase: add_padlock (2.5/18), add_blind (1.5/8), remove_prefill (0.8/5)
 * - Decrease: remove_blind (-1.5/-8), remove_padlock (-2.5/-18), add_prefill (-0.8/-5)
 * 
 * @param params - Adjustment parameters including base puzzle, target difficulty, budget, and RNG
 * @returns DifficultyAdjustmentResult with success status, adjusted puzzle, and adjustment log
 */
export const adjustPuzzleDifficulty = async (params: {
  basePuzzle: PuzzlePrivate;
  targetDifficulty: number;
  budget: ObstructionBudget;
  maxIterations: number;
  rng: Rng;
}): Promise<DifficultyAdjustmentResult> => {
  const { validatePuzzle } = await import('./validation.ts');
  
  const targetTier = difficultyToTier(params.targetDifficulty);
  let currentPuzzle = { ...params.basePuzzle };
  let currentBudget = { ...params.budget };
  const adjustmentLog: string[] = [];
  
  // Log adjustment start
  console.log('[adjustPuzzleDifficulty] Starting difficulty adjustment', {
    levelId: params.basePuzzle.levelId,
    targetDifficulty: params.targetDifficulty,
    targetTier,
    baseDifficulty: params.basePuzzle.difficulty,
    baseTier: difficultyToTier(params.basePuzzle.difficulty),
    budgetTotal: params.budget.total,
    budgetSpent: params.budget.spent,
    maxIterations: params.maxIterations,
  });
  
  for (let iteration = 0; iteration < params.maxIterations; iteration++) {
    // Estimate current difficulty based on obstructions
    const estimatedDifficulty = estimateDifficultyFromObstructions(currentPuzzle);
    const currentTier = difficultyToTier(estimatedDifficulty);
    
    // Log iteration start
    console.log('[adjustPuzzleDifficulty] Iteration', {
      iteration: iteration + 1,
      maxIterations: params.maxIterations,
      currentDifficulty: estimatedDifficulty,
      currentTier,
      targetDifficulty: params.targetDifficulty,
      targetTier,
      budgetRemaining: remainingBudget(currentBudget),
      budgetTotal: currentBudget.total,
      budgetSpent: currentBudget.spent,
    });
    
    // Check if target reached
    if (currentTier === targetTier) {
      // Update the puzzle's difficulty field to match target
      currentPuzzle = { ...currentPuzzle, difficulty: params.targetDifficulty };
      
      // Log success
      console.log('[adjustPuzzleDifficulty] Convergence successful', {
        iterations: iteration + 1,
        achievedDifficulty: params.targetDifficulty,
        achievedTier: currentTier,
        budgetUsed: currentBudget.spent,
        budgetTotal: currentBudget.total,
        budgetUtilization: ((currentBudget.spent / currentBudget.total) * 100).toFixed(1) + '%',
        adjustmentCount: adjustmentLog.length,
      });
      
      return {
        success: true,
        puzzle: currentPuzzle,
        achievedDifficulty: params.targetDifficulty,
        achievableTierRange: [currentTier],
        adjustmentLog,
        budgetUsed: currentBudget.spent,
        budgetTotal: currentBudget.total,
      };
    }
    
    // Determine adjustment direction
    const needsIncrease = tierToNumber(currentTier) < tierToNumber(targetTier);
    
    // Select best adjustment
    const adjustment = selectBestAdjustment({
      puzzle: currentPuzzle,
      budget: currentBudget,
      needsIncrease,
      rng: params.rng,
    });
    
    if (!adjustment) {
      // No valid adjustments available
      console.warn('[adjustPuzzleDifficulty] No valid adjustments available', {
        iteration: iteration + 1,
        currentTier,
        targetTier,
        budgetRemaining: remainingBudget(currentBudget),
        budgetSpent: currentBudget.spent,
        needsIncrease,
      });
      
      return {
        success: false,
        puzzle: currentPuzzle,
        achievedDifficulty: estimatedDifficulty,
        achievableTierRange: computeAchievableRange(currentPuzzle, currentBudget),
        adjustmentLog,
        budgetUsed: currentBudget.spent,
        budgetTotal: currentBudget.total,
        reason: 'No valid adjustments available within budget',
      };
    }
    
    // Log adjustment application
    console.log('[adjustPuzzleDifficulty] Applying adjustment', {
      iteration: iteration + 1,
      adjustmentType: adjustment.type,
      adjustmentImpact: adjustment.impact,
      adjustmentCost: adjustment.cost,
      budgetBefore: remainingBudget(currentBudget),
      budgetAfter: remainingBudget(currentBudget) - adjustment.cost,
      description: adjustment.description,
    });
    
    // Apply adjustment
    currentPuzzle = applyAdjustment(currentPuzzle, adjustment);
    currentBudget = updateBudget(currentBudget, adjustment.cost);
    adjustmentLog.push(adjustment.description);
    
    // Validate fairness constraints
    const validation = validatePuzzle(currentPuzzle);
    if (!validation.valid) {
      console.error('[adjustPuzzleDifficulty] Fairness constraint violated', {
        iteration: iteration + 1,
        violations: validation.reasons,
        lastAdjustment: adjustment.type,
      });
      
      return {
        success: false,
        puzzle: params.basePuzzle,
        achievedDifficulty: params.basePuzzle.difficulty,
        achievableTierRange: [difficultyToTier(params.basePuzzle.difficulty)],
        adjustmentLog,
        budgetUsed: currentBudget.spent,
        budgetTotal: currentBudget.total,
        reason: `Fairness constraint violated: ${validation.reasons.join('; ')}`,
      };
    }
  }
  
  // Max iterations reached
  const finalEstimatedDifficulty = estimateDifficultyFromObstructions(currentPuzzle);
  
  console.warn('[adjustPuzzleDifficulty] Max iterations reached without convergence', {
    maxIterations: params.maxIterations,
    targetDifficulty: params.targetDifficulty,
    targetTier,
    achievedDifficulty: finalEstimatedDifficulty,
    achievedTier: difficultyToTier(finalEstimatedDifficulty),
    budgetUsed: currentBudget.spent,
    budgetTotal: currentBudget.total,
    budgetUtilization: ((currentBudget.spent / currentBudget.total) * 100).toFixed(1) + '%',
    adjustmentCount: adjustmentLog.length,
  });
  
  return {
    success: false,
    puzzle: currentPuzzle,
    achievedDifficulty: finalEstimatedDifficulty,
    achievableTierRange: [difficultyToTier(finalEstimatedDifficulty)],
    adjustmentLog,
    budgetUsed: currentBudget.spent,
    budgetTotal: currentBudget.total,
    reason: 'Max iterations reached without convergence',
  };
};

/**
 * Estimates puzzle difficulty based on obstructions applied.
 * This is a heuristic that maps obstruction counts to difficulty tiers.
 */
const estimateDifficultyFromObstructions = (puzzle: PuzzlePrivate): number => {
  const phraseProfile = computePhraseDifficultyProfile(puzzle.targetText);
  const padlockCount = puzzle.padlockChains.length;
  const blindCount = puzzle.blindIndices.length;
  const prefilledCount = puzzle.prefilledIndices.length;
  const letterCount = puzzle.tiles.filter(t => t.isLetter).length;
  const fullyPrefilledWordCount = countFullyPrefilledWords({
    tiles: puzzle.tiles,
    words: puzzle.words,
    prefilledIndices: puzzle.prefilledIndices,
  });
  
  const prefilledRatio = letterCount > 0 ? prefilledCount / letterCount : 0;
  const textComplexityScore =
    1.5 +
    phraseProfile.cryptoHardness * 4.2 +
    Math.min(1.6, phraseProfile.uniqueLetterCount / 12) +
    Math.min(1.2, phraseProfile.uniqueWordRatio * 1.2) +
    Math.min(0.8, Math.max(0, letterCount - 24) / 18);

  let score = textComplexityScore;
  score += padlockCount * 1.4;
  score += blindCount * 0.9;
  score -= prefilledRatio * 4.5;
  score -= fullyPrefilledWordCount * 0.9;
  if (puzzle.cipherType === 'random') {
    score += 0.4;
  } else if (puzzle.cipherType === 'shift') {
    score -= 0.4;
  }

  return Math.max(1, Math.min(10, Math.round(score)));
};

/**
 * Converts difficulty tier to numeric value for comparison.
 */
const tierToNumber = (tier: DifficultyTier): number => {
  if (tier === 'warmup') return 1;
  if (tier === 'medium') return 2;
  if (tier === 'hard') return 3;
  return 4;
};

/**
 * Computes the achievable difficulty tier range given current puzzle and budget.
 */
const computeAchievableRange = (
  puzzle: PuzzlePrivate,
  budget: ObstructionBudget
): DifficultyTier[] => {
  const currentTier = difficultyToTier(puzzle.difficulty);
  const remaining = remainingBudget(budget);
  
  // Simple heuristic: if we have significant budget remaining, we might reach higher tiers
  const tiers: DifficultyTier[] = [currentTier];
  
  if (currentTier === 'warmup' && remaining >= PADLOCK_CHAIN_COST) {
    tiers.push('medium');
  }
  if (currentTier === 'medium') {
    tiers.push('warmup'); // Can always go down
    if (remaining >= PADLOCK_CHAIN_COST * 2) {
      tiers.push('hard');
    }
  }
  if (currentTier === 'hard') {
    tiers.push('medium', 'expert'); // Can always move one tier either way
  }
  if (currentTier === 'expert') {
    tiers.push('hard');
  }
  
  return tiers;
};

/**
 * Selects the best adjustment to apply based on impact/cost ratio.
 */
const selectBestAdjustment = (params: {
  puzzle: PuzzlePrivate;
  budget: ObstructionBudget;
  needsIncrease: boolean;
  rng: Rng;
}): Adjustment | null => {
  const available = params.needsIncrease
    ? getIncreaseAdjustments(params.puzzle, params.budget, params.rng)
    : getDecreaseAdjustments(params.puzzle, params.budget);
  
  if (available.length === 0) return null;
  
  // Sort by impact/cost ratio (higher is better)
  available.sort((a, b) => {
    const ratioA = Math.abs(a.impact / a.cost);
    const ratioB = Math.abs(b.impact / b.cost);
    return ratioB - ratioA;
  });
  
  return available[0] ?? null;
};

/**
 * Gets available adjustments to increase difficulty.
 */
const getIncreaseAdjustments = (
  puzzle: PuzzlePrivate,
  budget: ObstructionBudget,
  rng: Rng
): Adjustment[] => {
  const adjustments: Adjustment[] = [];
  
  // Try adding padlock
  if (remainingBudget(budget) >= PADLOCK_CHAIN_COST) {
    const padlockCandidate = tryAddPadlock(puzzle, rng);
    if (padlockCandidate) {
      adjustments.push({
        type: 'add_padlock',
        impact: 2.5,
        cost: PADLOCK_CHAIN_COST,
        data: padlockCandidate,
        description: `Add padlock chain (cost: ${PADLOCK_CHAIN_COST})`,
      });
    }
  }
  
  // Try adding blind tile
  if (remainingBudget(budget) >= BLIND_TILE_COST) {
    const blindCandidate = tryAddBlindTile(puzzle);
    if (blindCandidate !== null) {
      adjustments.push({
        type: 'add_blind',
        impact: 1.5,
        cost: BLIND_TILE_COST,
        data: blindCandidate,
        description: `Add blind tile (cost: ${BLIND_TILE_COST})`,
      });
    }
  }
  
  // Try removing prefill
  if (remainingBudget(budget) >= PREFILL_REMOVAL_COST) {
    const prefillCandidate = tryRemovePrefill(puzzle);
    if (prefillCandidate !== null) {
      adjustments.push({
        type: 'remove_prefill',
        impact: 0.8,
        cost: PREFILL_REMOVAL_COST,
        data: prefillCandidate,
        description: `Remove prefilled letter (cost: ${PREFILL_REMOVAL_COST})`,
      });
    }
  }
  
  return adjustments;
};

/**
 * Gets available adjustments to decrease difficulty.
 */
const getDecreaseAdjustments = (
  puzzle: PuzzlePrivate,
  _budget: ObstructionBudget
): Adjustment[] => {
  const adjustments: Adjustment[] = [];
  
  // Try removing blind tile
  if (puzzle.blindIndices.length > 0) {
    adjustments.push({
      type: 'remove_blind',
      impact: -1.5,
      cost: -BLIND_TILE_COST,
      data: puzzle.blindIndices[0],
      description: `Remove blind tile (cost: -${BLIND_TILE_COST})`,
    });
  }
  
  // Try removing padlock
  if (puzzle.padlockChains.length > 0) {
    adjustments.push({
      type: 'remove_padlock',
      impact: -2.5,
      cost: -PADLOCK_CHAIN_COST,
      data: puzzle.padlockChains[0],
      description: `Remove padlock chain (cost: -${PADLOCK_CHAIN_COST})`,
    });
  }
  
  // Try adding prefill
  const prefillCandidate = tryAddPrefill(puzzle);
  if (prefillCandidate !== null) {
    adjustments.push({
      type: 'add_prefill',
      impact: -0.8,
      cost: -PREFILL_REMOVAL_COST,
      data: prefillCandidate,
      description: `Add prefilled letter (cost: -${PREFILL_REMOVAL_COST})`,
    });
  }
  
  return adjustments;
};

/**
 * Attempts to add a padlock chain to the puzzle.
 * Returns the padlock chain if successful, null otherwise.
 */
const tryAddPadlock = (puzzle: PuzzlePrivate, rng: Rng): PadlockChain | null => {
  // Find words that can be locked
  const lettersByWord = new Map<number, number[]>();
  for (const tile of puzzle.tiles) {
    if (tile.isLetter && !puzzle.prefilledIndices.includes(tile.index)) {
      const indices = lettersByWord.get(tile.wordIndex) ?? [];
      indices.push(tile.index);
      lettersByWord.set(tile.wordIndex, indices);
    }
  }
  
  // Find potential key-lock pairs
  const wordIndices = Array.from(lettersByWord.keys());
  if (wordIndices.length < 2) return null;
  
  // Shuffle to get random selection
  const shuffled = shuffleWithRng([...wordIndices], rng);
  
  for (let i = 0; i < shuffled.length - 1; i++) {
    const keyWordIndex = shuffled[i];
    const lockedWordIndex = shuffled[i + 1];
    
    if (keyWordIndex === undefined || lockedWordIndex === undefined) continue;
    
    const keyIndices = lettersByWord.get(keyWordIndex) ?? [];
    const lockedIndices = lettersByWord.get(lockedWordIndex) ?? [];
    
    if (keyIndices.length > 0 && lockedIndices.length > 0) {
      // Check if this would create a circular dependency
      const existingLocked = new Set(puzzle.padlockChains.flatMap(c => c.lockedIndices));
      if (keyIndices.some(idx => existingLocked.has(idx))) {
        continue; // Skip if key would be locked
      }
      
      const nextChainId = Math.max(0, ...puzzle.padlockChains.map(c => c.chainId)) + 1;
      return {
        chainId: nextChainId,
        keyIndices,
        lockedIndices,
      };
    }
  }
  
  return null;
};

/**
 * Attempts to add a blind tile to the puzzle.
 * Returns the tile index if successful, null otherwise.
 */
const tryAddBlindTile = (puzzle: PuzzlePrivate): number | null => {
  // Find letters that appear multiple times and aren't already blind
  const letterCounts = new Map<string, number[]>();
  for (const tile of puzzle.tiles) {
    if (tile.isLetter) {
      const indices = letterCounts.get(tile.char) ?? [];
      indices.push(tile.index);
      letterCounts.set(tile.char, indices);
    }
  }
  
  const blindSet = new Set(puzzle.blindIndices);
  const prefilledSet = new Set(puzzle.prefilledIndices);
  
  // Find letters that appear at least twice (fairness constraint)
  for (const [, indices] of letterCounts.entries()) {
    if (indices.length >= 2) {
      // Find an index that isn't already blind or prefilled
      // Also check that the word is at least 5 letters long (fairness constraint)
      for (const index of indices) {
        const tile = puzzle.tiles[index];
        if (!tile) continue;
        
        const word = puzzle.words[tile.wordIndex];
        if (!word || word.length < 5) continue;
        
        if (!blindSet.has(index) && !prefilledSet.has(index)) {
          // Verify this letter appears elsewhere (not as blind)
          const appearsElsewhere = indices.some(
            otherIdx => otherIdx !== index && !blindSet.has(otherIdx)
          );
          if (appearsElsewhere) {
            return index;
          }
        }
      }
    }
  }
  
  return null;
};

/**
 * Attempts to remove a prefilled letter from the puzzle.
 * Returns the index if successful, null otherwise.
 */
const tryRemovePrefill = (puzzle: PuzzlePrivate): number | null => {
  // Keep at least one prefilled letter as starter clue
  if (puzzle.prefilledIndices.length <= 1) return null;
  
  // Return the last prefilled index
  return puzzle.prefilledIndices[puzzle.prefilledIndices.length - 1] ?? null;
};

/**
 * Attempts to add a prefilled letter to the puzzle.
 * Returns the index if successful, null otherwise.
 */
const tryAddPrefill = (puzzle: PuzzlePrivate): number | null => {
  // Find letter tiles that aren't already prefilled
  const prefilledSet = new Set(puzzle.prefilledIndices);
  
  for (const tile of puzzle.tiles) {
    if (tile.isLetter && !prefilledSet.has(tile.index)) {
      return tile.index;
    }
  }
  
  return null;
};

/**
 * Applies an adjustment to the puzzle, returning a new puzzle with the modification.
 */
const applyAdjustment = (puzzle: PuzzlePrivate, adjustment: Adjustment): PuzzlePrivate => {
  const newPuzzle = { ...puzzle };
  
  switch (adjustment.type) {
    case 'add_padlock': {
      const padlock = adjustment.data as PadlockChain;
      newPuzzle.padlockChains = [...puzzle.padlockChains, padlock];
      newPuzzle.lockIndices = [...(puzzle.lockIndices ?? []), ...padlock.lockedIndices];
      break;
    }
    
    case 'remove_padlock': {
      const padlock = adjustment.data as PadlockChain;
      newPuzzle.padlockChains = puzzle.padlockChains.filter(c => c.chainId !== padlock.chainId);
      const removedLocks = new Set(padlock.lockedIndices);
      newPuzzle.lockIndices = (puzzle.lockIndices ?? []).filter(idx => !removedLocks.has(idx));
      break;
    }
    
    case 'add_blind': {
      const index = adjustment.data as number;
      newPuzzle.blindIndices = [...puzzle.blindIndices, index];
      break;
    }
    
    case 'remove_blind': {
      const index = adjustment.data as number;
      newPuzzle.blindIndices = puzzle.blindIndices.filter(idx => idx !== index);
      break;
    }
    
    case 'add_prefill': {
      const index = adjustment.data as number;
      newPuzzle.prefilledIndices = [...puzzle.prefilledIndices, index];
      newPuzzle.revealedIndices = [...puzzle.revealedIndices, index];
      break;
    }
    
    case 'remove_prefill': {
      const index = adjustment.data as number;
      newPuzzle.prefilledIndices = puzzle.prefilledIndices.filter(idx => idx !== index);
      newPuzzle.revealedIndices = puzzle.revealedIndices.filter(idx => idx !== index);
      break;
    }
  }
  
  return newPuzzle;
};

/**
 * Updates the budget by spending or refunding the adjustment cost.
 */
const updateBudget = (budget: ObstructionBudget, cost: number): ObstructionBudget => {
  return {
    total: budget.total,
    spent: Math.max(0, Math.min(budget.total, budget.spent + cost)),
  };
};
