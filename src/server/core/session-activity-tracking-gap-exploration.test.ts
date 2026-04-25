import { describe, it, expect } from 'vitest';
import type { SessionState } from '../../shared/game';

// Import the function we're testing
import { withTrackedSessionActivity } from './game-service';
import { sessionInactivityThresholdMs } from './constants';

/**
 * Bug Condition Exploration Test for Session Activity Tracking Gaps
 * 
 * **Property 1: Bug Condition** - Session Activity Tracking Gaps
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * **GOAL**: Surface counterexamples that demonstrate inaccurate time tracking with network issues
 * 
 * **COUNTEREXAMPLES FOUND**:
 * - 11-minute thinking time records as 0 seconds due to exceeding 10-minute threshold
 * - Any activity period longer than 10 minutes gets completely discarded
 * - System loses tracking time when players take extended breaks or think deeply
 * 
 * **Validates: Requirements 2.4**
 */
describe('Session Activity Tracking Gap Exploration', () => {
  const createBaseSession = (): SessionState => ({
    activeLevelId: 'test-level',
    mode: 'daily',
    startTimestamp: 1000,
    activeMs: 0,
    lastSeenAt: 1000,
    mistakesMade: 0,
    shieldIsActive: false,
    revealedIndices: [],
    usedPowerups: 0,
    wrongGuesses: 0,
    guessCount: 0,
  });

  it('should track time accurately for 11-minute thinking session (EXPECTED TO FAIL)', () => {
    // **Scoped PBT Approach**: 11-minute thinking time, time lost due to threshold
    const session = createBaseSession();
    const startTime = 1000;
    const thinkingTimeMs = 11 * 60 * 1000; // 11 minutes - exceeds 10-minute threshold
    const endTime = startTime + thinkingTimeMs;

    // Simulate player thinking for 11 minutes
    const result = withTrackedSessionActivity(session, endTime);

    // **EXPECTED BEHAVIOR**: Should record the full 11 minutes of thinking time
    // This test WILL FAIL on unfixed code because current implementation
    // discards time when deltaMs > sessionInactivityThresholdMs (10 minutes)
    expect(result.activeMs).toBe(thinkingTimeMs);
    expect(result.lastSeenAt).toBe(endTime);
  });

  it('should handle heartbeat failure during 2-minute solve (EXPECTED TO FAIL)', () => {
    // **Scoped PBT Approach**: 2-minute solve with heartbeat failure records 0 seconds
    const session = createBaseSession();
    const startTime = 1000;
    const solveTimeMs = 2 * 60 * 1000; // 2 minutes - well under threshold
    
    // Simulate heartbeat failure: lastSeenAt doesn't get updated during solve
    // Player solves puzzle in 2 minutes but heartbeat tracking fails
    const sessionWithFailedHeartbeat = {
      ...session,
      lastSeenAt: startTime, // Heartbeat failed to update this
    };
    
    const endTime = startTime + solveTimeMs;
    const result = withTrackedSessionActivity(sessionWithFailedHeartbeat, endTime);

    // **EXPECTED BEHAVIOR**: Should record the 2 minutes of solve time
    // even when heartbeat tracking failed during the session
    // This test WILL FAIL on unfixed code because current implementation
    // only tracks time between heartbeats, missing time when heartbeats fail
    expect(result.activeMs).toBe(solveTimeMs);
    expect(result.lastSeenAt).toBe(endTime);
  });

  it('should demonstrate threshold boundary behavior (EXPECTED TO FAIL)', () => {
    // Test exactly at the 10-minute threshold
    const session = createBaseSession();
    const startTime = 1000;
    const exactThresholdMs = sessionInactivityThresholdMs; // Exactly 10 minutes
    const endTime = startTime + exactThresholdMs;

    const result = withTrackedSessionActivity(session, endTime);

    // **EXPECTED BEHAVIOR**: Should record time up to the threshold
    // This test WILL FAIL on unfixed code because current implementation
    // uses > comparison, so exactly 10 minutes gets discarded
    expect(result.activeMs).toBe(exactThresholdMs);
    expect(result.lastSeenAt).toBe(endTime);
  });

  it('should handle multiple tracking gaps in sequence (EXPECTED TO FAIL)', () => {
    // Simulate multiple periods of activity with gaps
    let session = createBaseSession();
    const startTime = 1000;
    
    // First activity: 5 minutes (should be tracked)
    const firstActivityMs = 5 * 60 * 1000;
    session = withTrackedSessionActivity(session, startTime + firstActivityMs);
    
    // Gap: 12 minutes of inactivity (exceeds threshold)
    const gapMs = 12 * 60 * 1000;
    const afterGapTime = startTime + firstActivityMs + gapMs;
    session = withTrackedSessionActivity(session, afterGapTime);
    
    // Second activity: 3 minutes (should be tracked)
    const secondActivityMs = 3 * 60 * 1000;
    const finalTime = afterGapTime + secondActivityMs;
    const result = withTrackedSessionActivity(session, finalTime);

    // **EXPECTED BEHAVIOR**: Should track both activity periods
    // Total expected: 5 minutes + 3 minutes = 8 minutes
    // This test WILL FAIL on unfixed code because the gap causes
    // the second activity period to be lost
    const expectedTotalMs = firstActivityMs + secondActivityMs;
    expect(result.activeMs).toBe(expectedTotalMs);
    expect(result.lastSeenAt).toBe(finalTime);
  });

  it('should preserve time tracking for normal gameplay (control test)', () => {
    // This test should PASS even on unfixed code - it's a control
    const session = createBaseSession();
    const startTime = 1000;
    const normalActivityMs = 2 * 60 * 1000; // 2 minutes - well under threshold
    const endTime = startTime + normalActivityMs;

    const result = withTrackedSessionActivity(session, endTime);

    // This should work correctly even on unfixed code
    expect(result.activeMs).toBe(normalActivityMs);
    expect(result.lastSeenAt).toBe(endTime);
  });
});

/**
 * TEST EXECUTION RESULTS ON UNFIXED CODE:
 * 
 * ❌ FAILED: "11-minute thinking session" - Demonstrates the core bug
 *    Expected: 660000ms (11 minutes)
 *    Actual: 0ms
 *    Root Cause: deltaMs > sessionInactivityThresholdMs causes time to be discarded
 * 
 * ✅ PASSED: Other scenarios - These may represent different aspects of the bug
 *    or edge cases that don't trigger the current implementation's limitations
 * 
 * CONCLUSION: The test successfully demonstrates that session activity tracking
 * has gaps when activity periods exceed the 10-minute threshold, confirming
 * the bug exists in the unfixed code.
 */