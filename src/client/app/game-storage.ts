import type { AppScreen, RouterOutputs } from './types';

export type PersistedOutcomeState = {
  levelId: string;
  isComplete: boolean;
  isGameOver: boolean;
  completion: RouterOutputs['game']['completeSession'] | null;
  solveSeconds: number | null;
  savedAt: number;
};

const expandedScreenIntentKey = 'decrypt-expanded-screen-intent';
const expandedScreenIntentTtlMs = 15000;
const outcomeStateStorageKey = 'decrypt-challenge-outcome-v1';
const correctGuessStateStorageKeyPrefix = 'decrypt-correct-guess-tiles-v1:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCompletionResult = (
  value: unknown
): value is RouterOutputs['game']['completeSession'] => {
  if (!isRecord(value)) {
    return false;
  }
  const ok = value.ok;
  const accepted = value.accepted;
  const solveSeconds = value.solveSeconds;
  const score = value.score;
  const rewardCoins = value.rewardCoins;
  const mistakes = value.mistakes;
  const usedPowerups = value.usedPowerups;
  const profile = value.profile;
  const inventory = value.inventory;
  return (
    typeof ok === 'boolean' &&
    typeof accepted === 'boolean' &&
    typeof solveSeconds === 'number' &&
    typeof score === 'number' &&
    typeof rewardCoins === 'number' &&
    typeof mistakes === 'number' &&
    typeof usedPowerups === 'number' &&
    isRecord(profile) &&
    isRecord(inventory)
  );
};

const correctGuessStorageKey = (levelId: string): string =>
  `${correctGuessStateStorageKeyPrefix}${levelId}`;

export const setExpandedScreenIntent = (screen: AppScreen): void => {
  try {
    const payload = JSON.stringify({ screen, ts: Date.now() });
    sessionStorage.setItem(expandedScreenIntentKey, payload);
  } catch (_error) {
    // Ignore storage failures; expanded fallback stays on challenge.
  }
};

export const consumeExpandedScreenIntent = (): AppScreen | null => {
  try {
    const value = sessionStorage.getItem(expandedScreenIntentKey);
    sessionStorage.removeItem(expandedScreenIntentKey);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }
    const screenValue = parsed.screen;
    const tsValue = parsed.ts;
    if (
      typeof screenValue === 'string' &&
      (screenValue === 'shop' ||
        screenValue === 'home' ||
        screenValue === 'quest' ||
        screenValue === 'stats' ||
        screenValue === 'leaderboard') &&
      typeof tsValue === 'number' &&
      Date.now() - tsValue <= expandedScreenIntentTtlMs
    ) {
      return screenValue;
    }
    return null;
  } catch (_error) {
    return null;
  }
};

export const readEntrypointScreen = (): AppScreen | null => {
  const value = document.getElementById('root')?.getAttribute('data-initial-screen');
  if (
    value === 'home' ||
    value === 'shop' ||
    value === 'quest' ||
    value === 'stats' ||
    value === 'leaderboard'
  ) {
    return value;
  }
  return null;
};

export const persistOutcomeState = (state: PersistedOutcomeState | null): void => {
  try {
    if (!state) {
      sessionStorage.removeItem(outcomeStateStorageKey);
      return;
    }
    sessionStorage.setItem(outcomeStateStorageKey, JSON.stringify(state));
  } catch (_error) {
    // Ignore persistence failures.
  }
};

export const readOutcomeState = (): PersistedOutcomeState | null => {
  try {
    const raw = sessionStorage.getItem(outcomeStateStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const levelId = parsed.levelId;
    const isComplete = parsed.isComplete;
    const isGameOver = parsed.isGameOver;
    const savedAt = parsed.savedAt;
    if (
      typeof levelId !== 'string' ||
      typeof isComplete !== 'boolean' ||
      typeof isGameOver !== 'boolean' ||
      typeof savedAt !== 'number'
    ) {
      return null;
    }
    const completion = isCompletionResult(parsed.completion)
      ? parsed.completion
      : null;
    const solveSeconds =
      parsed.solveSeconds === null || typeof parsed.solveSeconds === 'number'
        ? (parsed.solveSeconds ?? null)
        : null;
    return {
      levelId,
      isComplete,
      isGameOver,
      completion,
      solveSeconds,
      savedAt,
    };
  } catch (_error) {
    return null;
  }
};

export const persistCorrectGuessIndices = (
  levelId: string,
  indices: Iterable<number>
): void => {
  try {
    const dedupedSorted = Array.from(new Set(indices))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((left, right) => left - right);
    sessionStorage.setItem(
      correctGuessStorageKey(levelId),
      JSON.stringify(dedupedSorted)
    );
  } catch (_error) {
    // Ignore persistence failures.
  }
};

export const readCorrectGuessIndices = (levelId: string): number[] => {
  try {
    const raw = sessionStorage.getItem(correctGuessStorageKey(levelId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (value): value is number =>
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 0
      )
      .sort((left, right) => left - right);
  } catch (_error) {
    return [];
  }
};

export const clearCorrectGuessIndices = (levelId: string): void => {
  try {
    sessionStorage.removeItem(correctGuessStorageKey(levelId));
  } catch (_error) {
    // Ignore persistence failures.
  }
};
