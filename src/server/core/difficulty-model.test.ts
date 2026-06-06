import { describe, expect, it } from 'vitest';
import { buildDifficultyBreakdown } from './difficulty-model';
import { buildPuzzle } from './puzzle';

const buildBase = (text: string, difficulty = 5) =>
  buildPuzzle({
    levelId: `lvl_model_${text.length}_${difficulty}`,
    dateKey: '2026-06-05',
    text,
    author: 'UNKNOWN',
    difficulty,
    logicalPercent: 100,
    skipSolvabilityCheck: true,
    applyObstructionsOnSkip: false,
  }).puzzlePrivate;

const firstLetterIndices = (
  puzzle: ReturnType<typeof buildBase>,
  excluded: Set<number>,
  limit: number
) =>
  puzzle.tiles
    .filter((tile) => tile.isLetter && !excluded.has(tile.index))
    .map((tile) => tile.index)
    .slice(0, limit);

describe('difficulty model v2', () => {
  it('keeps a common lightly-obstructed quote out of expert', () => {
    const puzzle = buildBase('THE ONLY THING WE HAVE TO FEAR IS FEAR ITSELF', 5);
    const prefilledIndices = firstLetterIndices(puzzle, new Set(), 5);
    const excluded = new Set(prefilledIndices);
    const lockIndices = firstLetterIndices(puzzle, excluded, 4);
    for (const index of lockIndices) {
      excluded.add(index);
    }
    const blindIndices = firstLetterIndices(puzzle, excluded, 1);
    const breakdown = buildDifficultyBreakdown({
      ...puzzle,
      prefilledIndices,
      revealedIndices: prefilledIndices,
      revealed_indices: prefilledIndices,
      lockIndices,
      blindIndices,
      padlockChains: [
        {
          chainId: 1,
          keyIndices: [prefilledIndices[0] ?? 0],
          lockedIndices: lockIndices,
        },
      ],
    });

    expect(breakdown.calibratedDifficulty).toBeLessThan(9);
    expect(breakdown.humanFeatures.topCommonWordRatio).toBeGreaterThan(0.4);
  });

  it('does not punish recognizable vocabulary only because the old lexicon was sparse', () => {
    const puzzle = buildBase('IN THE MIDDLE OF DIFFICULTY LIES OPPORTUNITY', 5);
    const breakdown = buildDifficultyBreakdown(puzzle);

    expect(breakdown.calibratedDifficulty).toBeLessThan(9);
    expect(breakdown.humanFeatures.lexiconCoverageRatio).toBeGreaterThan(0.5);
  });

  it('raises difficulty when real blind and lock pressure increases', () => {
    const puzzle = buildBase(
      'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS UNDER BRIGHT MOONLIGHT',
      9
    );
    const easy = buildDifficultyBreakdown({
      ...puzzle,
      cipherType: 'shift',
      blindIndices: [],
      lockIndices: [],
      padlockChains: [],
    });
    const excluded = new Set<number>();
    const lockIndices = firstLetterIndices(puzzle, excluded, 18);
    for (const index of lockIndices) {
      excluded.add(index);
    }
    const blindIndices = firstLetterIndices(puzzle, excluded, 6);
    const hard = buildDifficultyBreakdown({
      ...puzzle,
      cipherType: 'random',
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices,
      blindIndices,
      padlockChains: [
        {
          chainId: 1,
          keyIndices: [lockIndices[0] ?? 0],
          lockedIndices: lockIndices.slice(1),
        },
      ],
    });

    expect(hard.calibratedDifficulty).toBeGreaterThanOrEqual(easy.calibratedDifficulty);
    expect(hard.calibratedDifficulty).toBeGreaterThanOrEqual(6);
  });

  it('does not increase difficulty when more starter letters are revealed', () => {
    const puzzle = buildBase('CLEAR ANCHORS MAKE CRYPTOGRAMS FRIENDLIER', 6);
    const onePrefill = firstLetterIndices(puzzle, new Set(), 1);
    const manyPrefills = firstLetterIndices(puzzle, new Set(), 8);
    const sparse = buildDifficultyBreakdown({
      ...puzzle,
      prefilledIndices: onePrefill,
      revealedIndices: onePrefill,
      revealed_indices: onePrefill,
    });
    const generous = buildDifficultyBreakdown({
      ...puzzle,
      prefilledIndices: manyPrefills,
      revealedIndices: manyPrefills,
      revealed_indices: manyPrefills,
    });

    expect(generous.calibratedDifficulty).toBeLessThanOrEqual(
      sparse.calibratedDifficulty
    );
  });

  it('keeps shift cipher no harder than random for the same board', () => {
    const puzzle = buildBase('PATTERNS REVEAL HIDDEN STRUCTURE OVER TIME', 6);
    const prefilledIndices = firstLetterIndices(puzzle, new Set(), 4);
    const shift = buildDifficultyBreakdown({
      ...puzzle,
      cipherType: 'shift',
      prefilledIndices,
      revealedIndices: prefilledIndices,
      revealed_indices: prefilledIndices,
    });
    const random = buildDifficultyBreakdown({
      ...puzzle,
      cipherType: 'random',
      prefilledIndices,
      revealedIndices: prefilledIndices,
      revealed_indices: prefilledIndices,
    });

    expect(shift.calibratedDifficulty).toBeLessThanOrEqual(
      random.calibratedDifficulty
    );
  });

  it('can still classify a no-reveal high-variety random board as expert', () => {
    const puzzle = buildBase(
      'QUARTZ GLYPHS VEX JUMBLED NYMPHS WHILE ZIGZAG FJORDS KNOCK WAXY RHYTHMS',
      9
    );
    const excluded = new Set<number>();
    const lockIndices = firstLetterIndices(puzzle, excluded, 28);
    for (const index of lockIndices) {
      excluded.add(index);
    }
    const blindIndices = firstLetterIndices(puzzle, excluded, 10);
    const expert = buildDifficultyBreakdown({
      ...puzzle,
      cipherType: 'random',
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices,
      blindIndices,
      padlockChains: [
        {
          chainId: 1,
          keyIndices: [lockIndices[0] ?? 0],
          lockedIndices: lockIndices.slice(1),
        },
      ],
    });

    expect(expert.calibratedDifficulty).toBeGreaterThanOrEqual(9);
  });

  it('reports solver weakness as confidence pressure instead of the whole score', () => {
    const puzzle = buildBase('PERSISTENCE AND RESILIENCE DEFINE SUCCESS', 7);
    const breakdown = buildDifficultyBreakdown({
      ...puzzle,
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
    });

    expect(breakdown.fairnessSummary.solvedRatio).toBeLessThanOrEqual(0.6);
    expect(breakdown.calibratedDifficulty).toBeLessThanOrEqual(8);
  });

  it('adds solver ambiguity metrics and caps confidence for unfair layouts', () => {
    const puzzle = buildBase('ABCDEFG HIJKLMN OPQRSTU', 9);
    const breakdown = buildDifficultyBreakdown({
      ...puzzle,
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
    });

    expect(breakdown.fairnessSummary.solvable).toBe(false);
    expect(breakdown.fairnessSummary.ambiguityScore).toBeGreaterThanOrEqual(0);
    expect(breakdown.fairnessSummary.branchExpansions).toBeGreaterThanOrEqual(0);
    expect(breakdown.difficultyConfidence).toBeLessThanOrEqual(0.42);
    expect(breakdown.calibratedDifficulty).toBeLessThanOrEqual(10);
  });
});
