import { describe, expect, it } from 'vitest';
import {
  buildPublicPuzzle,
  buildPuzzle,
  computeObstructionBudgetSpent,
  chooseGoldIndex,
  normalizePadlockChains,
  computeObstructionBudget,
  spendBudget,
  remainingBudget,
  ObstructionCosts,
  BLIND_TILE_COST,
  estimateDifficultyFromObstructions,
  PADLOCK_CHAIN_COST,
  PADLOCK_KEY_EASY_DISCOUNT,
  PREFILL_REMOVAL_COST,
} from './puzzle';

describe('puzzle', () => {
  it('keeps expert starter clues to at most one prefilled tile', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0099',
      dateKey: '2026-02-26',
      text: 'ONLY THE BRAVE TRY AGAIN',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    expect(generated.puzzlePrivate.prefilledIndices.length).toBeLessThanOrEqual(1);
  });

  it('does not fully prefill a multi-letter starter word', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0099_anchor',
      dateKey: '2026-02-26',
      text: 'THE SIGNAL STAYS',
      author: 'UNKNOWN',
      difficulty: 2,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    const firstWordIndices = generated.puzzlePrivate.tiles
      .filter((tile) => tile.isLetter && tile.wordIndex === 0)
      .map((tile) => tile.index);
    const prefilledSet = new Set(generated.puzzlePrivate.prefilledIndices);

    expect(firstWordIndices.length).toBeGreaterThan(1);
    expect(firstWordIndices.every((index) => prefilledSet.has(index))).toBe(false);
  });

  it('keeps expert prefills tight on short phrases', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0099_expert_prefill',
      dateKey: '2026-02-26',
      text: 'EASY PEASY',
      author: 'UNKNOWN',
      difficulty: 9,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    expect(generated.puzzlePrivate.prefilledIndices.length).toBeLessThanOrEqual(2);
  });

  it('shows a fallback starter letter for legacy zero-prefilled puzzles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0100',
      dateKey: '2026-02-26',
      text: 'SOLVE THIS IF YOU CAN',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    generated.puzzlePrivate.prefilledIndices = [];
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const visibleLetterCount = view.tiles.filter(
      (tile) => tile.isLetter && tile.displayChar !== '_'
    ).length;

    expect(visibleLetterCount).toBeGreaterThan(0);
  });

  it('does not reveal blind tiles in fallback starter selection', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0100_blind_fallback',
      dateKey: '2026-02-26',
      text: 'SOLVE THIS IF YOU CAN',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });

    generated.puzzlePrivate.prefilledIndices = [];
    const firstLetterIndex = generated.puzzlePrivate.tiles.find(
      (tile) => tile.isLetter
    )?.index;
    if (firstLetterIndex === undefined) {
      throw new Error('Expected at least one letter tile in generated puzzle');
    }
    generated.puzzlePrivate.blindIndices = [firstLetterIndex];
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const revealedLetterTiles = view.tiles.filter(
      (tile) => tile.isLetter && tile.displayChar !== '_'
    );

    expect(revealedLetterTiles.length).toBeGreaterThan(0);
    expect(revealedLetterTiles.some((tile) => tile.index === firstLetterIndex)).toBe(
      false
    );
  });

  it('normalizes legacy word-index padlock chains into tile-index chains', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0101',
      dateKey: '2026-02-26',
      text: 'LOCK KEY OPEN',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const normalized = normalizePadlockChains({
      tiles: generated.puzzlePrivate.tiles,
      padlockChains: [{ keyWordIndex: 0, lockedWordIndex: 1 }],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.keyIndices.length).toBeGreaterThan(0);
    expect(normalized[0]?.lockedIndices.length).toBeGreaterThan(0);
  });

  it('keeps punctuation pre-visible in public puzzle tiles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0102',
      dateKey: '2026-02-26',
      text: 'WINTER IS COMING!',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const punctuationTile = view.tiles.find((tile) => !tile.isLetter && tile.displayChar === '!');

    expect(punctuationTile).toBeTruthy();
  });

  it('keeps numbers pre-visible and unencrypted', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0103',
      dateKey: '2026-02-26',
      text: 'AGENT 007 REPORTS IN',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const view = buildPublicPuzzle(generated.puzzlePrivate, []);
    const sevenTile = view.tiles.find((tile) => !tile.isLetter && tile.displayChar === '7');

    expect(sevenTile).toBeTruthy();
    expect(sevenTile?.cipherNumber ?? null).toBeNull();
  });

  it('is deterministic for same level and quote input', () => {
    const first = buildPuzzle({
      levelId: 'lvl_0450',
      dateKey: '2026-02-26',
      text: 'EVERY CODE HIDES A CLUE, AND EVERY CLUE REWARDS PATIENCE.',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 35,
      skipSolvabilityCheck: true,
    });
    const second = buildPuzzle({
      levelId: 'lvl_0450',
      dateKey: '2026-02-26',
      text: 'EVERY CODE HIDES A CLUE, AND EVERY CLUE REWARDS PATIENCE.',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 35,
      skipSolvabilityCheck: true,
    });

    expect(first.puzzlePrivate.cipherType).toBe(second.puzzlePrivate.cipherType);
    expect(first.puzzlePrivate.shiftAmount).toBe(second.puzzlePrivate.shiftAmount);
    expect(first.puzzlePrivate.mapping).toEqual(second.puzzlePrivate.mapping);
    expect(first.puzzlePrivate.goldIndex).toBe(second.puzzlePrivate.goldIndex);
  });

  it('blind picks do not repeat the same letter in one selection pass', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0106',
      dateKey: '2026-02-26',
      text: 'APPLE BERRY CHERRY DELTA',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });
    const blindLetters = generated.puzzlePrivate.blindIndices
      .map((index) => generated.puzzlePrivate.tiles[index])
      .filter((tile): tile is (typeof generated.puzzlePrivate.tiles)[number] => Boolean(tile))
      .map((tile) => tile.char);
    expect(new Set(blindLetters).size).toBe(blindLetters.length);
  });

  it('chooses gold index from medium-frequency letters when available', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0107',
      dateKey: '2026-02-26',
      text: 'ALPHA BETA GAMMA DELTA EPSILON',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const tiles = generated.puzzlePrivate.tiles;
    const picked = chooseGoldIndex(tiles, [], [], () => 0.9999);
    expect(picked).not.toBeNull();
    const pickedTile = tiles.find((tile) => tile.index === picked);
    if (!pickedTile || !pickedTile.isLetter) {
      throw new Error('Expected a picked gold letter tile');
    }
    const pickedFrequency = tiles.filter(
      (tile) => tile.isLetter && tile.char === pickedTile.char
    ).length;
    expect(Math.abs(pickedFrequency - 3)).toBeLessThanOrEqual(1);
  });

  it('returns null gold index when all letters are blocked', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0108',
      dateKey: '2026-02-26',
      text: 'ALPHA BETA',
      author: 'UNKNOWN',
      difficulty: 6,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    const allLetterIndices = generated.puzzlePrivate.tiles
      .filter((tile) => tile.isLetter)
      .map((tile) => tile.index);
    const picked = chooseGoldIndex(
      generated.puzzlePrivate.tiles,
      allLetterIndices,
      [],
      () => 0
    );
    expect(picked).toBeNull();
  });

  it('defaults source to UNKNOWN_LEGACY when not provided', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0104',
      dateKey: '2026-02-26',
      text: 'STONE TONES LEAST STEAL STALE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    });
    expect(generated.puzzlePrivate.source).toBe('UNKNOWN_LEGACY');
  });

  it('stores explicit source on generated puzzles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0105',
      dateKey: '2026-02-26',
      text: 'STONE TONES LEAST STEAL STALE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      source: 'AUTO_DAILY',
    });
    expect(generated.puzzlePrivate.source).toBe('AUTO_DAILY');
  });
});

describe('obstruction budget system', () => {
  it('computes budget for warmup tier with low crypto hardness', () => {
    const budget = computeObstructionBudget({
      tier: 'warmup',
      difficulty: 2,
      cipherType: 'shift',
      phraseUniqueLetters: 8,
      phraseOneLetterWords: 1,
      phraseSuffixCount: 2,
      cryptoHardness: 0.3,
    });

    // Easier/helper-rich text now earns more obstruction room instead of less.
    expect(budget.total).toBe(24);
    expect(budget.spent).toBe(0);
  });

	  it('computes budget for medium tier with moderate crypto hardness', () => {
	    const budget = computeObstructionBudget({
	      tier: 'medium',
      difficulty: 5,
      cipherType: 'random',
      phraseUniqueLetters: 12,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 1,
      cryptoHardness: 0.5,
    });

	    expect(budget.total).toBe(59);
	    expect(budget.spent).toBe(0);
	  });

	  it('does not use total letter count when computing obstruction budget', () => {
	    const baseContext = {
	      tier: 'medium' as const,
	      difficulty: 5,
	      cipherType: 'random' as const,
	      phraseUniqueLetters: 12,
	      phraseOneLetterWords: 0,
	      phraseSuffixCount: 1,
	      cryptoHardness: 0.5,
	      uniqueWordCount: 7,
	    };
	    const shortBudget = computeObstructionBudget({
	      ...baseContext,
	      totalLetters: 28,
	    });
	    const longBudget = computeObstructionBudget({
	      ...baseContext,
	      totalLetters: 120,
	    });

	    expect(longBudget.total).toBe(shortBudget.total);
	  });

  it('computes budget for hard tier with high crypto hardness', () => {
    const budget = computeObstructionBudget({
      tier: 'hard',
      difficulty: 9,
      cipherType: 'random',
      phraseUniqueLetters: 18,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 0,
      cryptoHardness: 0.8,
    });

    expect(budget.total).toBe(95);
    expect(budget.spent).toBe(0);
  });

  it('ensures budget never goes negative', () => {
    const budget = computeObstructionBudget({
      tier: 'warmup',
      difficulty: 1,
      cipherType: 'shift',
      phraseUniqueLetters: 6,
      phraseOneLetterWords: 3,
      phraseSuffixCount: 5,
      cryptoHardness: 0.9,
    });

    expect(budget.total).toBe(27);
    expect(budget.spent).toBe(0);
  });

  it('spends budget correctly', () => {
    const budget = computeObstructionBudget({
      tier: 'medium',
      difficulty: 5,
      cipherType: 'random',
      phraseUniqueLetters: 10,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 0,
      cryptoHardness: 0.4,
    });

    expect(budget.total).toBe(59);
    expect(budget.spent).toBe(0);

    spendBudget(budget, BLIND_TILE_COST);
    expect(budget.spent).toBe(8);
    expect(remainingBudget(budget)).toBe(51);

    spendBudget(budget, PADLOCK_CHAIN_COST);
    expect(budget.spent).toBe(26);
    expect(remainingBudget(budget)).toBe(33);
  });

  it('does not exceed total budget when spending', () => {
    const budget = computeObstructionBudget({
      tier: 'warmup',
      difficulty: 2,
      cipherType: 'shift',
      phraseUniqueLetters: 8,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 0,
      cryptoHardness: 0.2,
    });

    expect(budget.total).toBe(19);

    spendBudget(budget, 10);
    expect(budget.spent).toBe(10);

    spendBudget(budget, 10);
    expect(budget.spent).toBe(19); // Clamped to total
    expect(remainingBudget(budget)).toBe(0);
  });

  it('ignores negative or zero spend amounts', () => {
    const budget = computeObstructionBudget({
      tier: 'medium',
      difficulty: 5,
      cipherType: 'random',
      phraseUniqueLetters: 10,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 0,
      cryptoHardness: 0.4,
    });

    expect(budget.spent).toBe(0);

    spendBudget(budget, 0);
    expect(budget.spent).toBe(0);

    spendBudget(budget, -5);
    expect(budget.spent).toBe(0);
  });

  it('exports correct cost constants', () => {
    expect(BLIND_TILE_COST).toBe(8);
    expect(PADLOCK_CHAIN_COST).toBe(18);
    expect(PADLOCK_KEY_EASY_DISCOUNT).toBe(4);
    expect(PREFILL_REMOVAL_COST).toBe(5);
  });

  it('exports ObstructionCosts object with all constants', () => {
    expect(ObstructionCosts.BLIND_TILE).toBe(8);
    expect(ObstructionCosts.PADLOCK_CHAIN).toBe(18);
    expect(ObstructionCosts.PADLOCK_KEY_EASY_DISCOUNT).toBe(4);
    expect(ObstructionCosts.PREFILL_REMOVAL).toBe(5);
  });

  it('tracks budget correctly across multiple spends', () => {
    const budget = computeObstructionBudget({
      tier: 'hard',
      difficulty: 8,
      cipherType: 'random',
      phraseUniqueLetters: 15,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 1,
      cryptoHardness: 0.6,
    });

    expect(budget.total).toBe(100);

    // Add 2 padlocks
    spendBudget(budget, PADLOCK_CHAIN_COST);
    spendBudget(budget, PADLOCK_CHAIN_COST);
    expect(budget.spent).toBe(36);
    expect(remainingBudget(budget)).toBe(64);

    // Add 3 blind tiles
    spendBudget(budget, BLIND_TILE_COST);
    spendBudget(budget, BLIND_TILE_COST);
    spendBudget(budget, BLIND_TILE_COST);
    expect(budget.spent).toBe(60);
    expect(remainingBudget(budget)).toBe(40);

    // Add another padlock and confirm remaining budget still tracks correctly
    spendBudget(budget, PADLOCK_CHAIN_COST);
    expect(budget.spent).toBe(78);
    expect(remainingBudget(budget)).toBe(22);
  });

  it('computes non-zero spent budget for already-obstructed puzzles', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_0109',
      dateKey: '2026-02-26',
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });

    const spent = computeObstructionBudgetSpent(generated.puzzlePrivate);

    expect(spent).toBeGreaterThan(0);
  });

  it('gives easier repetitive text more obstruction budget than harder text in the same tier', () => {
    const easierTextBudget = computeObstructionBudget({
      tier: 'hard',
      difficulty: 8,
      cipherType: 'random',
      totalLetters: 42,
      uniqueWordRatio: 0.5,
      repeatedWordRatio: 0.5,
      phraseUniqueLetters: 10,
      phraseOneLetterWords: 1,
      phraseSuffixCount: 2,
      cryptoHardness: 0.3,
    });
    const harderTextBudget = computeObstructionBudget({
      tier: 'hard',
      difficulty: 8,
      cipherType: 'random',
      totalLetters: 42,
      uniqueWordRatio: 1,
      repeatedWordRatio: 0,
      phraseUniqueLetters: 20,
      phraseOneLetterWords: 0,
      phraseSuffixCount: 0,
      cryptoHardness: 0.82,
    });

    expect(easierTextBudget.total).toBeGreaterThan(harderTextBudget.total);
  });
});

describe('board-aware difficulty estimate', () => {
  const longPhrase =
    'THE SIGNAL RETURNS WHEN THE PATTERN REPEATS AND THE LETTERS START HELPING EACH OTHER AGAIN';

  const buildLongPuzzle = () =>
    buildPuzzle({
      levelId: 'lvl_board_aware',
      dateKey: '2026-06-04',
      text: longPhrase,
      author: 'UNKNOWN',
      difficulty: 8,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: false,
    }).puzzlePrivate;

  const indicesForLetters = (puzzle: ReturnType<typeof buildLongPuzzle>, letters: string[]) => {
    const allowed = new Set(letters);
    return puzzle.tiles
      .filter((tile) => tile.isLetter && allowed.has(tile.char))
      .map((tile) => tile.index);
  };

  const firstLetterIndicesExcluding = (
    puzzle: ReturnType<typeof buildLongPuzzle>,
    excluded: Set<number>,
    limit: number
  ) =>
    puzzle.tiles
      .filter((tile) => tile.isLetter && !excluded.has(tile.index))
      .map((tile) => tile.index)
      .slice(0, limit);

  it('does not label a long clue-rich board as hard just because it is long', () => {
    const puzzle = buildLongPuzzle();
    const prefilledIndices = indicesForLetters(puzzle, ['E', 'T']);
    const estimated = estimateDifficultyFromObstructions({
      ...puzzle,
      prefilledIndices,
      revealedIndices: prefilledIndices,
      revealed_indices: prefilledIndices,
      blindIndices: [],
      lockIndices: [],
      padlockChains: [],
    });

    expect(longPhrase.length).toBeGreaterThan(80);
    expect(estimated).toBeLessThanOrEqual(5);
  });

  it('raises the same long phrase when the board has real blind and lock pressure', () => {
    const puzzle = buildLongPuzzle();
    const easyPrefills = indicesForLetters(puzzle, ['E', 'T']);
    const easyEstimate = estimateDifficultyFromObstructions({
      ...puzzle,
      prefilledIndices: easyPrefills,
      revealedIndices: easyPrefills,
      revealed_indices: easyPrefills,
      blindIndices: [],
      lockIndices: [],
      padlockChains: [],
    });
    const excluded = new Set(easyPrefills);
    const lockIndices = firstLetterIndicesExcluding(puzzle, excluded, 22);
    for (const index of lockIndices) {
      excluded.add(index);
    }
    const blindIndices = firstLetterIndicesExcluding(puzzle, excluded, 8);
    const obstructedEstimate = estimateDifficultyFromObstructions({
      ...puzzle,
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      blindIndices,
      lockIndices,
      padlockChains: [
        {
          chainId: 1,
          keyIndices: [blindIndices[0] ?? 0],
          lockedIndices: lockIndices.slice(0, 11),
        },
        {
          chainId: 2,
          keyIndices: [blindIndices[1] ?? 1],
          lockedIndices: lockIndices.slice(11),
        },
      ],
    });

    expect(obstructedEstimate).toBeGreaterThanOrEqual(easyEstimate + 2);
    expect(obstructedEstimate).toBeGreaterThanOrEqual(6);
  });
});
