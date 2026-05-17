import { formatCountdown } from './game-formatters';

export type BonusTimerView = {
  countdownLabel: string;
  fastSolveThresholdSeconds: number | null;
  remainingMs: number;
  secondsLeft: number;
  showTimer: boolean;
};

export const getBonusTimerView = ({
  challengeStartTs,
  isChallengeScreen,
  isComplete,
  isGameOver,
  nowTs,
  targetTimeSeconds,
}: {
  challengeStartTs: number | null;
  isChallengeScreen: boolean;
  isComplete: boolean;
  isGameOver: boolean;
  nowTs: number;
  targetTimeSeconds: number | null | undefined;
}): BonusTimerView => {
  const fastSolveThresholdSeconds =
    typeof targetTimeSeconds === 'number' && targetTimeSeconds > 0
      ? Math.round(targetTimeSeconds)
      : null;
  const remainingMs =
    fastSolveThresholdSeconds !== null && challengeStartTs !== null
      ? Math.max(0, challengeStartTs + fastSolveThresholdSeconds * 1000 - nowTs)
      : 0;
  const showTimer =
    fastSolveThresholdSeconds !== null &&
    challengeStartTs !== null &&
    remainingMs > 0 &&
    isChallengeScreen &&
    !isComplete &&
    !isGameOver;

  return {
    countdownLabel: formatCountdown(remainingMs),
    fastSolveThresholdSeconds,
    remainingMs,
    secondsLeft: Math.ceil(remainingMs / 1000),
    showTimer,
  };
};
