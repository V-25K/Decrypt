import type { UserProfile } from '../../shared/game';
import { heartRefillIntervalMs, heartsPerRun } from './constants';

const clampHearts = (hearts: number): number =>
  Math.min(heartsPerRun, Math.max(0, hearts));

export const hasInfiniteHearts = (
  profile: UserProfile,
  nowTs: number = Date.now()
): boolean => profile.infiniteHeartsExpiryTs > nowTs;

export const normalizeHearts = (
  profile: UserProfile,
  nowTs: number = Date.now()
): UserProfile => {
  if (hasInfiniteHearts(profile, nowTs)) {
    return profile;
  }

  const hearts = clampHearts(profile.hearts);
  if (hearts >= heartsPerRun) {
    return hearts === profile.hearts ? profile : { ...profile, hearts };
  }

  const elapsedMs = Math.max(0, nowTs - profile.lastHeartRefillTs);
  const refillCount = Math.floor(elapsedMs / heartRefillIntervalMs);
  if (refillCount <= 0) {
    return hearts === profile.hearts ? profile : { ...profile, hearts };
  }

  const nextHearts = clampHearts(hearts + refillCount);
  const nextRefillTs =
    nextHearts >= heartsPerRun
      ? nowTs
      : profile.lastHeartRefillTs + refillCount * heartRefillIntervalMs;

  return {
    ...profile,
    hearts: nextHearts,
    lastHeartRefillTs: nextRefillTs,
  };
};

export const canStartChallenge = (
  profile: UserProfile,
  nowTs: number = Date.now()
): boolean => {
  const normalized = normalizeHearts(profile, nowTs);
  return hasInfiniteHearts(normalized, nowTs) || normalized.hearts > 0;
};

export const consumeHeartOnFailure = (
  profile: UserProfile,
  nowTs: number = Date.now()
): UserProfile => {
  const normalized = normalizeHearts(profile, nowTs);
  if (hasInfiniteHearts(normalized, nowTs)) {
    return normalized;
  }
  if (normalized.hearts <= 0) {
    return normalized;
  }

  const nextHearts = normalized.hearts - 1;
  return {
    ...normalized,
    hearts: nextHearts,
    // Start refill countdown when dropping from full.
    lastHeartRefillTs:
      normalized.hearts === heartsPerRun ? nowTs : normalized.lastHeartRefillTs,
  };
};

export const addHeartsFromBundle = (
  profile: UserProfile,
  extraHearts: number,
  nowTs: number = Date.now()
): UserProfile => {
  const normalized = normalizeHearts(profile, nowTs);
  if (extraHearts <= 0) {
    return normalized;
  }
  const nextHearts = clampHearts(normalized.hearts + extraHearts);
  return {
    ...normalized,
    hearts: nextHearts,
    // Full hearts should not keep an old stale refill baseline.
    lastHeartRefillTs:
      nextHearts >= heartsPerRun ? nowTs : normalized.lastHeartRefillTs,
  };
};
