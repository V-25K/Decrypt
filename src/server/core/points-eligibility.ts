import { redis } from '@devvit/web/server';
import { keyGlobalScorePointsCutoffMs } from './keys';
import { getOfficialDailyCreatedAtForSequence } from './generator';

/**
 * Global-leaderboard points only accrue from challenges created at/after the
 * launch of this daily number. Everything before it (the pre-migration backlog)
 * still moves rating but awards no points, so newcomers can't out-grind the
 * veterans who already cleared that backlog. See Bug 4 / keyGlobalScorePointsCutoffMs.
 */
export const globalScorePointsMinDailyNumber = 180;

// Stored when the cutoff can't be resolved yet (fewer than
// globalScorePointsMinDailyNumber official dailies exist). Cached briefly so we
// retry as the catalog grows; treated as "no cutoff" → fail open (count points).
const unresolvedCutoffSentinel = 'none';
const unresolvedCutoffCacheTtlMs = 24 * 60 * 60 * 1000;

const parseCutoff = (raw: string | null | undefined): number | null => {
  if (
    raw === null ||
    raw === undefined ||
    raw === '' ||
    raw === unresolvedCutoffSentinel
  ) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Resolves (and caches) the epoch-ms cutoff for global-points eligibility.
 * Returns null when not enough dailies exist yet (caller fails open). The
 * resolved instant is a historical constant, so it is cached permanently.
 */
export const resolveGlobalScorePointsCutoffMs = async (): Promise<number | null> => {
  const cached = await redis.get(keyGlobalScorePointsCutoffMs);
  if (cached === unresolvedCutoffSentinel) {
    return null;
  }
  const cachedCutoff = parseCutoff(cached);
  if (cachedCutoff !== null) {
    return cachedCutoff;
  }
  const createdAt = await getOfficialDailyCreatedAtForSequence(
    globalScorePointsMinDailyNumber
  );
  if (createdAt === null) {
    await redis.set(keyGlobalScorePointsCutoffMs, unresolvedCutoffSentinel, {
      expiration: new Date(Date.now() + unresolvedCutoffCacheTtlMs),
    });
    return null;
  }
  await redis.set(keyGlobalScorePointsCutoffMs, String(createdAt));
  return createdAt;
};

/**
 * True when a win on this puzzle should award global-leaderboard points. Fails
 * open (true) on a cold cache or any resolution error so points are never
 * silently dropped and completion is never blocked by leaderboard housekeeping.
 */
export const isPuzzleEligibleForGlobalPoints = async (puzzle: {
  createdAt: number;
}): Promise<boolean> => {
  try {
    const cutoff = await resolveGlobalScorePointsCutoffMs();
    if (cutoff === null) {
      return true;
    }
    return puzzle.createdAt >= cutoff;
  } catch (error) {
    console.warn(
      `[isPuzzleEligibleForGlobalPoints] failing open: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return true;
  }
};

/** Pre-warms the cutoff cache (app install/upgrade + daily scheduler). */
export const warmGlobalScorePointsCutoff = async (): Promise<void> => {
  try {
    await resolveGlobalScorePointsCutoffMs();
  } catch (error) {
    console.warn(
      `[warmGlobalScorePointsCutoff] failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
