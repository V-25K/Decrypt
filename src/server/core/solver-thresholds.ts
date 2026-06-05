export type SolverThresholdMode =
  | 'build'
  | 'deep-build'
  | 'manual-stabilization';

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
