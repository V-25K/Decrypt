import type {
  PadlockChain,
  PuzzlePrivate,
  PuzzlePublic,
  PuzzleTile,
  StoredPadlockChain,
} from '../../shared/game';
import { puzzlePrivateSchema, puzzlePublicSchema } from '../../shared/game';
import { chooseCipherType, buildCipherMapping, invertCipherMapping } from './cipher';
import { difficultyToTier, maxPuzzleTotalLength, sanitizePhrase } from './content';
import { runDummySolver } from './dummy-solver';
import { checkPadlockStatus } from './gameplay';
import { deriveSeed, mulberry32, randInt, shuffleWithRng, type Rng } from './rng';

const isLetter = (char: string): boolean => /^[A-Z]$/.test(char);

export const difficultyFromDate = (now: Date): number => {
  const day = now.getUTCDay();
  if (day === 1) {
    return 2;
  }
  if (day === 2 || day === 3) {
    return 4;
  }
  if (day === 4) {
    return 6;
  }
  if (day === 5) {
    return 8;
  }
  return 5;
};

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

const choosePrefilledIndices = (
  tiles: PuzzleTile[],
  difficulty: number,
  targetText: string,
  _rng: Rng
): number[] => {
  const letterTiles = tiles.filter((tile) => tile.isLetter);
  if (letterTiles.length === 0) {
    return [];
  }

  const tier = difficultyToTier(difficulty);
  const revealRange =
    tier === 'easy'
      ? [6, 10]
      : tier === 'medium'
        ? [3, 5]
        : [1, 4];
  const minReveals = revealRange[0];
  const maxReveals = revealRange[1];
  if (minReveals === undefined || maxReveals === undefined) {
    return [];
  }

  const maxWordsPossible = Math.max(1, Math.floor((maxPuzzleTotalLength + 1) / 2));
  const wordCount = new Set(letterTiles.map((tile) => tile.wordIndex)).size;
  const letterRatio = Math.min(1, letterTiles.length / maxPuzzleTotalLength);
  const wordRatio = Math.min(1, wordCount / maxWordsPossible);
  const sizeRatio = Math.min(1, letterRatio * 0.7 + wordRatio * 0.3);
  const scaledTarget = Math.round(minReveals + (maxReveals - minReveals) * sizeRatio);
  const wordFloor = Math.floor(wordCount / 5);
  const maxByWords = Math.min(wordFloor, maxReveals + 1);
  const finalMax = Math.min(letterTiles.length, Math.max(maxReveals, maxByWords));
  const targetRevealCount = Math.max(
    minReveals,
    Math.min(finalMax, Math.max(scaledTarget, maxByWords))
  );
  const maxPrefillByLetters = Math.max(1, Math.ceil(letterTiles.length * 0.35));
  const maxPrefillByWords = wordCount + 1;
  const cappedTargetRevealCount = Math.max(
    1,
    Math.min(targetRevealCount, maxPrefillByLetters, maxPrefillByWords)
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
  const firstQuarterIndex = Math.max(0, Math.floor(targetText.length * 0.25) - 1);

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
  };

  const candidates: Candidate[] = letterTiles.map((tile) => {
    const wordIndices = lettersByWordIndex.get(tile.wordIndex) ?? [tile.index];
    const wordStart = wordIndices[0] ?? tile.index;
    const wordEnd = wordIndices[wordIndices.length - 1] ?? tile.index;
    const wordLength = wordIndices.length;
    const leftChar = tile.index > 0 ? targetText.charAt(tile.index - 1) : '';
    const rightChar =
      tile.index + 1 < targetText.length ? targetText.charAt(tile.index + 1) : '';

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
    return a.index - b.index;
  });

  const selected = new Set<number>();
  const selectedLetters = new Set<string>();

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

  const minUnique =
    tier === 'easy' ? 4 : tier === 'medium' ? 3 : 2;
  const uniqueRevealTarget = Math.min(
    letterFrequency.size,
    Math.max(minUnique, Math.min(cappedTargetRevealCount, letterFrequency.size))
  );

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
  const maxLockedRatio = tier === 'easy' ? 0.2 : tier === 'medium' ? 0.25 : 0.3;
  const lockSolveThreshold = tier === 'easy' ? 0.7 : tier === 'medium' ? 0.6 : 0.5;
  const revealedLetters = new Set(
    params.prefilledIndices
      .map((index) => params.basePuzzle.tiles[index])
      .filter((tile): tile is PuzzleTile => Boolean(tile && tile.isLetter))
      .map((tile) => tile.char)
  );

  const maxLockedCount =
    totalLetters > 0 ? Math.floor(totalLetters * maxLockedRatio) : 0;

  const pickChain = (pickParams: {
    chainId: number;
    usedLetters: Set<string>;
    existingLockedIndices: Set<number>;
  }): { lockIndices: number[]; chain: PadlockChain } | null => {
    const lockLetterCandidates = [...byLetter.entries()]
      .filter(
        ([letter, indices]) =>
          !revealedLetters.has(letter) &&
          !pickParams.usedLetters.has(letter) &&
          indices.length >= 3 &&
          indices.length <= 5
      )
      .map(([letter]) => letter);

    const orderedCandidates = shuffleWithRng(lockLetterCandidates, params.rng);
    for (const lockLetter of orderedCandidates) {
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

      const keyLetter = [...byLetter.entries()]
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
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]?.[0];

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
      };
    }

    return null;
  };

  const usedLetters = new Set<string>();
  const lockedIndexSet = new Set<number>();
  const chains: PadlockChain[] = [];

  const firstChain = pickChain({
    chainId: 1,
    usedLetters,
    existingLockedIndices: lockedIndexSet,
  });
  if (!firstChain) {
    return { lockIndices: [], padlockChains: [] };
  }
  for (const index of firstChain.lockIndices) {
    lockedIndexSet.add(index);
  }
  const firstKeyLetter = params.basePuzzle.tiles[firstChain.chain.keyIndices[0] ?? -1]?.char;
  if (firstKeyLetter) {
    usedLetters.add(firstKeyLetter);
  }
  const firstLockLetter = params.basePuzzle.tiles[firstChain.lockIndices[0] ?? -1]?.char;
  if (firstLockLetter) {
    usedLetters.add(firstLockLetter);
  }
  chains.push(firstChain.chain);

  const isExpert = params.basePuzzle.difficulty >= 9;
  const isHard = params.basePuzzle.difficulty >= 8 && !isExpert;
  const chance =
    isExpert ? 0.3 + params.rng() * 0.1 : isHard ? 0.1 + params.rng() * 0.1 : 0;
  if (chance > 0 && params.rng() < chance) {
    const secondChain = pickChain({
      chainId: 2,
      usedLetters,
      existingLockedIndices: lockedIndexSet,
    });
    if (secondChain) {
      for (const index of secondChain.lockIndices) {
        lockedIndexSet.add(index);
      }
      const secondKeyLetter =
        params.basePuzzle.tiles[secondChain.chain.keyIndices[0] ?? -1]?.char;
      if (secondKeyLetter) {
        usedLetters.add(secondKeyLetter);
      }
      const secondLockLetter =
        params.basePuzzle.tiles[secondChain.lockIndices[0] ?? -1]?.char;
      if (secondLockLetter) {
        usedLetters.add(secondLockLetter);
      }
      chains.push(secondChain.chain);
    }
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
}): number[] => {
  const tier = difficultyToTier(params.difficulty);
  const maxBlinds = tier === 'easy' ? 1 : tier === 'medium' ? 2 : 4;
  const blindCount = Math.min(
    maxBlinds,
    Math.floor(params.targetText.length / 10)
  );
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
      if (wordBlindCount >= 2) {
        continue;
      }
      const letterCount = letterCounts.get(tile.char) ?? 0;
      if (letterCount < 2) {
        continue;
      }
      selected.push(index);
      blocked.add(index);
      blindCountsByWord.set(tile.wordIndex, wordBlindCount + 1);
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
  rng: Rng
): number | null => {
  const blocked = new Set([...prefilledIndices, ...blindIndices]);
  const candidates = tiles
    .filter((tile) => tile.isLetter && !blocked.has(tile.index))
    .map((tile) => tile.index);
  if (candidates.length === 0) {
    return null;
  }
  const pick = randInt(rng, 0, candidates.length - 1);
  const selected = candidates[pick];
  return selected ?? null;
};

const computeTimingTargets = (
  targetText: string
): { targetTimeSeconds: number; starThresholds: { '3_star': number; '2_star': number; '1_star': number } } => {
  const targetTimeSeconds = targetText.length * 2 + 30;
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
  revealedIndices: number[]
): PuzzlePublic => {
  const lockSet = new Set(puzzle.lockIndices ?? []);
  const revealedSet = new Set([...puzzle.prefilledIndices, ...revealedIndices]);
  if (revealedSet.size === 0) {
    const initialPadlockStatus = checkPadlockStatus(puzzle, revealedSet);
    const nonBlindStarter = puzzle.tiles.find(
      (tile) =>
        tile.isLetter &&
        !puzzle.blindIndices.includes(tile.index) &&
        !initialPadlockStatus.lockedIndexSet.has(tile.index)
    );
    const fallbackStarter = puzzle.tiles.find((tile) => tile.isLetter);
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
  const seed = deriveSeed(params.levelId, normalizedText);
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

  const maxRevealAttempts = params.skipSolvabilityCheck ? 1 : 5;
  for (let attempt = 0; attempt < maxRevealAttempts; attempt += 1) {
    const prefilledIndices = choosePrefilledIndices(
      tiles,
      params.difficulty,
      normalizedText,
      rng
    );

    const timing = computeTimingTargets(normalizedText);
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
      targetTimeSeconds: timing.targetTimeSeconds,
      starThresholds: timing.starThresholds,
      isLogical: cipherSelection.cipherType !== 'random',
      createdAt: Date.now(),
    });

    const applyObstructions =
      !params.skipSolvabilityCheck || params.applyObstructionsOnSkip === true;
    if (!params.skipSolvabilityCheck) {
      const solver = runDummySolver({
        puzzle: phase2Puzzle,
        revealedIndices: prefilledIndices,
      });
      const requiredRatio = solveRatioThreshold(params.difficulty);
      if (!solver.solvable || solver.blindGuessRequired || solver.solvedRatio < requiredRatio) {
        continue;
      }
    } else if (!applyObstructions) {
      const puzzlePublic = buildPublicPuzzle(phase2Puzzle, []);
      return { puzzlePrivate: phase2Puzzle, puzzlePublic };
    }

    const lockSelection = choosePadlockObstruction({
      basePuzzle: phase2Puzzle,
      prefilledIndices,
      rng,
    });
    const blindIndices = chooseBlindIndices({
      tiles,
      targetText: normalizedText,
      prefilledIndices,
      lockIndices: lockSelection.lockIndices,
      difficulty: params.difficulty,
    });

    const puzzlePrivate = puzzlePrivateSchema.parse({
      ...phase2Puzzle,
      lockIndices: lockSelection.lockIndices,
      blindIndices,
      goldIndex: chooseGoldIndex(tiles, prefilledIndices, blindIndices, rng),
      padlockChains: lockSelection.padlockChains,
    });
    const puzzlePublic = buildPublicPuzzle(puzzlePrivate, []);
    return { puzzlePrivate, puzzlePublic };
  }

  throw new Error('DUMMY_SOLVER_UNSATISFIED');
};
