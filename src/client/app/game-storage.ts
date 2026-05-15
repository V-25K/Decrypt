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
const expandedScreenIntentTtlMs = 5000;
const outcomeStateStorageKey = 'decrypt-challenge-outcome-v1';
const correctGuessStateStorageKeyPrefix = 'decrypt-correct-guess-tiles-v1:';
const storageMigrationMarkerPrefix = 'decrypt-storage-migrated-v1:';
const expandedIntentScreens = ['shop', 'home', 'quest', 'stats', 'leaderboard'] as const;
const entrypointScreens = ['challenge', 'home', 'shop', 'quest', 'stats', 'leaderboard'] as const;

const isAppScreen = <TScreen extends AppScreen>(
  value: string,
  allowedScreens: readonly TScreen[]
): value is TScreen => allowedScreens.some((screen) => screen === value);

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

export const getStorageKey = (userId: string, baseKey: string): string =>
  `decrypt:${userId}:${baseKey}`;

const outcomeStorageKey = (userId: string): string =>
  getStorageKey(userId, 'challenge-outcome-v1');

const correctGuessStorageKey = (userId: string, levelId: string): string =>
  getStorageKey(userId, `correct-guess-tiles-v1:${levelId}`);

const storageMigrationMarkerKey = (userId: string): string =>
  `${storageMigrationMarkerPrefix}${userId}`;

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
      isAppScreen(screenValue, expandedIntentScreens) &&
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
  if (typeof value === 'string' && isAppScreen(value, entrypointScreens)) {
    return value;
  }
  return null;
};

export const migrateSessionStorageForUser = (userId: string): void => {
  try {
    const markerKey = storageMigrationMarkerKey(userId);
    const hasMigrated = sessionStorage.getItem(markerKey) === '1';

    const existingOutcome = sessionStorage.getItem(outcomeStorageKey(userId));
    const legacyOutcome = sessionStorage.getItem(outcomeStateStorageKey);
    if (!hasMigrated && !existingOutcome && legacyOutcome) {
      sessionStorage.setItem(outcomeStorageKey(userId), legacyOutcome);
    }
    sessionStorage.removeItem(outcomeStateStorageKey);

    const legacyCorrectGuessKeys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(correctGuessStateStorageKeyPrefix)) {
        legacyCorrectGuessKeys.push(key);
      }
    }

    for (const legacyKey of legacyCorrectGuessKeys) {
      const levelId = legacyKey.slice(correctGuessStateStorageKeyPrefix.length);
      const legacyValue = sessionStorage.getItem(legacyKey);
      const nextKey = correctGuessStorageKey(userId, levelId);
      if (!hasMigrated && !sessionStorage.getItem(nextKey) && legacyValue) {
        sessionStorage.setItem(nextKey, legacyValue);
      }
      sessionStorage.removeItem(legacyKey);
    }

    sessionStorage.setItem(markerKey, '1');
  } catch (_error) {
    // Ignore migration failures; storage callers still fail closed.
  }
};

export const persistOutcomeState = (
  userId: string,
  state: PersistedOutcomeState | null
): void => {
  try {
    const key = outcomeStorageKey(userId);
    if (!state) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch (_error) {
    // Ignore persistence failures.
  }
};

export const readOutcomeState = (userId: string): PersistedOutcomeState | null => {
  try {
    const raw = sessionStorage.getItem(outcomeStorageKey(userId));
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
  userId: string,
  levelId: string,
  indices: Iterable<number>
): void => {
  try {
    const dedupedSorted = Array.from(new Set(indices))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((left, right) => left - right);
    sessionStorage.setItem(
      correctGuessStorageKey(userId, levelId),
      JSON.stringify(dedupedSorted)
    );
  } catch (_error) {
    // Ignore persistence failures.
  }
};

export const readCorrectGuessIndices = (userId: string, levelId: string): number[] => {
  try {
    const raw = sessionStorage.getItem(correctGuessStorageKey(userId, levelId));
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

export const clearCorrectGuessIndices = (userId: string, levelId: string): void => {
  try {
    sessionStorage.removeItem(correctGuessStorageKey(userId, levelId));
  } catch (_error) {
    // Ignore persistence failures.
  }
};
