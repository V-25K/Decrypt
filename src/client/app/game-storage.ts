import type { ChallengeMode } from './challenge-session-state';
import type { ChallengeType, EndlessSort, ThemePreference } from '../../shared/game';
import type { AppScreen, RouterOutputs } from './types';

export type PersistedOutcomeState = {
  levelId: string;
  isComplete: boolean;
  isGameOver: boolean;
  completion: RouterOutputs['game']['completeSession'] | null;
  solveSeconds: number | null;
  ratingDelta?: number | null;
  pointsGained?: number | null;
  savedAt: number;
};

const expandedScreenIntentKey = 'decrypt-expanded-screen-intent';
const expandedChallengeModeIntentKey = 'decrypt-expanded-challenge-mode-intent';
const expandedScreenIntentTtlMs = 5000;
const outcomeStateStorageKey = 'decrypt-challenge-outcome-v1';
const themePreferenceStorageKey = 'decrypt-theme-preference-v1';
const correctGuessStateStorageKeyPrefix = 'decrypt-correct-guess-tiles-v1:';
const storageMigrationMarkerPrefix = 'decrypt-storage-migrated-v1:';
const expandedIntentScreens = [
  'challenge',
  'shop',
  'home',
  'community',
  'quest',
  'stats',
  'leaderboard',
] as const;
const entrypointScreens = ['challenge', 'home', 'community', 'shop', 'quest', 'stats', 'leaderboard'] as const;

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

// Device-local mirror of the profile's theme preference so the very first
// paint after boot uses the right theme (the profile arrives async).
export const readThemePreference = (): ThemePreference => {
  try {
    return localStorage.getItem(themePreferenceStorageKey) === 'minimal'
      ? 'minimal'
      : 'default';
  } catch (_error) {
    return 'default';
  }
};

export const persistThemePreference = (theme: ThemePreference): void => {
  try {
    localStorage.setItem(themePreferenceStorageKey, theme);
  } catch (_error) {
    // Ignore storage failures; the server-side preference still applies.
  }
};

export const setExpandedScreenIntent = (screen: AppScreen): void => {
  try {
    const payload = JSON.stringify({ screen, ts: Date.now() });
    sessionStorage.setItem(expandedScreenIntentKey, payload);
    localStorage.setItem(expandedScreenIntentKey, payload);
  } catch (_error) {
    // Ignore storage failures; expanded fallback stays on challenge.
  }
};

export const consumeExpandedScreenIntent = (): AppScreen | null => {
  try {
    const value =
      sessionStorage.getItem(expandedScreenIntentKey) ??
      localStorage.getItem(expandedScreenIntentKey);
    sessionStorage.removeItem(expandedScreenIntentKey);
    localStorage.removeItem(expandedScreenIntentKey);
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

const isChallengeMode = (value: string): value is ChallengeMode =>
  value === 'daily' || value === 'endless';

const isChallengeType = (value: string): value is ChallengeType =>
  value === 'QUOTE' ||
  value === 'LYRIC_LINE' ||
  value === 'MOVIE_LINE' ||
  value === 'ANIME_LINE' ||
  value === 'SPEECH_LINE' ||
  value === 'BOOK_LINE' ||
  value === 'TV_LINE' ||
  value === 'SAYING' ||
  value === 'PROVERB';

const isEndlessSort = (value: string): value is EndlessSort =>
  value === 'random' ||
  value === 'latest' ||
  value === 'oldest' ||
  value === 'win_rate_desc' ||
  value === 'win_rate_asc';

export type ExpandedChallengeIntent = {
  mode: ChallengeMode;
  categoryFilter: ChallengeType | null;
  endlessSort: EndlessSort;
  dailyArchive: boolean;
  excludeLevelId: string | null;
  ignorePostLevel: boolean;
};

export const setExpandedChallengeModeIntent = (
  mode: ChallengeMode,
  categoryFilter: ChallengeType | null = null,
  endlessSort: EndlessSort = 'random',
  dailyArchive = false,
  excludeLevelId: string | null = null,
  ignorePostLevel = false
): void => {
  try {
    const payload = JSON.stringify({
      mode,
      categoryFilter,
      endlessSort,
      dailyArchive,
      excludeLevelId,
      ignorePostLevel,
      ts: Date.now(),
    });
    sessionStorage.setItem(expandedChallengeModeIntentKey, payload);
    localStorage.setItem(expandedChallengeModeIntentKey, payload);
  } catch (_error) {
    // Ignore storage failures; expanded fallback loads the daily challenge.
  }
};

export const consumeExpandedChallengeModeIntent = (): ExpandedChallengeIntent | null => {
  try {
    const value =
      sessionStorage.getItem(expandedChallengeModeIntentKey) ??
      localStorage.getItem(expandedChallengeModeIntentKey);
    sessionStorage.removeItem(expandedChallengeModeIntentKey);
    localStorage.removeItem(expandedChallengeModeIntentKey);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }
    const modeValue = parsed.mode;
    const categoryValue = parsed.categoryFilter;
    const sortValue = parsed.endlessSort;
    const dailyArchiveValue = parsed.dailyArchive;
    const excludeLevelIdValue = parsed.excludeLevelId;
    const ignorePostLevelValue = parsed.ignorePostLevel;
    const tsValue = parsed.ts;
    if (
      typeof modeValue === 'string' &&
      isChallengeMode(modeValue) &&
      (categoryValue === null ||
        categoryValue === undefined ||
        (typeof categoryValue === 'string' && isChallengeType(categoryValue))) &&
      (sortValue === undefined ||
        (typeof sortValue === 'string' && isEndlessSort(sortValue))) &&
      (dailyArchiveValue === undefined || typeof dailyArchiveValue === 'boolean') &&
      (excludeLevelIdValue === null ||
        excludeLevelIdValue === undefined ||
        typeof excludeLevelIdValue === 'string') &&
      (ignorePostLevelValue === undefined ||
        typeof ignorePostLevelValue === 'boolean') &&
      typeof tsValue === 'number' &&
      Date.now() - tsValue <= expandedScreenIntentTtlMs
    ) {
      return {
        mode: modeValue,
        categoryFilter:
          typeof categoryValue === 'string' && isChallengeType(categoryValue)
            ? categoryValue
            : null,
        endlessSort:
          typeof sortValue === 'string' && isEndlessSort(sortValue)
            ? sortValue
            : 'random',
        dailyArchive: dailyArchiveValue === true,
        excludeLevelId:
          typeof excludeLevelIdValue === 'string' && excludeLevelIdValue.length > 0
            ? excludeLevelIdValue
            : null,
        ignorePostLevel: ignorePostLevelValue === true,
      };
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
    const ratingDelta =
      parsed.ratingDelta === null || typeof parsed.ratingDelta === 'number'
        ? (parsed.ratingDelta ?? null)
        : null;
    const pointsGained =
      parsed.pointsGained === null || typeof parsed.pointsGained === 'number'
        ? (parsed.pointsGained ?? null)
        : null;
    return {
      levelId,
      isComplete,
      isGameOver,
      completion,
      solveSeconds,
      ratingDelta,
      pointsGained,
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
