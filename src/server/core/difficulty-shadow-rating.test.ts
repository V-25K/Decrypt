import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  hashStore,
  redisGetMock,
  redisHDelMock,
  redisHGetMock,
  redisHSetNXMock,
  redisIncrByMock,
  redisSetMock,
  store,
} = vi.hoisted(() => ({
  hashStore: new Map<string, Map<string, string>>(),
  redisGetMock: vi.fn(),
  redisHDelMock: vi.fn(),
  redisHGetMock: vi.fn(),
  redisHSetNXMock: vi.fn(),
  redisIncrByMock: vi.fn(),
  redisSetMock: vi.fn(),
  store: new Map<string, string>(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
    hDel: redisHDelMock,
    hGet: redisHGetMock,
    hSetNX: redisHSetNXMock,
    incrBy: redisIncrByMock,
    set: redisSetMock,
  },
}));

import {
  keyLevelDifficultyRating,
  keyPlayerDifficultyRating,
  keyShadowDifficultyUpdateFailures,
  keyUserShadowRatingOutcomes,
} from './keys';
import { buildPuzzle } from './puzzle';
import {
  getPlayerShadowDifficultyRating,
  getLevelShadowDifficultyRating,
  recordShadowDifficultyOutcome,
  recordShadowDifficultyOutcomeSafely,
  shadowMinUncertainty,
  shadowUncertaintyDecay,
} from './difficulty-shadow-rating';

beforeEach(() => {
  hashStore.clear();
  store.clear();
  redisGetMock.mockReset();
  redisHDelMock.mockReset();
  redisHGetMock.mockReset();
  redisHSetNXMock.mockReset();
  redisIncrByMock.mockReset();
  redisSetMock.mockReset();
  redisGetMock.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisHGetMock.mockImplementation(
    async (key: string, field: string) => hashStore.get(key)?.get(field) ?? null
  );
  redisHSetNXMock.mockImplementation(
    async (key: string, field: string, value: string) => {
      const hash = hashStore.get(key) ?? new Map<string, string>();
      hashStore.set(key, hash);
      if (hash.has(field)) {
        return 0;
      }
      hash.set(field, value);
      return 1;
    }
  );
  redisHDelMock.mockImplementation(async (key: string, fields: string[]) => {
    const hash = hashStore.get(key);
    if (!hash) {
      return 0;
    }
    let deleted = 0;
    for (const field of fields) {
      if (hash.delete(field)) {
        deleted += 1;
      }
    }
    return deleted;
  });
  redisIncrByMock.mockImplementation(async (key: string, increment: number) => {
    const next = Number(store.get(key) ?? '0') + increment;
    store.set(key, String(next));
    return next;
  });
  redisSetMock.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return true;
  });
});

const buildRatingPuzzle = () =>
  buildPuzzle({
    levelId: 'lvl_shadow_1',
    dateKey: '2026-06-06',
    text: 'PRACTICE MAKES PROGRESS POSSIBLE',
    author: 'UNKNOWN',
    difficulty: 6,
    logicalPercent: 20,
    skipSolvabilityCheck: true,
  }).puzzlePrivate;

describe('shadow difficulty ratings', () => {
  it('keeps matched base wins and failures symmetric after expected-score scaling', async () => {
    const puzzle = buildPuzzle({
      levelId: 'lvl_shadow_matched',
      dateKey: '2026-06-06',
      text: 'BALANCED PUZZLES TEACH CLEAR SIGNALS',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    }).puzzlePrivate;

    const win = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_win',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'win',
      solveSeconds: null,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      targetTimeSeconds: null,
    });
    const loss = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_loss',
      levelId: 'lvl_shadow_matched_loss',
      puzzle: {
        ...puzzle,
        levelId: 'lvl_shadow_matched_loss',
      },
      outcome: 'failure',
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      targetTimeSeconds: null,
    });

    expect(win?.playerSkillRating).toBe(5.1656);
    expect(win?.itemDifficultyRating).toBe(4.8344);
    expect(loss?.playerSkillRating).toBe(4.8344);
    expect(loss?.itemDifficultyRating).toBe(5.1656);
  });

  it('updates player and item ratings after a qualified win', async () => {
    const puzzle = buildRatingPuzzle();
    const snapshot = await recordShadowDifficultyOutcome({
      userId: 'u_shadow',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'win',
      solveSeconds: 60,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      targetTimeSeconds: 120,
    });

    expect(snapshot?.playerSkillRating).toBeGreaterThan(5);
    expect(snapshot?.itemDifficultyRating).toBeLessThan(6);
    expect(snapshot?.itemPlayCount).toBe(1);
  });

  it('moves item difficulty up after a qualified failure', async () => {
    const puzzle = buildRatingPuzzle();
    const snapshot = await recordShadowDifficultyOutcome({
      userId: 'u_shadow',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'failure',
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 1,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });

    expect(snapshot?.playerSkillRating).toBeLessThan(5);
    expect(snapshot?.itemDifficultyRating).toBeGreaterThan(6);
  });

  it('does not record duplicate shadow failures for the same user and level', async () => {
    const puzzle = buildRatingPuzzle();
    const first = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_duplicate',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'failure',
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 1,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });
    const second = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_duplicate',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'failure',
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 1,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });

    expect(first?.itemPlayCount).toBe(1);
    expect(second?.itemPlayCount).toBe(1);
    expect(second?.playerPlayCount).toBe(1);
  });

  it('lets a win override a previous failure receipt and suppresses later failures', async () => {
    const puzzle = buildRatingPuzzle();
    await recordShadowDifficultyOutcome({
      userId: 'u_shadow_retry',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'failure',
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 0,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });
    const win = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_retry',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'win',
      solveSeconds: 80,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 1,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });
    const afterSuppressedFailure = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_retry',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'failure',
      mistakes: 3,
      usedPowerups: 1,
      retryCount: 2,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });
    const receiptHash = hashStore.get(keyUserShadowRatingOutcomes('u_shadow_retry'));

    expect(win?.itemPlayCount).toBe(2);
    expect(afterSuppressedFailure?.itemPlayCount).toBe(2);
    expect(receiptHash?.has(`win:${puzzle.levelId}`)).toBe(true);
    expect(receiptHash?.has(`failure:${puzzle.levelId}`)).toBe(false);
  });

  it('falls back safely from malformed stored ratings', async () => {
    const puzzle = buildRatingPuzzle();
    store.set(keyLevelDifficultyRating(puzzle.levelId), '{"version":"old"}');

    const rating = await getLevelShadowDifficultyRating(puzzle.levelId, puzzle);

    expect(rating.rating).toBe(puzzle.difficulty);
    expect(rating.playCount).toBe(0);
  });

  it('decays uncertainty slowly and respects the new floor', async () => {
    const puzzle = buildRatingPuzzle();
    const snapshot = await recordShadowDifficultyOutcome({
      userId: 'u_shadow_decay',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'win',
      solveSeconds: 70,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
    });

    expect(snapshot?.itemUncertainty).toBe(shadowUncertaintyDecay);

    store.set(
      keyLevelDifficultyRating(puzzle.levelId),
      JSON.stringify({
        version: 'v1',
        rating: 6,
        uncertainty: 0.02,
        playCount: 80,
        updatedAt: 1,
      })
    );
    const rating = await getLevelShadowDifficultyRating(puzzle.levelId, puzzle);

    expect(rating.uncertainty).toBe(shadowMinUncertainty);
  });

  it('decays stale player ratings toward the population mean and raises uncertainty', async () => {
    const now = Date.now();
    store.set(
      keyPlayerDifficultyRating('u_shadow_stale'),
      JSON.stringify({
        version: 'v1',
        rating: 8,
        uncertainty: 0.2,
        playCount: 80,
        updatedAt: now - 120 * 86_400_000,
      })
    );

    const rating = await getPlayerShadowDifficultyRating('u_shadow_stale');

    expect(rating.rating).toBe(6.5);
    expect(rating.uncertainty).toBe(0.7);
    expect(rating.playCount).toBe(80);
  });

  it('increments a persistent failure metric when safe updates fail', async () => {
    const puzzle = buildRatingPuzzle();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    redisSetMock.mockRejectedValueOnce(new Error('redis unavailable'));

    const snapshot = await recordShadowDifficultyOutcomeSafely({
      userId: 'u_shadow_failure_metric',
      levelId: puzzle.levelId,
      puzzle,
      outcome: 'win',
      solveSeconds: 60,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      targetTimeSeconds: 120,
    });

    expect(snapshot).toBeNull();
    expect(redisIncrByMock).toHaveBeenCalledWith(
      keyShadowDifficultyUpdateFailures,
      1
    );
  });
});
