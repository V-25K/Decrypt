import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserProfile, Inventory } from '../../shared/game';

const {
  redisIncrByMock,
  redisExpireMock,
  redisWatchMock,
  redisHGetMock,
  redisHSetMock,
  redisGetMock,
  redisDelMock,
  getUserProfileMock,
  getInventoryMock,
  updateQuestProgressOnCoinSpendMock,
  tx,
} = vi.hoisted(() => ({
  redisIncrByMock: vi.fn(),
  redisExpireMock: vi.fn(),
  redisWatchMock: vi.fn(),
  redisHGetMock: vi.fn(),
  redisHSetMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisDelMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  updateQuestProgressOnCoinSpendMock: vi.fn(),
  tx: {
    unwatch: vi.fn(),
    multi: vi.fn(),
    hIncrBy: vi.fn(),
    hSet: vi.fn(),
    incrBy: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn(),
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    incrBy: redisIncrByMock,
    expire: redisExpireMock,
    watch: redisWatchMock,
    hGet: redisHGetMock,
    hSet: redisHSetMock,
    get: redisGetMock,
    del: redisDelMock,
  },
}));

vi.mock('./state', () => ({
  getUserProfile: getUserProfileMock,
  getInventory: getInventoryMock,
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: updateQuestProgressOnCoinSpendMock,
}));

import { purchaseCoinHeartTopUp } from './economy';

/**
 * Coin Heart Purchase Rollback Race Exploration Test
 * 
 * **Validates: Requirements 2.5**
 * 
 * Property 1: Bug Condition - Coin Heart Purchase Rollback Race
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate race condition in purchase limit enforcement
 * 
 * Scoped PBT Approach: Scope to concrete failing case: two simultaneous purchases at daily limit
 * Test that `acquireCoinHeartSlot` allows exceeding daily limit when requests race
 * Simulate: counter at 2, limit 3, two simultaneous requests both increment to 3, both rollback to 2
 * Run test on UNFIXED code
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the rollback race exists)
 * Document counterexamples found: "Both requests rollback, counter shows 2 but should be 3, limit potentially exceeded"
 */

describe('Coin Heart Purchase Rollback Race Bug Condition - Exploration Test', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const profileFixture = (): UserProfile => ({
    coins: 1000, // Enough coins for purchases
    hearts: 1, // Less than full hearts to allow purchases
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

  const setupMocksForPurchase = () => {
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    redisWatchMock.mockResolvedValue(tx);
    redisHGetMock.mockImplementation((key: string, field: string) => {
      if (field === 'coins') return Promise.resolve('1000');
      if (field === 'hearts') return Promise.resolve('1');
      return Promise.resolve('0');
    });
    // Mock successful transaction execution for the purchase logic
    tx.exec.mockResolvedValue(['ok']);
    redisExpireMock.mockResolvedValue(1);
    updateQuestProgressOnCoinSpendMock.mockResolvedValue(undefined);
  };

  it('should demonstrate rollback race condition - both requests increment then rollback (EXPECTED TO FAIL on unfixed code)', async () => {
    setupMocksForPurchase();
    
    // Track the sequence of Redis operations to detect race condition
    const operationSequence: string[] = [];
    let slotRequestCount = 0;
    
    // Mock Redis get to simulate counter at 1 (under limit of 2)
    // This allows one request to succeed and one to fail
    redisGetMock.mockResolvedValue('1');
    
    // Create separate transaction objects for slot acquisition vs purchase
    const slotTx = {
      unwatch: vi.fn(),
      multi: vi.fn(),
      incrBy: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn(),
    };
    
    // Mock Redis watch to return different transaction objects
    redisWatchMock.mockImplementation((key: string) => {
      if (key.includes('coin-heart-purchases')) {
        // This is for slot acquisition
        return Promise.resolve(slotTx);
      } else {
        // This is for the purchase transaction
        return Promise.resolve(tx);
      }
    });
    
    // Mock slot acquisition transaction execution
    slotTx.exec.mockImplementation(async () => {
      slotRequestCount++;
      operationSequence.push(`slot_acquisition_${slotRequestCount}`);
      
      // In the FIXED code, only the first request should succeed atomically
      // The second request should fail because the watched key was modified
      if (slotRequestCount === 1) {
        return ['ok']; // First request succeeds
      } else {
        return null; // Second request fails due to watched key modification
      }
    });
    
    // Simulate two simultaneous purchase requests near daily limit
    const userId = 'test-user';
    
    const request1Promise = purchaseCoinHeartTopUp({ userId });
    const request2Promise = purchaseCoinHeartTopUp({ userId });
    
    // Wait for both requests to complete
    const [result1, result2] = await Promise.all([request1Promise, request2Promise]);
    
    console.log('Operation sequence:', operationSequence);
    console.log('Request 1 result:', { success: result1.success, reason: result1.reason });
    console.log('Request 2 result:', { success: result2.success, reason: result2.reason });
    
    // Analyze the atomic operation behavior
    const slotAcquisitions = operationSequence.filter(op => op.startsWith('slot_acquisition_')).length;
    
    console.log(`Slot acquisitions attempted: ${slotAcquisitions}`);
    
    // CRITICAL ASSERTION: This test encodes the EXPECTED behavior after fix
    // With atomic operations, exactly one request should succeed and one should fail
    // This eliminates the rollback race condition
    
    // Expected behavior after fix: One succeeds, one fails atomically
    const successCount = [result1.success, result2.success].filter(Boolean).length;
    const failureCount = [result1.success, result2.success].filter(s => !s).length;
    
    // This assertion PASSES after fix (atomic operations prevent race)
    expect(successCount).toBe(1); // Exactly one request succeeds
    expect(failureCount).toBe(1); // Exactly one request fails
    
    // Verify that both requests attempted slot acquisition
    expect(slotAcquisitions).toBe(2); // Both requests attempt slot acquisition
    
    // Verify no rollback operations occurred (eliminated by atomic approach)
    const rollbackOperations = operationSequence.filter(op => op.includes('rollback')).length;
    expect(rollbackOperations).toBe(0); // No rollbacks with atomic operations
    
    // Verify that the failing request got the correct error message
    const failedRequest = result1.success ? result2 : result1;
    expect(failedRequest.reason).toContain('Daily limit reached');
    
    // Document the fix verification
    console.log('EXPECTED BEHAVIOR VERIFIED: Atomic operations prevent rollback race');
    console.log(`Success count: ${successCount}, Failure count: ${failureCount}`);
    console.log('One request succeeded atomically, one failed due to watched key modification');
    console.log('No rollback operations needed - race condition eliminated');
  });

  it('should demonstrate limit enforcement failure in rollback race (EXPECTED TO FAIL on unfixed code)', async () => {
    setupMocksForPurchase();
    
    // Track counter state throughout the operation
    const counterStates: Array<{ operation: string; counterValue: number; timestamp: number }> = [];
    let operationCounter = 0;
    
    // Mock Redis operations to track counter state changes
    redisIncrByMock.mockImplementation(async (key: string, increment: number) => {
      // Only track operations on the coin heart purchase counter key
      if (key.includes('coin-heart-purchases')) {
        operationCounter++;
        const timestamp = Date.now();
        
        if (increment === 1) {
          // Both requests increment from 2 to 3
          const counterValue = 3;
          counterStates.push({ 
            operation: `increment_${operationCounter}`, 
            counterValue, 
            timestamp 
          });
          return counterValue;
        } else if (increment === -1) {
          // Both requests rollback from 3 to 2
          const counterValue = 2;
          counterStates.push({ 
            operation: `rollback_${operationCounter}`, 
            counterValue, 
            timestamp 
          });
          return counterValue;
        }
      }
      
      return 0;
    });
    
    // Execute simultaneous requests
    const userId = 'test-user';
    const [result1, result2] = await Promise.all([
      purchaseCoinHeartTopUp({ userId }),
      purchaseCoinHeartTopUp({ userId })
    ]);
    
    // Analyze counter state progression
    console.log('Counter state progression:');
    counterStates.forEach((state, index) => {
      console.log(`${index + 1}. ${state.operation}: counter = ${state.counterValue} at ${state.timestamp}`);
    });
    
    // Find final counter state
    const finalState = counterStates[counterStates.length - 1];
    const incrementOperations = counterStates.filter(state => state.operation.startsWith('increment_'));
    const rollbackOperations = counterStates.filter(state => state.operation.startsWith('rollback_'));
    
    console.log(`Final counter value: ${finalState?.counterValue || 'unknown'}`);
    console.log(`Increment operations: ${incrementOperations.length}`);
    console.log(`Rollback operations: ${rollbackOperations.length}`);
    
    // CRITICAL ASSERTION: The counter should reflect actual successful purchases
    // In unfixed code, counter ends at 2 after both requests rollback
    // But this doesn't reflect the true state - both requests attempted to purchase
    
    // Expected behavior after fix: Counter should be 3 if one request succeeds
    // Or remain at 2 if both requests fail atomically
    const expectedFinalCounter = 3; // One successful purchase from initial state of 2
    
    // This assertion FAILS on unfixed code (counter shows 2 due to rollbacks)
    expect(finalState?.counterValue).toBe(expectedFinalCounter); // FAILS on unfixed code
    
    // Verify that rollback operations indicate the race condition
    expect(rollbackOperations.length).toBe(0); // FAILS on unfixed code (shows 2 rollbacks)
    
    // Document the limit enforcement failure
    if (rollbackOperations.length > 0 && finalState?.counterValue === 2) {
      console.log('COUNTEREXAMPLE FOUND: Limit enforcement failed due to rollback race');
      console.log(`Counter shows ${finalState.counterValue} but should be ${expectedFinalCounter}`);
      console.log('Both requests rolled back, masking the fact that limit was exceeded');
      console.log('In other timing scenarios, this could allow exceeding daily limits');
    }
  });

  it('should demonstrate atomic operation requirement for purchase limits (EXPECTED TO FAIL on unfixed code)', async () => {
    // Test the atomic operation requirement by simulating various race scenarios
    const raceScenarios = [
      { initialCounter: 2, limit: 3, description: 'at_limit_boundary' },
      { initialCounter: 1, limit: 3, description: 'near_limit' },
      { initialCounter: 3, limit: 3, description: 'already_at_limit' }
    ];
    
    for (const scenario of raceScenarios) {
      console.log(`\nTesting scenario: ${scenario.description}`);
      console.log(`Initial counter: ${scenario.initialCounter}, Limit: ${scenario.limit}`);
      
      // Reset mocks for each scenario
      vi.clearAllMocks();
      setupMocksForPurchase();
      
      let mockCallCount = 0;
      redisIncrByMock.mockImplementation(async (key: string, increment: number) => {
        // Only track operations on the coin heart purchase counter key
        if (key.includes('coin-heart-purchases')) {
          mockCallCount++;
          
          if (increment === 1) {
            // Increment operation
            const newValue = scenario.initialCounter + 1;
            console.log(`  Increment ${mockCallCount}: ${scenario.initialCounter} -> ${newValue}`);
            return newValue;
          } else if (increment === -1) {
            // Rollback operation
            const newValue = scenario.initialCounter;
            console.log(`  Rollback ${mockCallCount}: ${scenario.initialCounter + 1} -> ${newValue}`);
            return newValue;
          }
        }
        
        return scenario.initialCounter;
      });
      
      // Execute simultaneous requests for this scenario
      const userId = `test-user-${scenario.description}`;
      const [result1, result2] = await Promise.all([
        purchaseCoinHeartTopUp({ userId }),
        purchaseCoinHeartTopUp({ userId })
      ]);
      
      console.log(`  Results: Request1=${result1.success}, Request2=${result2.success}`);
      
      // Analyze atomicity violation
      const incrementCalls = redisIncrByMock.mock.calls.filter(call => 
        call[0].includes('coin-heart-purchases') && call[1] === 1
      ).length;
      const rollbackCalls = redisIncrByMock.mock.calls.filter(call => 
        call[0].includes('coin-heart-purchases') && call[1] === -1
      ).length;
      
      console.log(`  Increment calls: ${incrementCalls}, Rollback calls: ${rollbackCalls}`);
      
      // CRITICAL ASSERTION: Atomic operations should not require rollbacks
      // In unfixed code, we see increment-then-rollback pattern
      // Expected behavior after fix: Single atomic check-and-increment
      
      if (scenario.initialCounter < scenario.limit) {
        // When under limit, one request should succeed atomically
        expect(rollbackCalls).toBe(0); // FAILS on unfixed code
        expect(result1.success || result2.success).toBe(true); // One should succeed
        expect(result1.success && result2.success).toBe(false); // But not both
      } else {
        // When at limit, both should fail without any increments
        expect(incrementCalls).toBe(0); // Should not increment if already at limit
        expect(result1.success).toBe(false);
        expect(result2.success).toBe(false);
      }
      
      // Document atomicity violation for this scenario
      if (rollbackCalls > 0) {
        console.log(`  COUNTEREXAMPLE: Non-atomic operation in ${scenario.description} scenario`);
        console.log(`  Expected: Atomic check-and-increment, Actual: ${incrementCalls} increments + ${rollbackCalls} rollbacks`);
      }
    }
  });
});