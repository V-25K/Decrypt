import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Inventory, PuzzlePrivate, SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  redisSetMock,
  redisHGetMock,
  redisHGetAllMock,
  redisHSetMock,
  redisExpireMock,
  redisGetMock,
  redisDelMock,
  getSessionStateMock,
  clearSessionStateMock,
  heartsRemainingMock,
  getPuzzlePrivateMock,
  getUserProfileMock,
  getInventoryMock,
  getDailyRetryCountMock,
  hasFailedLevelMock,
  markLevelCompletedMock,
  saveInventoryMock,
  saveUserProfileMock,
  puzzleIsCompleteMock,
  computeScoreMock,
  getUserRankSummaryMock,
  incrementAllTimeLogicMock,
  recordAllTimeLevelScoreMock,
  recordDailyScoreMock,
  recordLevelWinMock,
  recordQualifiedLevelWinMock,
  updateQuestProgressOnCompletionMock,
  saveShareCompletionReceiptMock,
  incrementUserEndlessCursorMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  redisSetMock: vi.fn(),
  redisHGetMock: vi.fn(),
  redisHGetAllMock: vi.fn(),
  redisHSetMock: vi.fn(),
  redisExpireMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisDelMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  clearSessionStateMock: vi.fn(),
  heartsRemainingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getDailyRetryCountMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  markLevelCompletedMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  puzzleIsCompleteMock: vi.fn(),
  computeScoreMock: vi.fn(),
  getUserRankSummaryMock: vi.fn(),
  incrementAllTimeLogicMock: vi.fn(),
  recordAllTimeLevelScoreMock: vi.fn(),
  recordDailyScoreMock: vi.fn(),
  recordLevelWinMock: vi.fn(),
  recordQualifiedLevelWinMock: vi.fn(),
  updateQuestProgressOnCompletionMock: vi.fn(),
  saveShareCompletionReceiptMock: vi.fn(),
  incrementUserEndlessCursorMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
  redis: {
    set: redisSetMock,
    hGet: redisHGetMock,
    hGetAll: redisHGetAllMock,
    hSet: redisHSetMock,
    expire: redisExpireMock,
    get: redisGetMock,
    del: redisDelMock,
  },
}));

vi.mock('./session', () => ({
  clearSessionState: clearSessionStateMock,
  createSessionState: vi.fn(),
  getSessionState: getSessionStateMock,
  heartsRemaining: heartsRemainingMock,
  saveSessionState: vi.fn(),
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublic: vi.fn(),
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getDailyRetryCount: getDailyRetryCountMock,
  getInventory: getInventoryMock,
  getUserProfile: getUserProfileMock,
  hasFailedLevel: hasFailedLevelMock,
  incrementDailyRetryCount: vi.fn(),
  markLevelCompleted: markLevelCompletedMock,
  markLevelFailed: vi.fn(),
  registerKnownUser: vi.fn(),
  saveInventory: saveInventoryMock,
  saveUserProfile: saveUserProfileMock,
  incrementUserEndlessCursor: incrementUserEndlessCursorMock,
}));

vi.mock('./gameplay', () => ({
  applyHammer: vi.fn(),
  applyRocket: vi.fn(),
  applyWand: vi.fn(),
  checkPadlockStatus: vi.fn(),
  getUnlockedWordIndices: vi.fn(),
  puzzleIsComplete: puzzleIsCompleteMock,
  revealFromGuess: vi.fn(),
  tileIsLocked: vi.fn(),
}));

vi.mock('./leaderboard', () => ({
  computeScore: computeScoreMock,
  getUserRankSummary: getUserRankSummaryMock,
  incrementAllTimeLogic: incrementAllTimeLogicMock,
  recordAllTimeLevelScore: recordAllTimeLevelScoreMock,
  recordDailyScore: recordDailyScoreMock,
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: vi.fn(),
  recordQualifiedLevelWin: recordQualifiedLevelWinMock,
  recordLevelPlay: vi.fn(),
  recordLevelWin: recordLevelWinMock,
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: vi.fn(),
  updateQuestProgressOnCompletion: updateQuestProgressOnCompletionMock,
  updateQuestProgressOnShare: vi.fn(),
}));

vi.mock('./share-receipts', () => ({
  saveShareCompletionReceipt: saveShareCompletionReceiptMock,
}));

vi.mock('./economy', () => ({
  consumePowerup: vi.fn(),
  purchasePowerup: vi.fn(),
}));

vi.mock('./hearts', () => ({
  canStartChallenge: vi.fn(),
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

vi.mock('./endless-catalog', () => ({
  getEndlessCatalogStatus: vi.fn(),
  getNextEndlessCatalogLevelId: vi.fn(),
}));

import { completeSessionForLevel } from './game-service';

const profileFixture = (): UserProfile => ({
  coins: 0,
  hearts: 3,
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
  audioEnabled: true,
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const inventoryFixture = (): Inventory => ({
  hammers: 0,
  rockets: 0,
  wands: 0,
  coinHeartsPurchasedToday: 0,
});

const sessionFixture = (): SessionState => ({
  levelId: 'test-level',
  mode: 'daily',
  startTimestamp: Date.now() - 30000, // 30 seconds ago
  lastActivityTimestamp: Date.now() - 1000, // 1 second ago
  activeMs: 29000, // 29 seconds active
  revealedIndices: [0, 1, 2, 3, 4], // All tiles revealed (complete puzzle)
  mistakesMade: 0,
  usedPowerups: 0,
  guessCount: 5,
  heartbeatCount: 30,
});

const puzzleFixture = (): PuzzlePrivate => ({
  id: 'test-level',
  dateKey: '2024-01-01',
  words: ['HELLO'],
  tiles: [
    { index: 0, char: 'H', isLetter: true },
    { index: 1, char: 'E', isLetter: true },
    { index: 2, char: 'L', isLetter: true },
    { index: 3, char: 'L', isLetter: true },
    { index: 4, char: 'O', isLetter: true },
  ],
  isLogical: false,
});

/**
 * Completion Race Condition Exploration Test
 * 
 * **Validates: Requirements 2.1**
 * 
 * Property 1: Bug Condition - Completion Lock Race Condition
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate simultaneous completion requests can both pass validation
 * 
 * Scoped PBT Approach: Scope the property to concrete failing case: two simultaneous requests for same puzzle completion
 * Test that when two requests call `completeSessionForLevel` simultaneously, both can pass `puzzleIsComplete()` check before lock acquisition
 * Simulate race condition by introducing artificial delay between validation and lock acquisition
 * Run test on UNFIXED code
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the race condition exists)
 * Document counterexamples found: "Both requests pass validation, first gets lock and rewards, second fails lock but already validated"
 */

describe('Completion Race Condition Bug Condition - Exploration Test', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const setupMocksForSuccessfulCompletion = () => {
    // Setup basic mocks for successful completion
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getDailyRetryCountMock.mockResolvedValue(0);
    hasFailedLevelMock.mockResolvedValue(false);
    computeScoreMock.mockReturnValue(120);
    getUserRankSummaryMock.mockResolvedValue({ currentRank: 1 });
    
    // Mock puzzle completion validation to return true
    puzzleIsCompleteMock.mockReturnValue(true);
    
    // Mock Redis operations
    redisHGetAllMock.mockResolvedValue({}); // Empty journal initially
    redisHGetMock.mockResolvedValue(null); // No prior completion
    redisHSetMock.mockResolvedValue(1);
    redisExpireMock.mockResolvedValue(1);
    redisGetMock.mockResolvedValue(null); // For lock token check
    redisDelMock.mockResolvedValue(1);
    
    // Mock all the completion steps
    markLevelCompletedMock.mockResolvedValue(undefined);
    saveInventoryMock.mockResolvedValue(undefined);
    saveUserProfileMock.mockResolvedValue(undefined);
    recordDailyScoreMock.mockResolvedValue(undefined);
    recordLevelWinMock.mockResolvedValue(undefined);
    recordQualifiedLevelWinMock.mockResolvedValue(undefined);
    updateQuestProgressOnCompletionMock.mockResolvedValue(undefined);
    saveShareCompletionReceiptMock.mockResolvedValue(undefined);
    clearSessionStateMock.mockResolvedValue(undefined);
  };

  it('should demonstrate race condition - both requests pass validation before lock acquisition (EXPECTED TO FAIL on unfixed code)', async () => {
    setupMocksForSuccessfulCompletion();
    
    // Track the sequence of operations to detect race condition
    const operationSequence: string[] = [];
    let lockAcquisitionCount = 0;
    
    // Mock puzzleIsComplete to track when validation happens
    puzzleIsCompleteMock.mockImplementation(() => {
      operationSequence.push('validation_passed');
      return true;
    });
    
    // Mock Redis set (lock acquisition) to track when locks are acquired
    // First request gets the lock, second request fails to get lock
    redisSetMock.mockImplementation(async (key, value, options) => {
      operationSequence.push(`lock_attempt_${++lockAcquisitionCount}`);
      
      // Simulate race condition: first request gets lock, second fails
      if (lockAcquisitionCount === 1) {
        operationSequence.push('lock_acquired_request_1');
        return 'OK'; // First request succeeds
      } else {
        operationSequence.push('lock_failed_request_2');
        return null; // Second request fails
      }
    });
    
    // Simulate two simultaneous completion requests
    const request1Promise = completeSessionForLevel({
      levelId: 'test-level',
      mode: 'daily'
    });
    
    const request2Promise = completeSessionForLevel({
      levelId: 'test-level', 
      mode: 'daily'
    });
    
    // Wait for both requests to complete
    const [result1, result2] = await Promise.all([request1Promise, request2Promise]);
    
    console.log('Operation sequence:', operationSequence);
    console.log('Request 1 result:', { accepted: result1.accepted, rewardCoins: result1.rewardCoins });
    console.log('Request 2 result:', { accepted: result2.accepted, rewardCoins: result2.rewardCoins });
    
    // Analyze the race condition
    const validationCount = operationSequence.filter(op => op === 'validation_passed').length;
    const lockAttemptCount = operationSequence.filter(op => op.startsWith('lock_attempt')).length;
    
    console.log(`Validation calls: ${validationCount}`);
    console.log(`Lock attempts: ${lockAttemptCount}`);
    
    // CRITICAL ASSERTION: This test MUST FAIL on unfixed code
    // The bug allows both requests to pass validation before lock acquisition
    // Expected counterexample: Both requests validate completion, but only one should succeed
    
    // In the UNFIXED code, both requests pass validation (validationCount = 2)
    // But only one gets the lock and rewards
    // This creates the race condition where duplicate validation occurs
    
    // This assertion encodes the EXPECTED behavior after fix:
    // Only ONE request should pass validation (after lock acquisition)
    expect(validationCount).toBe(1); // FAILS on unfixed code (shows 2), PASSES after fix
    
    // Additional assertions to document the race condition
    expect(lockAttemptCount).toBe(2); // Both requests attempt to get lock
    expect(result1.accepted || result2.accepted).toBe(true); // One request succeeds
    expect(result1.accepted && result2.accepted).toBe(false); // But not both
    
    // Document the counterexample found
    if (validationCount > 1) {
      console.log('COUNTEREXAMPLE FOUND: Both requests passed validation before lock acquisition');
      console.log('This demonstrates the completion race condition bug');
      console.log('Expected: Only 1 validation after lock acquisition');
      console.log(`Actual: ${validationCount} validations before lock acquisition`);
    }
  });

  it('should demonstrate validation-before-lock timing window (EXPECTED TO FAIL on unfixed code)', async () => {
    setupMocksForSuccessfulCompletion();
    
    // Track timing of validation vs lock acquisition
    const timingLog: Array<{ operation: string; timestamp: number }> = [];
    let timingLockCounter = 0;
    
    puzzleIsCompleteMock.mockImplementation(() => {
      timingLog.push({ operation: 'validation', timestamp: Date.now() });
      return true;
    });
    
    redisSetMock.mockImplementation(async (key, value, options) => {
      timingLog.push({ operation: 'lock_attempt', timestamp: Date.now() });
      // First request gets lock
      return timingLockCounter++ === 0 ? 'OK' : null;
    });
    
    // Execute simultaneous requests
    const [result1, result2] = await Promise.all([
      completeSessionForLevel({ levelId: 'test-level', mode: 'daily' }),
      completeSessionForLevel({ levelId: 'test-level', mode: 'daily' })
    ]);
    
    // Analyze timing sequence
    console.log('Timing sequence:');
    timingLog.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.operation} at ${entry.timestamp}`);
    });
    
    // Find validation and lock attempt pairs
    const validations = timingLog.filter(entry => entry.operation === 'validation');
    const lockAttempts = timingLog.filter(entry => entry.operation === 'lock_attempt');
    
    console.log(`Total validations: ${validations.length}`);
    console.log(`Total lock attempts: ${lockAttempts.length}`);
    
    // CRITICAL ASSERTION: This demonstrates the timing window vulnerability
    // In unfixed code, validations happen BEFORE lock attempts
    // This creates a race condition window where both can validate simultaneously
    
    // Expected behavior after fix: validation should happen AFTER lock acquisition
    // So we should see: lock_attempt, validation, lock_attempt, validation (if second fails)
    // Or just: lock_attempt, validation (if second request is blocked)
    
    const firstValidationTime = validations[0]?.timestamp || 0;
    const firstLockTime = lockAttempts[0]?.timestamp || 0;
    
    // This assertion FAILS on unfixed code (validation before lock)
    // PASSES after fix (lock before validation)
    expect(firstLockTime).toBeLessThanOrEqual(firstValidationTime); // FAILS on unfixed code
    
    // Document the timing vulnerability
    if (firstValidationTime < firstLockTime) {
      console.log('COUNTEREXAMPLE FOUND: Validation happens before lock acquisition');
      console.log(`Validation at: ${firstValidationTime}`);
      console.log(`Lock attempt at: ${firstLockTime}`);
      console.log('This creates a race condition timing window');
    }
  });

  it('should demonstrate duplicate reward potential in race condition (EXPECTED TO FAIL on unfixed code)', async () => {
    setupMocksForSuccessfulCompletion();
    
    // Track reward distribution
    const rewardLog: Array<{ request: string; coins: number; accepted: boolean }> = [];
    let rewardLockCounter = 0;
    
    // Mock lock acquisition for reward tracking
    redisSetMock.mockImplementation(async (key, value, options) => {
      // First request gets lock
      return rewardLockCounter++ === 0 ? 'OK' : null;
    });
    
    // Execute requests and track results
    const request1 = completeSessionForLevel({ levelId: 'test-level', mode: 'daily' })
      .then(result => {
        rewardLog.push({ 
          request: 'request_1', 
          coins: result.rewardCoins, 
          accepted: result.accepted 
        });
        return result;
      });
    
    const request2 = completeSessionForLevel({ levelId: 'test-level', mode: 'daily' })
      .then(result => {
        rewardLog.push({ 
          request: 'request_2', 
          coins: result.rewardCoins, 
          accepted: result.accepted 
        });
        return result;
      });
    
    await Promise.all([request1, request2]);
    
    console.log('Reward distribution:');
    rewardLog.forEach(entry => {
      console.log(`${entry.request}: ${entry.coins} coins, accepted: ${entry.accepted}`);
    });
    
    // Analyze reward distribution
    const totalRewardsDistributed = rewardLog.reduce((sum, entry) => 
      entry.accepted ? sum + entry.coins : sum, 0
    );
    const acceptedRequests = rewardLog.filter(entry => entry.accepted).length;
    
    console.log(`Total rewards distributed: ${totalRewardsDistributed} coins`);
    console.log(`Accepted requests: ${acceptedRequests}`);
    
    // CRITICAL ASSERTION: Only ONE request should be accepted and receive rewards
    // In unfixed code, both might pass validation, creating potential for duplicate rewards
    
    expect(acceptedRequests).toBe(1); // FAILS if both requests are accepted
    expect(totalRewardsDistributed).toBeLessThanOrEqual(50); // Max reward for one completion
    
    // Document potential duplicate reward scenario
    if (acceptedRequests > 1) {
      console.log('COUNTEREXAMPLE FOUND: Multiple requests accepted simultaneously');
      console.log('This could lead to duplicate reward distribution');
      console.log(`Expected: 1 accepted request, Actual: ${acceptedRequests} accepted requests`);
    }
  });
});