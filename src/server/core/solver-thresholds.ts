export type SolverThresholdMode =
  | 'build'
  | 'deep-build'
  | 'manual-stabilization';

export type DifficultySolverTier = 'warmup' | 'medium' | 'hard' | 'expert';

export type TierSolverBand = {
  floor: number;
  ceiling: number;
};

// Floors match the 'build' thresholds so a band-fitted board is never less
// fair than legacy output. Ceilings create separation between tiers (an
// "expert" board should not nearly auto-solve); they are tunables — widen a
// ceiling before loosening a floor if fitting fails too often in playtests.
export const solverBandForTier = (tier: DifficultySolverTier): TierSolverBand => {
  if (tier === 'warmup') {
    return { floor: 0.82, ceiling: 1.0 };
  }
  if (tier === 'medium') {
    return { floor: 0.7, ceiling: 0.9 };
  }
  if (tier === 'hard') {
    return { floor: 0.56, ceiling: 0.78 };
  }
  return { floor: 0.42, ceiling: 0.66 };
};

export const solverThresholdForDifficulty = (
  difficulty: number,
  mode: SolverThresholdMode
): number => {
  if (mode === 'manual-stabilization') {
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
  }

  if (mode === 'deep-build') {
    if (difficulty >= 9) {
      return 0.42;
    }
    if (difficulty >= 8) {
      return 0.48;
    }
    if (difficulty >= 6) {
      return 0.56;
    }
  }

  if (difficulty <= 3) {
    return 0.82;
  }
  if (difficulty <= 5) {
    return 0.7;
  }
  if (difficulty <= 7) {
    return 0.56;
  }
  if (difficulty >= 9) {
    return 0.42;
  }
  return 0.5;
};
