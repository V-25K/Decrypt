import type { PuzzlePrivate } from '../../shared/game.ts';
import {
  exceedsPuzzleTotalLength,
  hasWordLongerThan,
  maxPuzzleTotalLength,
  maxPuzzleWordLength,
} from './content.ts';

const isUpperAlpha = (char: string): boolean => char >= 'A' && char <= 'Z';

const uniqueLetters = (text: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (isUpperAlpha(char)) {
      set.add(char);
    }
  }
  return set;
};

const hasStarterClue = (puzzle: PuzzlePrivate): boolean => {
  for (const index of puzzle.prefilledIndices) {
    const tile = puzzle.tiles[index];
    if (tile && tile.isLetter) {
      return true;
    }
  }
  return false;
};

const hasOverlap = (a: number[], b: number[]): boolean => {
  const setB = new Set(b);
  return a.some((index) => setB.has(index));
};

const hasSelfLockingPadlock = (puzzle: PuzzlePrivate): boolean =>
  puzzle.padlockChains.some((chain) => hasOverlap(chain.keyIndices, chain.lockedIndices));

const hasCircularPadlock = (puzzle: PuzzlePrivate): boolean => {
  const adjacency = new Map<number, number[]>();
  const chainCount = puzzle.padlockChains.length;

  for (let i = 0; i < chainCount; i += 1) {
    adjacency.set(i, []);
  }

  for (let i = 0; i < chainCount; i += 1) {
    const chain = puzzle.padlockChains[i];
    if (!chain) {
      continue;
    }
    for (let j = 0; j < chainCount; j += 1) {
      const other = puzzle.padlockChains[j];
      if (!other) {
        continue;
      }
      if (hasOverlap(chain.keyIndices, other.lockedIndices)) {
        const edges = adjacency.get(i) ?? [];
        edges.push(j);
        adjacency.set(i, edges);
      }
    }
  }

  const state: Array<0 | 1 | 2> = Array.from({ length: chainCount }, () => 0);
  const visit = (node: number): boolean => {
    state[node] = 1;
    for (const next of adjacency.get(node) ?? []) {
      if (state[next] === 1) {
        return true;
      }
      if (state[next] === 0 && visit(next)) {
        return true;
      }
    }
    state[node] = 2;
    return false;
  };

  for (let i = 0; i < chainCount; i += 1) {
    if (state[i] === 0 && visit(i)) {
      return true;
    }
  }

  return false;
};

const hasUnfairBlindTile = (puzzle: PuzzlePrivate): boolean => {
  if (puzzle.blindIndices.length === 0) {
    return false;
  }

  const textLetters = uniqueLetters(puzzle.targetText);
  const blindSet = new Set(puzzle.blindIndices);
  const visibleByChar = new Map<string, number[]>();
  for (const tile of puzzle.tiles) {
    if (tile.isLetter && !blindSet.has(tile.index)) {
      const indices = visibleByChar.get(tile.char) ?? [];
      indices.push(tile.index);
      visibleByChar.set(tile.char, indices);
    }
  }

  for (const index of puzzle.blindIndices) {
    const tile = puzzle.tiles[index];
    if (!tile || !tile.isLetter) {
      return true;
    }
    const word = puzzle.words[tile.wordIndex];
    if (!word || word.length < 5) {
      return true;
    }

    const appearsElsewhere = (visibleByChar.get(tile.char)?.length ?? 0) > 0;
    if (!appearsElsewhere && textLetters.has(tile.char)) {
      return true;
    }
  }
  return false;
};

const hasFullyPrefilledMultiLetterWord = (puzzle: PuzzlePrivate): boolean => {
  const prefilledSet = new Set(puzzle.prefilledIndices);
  const lettersByWord = new Map<number, number[]>();
  for (const tile of puzzle.tiles) {
    if (!tile.isLetter) {
      continue;
    }
    const indices = lettersByWord.get(tile.wordIndex) ?? [];
    indices.push(tile.index);
    lettersByWord.set(tile.wordIndex, indices);
  }
  for (const indices of lettersByWord.values()) {
    if (indices.length <= 1) {
      continue;
    }
    if (indices.every((index) => prefilledSet.has(index))) {
      return true;
    }
  }
  return false;
};

const hasOversizedWord = (puzzle: PuzzlePrivate): boolean =>
  hasWordLongerThan(puzzle.targetText, maxPuzzleWordLength);

const hasExcessiveTotalLength = (puzzle: PuzzlePrivate): boolean =>
  exceedsPuzzleTotalLength(puzzle.targetText, maxPuzzleTotalLength);

export const validatePuzzle = (puzzle: PuzzlePrivate): {
  valid: boolean;
  reasons: string[];
} => {
  const reasons: string[] = [];

  if (!hasStarterClue(puzzle)) {
    reasons.push('No starter clue on board.');
  }
  if (hasSelfLockingPadlock(puzzle)) {
    reasons.push('Padlock chain locks its own key tiles.');
  }
  if (hasCircularPadlock(puzzle)) {
    reasons.push('Padlock dependency loop detected.');
  }
  if (hasUnfairBlindTile(puzzle)) {
    reasons.push('Blind tile fairness check failed.');
  }
  if (hasFullyPrefilledMultiLetterWord(puzzle)) {
    reasons.push('A multi-letter word is fully prefilled.');
  }
  if (hasOversizedWord(puzzle)) {
    reasons.push(`Word length exceeds ${maxPuzzleWordLength} characters.`);
  }
  if (hasExcessiveTotalLength(puzzle)) {
    reasons.push(`Total challenge length exceeds ${maxPuzzleTotalLength} characters.`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
};
