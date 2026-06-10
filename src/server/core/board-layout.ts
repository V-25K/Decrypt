import type { PuzzlePrivate } from '../../shared/game.ts';
import {
  buildDifficultyBreakdown,
  difficultyModelVersion,
} from './difficulty-model.ts';
import type { FittedLayout } from './tier-fitter.ts';

const uniqueSortedNumbers = (values: number[]): number[] =>
  [...new Set(values)].sort((a, b) => a - b);

/**
 * Overlays a fitted layout onto a freshly built base board of the SAME text.
 * Layout indices are text-positional, so they stay valid across level IDs and
 * cipher mappings — this is what guarantees the published board is exactly
 * the board that was previewed.
 */
export const applyFittedLayoutToBasePuzzle = (params: {
  basePuzzle: PuzzlePrivate;
  layout: FittedLayout;
}): PuzzlePrivate => {
  const { basePuzzle, layout } = params;
  const lockIndices = uniqueSortedNumbers(
    layout.padlockChains.flatMap((chain) => chain.lockedIndices)
  );
  const candidate: PuzzlePrivate = {
    ...basePuzzle,
    prefilledIndices: layout.prefilledIndices,
    revealedIndices: layout.prefilledIndices,
    revealed_indices: layout.prefilledIndices,
    blindIndices: layout.blindIndices,
    lockIndices,
    padlockChains: layout.padlockChains,
    goldIndex: layout.goldIndex,
    difficulty: layout.difficulty,
  };
  const breakdown = buildDifficultyBreakdown(candidate);
  return {
    ...candidate,
    difficultyModelVersion,
    difficultyBreakdown: breakdown,
  };
};
