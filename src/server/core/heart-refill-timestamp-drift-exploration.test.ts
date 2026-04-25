import { describe, it, expect } from 'vitest';
import { normalizeHearts } from './hearts';
import { heartRefillIntervalMs, heartsPerRun } from './constants';
import type { UserProfile } from '../../shared/game';

describe('Heart Refill Timestamp Drift Bug Exploration', () => {
  it('Property 2: Bug Condition - Heart Refill Timestamp Drift', () => {
    /**
     * **Validates: Requirements 2.2**
     * 
     * This test explores the heart refill timestamp drift bug where players lose refills
     * due to calculation based on old timestamps rather than current time.
     * 
     * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
     * DO NOT attempt to fix the test or the code when it fails.
     * 
     * Bug Scenario from spec: Player with 1 heart waits 59 minutes, then 2 more minutes
     * Adapted for 30-minute intervals: Player waits 29 minutes, then 2 more minutes
     * - After 29 minutes: Should get 0 refills (expected)
     * - After 31 minutes total: Should get 1 refill (1 heart + 1 refill = 2 hearts)
     * - The bug: timestamp calculation drift affects future refill calculations
     */
    
    // Initial state: Player has 1 heart, last refill was "now"
    const initialTime = 1000000000000; // Fixed timestamp for predictable testing
    const initialProfile: UserProfile = {
      userId: 'test-user',
      username: 'TestUser',
      hearts: 1,
      lastHeartRefillTs: initialTime,
      infiniteHeartsExpiryTs: 0,
      coins: 0,
      powerups: { hammer: 0, wand: 0, shield: 0, rocket: 0 },
      completedLevels: new Set(),
      endlessCursor: 0,
      stats: {
        totalSolves: 0,
        totalTime: 0,
        averageTime: 0,
        bestTime: 0,
        currentStreak: 0,
        bestStreak: 0,
        flawlessCount: 0,
        fastSolveCount: 0,
        totalRetries: 0,
      },
      questProgress: {},
      settings: {
        soundEnabled: true,
        musicEnabled: true,
        hapticsEnabled: true,
        theme: 'dark',
      },
    };

    // Step 1: Player waits 29 minutes (just under 1 refill interval)
    const after29Minutes = initialTime + (29 * 60 * 1000);
    const profileAfter29Min = normalizeHearts(initialProfile, after29Minutes);
    
    // After 29 minutes: should get 0 refills (still 1 heart)
    expect(profileAfter29Min.hearts).toBe(1);
    
    // Step 2: Player waits 2 more minutes (total 31 minutes = 1+ refill intervals)
    const after31Minutes = initialTime + (31 * 60 * 1000);
    const profileAfter31Min = normalizeHearts(profileAfter29Min, after31Minutes);
    
    // After 31 minutes: should get 1 refill (1 + 1 = 2 hearts)
    expect(profileAfter31Min.hearts).toBe(2);
    
    // Step 3: The critical test - demonstrate the timestamp drift bug
    // Wait another 29 minutes (total 60 minutes = 2 refill intervals)
    const after60Minutes = initialTime + (60 * 60 * 1000);
    const profileAfter60Min = normalizeHearts(profileAfter31Min, after60Minutes);
    
    // EXPECTED BEHAVIOR: After 60 minutes total, player should have 3 hearts
    // (1 initial + 2 refills from 2 intervals)
    // BUG BEHAVIOR: Due to timestamp drift, calculation might be incorrect
    
    // This assertion should FAIL on unfixed code if the timestamp drift bug exists
    expect(profileAfter60Min.hearts).toBe(3);
    
    // Additional verification: When hearts are full, timestamp should be current time
    expect(profileAfter60Min.lastHeartRefillTs).toBe(after60Minutes);
  });

  it('Property 2: Bug Condition - Heart Refill Timestamp Drift (Actual Bug Found)', () => {
    /**
     * **Validates: Requirements 2.2**
     * 
     * This test demonstrates the actual heart refill timestamp drift bug.
     * When hearts are already full, the normalizeHearts function returns early
     * without updating lastHeartRefillTs, causing timestamp drift for future calculations.
     * 
     * CRITICAL: This test FAILS on unfixed code - failure confirms the bug exists.
     * DO NOT attempt to fix the test or the code when it fails.
     */
    
    const baseTime = 1000000000000;
    
    // Start with a player who has full hearts
    const profile: UserProfile = {
      userId: 'timestamp-drift-bug',
      username: 'TimestampDriftBug',
      hearts: 3, // Full hearts
      lastHeartRefillTs: baseTime,
      infiniteHeartsExpiryTs: 0,
      coins: 0,
      powerups: { hammer: 0, wand: 0, shield: 0, rocket: 0 },
      completedLevels: new Set(),
      endlessCursor: 0,
      stats: {
        totalSolves: 0,
        totalTime: 0,
        averageTime: 0,
        bestTime: 0,
        currentStreak: 0,
        bestStreak: 0,
        flawlessCount: 0,
        fastSolveCount: 0,
        totalRetries: 0,
      },
      questProgress: {},
      settings: {
        soundEnabled: true,
        musicEnabled: true,
        hapticsEnabled: true,
        theme: 'dark',
      },
    };

    // Player waits 30 minutes while having full hearts
    // The normalizeHearts function should update lastHeartRefillTs to current time
    const timeAfter30Min = baseTime + (30 * 60 * 1000);
    const result1 = normalizeHearts(profile, timeAfter30Min);
    
    console.log('After 30 minutes with full hearts:');
    console.log('  Hearts:', result1.hearts);
    console.log('  lastHeartRefillTs:', result1.lastHeartRefillTs);
    console.log('  Current time:', timeAfter30Min);
    console.log('  Timestamp updated?', result1.lastHeartRefillTs === timeAfter30Min);
    
    // Hearts should still be full
    expect(result1.hearts).toBe(3);
    
    // BUG: lastHeartRefillTs should be updated to current time when hearts are full
    // This assertion FAILS on unfixed code, proving the timestamp drift bug exists
    expect(result1.lastHeartRefillTs).toBe(timeAfter30Min);
    
    // This bug causes problems when the player later consumes hearts and needs refills
    // The timestamp will be stale, leading to incorrect refill calculations
  });
});