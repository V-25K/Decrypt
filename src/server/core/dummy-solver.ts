import type { PuzzlePrivate, PuzzleTile } from '../../shared/game.ts';
import { solverLexicon } from './solver-lexicon.ts';

const englishFrequencyOrder = 'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('');
const suffixHints = ['ING', 'ED', 'ER', 'LY', 'EST', 'TION', 'NESS'] as const;
const defaultMaxBranchExpansionsByProfile = {
  standard: 2000,
  deep: 5000,
} as const;
const defaultMaxSolverMsByProfile = {
  standard: 40,
  deep: 75,
} as const;

export type SolverProfile = 'standard' | 'deep';

export type SolverResult = {
  solvable: boolean;
  solvedRatio: number;
  blindGuessRequired: boolean;
  budgetExceeded: boolean;
  branchExpansions: number;
  bestRatio: number;
  ambiguousWordCount: number;
  meanCandidateCount: number;
  maxCandidateCount: number;
  unresolvedCipherCount: number;
  forcedGuessCount: number;
  ambiguityScore: number;
};

type CipherTile = {
  index: number;
  wordIndex: number;
  cipherNumber: number;
  isBlind: boolean;
};

type Assignment = {
  cipherNumber: number;
  letter: string;
};

type SolverState = {
  knownLetters: Array<string | null>;
  letterToCipher: Map<string, number>;
  solvedIndices: Set<number>;
};

type SolverContext = {
  startedAtMs: number;
  branchExpansions: number;
  budgetExceeded: boolean;
  bestRatio: number;
  targetRatio: number;
  maxSearchMs: number;
  maxBranchExpansions: number;
  solverProfile: SolverProfile;
};

type CandidateWord = {
  word: string;
  assignments: Assignment[];
  rank: number;
};

const buildPatternSignature = (
  values: readonly (number | string)[]
): string => {
  const seen = new Map<number | string, number>();
  let nextIndex = 0;
  const signature: string[] = [];
  for (const value of values) {
    const existing = seen.get(value);
    if (existing !== undefined) {
      signature.push(String.fromCharCode(65 + existing));
      continue;
    }
    seen.set(value, nextIndex);
    signature.push(String.fromCharCode(65 + nextIndex));
    nextIndex += 1;
  }
  return signature.join('');
};

const lexiconRank = new Map(
  solverLexicon.map((word, index) => [word, index] as const)
);

const solverWordsByPattern = (() => {
  const byPattern = new Map<string, string[]>();
  for (const word of solverLexicon) {
    const key = `${word.length}:${buildPatternSignature(word.split(''))}`;
    const existing = byPattern.get(key) ?? [];
    existing.push(word);
    byPattern.set(key, existing);
  }
  return byPattern;
})();

const buildNeighborMap = (
  words: readonly string[],
  reader: (word: string, index: number) => { key: string; letter: string } | null
): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const word of words) {
    for (let index = 0; index < word.length; index += 1) {
      const pair = reader(word, index);
      if (!pair) {
        continue;
      }
      const existing = map.get(pair.key) ?? new Set<string>();
      existing.add(pair.letter);
      map.set(pair.key, existing);
    }
  }
  return map;
};

const forwardBigramMap = buildNeighborMap(
  solverLexicon.filter((word) => word.length >= 2),
  (word, index) => {
    if (index >= word.length - 1) {
      return null;
    }
    return {
      key: word[index] ?? '',
      letter: word[index + 1] ?? '',
    };
  }
);

const backwardBigramMap = buildNeighborMap(
  solverLexicon.filter((word) => word.length >= 2),
  (word, index) => {
    if (index === 0) {
      return null;
    }
    return {
      key: word[index] ?? '',
      letter: word[index - 1] ?? '',
    };
  }
);

const prefixTrigramMap = buildNeighborMap(
  solverLexicon.filter((word) => word.length >= 3),
  (word, index) => {
    if (index >= word.length - 2) {
      return null;
    }
    return {
      key: `${word[index] ?? ''}${word[index + 1] ?? ''}`,
      letter: word[index + 2] ?? '',
    };
  }
);

const suffixTrigramMap = buildNeighborMap(
  solverLexicon.filter((word) => word.length >= 3),
  (word, index) => {
    if (index <= 1) {
      return null;
    }
    return {
      key: `${word[index - 1] ?? ''}${word[index] ?? ''}`,
      letter: word[index - 2] ?? '',
    };
  }
);

const sandwichTrigramMap = buildNeighborMap(
  solverLexicon.filter((word) => word.length >= 3),
  (word, index) => {
    if (index === 0 || index >= word.length - 1) {
      return null;
    }
    return {
      key: `${word[index - 1] ?? ''}${word[index + 1] ?? ''}`,
      letter: word[index] ?? '',
    };
  }
);

const cloneLetterSet = (source: Set<string>): Set<string> => new Set(source);

const intersectLetterSets = (sets: Set<string>[]): Set<string> => {
  if (sets.length === 0) {
    return new Set<string>();
  }
  const ordered = [...sets].sort((a, b) => a.size - b.size);
  const [smallest, ...rest] = ordered;
  if (!smallest) {
    return new Set<string>();
  }
  const result = cloneLetterSet(smallest);
  for (const letter of [...result]) {
    if (rest.some((set) => !set.has(letter))) {
      result.delete(letter);
    }
  }
  return result;
};

const buildAlphabetSet = (): Set<string> => new Set(englishFrequencyOrder);

export const normalizeRequiredSolveRatio = (requiredSolveRatio = 0.8): number =>
  Math.max(0.35, Math.min(0.95, requiredSolveRatio));

const normalizeSolverProfile = (profile?: SolverProfile): SolverProfile =>
  profile === 'deep' ? 'deep' : 'standard';

const countKnown = (knownLetters: Array<string | null>): number =>
  knownLetters.filter((letter) => letter !== null).length;

const solveRatio = (solvedIndices: Set<number>, totalLetters: number): number =>
  totalLetters === 0 ? 0 : solvedIndices.size / totalLetters;

const buildCipherTiles = (
  puzzle: PuzzlePrivate,
  forbiddenIndices: Set<number>
): CipherTile[] =>
  (() => {
    const blindSet = new Set(puzzle.blindIndices);
    return puzzle.tiles
      .filter((tile): tile is PuzzleTile => tile.isLetter && !forbiddenIndices.has(tile.index))
      .map((tile) => {
        const cipherNumber = puzzle.mapping[tile.char];
        if (!cipherNumber) {
          return null;
        }
        return {
          index: tile.index,
          wordIndex: tile.wordIndex,
          cipherNumber,
          isBlind: blindSet.has(tile.index),
        };
      })
      .filter((tile): tile is CipherTile => tile !== null);
  })();

const groupWordTiles = (cipherTiles: CipherTile[]): CipherTile[][] => {
  const byWord = new Map<number, CipherTile[]>();
  for (const tile of cipherTiles) {
    const existing = byWord.get(tile.wordIndex) ?? [];
    existing.push(tile);
    byWord.set(tile.wordIndex, existing);
  }
  return [...byWord.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1].sort((a, b) => a.index - b.index));
};

const cloneState = (state: SolverState): SolverState => ({
  knownLetters: [...state.knownLetters],
  letterToCipher: new Map(state.letterToCipher),
  solvedIndices: new Set(state.solvedIndices),
});

const isWithinBudget = (context: SolverContext): boolean => {
  if (context.budgetExceeded) {
    return false;
  }
  const elapsed = Date.now() - context.startedAtMs;
  if (
    elapsed > context.maxSearchMs ||
    context.branchExpansions >= context.maxBranchExpansions
  ) {
    context.budgetExceeded = true;
    return false;
  }
  return true;
};

const isAssignmentCompatible = (
  state: SolverState,
  cipherNumber: number,
  letter: string
): boolean => {
  const existingLetter = state.knownLetters[cipherNumber] ?? null;
  if (existingLetter !== null && existingLetter !== letter) {
    return false;
  }
  const existingCipher = state.letterToCipher.get(letter);
  if (existingCipher !== undefined && existingCipher !== cipherNumber) {
    return false;
  }
  return true;
};

const assignCipherLetter = (
  state: SolverState,
  cipherNumber: number,
  letter: string
): 'assigned' | 'unchanged' | 'conflict' => {
  if (!isAssignmentCompatible(state, cipherNumber, letter)) {
    return 'conflict';
  }
  const existingLetter = state.knownLetters[cipherNumber] ?? null;
  if (existingLetter === letter) {
    return 'unchanged';
  }
  state.knownLetters[cipherNumber] = letter;
  state.letterToCipher.set(letter, cipherNumber);
  return 'assigned';
};

const applyAssignments = (state: SolverState, assignments: Assignment[]): boolean => {
  for (const assignment of assignments) {
    const outcome = assignCipherLetter(
      state,
      assignment.cipherNumber,
      assignment.letter
    );
    if (outcome === 'conflict') {
      return false;
    }
  }
  return true;
};

const propagateSolvedTiles = (state: SolverState, cipherTiles: CipherTile[]): boolean => {
  let changed = false;
  for (const tile of cipherTiles) {
    if (
      !tile.isBlind &&
      state.knownLetters[tile.cipherNumber] !== null &&
      !state.solvedIndices.has(tile.index)
    ) {
      state.solvedIndices.add(tile.index);
      changed = true;
    }
  }
  return changed;
};

const assignmentsForLetterSequence = (
  state: SolverState,
  tiles: CipherTile[],
  letters: string[]
): Assignment[] | null => {
  if (tiles.length !== letters.length) {
    return null;
  }
  const localCipherToLetter = new Map<number, string>();
  const localLetterToCipher = new Map<string, number>();

  for (let i = 0; i < tiles.length; i += 1) {
    const tile = tiles[i];
    const letter = letters[i];
    if (!tile || !letter) {
      return null;
    }
    const knownLetter = state.knownLetters[tile.cipherNumber] ?? null;
    if (knownLetter !== null && knownLetter !== letter) {
      return null;
    }
    const knownCipher = state.letterToCipher.get(letter);
    if (knownCipher !== undefined && knownCipher !== tile.cipherNumber) {
      return null;
    }
    const localExistingLetter = localCipherToLetter.get(tile.cipherNumber);
    if (localExistingLetter !== undefined && localExistingLetter !== letter) {
      return null;
    }
    const localExistingCipher = localLetterToCipher.get(letter);
    if (localExistingCipher !== undefined && localExistingCipher !== tile.cipherNumber) {
      return null;
    }
    localCipherToLetter.set(tile.cipherNumber, letter);
    localLetterToCipher.set(letter, tile.cipherNumber);
  }

  return [...localCipherToLetter.entries()]
    .filter(([cipherNumber]) => state.knownLetters[cipherNumber] === null)
    .map(([cipherNumber, letter]) => ({ cipherNumber, letter }));
};

const candidateWordsForWord = (
  state: SolverState,
  word: CipherTile[],
  profile: SolverProfile
): CandidateWord[] => {
  const maxWordLength = profile === 'deep' ? 10 : 8;
  if (word.length < 2 || word.length > maxWordLength) {
    return [];
  }
  const key = `${word.length}:${buildPatternSignature(word.map((tile) => tile.cipherNumber))}`;
  const maxCandidates = profile === 'deep' ? 28 : 14;
  const candidates = solverWordsByPattern.get(key) ?? [];

  return candidates
    .map((candidate) => {
      const assignments = assignmentsForLetterSequence(
        state,
        word,
        candidate.split('')
      );
      if (assignments === null) {
        return null;
      }
      return {
        word: candidate,
        assignments,
        rank: lexiconRank.get(candidate) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((candidate): candidate is CandidateWord => candidate !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxCandidates);
};

const deterministicOneLetterPass = (
  state: SolverState,
  wordTiles: CipherTile[][]
): 'changed' | 'unchanged' | 'conflict' => {
  let changed = false;
  for (const word of wordTiles) {
    if (word.length !== 1) {
      continue;
    }
    const tile = word[0];
    if (!tile || state.knownLetters[tile.cipherNumber] !== null) {
      continue;
    }
    const options = ['A', 'I'].filter((letter) =>
      isAssignmentCompatible(state, tile.cipherNumber, letter)
    );
    if (options.length === 0) {
      return 'conflict';
    }
    if (options.length === 1) {
      const onlyOption = options[0];
      if (!onlyOption) {
        return 'conflict';
      }
      const outcome = assignCipherLetter(state, tile.cipherNumber, onlyOption);
      if (outcome === 'conflict') {
        return 'conflict';
      }
      if (outcome === 'assigned') {
        changed = true;
      }
    }
  }
  return changed ? 'changed' : 'unchanged';
};

const deterministicWordPatternPass = (
  state: SolverState,
  wordTiles: CipherTile[][],
  context: SolverContext
): 'changed' | 'unchanged' | 'conflict' => {
  let changed = false;
  for (const word of wordTiles) {
    const candidates = candidateWordsForWord(state, word, context.solverProfile);
    if (candidates.length === 0) {
      continue;
    }

    if (candidates.length === 1) {
      const onlyCandidate = candidates[0];
      if (!onlyCandidate) {
        return 'conflict';
      }
      if (!applyAssignments(state, onlyCandidate.assignments)) {
        return 'conflict';
      }
      if (onlyCandidate.assignments.length > 0) {
        changed = true;
      }
      continue;
    }

    for (let index = 0; index < word.length; index += 1) {
      const tile = word[index];
      if (!tile || state.knownLetters[tile.cipherNumber] !== null) {
        continue;
      }
      const letters = new Set<string>();
      for (const candidate of candidates) {
        const letter = candidate.word[index];
        if (letter) {
          letters.add(letter);
        }
      }
      if (letters.size !== 1) {
        continue;
      }
      const [onlyLetter] = [...letters];
      if (!onlyLetter) {
        return 'conflict';
      }
      const outcome = assignCipherLetter(state, tile.cipherNumber, onlyLetter);
      if (outcome === 'conflict') {
        return 'conflict';
      }
      if (outcome === 'assigned') {
        changed = true;
      }
    }
  }
  return changed ? 'changed' : 'unchanged';
};

const ngramCandidatesForTile = (
  state: SolverState,
  word: CipherTile[],
  index: number
): Set<string> => {
  const constraints: Set<string>[] = [];
  const previous = index > 0 ? word[index - 1] : null;
  const next = index + 1 < word.length ? word[index + 1] : null;
  const previousKnown =
    previous ? state.knownLetters[previous.cipherNumber] ?? null : null;
  const nextKnown = next ? state.knownLetters[next.cipherNumber] ?? null : null;

  if (previousKnown) {
    const forward = forwardBigramMap.get(previousKnown);
    if (forward && forward.size > 0) {
      constraints.push(cloneLetterSet(forward));
    }
  }
  if (nextKnown) {
    const backward = backwardBigramMap.get(nextKnown);
    if (backward && backward.size > 0) {
      constraints.push(cloneLetterSet(backward));
    }
  }
  if (previousKnown && nextKnown) {
    const middle = sandwichTrigramMap.get(`${previousKnown}${nextKnown}`);
    if (middle && middle.size > 0) {
      constraints.push(cloneLetterSet(middle));
    }
  }
  if (index >= 2) {
    const prevTwoFirst = word[index - 2];
    const prevTwoSecond = word[index - 1];
    const firstKnown =
      prevTwoFirst ? state.knownLetters[prevTwoFirst.cipherNumber] ?? null : null;
    const secondKnown =
      prevTwoSecond ? state.knownLetters[prevTwoSecond.cipherNumber] ?? null : null;
    if (firstKnown && secondKnown) {
      const suffix = prefixTrigramMap.get(`${firstKnown}${secondKnown}`);
      if (suffix && suffix.size > 0) {
        constraints.push(cloneLetterSet(suffix));
      }
    }
  }
  if (index + 2 < word.length) {
    const nextTwoFirst = word[index + 1];
    const nextTwoSecond = word[index + 2];
    const firstKnown =
      nextTwoFirst ? state.knownLetters[nextTwoFirst.cipherNumber] ?? null : null;
    const secondKnown =
      nextTwoSecond ? state.knownLetters[nextTwoSecond.cipherNumber] ?? null : null;
    if (firstKnown && secondKnown) {
      const prefix = suffixTrigramMap.get(`${firstKnown}${secondKnown}`);
      if (prefix && prefix.size > 0) {
        constraints.push(cloneLetterSet(prefix));
      }
    }
  }

  if (constraints.length === 0) {
    return buildAlphabetSet();
  }
  return intersectLetterSets(constraints);
};

const deterministicNgramPass = (
  state: SolverState,
  wordTiles: CipherTile[][],
  context: SolverContext
): 'changed' | 'unchanged' | 'conflict' => {
  let changed = false;
  for (const word of wordTiles) {
    if (word.length < 2) {
      continue;
    }
    const candidates = candidateWordsForWord(state, word, context.solverProfile);
    for (let index = 0; index < word.length; index += 1) {
      const tile = word[index];
      if (!tile || state.knownLetters[tile.cipherNumber] !== null) {
        continue;
      }

      const ngramLetters = ngramCandidatesForTile(state, word, index);
      const refinedSets: Set<string>[] = [];
      if (ngramLetters.size > 0 && ngramLetters.size < 26) {
        refinedSets.push(ngramLetters);
      }
      if (candidates.length > 0) {
        const letters = new Set<string>();
        for (const candidate of candidates) {
          const letter = candidate.word[index];
          if (letter) {
            letters.add(letter);
          }
        }
        if (letters.size > 0) {
          refinedSets.push(letters);
        }
      }
      if (refinedSets.length === 0) {
        continue;
      }
      const allowed = intersectLetterSets(refinedSets);
      if (allowed.size !== 1) {
        continue;
      }
      const [onlyLetter] = [...allowed];
      if (!onlyLetter) {
        return 'conflict';
      }
      const outcome = assignCipherLetter(state, tile.cipherNumber, onlyLetter);
      if (outcome === 'conflict') {
        return 'conflict';
      }
      if (outcome === 'assigned') {
        changed = true;
      }
    }
  }
  return changed ? 'changed' : 'unchanged';
};

const propagateDeterministic = (
  state: SolverState,
  cipherTiles: CipherTile[],
  wordTiles: CipherTile[][],
  context: SolverContext
): boolean => {
  for (let pass = 0; pass < 64; pass += 1) {
    if (!isWithinBudget(context)) {
      return false;
    }
    let changed = false;
    if (propagateSolvedTiles(state, cipherTiles)) {
      changed = true;
    }
    const oneLetterOutcome = deterministicOneLetterPass(state, wordTiles);
    if (oneLetterOutcome === 'conflict') {
      return false;
    }
    if (oneLetterOutcome === 'changed') {
      changed = true;
    }
    const patternOutcome = deterministicWordPatternPass(state, wordTiles, context);
    if (patternOutcome === 'conflict') {
      return false;
    }
    if (patternOutcome === 'changed') {
      changed = true;
    }
    const ngramOutcome = deterministicNgramPass(state, wordTiles, context);
    if (ngramOutcome === 'conflict') {
      return false;
    }
    if (ngramOutcome === 'changed') {
      changed = true;
    }
    if (!changed) {
      return true;
    }
  }
  return true;
};

const branchFromOneLetterWords = (
  state: SolverState,
  wordTiles: CipherTile[][]
): Assignment[][] => {
  const candidates = new Set<number>();
  for (const word of wordTiles) {
    if (word.length !== 1) {
      continue;
    }
    const tile = word[0];
    if (tile && state.knownLetters[tile.cipherNumber] === null) {
      candidates.add(tile.cipherNumber);
    }
  }
  const targetCipher = [...candidates].sort((a, b) => a - b)[0];
  if (targetCipher === undefined) {
    return [];
  }
  return ['A', 'I']
    .filter((letter) => isAssignmentCompatible(state, targetCipher, letter))
    .map((letter) => [{ cipherNumber: targetCipher, letter }]);
};

const suffixAssignmentsForWord = (
  state: SolverState,
  word: CipherTile[],
  suffix: string
): Assignment[] | null => {
  if (word.length < suffix.length) {
    return null;
  }
  const suffixTiles = word.slice(word.length - suffix.length);
  const assignments = assignmentsForLetterSequence(state, suffixTiles, suffix.split(''));
  return assignments && assignments.length > 0 ? assignments : null;
};

const dedupeAssignmentBranches = (branches: Assignment[][]): Assignment[][] => {
  const deduped = new Map<string, Assignment[]>();
  for (const branch of branches) {
    const signature = branch
      .map((entry) => `${entry.cipherNumber}:${entry.letter}`)
      .sort()
      .join('|');
    if (!deduped.has(signature)) {
      deduped.set(signature, branch);
    }
  }
  return [...deduped.values()];
};

const branchFromWordPatterns = (
  state: SolverState,
  wordTiles: CipherTile[][],
  profile: SolverProfile
): Assignment[][] => {
  let bestWord: CipherTile[] | null = null;
  let bestCandidates: CandidateWord[] = [];

  for (const word of wordTiles) {
    const candidates = candidateWordsForWord(state, word, profile);
    const maxBranchCandidates = profile === 'deep' ? 10 : 6;
    if (candidates.length <= 1 || candidates.length > maxBranchCandidates) {
      continue;
    }
    const unresolvedCount = word.filter(
      (tile) => state.knownLetters[tile.cipherNumber] === null
    ).length;
    if (unresolvedCount === 0) {
      continue;
    }
    if (
      bestWord === null ||
      candidates.length < bestCandidates.length ||
      (candidates.length === bestCandidates.length && unresolvedCount > 0 && word.length > bestWord.length)
    ) {
      bestWord = word;
      bestCandidates = candidates;
    }
  }

  if (!bestWord || bestCandidates.length === 0) {
    return [];
  }

  return dedupeAssignmentBranches(
    bestCandidates
      .map((candidate) => candidate.assignments)
      .filter((assignments) => assignments.length > 0)
  );
};

const branchFromSuffixHints = (
  state: SolverState,
  wordTiles: CipherTile[][]
): Assignment[][] => {
  let bestBranches: Assignment[][] = [];
  for (const suffix of suffixHints) {
    const candidates = dedupeAssignmentBranches(
      wordTiles
      .map((word) => suffixAssignmentsForWord(state, word, suffix))
      .filter((assignments): assignments is Assignment[] => assignments !== null)
      .slice(0, 10)
    );
    if (
      candidates.length > 0 &&
      (bestBranches.length === 0 || candidates.length < bestBranches.length)
    ) {
      bestBranches = candidates;
    }
  }
  return bestBranches;
};

const branchFromFrequency = (
  state: SolverState,
  cipherTiles: CipherTile[]
): Assignment[][] => {
  const unresolvedCounts = new Map<number, number>();
  for (const tile of cipherTiles) {
    if (state.knownLetters[tile.cipherNumber] !== null) {
      continue;
    }
    unresolvedCounts.set(
      tile.cipherNumber,
      (unresolvedCounts.get(tile.cipherNumber) ?? 0) + 1
    );
  }
  const ranked = [...unresolvedCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0]
  );
  const top = ranked[0];
  if (!top) {
    return [];
  }
  const secondCount = ranked[1]?.[1] ?? 0;
  if (top[1] - secondCount < 2) {
    return [];
  }
  const topCipher = top[0];
  const usedLetters = new Set(state.letterToCipher.keys());
  return englishFrequencyOrder
    .filter((letter) => !usedLetters.has(letter))
    .slice(0, 5)
    .filter((letter) => isAssignmentCompatible(state, topCipher, letter))
    .map((letter) => [{ cipherNumber: topCipher, letter }]);
};

const chooseBranchCandidates = (
  state: SolverState,
  cipherTiles: CipherTile[],
  wordTiles: CipherTile[][],
  profile: SolverProfile
): Assignment[][] => {
  const oneLetterBranches = branchFromOneLetterWords(state, wordTiles);
  if (oneLetterBranches.length > 0) {
    return oneLetterBranches;
  }
  const wordPatternBranches = branchFromWordPatterns(state, wordTiles, profile);
  if (wordPatternBranches.length > 0) {
    return wordPatternBranches;
  }
  const suffixBranches = branchFromSuffixHints(state, wordTiles);
  if (suffixBranches.length > 0) {
    return suffixBranches;
  }
  return branchFromFrequency(state, cipherTiles);
};

const searchSolve = (params: {
  state: SolverState;
  cipherTiles: CipherTile[];
  wordTiles: CipherTile[][];
  totalLetters: number;
  context: SolverContext;
}): SolverState | null => {
  if (!isWithinBudget(params.context)) {
    return null;
  }
  const propagated = propagateDeterministic(
    params.state,
    params.cipherTiles,
    params.wordTiles,
    params.context
  );
  if (!propagated) {
    return null;
  }

  const ratio = solveRatio(params.state.solvedIndices, params.totalLetters);
  params.context.bestRatio = Math.max(params.context.bestRatio, ratio);
  if (ratio >= params.context.targetRatio) {
    return params.state;
  }

  const branchCandidates = chooseBranchCandidates(
    params.state,
    params.cipherTiles,
    params.wordTiles,
    params.context.solverProfile
  );
  if (branchCandidates.length === 0) {
    return null;
  }

  for (const branch of branchCandidates) {
    if (!isWithinBudget(params.context)) {
      return null;
    }
    params.context.branchExpansions += 1;
    if (!isWithinBudget(params.context)) {
      return null;
    }
    const nextState = cloneState(params.state);
    if (!applyAssignments(nextState, branch)) {
      continue;
    }
    const solved = searchSolve({
      ...params,
      state: nextState,
    });
    if (solved) {
      return solved;
    }
  }

  return null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round4 = (value: number): number => Number(value.toFixed(4));

const collectUnresolvedWordCandidateCounts = (params: {
  state: SolverState;
  wordTiles: CipherTile[][];
  solverProfile: SolverProfile;
}): number[] => {
  const candidateCounts: number[] = [];
  for (const word of params.wordTiles) {
    const unresolved = word.some(
      (tile) => params.state.knownLetters[tile.cipherNumber] === null
    );
    if (unresolved) {
      candidateCounts.push(
        candidateWordsForWord(
          params.state,
          word,
          params.solverProfile
        ).length
      );
    }
  }
  return candidateCounts;
};

const countUnresolvedCipherNumbers = (
  state: SolverState,
  cipherTiles: CipherTile[]
): number => {
  const unresolvedCipherNumbers = new Set<number>();
  for (const tile of cipherTiles) {
    if (state.knownLetters[tile.cipherNumber] === null) {
      unresolvedCipherNumbers.add(tile.cipherNumber);
    }
  }
  return unresolvedCipherNumbers.size;
};

const meanCandidateCountFor = (candidateCounts: number[]): number =>
  candidateCounts.length > 0
    ? candidateCounts.reduce((sum, count) => sum + count, 0) / candidateCounts.length
    : 0;

const solverAmbiguityScore = (params: {
  ambiguousWordCount: number;
  wordCount: number;
  meanCandidateCount: number;
  maxCandidateCount: number;
  unresolvedCipherCount: number;
  branchExpansions: number;
  budgetExceeded: boolean;
}): number =>
  clamp(
    (params.ambiguousWordCount / Math.max(1, params.wordCount)) * 0.32 +
      clamp(params.meanCandidateCount / 12, 0, 1) * 0.22 +
      clamp(params.maxCandidateCount / 28, 0, 1) * 0.16 +
      clamp(params.unresolvedCipherCount / 12, 0, 1) * 0.18 +
      clamp(params.branchExpansions / 250, 0, 1) * 0.08 +
      (params.budgetExceeded ? 0.04 : 0),
    0,
    1
  );

const buildSolverResult = (params: {
  solvable: boolean;
  solvedRatio: number;
  blindGuessRequired: boolean;
  state: SolverState;
  cipherTiles: CipherTile[];
  wordTiles: CipherTile[][];
  solverProfile: SolverProfile;
  context?: SolverContext;
}): SolverResult => {
  const candidateCounts = collectUnresolvedWordCandidateCounts({
    state: params.state,
    wordTiles: params.wordTiles,
    solverProfile: params.solverProfile,
  });
  const ambiguousWordCount = candidateCounts.filter((count) => count > 1).length;
  const unresolvedCipherCount = countUnresolvedCipherNumbers(
    params.state,
    params.cipherTiles
  );
  const maxCandidateCount = Math.max(0, ...candidateCounts);
  const meanCandidateCount = meanCandidateCountFor(candidateCounts);
  const budgetExceeded = params.context?.budgetExceeded ?? false;
  const branchExpansions = params.context?.branchExpansions ?? 0;
  const bestRatio = Math.max(
    params.context?.bestRatio ?? params.solvedRatio,
    params.solvedRatio
  );
  const ambiguityScore = solverAmbiguityScore({
    ambiguousWordCount,
    wordCount: params.wordTiles.length,
    meanCandidateCount,
    maxCandidateCount,
    unresolvedCipherCount,
    branchExpansions,
    budgetExceeded,
  });

  return {
    solvable: params.solvable,
    solvedRatio: round4(params.solvedRatio),
    blindGuessRequired: params.blindGuessRequired,
    budgetExceeded,
    branchExpansions,
    bestRatio: round4(bestRatio),
    ambiguousWordCount,
    meanCandidateCount: round4(meanCandidateCount),
    maxCandidateCount,
    unresolvedCipherCount,
    forcedGuessCount: branchExpansions,
    ambiguityScore: round4(ambiguityScore),
  };
};

export const runDummySolver = (params: {
  puzzle: PuzzlePrivate;
  revealedIndices: number[];
  forbiddenIndices?: number[];
  requiredSolveRatio?: number;
  maxSearchMs?: number;
  maxBranchExpansions?: number;
  solverProfile?: SolverProfile;
}): SolverResult => {
  const forbiddenSet = new Set(params.forbiddenIndices ?? []);
  const cipherTiles = buildCipherTiles(params.puzzle, forbiddenSet);
  const wordTiles = groupWordTiles(cipherTiles);
  const totalLetters = cipherTiles.length;
  const solverProfile = normalizeSolverProfile(params.solverProfile);
  const state: SolverState = {
    knownLetters: Array.from({ length: 27 }, () => null),
    letterToCipher: new Map<string, number>(),
    solvedIndices: new Set<number>(),
  };

  for (const revealedIndex of params.revealedIndices) {
    if (forbiddenSet.has(revealedIndex)) {
      continue;
    }
    const tile = params.puzzle.tiles[revealedIndex];
    if (!tile || !tile.isLetter) {
      continue;
    }
    const cipherNumber = params.puzzle.mapping[tile.char];
    if (!cipherNumber) {
      continue;
    }
    const assigned = assignCipherLetter(state, cipherNumber, tile.char);
    if (assigned === 'conflict') {
      return buildSolverResult({
        solvable: false,
        solvedRatio: solveRatio(state.solvedIndices, totalLetters),
        blindGuessRequired: true,
        state,
        cipherTiles,
        wordTiles,
        solverProfile,
      });
    }
    state.solvedIndices.add(revealedIndex);
  }

  if (countKnown(state.knownLetters) === 0) {
    return buildSolverResult({
      solvable: false,
      solvedRatio: 0,
      blindGuessRequired: true,
      state,
      cipherTiles,
      wordTiles,
      solverProfile,
    });
  }

  const context: SolverContext = {
    startedAtMs: Date.now(),
    branchExpansions: 0,
    budgetExceeded: false,
    bestRatio: solveRatio(state.solvedIndices, totalLetters),
    targetRatio: normalizeRequiredSolveRatio(params.requiredSolveRatio ?? 0.8),
    maxSearchMs:
      typeof params.maxSearchMs === 'number' && Number.isFinite(params.maxSearchMs)
        ? Math.max(1, Math.floor(params.maxSearchMs))
        : defaultMaxSolverMsByProfile[solverProfile],
    maxBranchExpansions:
      typeof params.maxBranchExpansions === 'number' &&
      Number.isFinite(params.maxBranchExpansions)
        ? Math.max(1, Math.floor(params.maxBranchExpansions))
        : defaultMaxBranchExpansionsByProfile[solverProfile],
    solverProfile,
  };
  const solved = searchSolve({
    state,
    cipherTiles,
    wordTiles,
    totalLetters,
    context,
  });

  if (solved && !context.budgetExceeded) {
    const ratio = solveRatio(solved.solvedIndices, totalLetters);
    return buildSolverResult({
      solvable: ratio >= context.targetRatio,
      solvedRatio: ratio,
      blindGuessRequired: ratio < context.targetRatio,
      state: solved,
      cipherTiles,
      wordTiles,
      solverProfile,
      context,
    });
  }

  return buildSolverResult({
    solvable: false,
    solvedRatio: context.bestRatio,
    blindGuessRequired: true,
    state,
    cipherTiles,
    wordTiles,
    solverProfile,
    context,
  });
};
