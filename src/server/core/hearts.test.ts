import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../shared/game';
import { heartRefillIntervalMs, heartsPerRun } from './constants';
import { addHeartsFromBundle, consumeHeartOnFailure, normalizeHearts } from './hearts';

const profileFixture = (overrides?: Partial<UserProfile>): UserProfile => ({
  coins: 0,
  hearts: heartsPerRun,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 0,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  dailyFlawlessWins: 0,
  endlessFlawlessWins: 0,
  dailySpeedWins: 0,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 0,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 0,
  endlessFirstTryWins: 0,
  questsCompleted: 0,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 0,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
});

describe('hearts', () => {
  it('consumes one heart when a run is failed', () => {
    const nowTs = 1_000_000;
    const profile = profileFixture({
      hearts: 3,
      lastHeartRefillTs: nowTs - 5000,
    });
    const next = consumeHeartOnFailure(profile, nowTs);
    expect(next.hearts).toBe(2);
    expect(next.lastHeartRefillTs).toBe(nowTs);
  });

  it('refills one heart every 30 minutes', () => {
    const baseTs = 1_000_000;
    const profile = profileFixture({
      hearts: 1,
      lastHeartRefillTs: baseTs,
    });
    const next = normalizeHearts(profile, baseTs + heartRefillIntervalMs);
    expect(next.hearts).toBe(2);
  });

  it('does not consume hearts while infinite hearts are active', () => {
    const nowTs = 1_000_000;
    const profile = profileFixture({
      hearts: 1,
      infiniteHeartsExpiryTs: nowTs + 60_000,
    });
    const next = consumeHeartOnFailure(profile, nowTs);
    expect(next.hearts).toBe(1);
  });

  it('applies bundle hearts and caps at max hearts', () => {
    const nowTs = 1_000_000;
    const profile = profileFixture({
      hearts: 2,
      lastHeartRefillTs: nowTs - 10_000,
    });
    const next = addHeartsFromBundle(profile, 5, nowTs);
    expect(next.hearts).toBe(heartsPerRun);
    expect(next.lastHeartRefillTs).toBe(nowTs);
  });
});
