import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock, redisSetMock, store } = vi.hoisted(() => ({
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  store: new Map<string, string>(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
  },
}));

import { keyLevelDifficultyRating } from './keys';
import { buildPuzzle } from './puzzle';
import {
  getLevelShadowDifficultyRating,
  recordShadowDifficultyOutcome,
  shadowMinUncertainty,
  shadowUncertaintyDecay,
} from './difficulty-shadow-rating';

beforeEach(() => {
  store.clear();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisGetMock.mockImplementation(async (key: string) => store.get(key) ?? null);
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
});
