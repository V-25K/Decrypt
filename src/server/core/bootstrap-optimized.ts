/**
 * Optimized Bootstrap System using Redis Batching
 * 
 * Reduces the number of Redis round-trips from 4+ to 1-2 for better performance
 */

import { context } from '@devvit/web/server';
import { RedisBatch, BatchUtils } from './redis-batch';
import { PerformanceMonitor } from './performance-monitor';
import { 
  defaultUserProfile, 
  defaultInventory,
  saveUserProfile,
  saveInventory,
  registerKnownUser
} from './state';
import { formatDateKey } from './serde';
import { getEndlessCatalogStatus } from './endless-catalog';
import { normalizeHearts } from './hearts';
import { userProfileSchema, inventorySchema } from '../../shared/game';
import type { UserProfile, Inventory } from '../../shared/game';

/**
 * Assert that user is logged in and return userId
 */
const assertUserId = (): string => {
  const userId = context.userId;
  if (!userId) {
    throw new Error('User must be logged in.');
  }
  return userId;
};

/**
 * Helper functions for parsing Redis hash data
 */
const numberFromHash = (
  hash: Record<string, string>,
  field: string,
  defaultValue: number
): number => {
  const raw = hash[field];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const stringFromHash = (
  hash: Record<string, string>,
  field: string,
  defaultValue: string
): string => {
  return hash[field] || defaultValue;
};

const stringArrayFromHash = (
  hash: Record<string, string>,
  field: string
): string[] => {
  const raw = hash[field];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Normalize unlocked flairs to remove duplicates and invalid entries
 */
const normalizeUnlockedFlairs = (profile: UserProfile): UserProfile => {
  const nextUnlockedFlairs = Array.from(
    new Set(
      profile.unlockedFlairs.filter(
        (flair) => typeof flair === 'string' && flair.length > 0
      )
    )
  );
  
  const nextActiveFlair =
    nextUnlockedFlairs.includes(profile.activeFlair) ? profile.activeFlair : '';
  
  return {
    ...profile,
    unlockedFlairs: nextUnlockedFlairs,
    activeFlair: nextActiveFlair,
  };
};

/**
 * Optimized bootstrap function using batched Redis operations
 */
export const bootstrapGameOptimized = async () => {
  const startTime = performance.now();
  const userId = assertUserId();
  await registerKnownUser(userId);

  // Create batch for all bootstrap data
  const batch = BatchUtils.createBootstrapBatch(userId);
  
  // Execute all Redis operations in parallel
  const results = await BatchUtils.executeWithRetry(batch);

  // Process results with fallbacks
  const [profile, inventory, dailyPointer] = await Promise.all([
    processProfileResult(userId, results),
    processInventoryResult(userId, results),
    processDailyPointerResult(results)
  ]);

  // Get endless catalog (this is a separate operation that can't be easily batched)
  const endlessCatalog = await getEndlessCatalogStatus();

  // Record performance metrics
  PerformanceMonitor.getInstance().recordMetric({
    operation: 'bootstrap-optimized',
    duration: performance.now() - startTime,
    timestamp: Date.now(),
    success: true,
    metadata: {
      userId
    }
  });

  return {
    userId,
    username: context.username ?? null,
    subredditName: context.subredditName ?? null,
    postId: context.postId ?? null,
    currentDailyLevelId: dailyPointer,
    todayDateKey: formatDateKey(new Date()),
    profile,
    inventory,
    endlessCatalog,
  };
};

/**
 * Process profile result from batch with fallback handling
 */
async function processProfileResult(
  userId: string, 
  results: Map<string, any>
): Promise<UserProfile> {
  const profileResult = results.get('profile');
  
  if (!profileResult?.success || !profileResult.result || Object.keys(profileResult.result).length === 0) {
    // Fallback to default profile creation
    const profile = defaultUserProfile();
    await saveUserProfile(userId, profile);
    return profile;
  }

  const hash = profileResult.result;
  const parsedResult = userProfileSchema.safeParse({
    coins: numberFromHash(hash, 'coins', 0),
    hearts: numberFromHash(hash, 'hearts', 3),
    lastHeartRefillTs: numberFromHash(hash, 'lastHeartRefillTs', Date.now()),
    infiniteHeartsExpiryTs: numberFromHash(hash, 'infiniteHeartsExpiryTs', 0),
    currentStreak: numberFromHash(hash, 'currentStreak', 0),
    dailyCurrentStreak: numberFromHash(hash, 'dailyCurrentStreak', 0),
    endlessCurrentStreak: numberFromHash(hash, 'endlessCurrentStreak', 0),
    lastPlayedDateKey: stringFromHash(hash, 'lastPlayedDateKey', ''),
    totalWordsSolved: numberFromHash(hash, 'totalWordsSolved', 0),
    logicTasksCompleted: numberFromHash(hash, 'logicTasksCompleted', 0),
    totalLevelsCompleted: numberFromHash(hash, 'totalLevelsCompleted', 0),
    flawlessWins: numberFromHash(hash, 'flawlessWins', 0),
    speedWins: numberFromHash(hash, 'speedWins', 0),
    dailyFlawlessWins: numberFromHash(hash, 'dailyFlawlessWins', 0),
    endlessFlawlessWins: numberFromHash(hash, 'endlessFlawlessWins', 0),
    dailySpeedWins: numberFromHash(hash, 'dailySpeedWins', 0),
    endlessSpeedWins: numberFromHash(hash, 'endlessSpeedWins', 0),
    dailyChallengesPlayed: numberFromHash(hash, 'dailyChallengesPlayed', 0),
    endlessChallengesPlayed: numberFromHash(hash, 'endlessChallengesPlayed', 0),
    dailyFirstTryWins: numberFromHash(hash, 'dailyFirstTryWins', 0),
    endlessFirstTryWins: numberFromHash(hash, 'endlessFirstTryWins', 0),
    questsCompleted: numberFromHash(hash, 'questsCompleted', 0),
    dailyModeClears: numberFromHash(hash, 'dailyModeClears', 0),
    endlessModeClears: numberFromHash(hash, 'endlessModeClears', 0),
    dailySolveTimeTotalSec: numberFromHash(hash, 'dailySolveTimeTotalSec', 0),
    endlessSolveTimeTotalSec: numberFromHash(hash, 'endlessSolveTimeTotalSec', 0),
    bestOverallRank: numberFromHash(hash, 'bestOverallRank', 0),
    audioEnabled: stringFromHash(hash, 'audioEnabled', '1') === '1',
    communityJoinRecorded: stringFromHash(hash, 'communityJoinRecorded', '0') === '1',
    communityJoinRewardClaimed: stringFromHash(hash, 'communityJoinRewardClaimed', '0') === '1',
    unlockedFlairs: stringArrayFromHash(hash, 'unlockedFlairs'),
    activeFlair: stringFromHash(hash, 'activeFlair', ''),
  });

  if (!parsedResult.success) {
    const fallback = defaultUserProfile();
    await saveUserProfile(userId, fallback);
    return fallback;
  }

  const parsed = parsedResult.data;
  const normalized = normalizeUnlockedFlairs(normalizeHearts(parsed));
  
  // Save if normalization changed anything
  if (
    JSON.stringify(normalized.unlockedFlairs) !== JSON.stringify(parsed.unlockedFlairs) ||
    normalized.activeFlair !== parsed.activeFlair ||
    normalized.hearts !== parsed.hearts ||
    normalized.lastHeartRefillTs !== parsed.lastHeartRefillTs
  ) {
    await saveUserProfile(userId, normalized);
  }
  
  return normalized;
}

/**
 * Process inventory result from batch with fallback handling
 */
async function processInventoryResult(
  userId: string, 
  results: Map<string, any>
): Promise<Inventory> {
  const inventoryResult = results.get('inventory');
  
  if (!inventoryResult?.success || !inventoryResult.result || Object.keys(inventoryResult.result).length === 0) {
    // Fallback to default inventory creation
    const inventory = defaultInventory();
    await saveInventory(userId, inventory);
    return inventory;
  }

  const hash = inventoryResult.result;
  const parsedResult = inventorySchema.safeParse({
    hammers: numberFromHash(hash, 'hammers', 0),
    rockets: numberFromHash(hash, 'rockets', 0),
    wands: numberFromHash(hash, 'wands', 0),
    coinHeartsPurchasedToday: numberFromHash(hash, 'coinHeartsPurchasedToday', 0),
  });

  if (!parsedResult.success) {
    const fallback = defaultInventory();
    await saveInventory(userId, fallback);
    return fallback;
  }

  return parsedResult.data;
}

/**
 * Process daily pointer result from batch
 */
async function processDailyPointerResult(results: Map<string, any>): Promise<string | null> {
  const pointerResult = results.get('dailyPointer');
  
  if (!pointerResult?.success) {
    return null;
  }

  return pointerResult.result || null;
}

/**
 * Performance comparison utility for bootstrap methods
 */
export class BootstrapPerformanceComparator {
  private monitor = PerformanceMonitor.getInstance();

  /**
   * Compare original vs optimized bootstrap performance
   */
  async compareBootstrapMethods(iterations: number = 10): Promise<{
    originalAvg: number;
    optimizedAvg: number;
    improvement: number;
    results: {
      original: any[];
      optimized: any[];
    };
  }> {
    const originalTimes: number[] = [];
    const optimizedTimes: number[] = [];
    const originalResults: any[] = [];
    const optimizedResults: any[] = [];

    // Import the original function
    const { bootstrapGame: originalBootstrap } = await import('./game-service');

    // Test original approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        const result = await originalBootstrap();
        const duration = performance.now() - start;
        originalTimes.push(duration);
        originalResults.push(result);
      } catch (error) {
        console.warn('Original bootstrap failed:', error);
        originalTimes.push(1000); // Penalty for failure
        originalResults.push(null);
      }
    }

    // Test optimized approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        const result = await bootstrapGameOptimized();
        const duration = performance.now() - start;
        optimizedTimes.push(duration);
        optimizedResults.push(result);
      } catch (error) {
        console.warn('Optimized bootstrap failed:', error);
        optimizedTimes.push(1000); // Penalty for failure
        optimizedResults.push(null);
      }
    }

    const originalAvg = originalTimes.reduce((a, b) => a + b, 0) / originalTimes.length;
    const optimizedAvg = optimizedTimes.reduce((a, b) => a + b, 0) / optimizedTimes.length;
    const improvement = (originalAvg - optimizedAvg) / originalAvg;

    // Record performance metrics
    this.monitor.recordMetric({
      operation: 'bootstrap-comparison',
      duration: optimizedAvg,
      timestamp: Date.now(),
      success: true,
      metadata: {
        originalAvg,
        optimizedAvg,
        improvement,
        iterations
      }
    });

    return {
      originalAvg,
      optimizedAvg,
      improvement,
      results: {
        original: originalResults,
        optimized: optimizedResults
      }
    };
  }

  /**
   * Validate that optimized bootstrap produces equivalent results
   */
  async validateEquivalence(iterations: number = 5): Promise<{
    equivalent: boolean;
    differences: string[];
    successRate: number;
  }> {
    const differences: string[] = [];
    let successfulComparisons = 0;

    const { bootstrapGame: originalBootstrap } = await import('./game-service');

    for (let i = 0; i < iterations; i++) {
      try {
        const [original, optimized] = await Promise.all([
          originalBootstrap(),
          bootstrapGameOptimized()
        ]);

        // Compare key fields (excluding timestamps which may differ slightly)
        const fieldsToCompare = [
          'userId', 'username', 'subredditName', 'postId', 
          'currentDailyLevelId', 'todayDateKey'
        ];

        for (const field of fieldsToCompare) {
          if (original[field] !== optimized[field]) {
            differences.push(`${field}: ${original[field]} !== ${optimized[field]}`);
          }
        }

        // Compare profile structure (excluding timestamps)
        if (original.profile && optimized.profile) {
          const profileFields = ['coins', 'hearts', 'currentStreak', 'totalLevelsCompleted'];
          for (const field of profileFields) {
            if (original.profile[field] !== optimized.profile[field]) {
              differences.push(`profile.${field}: ${original.profile[field]} !== ${optimized.profile[field]}`);
            }
          }
        }

        // Compare inventory
        if (original.inventory && optimized.inventory) {
          const inventoryFields = ['hammers', 'rockets', 'wands', 'coinHeartsPurchasedToday'];
          for (const field of inventoryFields) {
            if (original.inventory[field] !== optimized.inventory[field]) {
              differences.push(`inventory.${field}: ${original.inventory[field]} !== ${optimized.inventory[field]}`);
            }
          }
        }

        successfulComparisons++;
      } catch (error) {
        differences.push(`Comparison ${i} failed: ${error}`);
      }
    }

    return {
      equivalent: differences.length === 0,
      differences,
      successRate: successfulComparisons / iterations
    };
  }
}