import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32, shuffleWithRng } from './rng';
import type { ChallengeType } from '../../shared/game';

const {
  clearUsedSignatureMock,
  ensureAICandidatePoolSelectionMock,
  getBundledEndlessReservationOwnerMock,
  generatePuzzlePhraseMock,
  generatePuzzlePhraseBatchMock,
  getDecryptSettingsMock,
  computeGlobalDailyBiasMock,
  computeAdaptiveHardnessBoundsMock,
  clearStagedLevelIdMock,
  getNextLevelIdMock,
  peekNextLevelIdMock,
  getPuzzleMappingMock,
  getPuzzlePublishedPostIdMock,
  getStagedLevelIdMock,
  getPuzzlePrivateMock,
  getRecentUsedSignatureEntriesMock,
  deletePuzzleDataMock,
  getAutoDailyLevelIdsForDateMock,
  getPuzzlePublicationReceiptMock,
  reserveUsedSignatureMock,
  savePuzzleMock,
  setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostIdMock,
  setStagedLevelIdMock,
  setDailyPointerMock,
  transferUsedSignatureReservationMock,
  validatePuzzleMock,
  buildPuzzleMock,
  buildPublicPuzzleMock,
  runDummySolverMock,
  submitCustomPostMock,
  takeAICandidateBatchMock,
  getPostByIdMock,
  approveMock,
  redisDelMock,
  redisIncrByMock,
  redisGetMock,
  redisSetMock,
} = vi.hoisted(() => ({
  clearUsedSignatureMock: vi.fn(),
  ensureAICandidatePoolSelectionMock: vi.fn(),
  getBundledEndlessReservationOwnerMock: vi.fn(),
  generatePuzzlePhraseMock: vi.fn(),
  generatePuzzlePhraseBatchMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  computeGlobalDailyBiasMock: vi.fn(),
  computeAdaptiveHardnessBoundsMock: vi.fn(),
  clearStagedLevelIdMock: vi.fn(),
  getNextLevelIdMock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  getStagedLevelIdMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getRecentUsedSignatureEntriesMock: vi.fn(),
  deletePuzzleDataMock: vi.fn(),
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getPuzzlePublicationReceiptMock: vi.fn(),
  reserveUsedSignatureMock: vi.fn(),
  savePuzzleMock: vi.fn(),
  setPuzzlePublicationReceiptMock: vi.fn(),
  setPuzzlePublishedPostIdMock: vi.fn(),
  setStagedLevelIdMock: vi.fn(),
  setDailyPointerMock: vi.fn(),
  transferUsedSignatureReservationMock: vi.fn(),
  validatePuzzleMock: vi.fn(),
  buildPuzzleMock: vi.fn(),
  buildPublicPuzzleMock: vi.fn(),
  runDummySolverMock: vi.fn(),
  submitCustomPostMock: vi.fn(),
  takeAICandidateBatchMock: vi.fn(),
  getPostByIdMock: vi.fn(),
  approveMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisIncrByMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest', subredditId: 't5_test' },
  reddit: {
    submitCustomPost: submitCustomPostMock,
    getPostById: getPostByIdMock,
    approve: approveMock,
  },
  redis: {
    del: redisDelMock,
    incrBy: redisIncrByMock,
    get: redisGetMock,
    set: redisSetMock,
  },
}));

const challengeTypePool = vi.hoisted(
  (): ChallengeType[] => [
    'QUOTE',
    'LYRIC_LINE',
    'MOVIE_LINE',
    'ANIME_LINE',
    'SPEECH_LINE',
    'BOOK_LINE',
    'TV_LINE',
    'SAYING',
    'PROVERB',
  ]
);

vi.mock('./ai', () => ({
  aiChallengeTypePool: challengeTypePool,
  generatePuzzlePhrase: generatePuzzlePhraseMock,
  generatePuzzlePhraseBatch: generatePuzzlePhraseBatchMock,
}));

vi.mock('./config', () => ({
  getDecryptSettings: getDecryptSettingsMock,
}));

vi.mock('./puzzle', () => ({
  buildPuzzle: buildPuzzleMock,
  buildPublicPuzzle: buildPublicPuzzleMock,
}));

vi.mock('./dummy-solver', () => ({
  runDummySolver: runDummySolverMock,
}));

vi.mock('./difficulty-calibration', () => ({
  computeGlobalDailyBias: computeGlobalDailyBiasMock,
  computeAdaptiveHardnessBounds: computeAdaptiveHardnessBoundsMock,
}));

vi.mock('./ai-pool', () => ({
  ensureAICandidatePoolSelection: ensureAICandidatePoolSelectionMock,
  takeAICandidateBatch: takeAICandidateBatchMock,
}));

vi.mock('./endless-reservations', () => ({
  getBundledEndlessReservationOwner: getBundledEndlessReservationOwnerMock,
}));

vi.mock('./puzzle-store', () => ({
  clearUsedSignature: clearUsedSignatureMock,
  clearStagedLevelId: clearStagedLevelIdMock,
  deletePuzzleData: deletePuzzleDataMock,
  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
  getNextLevelId: getNextLevelIdMock,
  peekNextLevelId: peekNextLevelIdMock,
  getPuzzleMapping: getPuzzleMappingMock,
  getPuzzlePublicationReceipt: getPuzzlePublicationReceiptMock,
  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
  getStagedLevelId: getStagedLevelIdMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
  getRecentUsedSignatureEntries: getRecentUsedSignatureEntriesMock,
  reserveUsedSignature: reserveUsedSignatureMock,
  savePuzzle: savePuzzleMock,
  setPuzzlePublicationReceipt: setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostId: setPuzzlePublishedPostIdMock,
  setStagedLevelId: setStagedLevelIdMock,
  setDailyPointer: setDailyPointerMock,
  transferUsedSignatureReservation: transferUsedSignatureReservationMock,
}));

vi.mock('./validation', () => ({
  validatePuzzle: validatePuzzleMock,
}));

import {
  buildManualPuzzleWithSolverFallback,
  generatePuzzleForDate,
  injectManualPuzzle,
  publishDailyPost,
  publishAndActivateDailyPost,
  publishStagedPuzzle,
  stagePuzzleForTomorrow,
  PuzzleGenerationFailedError,
  PuzzleGenerationInProgressError,
} from './generator';

const buildChallengeTypeQueueFromSeed = (seed: number): ChallengeType[] => {
  const rng = mulberry32(seed);
  return shuffleWithRng(challengeTypePool, rng);
};

const validPhrase = {
  text: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS AT NOON',
  author: 'AUTHOR',
  challengeType: 'QUOTE',
};

const warmupValidPhrase = {
  text: 'SEE THE TREE BY THE SEA',
  author: 'AUTHOR',
  challengeType: 'QUOTE',
};

const hardValidPhrase = {
  text: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS AT NOON',
  author: 'AUTHOR',
  challengeType: 'QUOTE',
};

afterEach(() => {
  clearUsedSignatureMock.mockReset();
  ensureAICandidatePoolSelectionMock.mockReset();
  getBundledEndlessReservationOwnerMock.mockReset();
  generatePuzzlePhraseMock.mockReset();
  generatePuzzlePhraseBatchMock.mockReset();
  getDecryptSettingsMock.mockReset();
  computeGlobalDailyBiasMock.mockReset();
  computeAdaptiveHardnessBoundsMock.mockReset();
  clearStagedLevelIdMock.mockReset();
  getNextLevelIdMock.mockReset();
  peekNextLevelIdMock.mockReset();
  getPuzzleMappingMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  getStagedLevelIdMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getRecentUsedSignatureEntriesMock.mockReset();
  deletePuzzleDataMock.mockReset();
  getAutoDailyLevelIdsForDateMock.mockReset();
  getPuzzlePublicationReceiptMock.mockReset();
  reserveUsedSignatureMock.mockReset();
  savePuzzleMock.mockReset();
  setPuzzlePublicationReceiptMock.mockReset();
  setPuzzlePublishedPostIdMock.mockReset();
  setStagedLevelIdMock.mockReset();
  setDailyPointerMock.mockReset();
  transferUsedSignatureReservationMock.mockReset();
  validatePuzzleMock.mockReset();
  buildPuzzleMock.mockReset();
  buildPublicPuzzleMock.mockReset();
  runDummySolverMock.mockReset();
  submitCustomPostMock.mockReset();
  takeAICandidateBatchMock.mockReset();
  getPostByIdMock.mockReset();
  approveMock.mockReset();
  redisDelMock.mockReset();
  redisIncrByMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
});

beforeEach(() => {
  getRecentUsedSignatureEntriesMock.mockResolvedValue([]);
  getAutoDailyLevelIdsForDateMock.mockResolvedValue([]);
  getPuzzlePublicationReceiptMock.mockResolvedValue(null);
  getPuzzleMappingMock.mockResolvedValue(null);
  peekNextLevelIdMock.mockResolvedValue('lvl_0001');
  savePuzzleMock.mockImplementation(async (params) => params.expectedLevelId ?? 'lvl_0001');
  transferUsedSignatureReservationMock.mockResolvedValue(true);
  validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });
  buildPublicPuzzleMock.mockReturnValue({});
  runDummySolverMock.mockReturnValue({
    solvable: true,
    solvedRatio: 1,
    blindGuessRequired: false,
  });
  takeAICandidateBatchMock.mockResolvedValue({
    candidates: [],
    totalRequested: 3,
    totalReturned: 0,
  });
  ensureAICandidatePoolSelectionMock.mockResolvedValue({
    generated: 0,
    locked: false,
  });
  computeAdaptiveHardnessBoundsMock.mockResolvedValue({
    easy: {
      uniqueLetterBounds: { min: 5, max: 9 },
      cryptoHardnessBounds: { min: 0.16, max: 0.42 },
    },
    medium: {
      uniqueLetterBounds: { min: 9, max: 16 },
      cryptoHardnessBounds: { min: 0.43, max: 0.68 },
    },
    hard: {
      uniqueLetterBounds: { min: 12, max: 26 },
      cryptoHardnessBounds: { min: 0.58, max: 1 },
    },
  });
  redisSetMock.mockImplementation((key) => {
    const keyText = String(key);
    if (keyText.includes('puzzle_generation_lock')) {
      return true;
    }
    if (keyText.includes('daily_challenge_type_seed')) {
      return false;
    }
    return true;
  });
  
  // Default live batch mock implementation that wraps the single phrase mock.
  generatePuzzlePhraseBatchMock.mockImplementation(async (params) => {
    const candidates = [];
    for (let i = 0; i < params.batchSize; i++) {
      try {
        const result = await generatePuzzlePhraseMock({
          ...params,
          levelId: 'pool_test',
          apiKey: 'api-key',
          difficultyLabel: `difficulty ${params.difficulty}`,
          safetyMode: 'strict',
        });
        candidates.push(result);
      } catch (error) {
        // Continue trying to get more candidates even if one fails
        // This simulates the AI returning partial results
        continue;
      }
    }
    
    // If no candidates were generated, throw the error from the mock
    if (candidates.length === 0) {
      // Try one more time to get the error
      await generatePuzzlePhraseMock({
        ...params,
        levelId: 'pool_test',
        apiKey: 'api-key',
        difficultyLabel: `difficulty ${params.difficulty}`,
        safetyMode: 'strict',
      });
    }
    
    return {
      candidates,
      totalRequested: params.batchSize,
      totalReturned: candidates.length,
    };
  });
  getPostByIdMock.mockResolvedValue({
    id: 't3_daily123',
    title: 'Daily Cipher',
    subredditName: 'decrypttest',
    approved: true,
    removed: false,
    spam: false,
    removedBy: undefined,
    removedByCategory: undefined,
  });
  approveMock.mockResolvedValue(undefined);
});

describe('generatePuzzleForDate', () => {
  it('retries up to aiMaxRetries and succeeds on a later attempt', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0010');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });

    generatePuzzlePhraseMock
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce({
        text: 'TOO SHORT',
        author: 'AUTHOR',
        challengeType: baseType,
      })
      .mockResolvedValueOnce({ ...hardValidPhrase, challengeType: baseType })
      .mockResolvedValueOnce({ ...hardValidPhrase, challengeType: baseType });

    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: validPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    // With batch size 3 and aiMaxRetries 3, we expect up to 3 batch attempts
    // First batch: all 3 fail with timeout, returns 0 candidates
    // Second batch: first fails validation (TOO SHORT), second succeeds
    expect(generatePuzzlePhraseMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(savePuzzleMock).toHaveBeenCalledTimes(1);
    expect(buildPuzzleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        levelId: 'lvl_0010',
      })
    );
    expect(setDailyPointerMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      levelId: 'lvl_0010',
      dateKey: '2026-03-07',
    });
  });

  it('accepts a safe challenge type fallback only on the final retry', async () => {
    let challengeTypeSeed = 1;
    while ((buildChallengeTypeQueueFromSeed(challengeTypeSeed)[0] ?? 'QUOTE') !== 'PROVERB') {
      challengeTypeSeed += 1;
    }

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 2,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0011');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseBatchMock.mockResolvedValue({
      candidates: [{ ...hardValidPhrase, challengeType: 'QUOTE' }],
      totalRequested: 3,
      totalReturned: 1,
    });
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: hardValidPhrase.text },
      puzzlePublic: {},
    });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(generatePuzzlePhraseBatchMock).toHaveBeenCalledTimes(2);
    expect(buildPuzzleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeType: 'QUOTE',
        levelId: 'lvl_0011',
      })
    );
    expect(result).toEqual({
      levelId: 'lvl_0011',
      dateKey: '2026-03-07',
    });
  });

  it('uses pooled candidates before calling the live AI batch and schedules a refill', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0015');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    takeAICandidateBatchMock.mockResolvedValue({
      candidates: [
        {
          ...hardValidPhrase,
          challengeType: baseType,
          reservationOwnerToken: 'pool_00000001',
        },
      ],
      totalRequested: 3,
      totalReturned: 1,
    });
    ensureAICandidatePoolSelectionMock.mockResolvedValue({
      generated: 1,
      locked: false,
    });
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: validPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result).toEqual({
      levelId: 'lvl_0015',
      dateKey: '2026-03-07',
    });
    expect(takeAICandidateBatchMock).toHaveBeenCalledWith({
      difficulty: expect.any(Number),
      preferredType: baseType,
      batchSize: 3,
    });
    expect(ensureAICandidatePoolSelectionMock).toHaveBeenCalledWith({
      difficulty: expect.any(Number),
      preferredType: baseType,
      minimumCandidates: 3,
      hardnessBoundsByTier: expect.anything(),
    });
    expect(transferUsedSignatureReservationMock).toHaveBeenCalledWith(
      'THEQUICKBROWNFOXJUMPSOVERLAZYDOGSATNOON',
      'pool_00000001',
      expect.stringMatching(/^pending:/)
    );
    expect(generatePuzzlePhraseBatchMock).not.toHaveBeenCalled();
  });

  it('throws a typed error when all retries fail', async () => {
    const challengeTypeSeed = 123456789;
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    generatePuzzlePhraseMock.mockRejectedValue(new Error('api down'));
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      const keyText = String(key);
      if (keyText.includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      if (
        keyText.includes('daily_tier_cursor') ||
        keyText.includes('daily_challenge_type_cursor')
      ) {
        return '1';
      }
      return null;
    });
    await expect(
      generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'))
    ).rejects.toMatchObject({
      name: 'PuzzleGenerationFailedError',
      dateKey: '2026-03-07',
    });

    // With batch size 3 and aiMaxRetries 3, we expect 3 batch attempts
    // Each batch tries to get 3 candidates, and if all fail, it throws
    // So we expect at least 3 calls per batch attempt
    expect(generatePuzzlePhraseMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(savePuzzleMock).not.toHaveBeenCalled();
    expect(setDailyPointerMock).not.toHaveBeenCalled();
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });

  it('rejects solver-unsatisfied candidates instead of saving fallback puzzles', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0099');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      const keyText = String(key);
      if (keyText.includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      if (
        keyText.includes('daily_tier_cursor') ||
        keyText.includes('daily_challenge_type_cursor')
      ) {
        return '1';
      }
      return null;
    });
    generatePuzzlePhraseMock.mockResolvedValue({
      ...hardValidPhrase,
      challengeType: baseType,
    });
    buildPuzzleMock.mockImplementation(() => {
      throw new Error('DUMMY_SOLVER_UNSATISFIED');
    });

    await expect(
      generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'))
    ).rejects.toBeInstanceOf(PuzzleGenerationFailedError);

    expect(savePuzzleMock).not.toHaveBeenCalled();
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
    expect(clearUsedSignatureMock).toHaveBeenCalledWith(
      'THEQUICKBROWNFOXJUMPSOVERLAZYDOGSATNOON',
      expect.stringMatching(/^pending:/)
    );
    expect(buildPuzzleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        levelId: 'lvl_0099',
      })
    );
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });

  it('rejects phrases reserved by staged endless candidates before reserving the daily signature', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 2,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0011');
    getPuzzlePrivateMock.mockResolvedValue(null);
    getBundledEndlessReservationOwnerMock
      .mockReturnValueOnce('endless_0010')
      .mockReturnValueOnce(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseMock
      .mockResolvedValueOnce({
        text: hardValidPhrase.text,
        author: 'AUTHOR',
        challengeType: baseType,
      })
      .mockResolvedValueOnce({
        text: hardValidPhrase.text,
        author: 'AUTHOR',
        challengeType: baseType,
      });

    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: {
        targetText: hardValidPhrase.text,
      },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result.levelId).toBe('lvl_0011');
    expect(getBundledEndlessReservationOwnerMock).toHaveBeenCalledWith(
      'THEQUICKBROWNFOXJUMPSOVERLAZYDOGSATNOON'
    );
    expect(reserveUsedSignatureMock).toHaveBeenCalledTimes(1);
    // With batch size 3, the first batch gets 3 candidates
    // First candidate is reserved by endless, second succeeds
    // So we expect at least 2 calls (could be 3 if all candidates are generated)
    expect(generatePuzzlePhraseMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('selects the daily tier and challenge type from existing AUTO_DAILY count instead of mutating cursors', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const secondType = expectedQueue[1] ?? 'QUOTE';
    const easyPhrase = {
      text: 'SEE THE TREE BY THE SEA',
      author: 'AUTHOR',
      challengeType: secondType,
    };

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0007']);
    peekNextLevelIdMock.mockResolvedValue('lvl_0012');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseMock.mockResolvedValue({
      ...easyPhrase,
    });
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: easyPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result.levelId).toBe('lvl_0012');
    expect(redisIncrByMock).not.toHaveBeenCalled();
    expect(generatePuzzlePhraseMock).toHaveBeenCalled();
  });

  it('wraps the daily challenge type queue when rerolls exceed the unique slot count', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const wrappedType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(
      Array.from({ length: challengeTypePool.length }, (_, index) => `lvl_${index + 1}`)
    );
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0020');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseMock.mockResolvedValue({
      ...warmupValidPhrase,
      challengeType: wrappedType,
    });
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: warmupValidPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result).toEqual({
      levelId: 'lvl_0020',
      dateKey: '2026-03-07',
    });
    expect(generatePuzzlePhraseBatchMock).toHaveBeenCalled();
    expect(savePuzzleMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when another puzzle generation is already holding the lock', async () => {
    redisSetMock.mockImplementation((key) => {
      const keyText = String(key);
      if (keyText.includes('puzzle_generation_lock')) {
        return false;
      }
      if (keyText.includes('daily_challenge_type_seed')) {
        return false;
      }
      return true;
    });

    await expect(
      generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'))
    ).rejects.toBeInstanceOf(PuzzleGenerationInProgressError);

    expect(getNextLevelIdMock).not.toHaveBeenCalled();
    expect(generatePuzzlePhraseBatchMock).not.toHaveBeenCalled();
  });

  it('uses the manual solver fallback in the auto path before giving up on a candidate', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0030');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseMock.mockResolvedValue({
      ...hardValidPhrase,
      challengeType: baseType,
    });
    buildPuzzleMock
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockReturnValueOnce({
        puzzlePrivate: {
          targetText: hardValidPhrase.text,
          difficulty: 8,
          prefilledIndices: [],
          tiles: [],
        },
        puzzlePublic: {},
      });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result).toEqual({
      levelId: 'lvl_0030',
      dateKey: '2026-03-07',
    });
    expect(buildPuzzleMock).toHaveBeenCalledTimes(5);
    expect(buildPuzzleMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        levelId: 'lvl_0030',
        skipSolvabilityCheck: true,
        applyObstructionsOnSkip: true,
      })
    );
    expect(savePuzzleMock).toHaveBeenCalledTimes(1);
  });

  it('tries the next filtered survivor when phase2 fails instead of burning the whole batch', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValue('lvl_0040');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseBatchMock.mockResolvedValue({
      candidates: [
        {
          ...hardValidPhrase,
          text: 'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS',
          challengeType: baseType,
        },
        {
          ...hardValidPhrase,
          text: 'WIZARD JAZZ PHANTOMS MIX BOLD QUICK VERBS',
          challengeType: baseType,
        },
      ],
      totalRequested: 3,
      totalReturned: 2,
    });
    buildPuzzleMock
      .mockReturnValueOnce({
        puzzlePrivate: { targetText: 'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS' },
        puzzlePublic: {},
      })
      .mockReturnValueOnce({
        puzzlePrivate: { targetText: 'WIZARD JAZZ PHANTOMS MIX BOLD QUICK VERBS' },
        puzzlePublic: {},
      });
    validatePuzzleMock
      .mockReturnValueOnce({ valid: false, reasons: ['phase2 failed'] })
      .mockReturnValueOnce({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(result).toEqual({
      levelId: 'lvl_0040',
      dateKey: '2026-03-07',
    });
    expect(generatePuzzlePhraseBatchMock).toHaveBeenCalledTimes(1);
    expect(buildPuzzleMock).toHaveBeenCalledTimes(2);
    expect(savePuzzleMock).toHaveBeenCalledTimes(1);
  });
});

describe('injectManualPuzzle', () => {
  it('rejects a manual puzzle when its normalized phrase is already reserved', async () => {
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    reserveUsedSignatureMock.mockResolvedValue(false);

    await expect(
      injectManualPuzzle({
        text: validPhrase.text,
        author: 'MODERATOR',
        difficulty: 8,
        challengeType: 'QUOTE',
      })
    ).rejects.toThrow('already used');

    expect(savePuzzleMock).not.toHaveBeenCalled();
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });

  it('releases the reserved signature when manual puzzle validation fails', async () => {
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    peekNextLevelIdMock.mockResolvedValue('lvl_0043');
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: validPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({
      valid: false,
      reasons: ['bad puzzle'],
    });

    await expect(
      injectManualPuzzle({
        text: validPhrase.text,
        author: 'MODERATOR',
        difficulty: 8,
        challengeType: 'QUOTE',
      })
    ).rejects.toThrow('Injected puzzle validation failed');

    expect(clearUsedSignatureMock).toHaveBeenCalledWith(
      'THEQUICKBROWNFOXJUMPSOVERLAZYDOGSATNOON',
      expect.stringMatching(/^pending:/)
    );
    expect(buildPuzzleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        levelId: 'lvl_0043',
      })
    );
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });

  it('retries alternate solver seeds before failing a manual puzzle build', async () => {
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    peekNextLevelIdMock.mockResolvedValue('lvl_0044');
    getBundledEndlessReservationOwnerMock.mockReturnValue(null);
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    buildPuzzleMock
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockReturnValueOnce({
        puzzlePrivate: { targetText: validPhrase.text },
        puzzlePublic: {},
      });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await injectManualPuzzle({
      text: validPhrase.text,
      author: 'MODERATOR',
      difficulty: 8,
      challengeType: 'QUOTE',
    });

    expect(result).toEqual({
      levelId: 'lvl_0044',
      dateKey: expect.any(String),
    });
    expect(buildPuzzleMock).toHaveBeenCalledTimes(4);
    expect(buildPuzzleMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        levelId: 'lvl_0044',
        seedKey: 'lvl_0044',
      })
    );
    expect(buildPuzzleMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        levelId: 'lvl_0044',
        seedKey: 'lvl_0044:solver:3',
      })
    );
  });

  it('does not accept fallback reveals that fail phase2 validation', () => {
    const fallbackPuzzle = {
      levelId: 'lvl_0045',
      dateKey: '2026-03-08',
      targetText: 'AB CD',
      author: 'AUTHOR',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      cipherType: 'random',
      shiftAmount: null,
      mapping: { A: 1, B: 2, C: 3, D: 4 },
      reverseMapping: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      tiles: [
        { index: 0, char: 'A', isLetter: true, wordIndex: 0 },
        { index: 1, char: 'B', isLetter: true, wordIndex: 0 },
        { index: 2, char: ' ', isLetter: false, wordIndex: 0 },
        { index: 3, char: 'C', isLetter: true, wordIndex: 1 },
        { index: 4, char: 'D', isLetter: true, wordIndex: 1 },
      ],
      words: ['AB', 'CD'],
      prefilledIndices: [0],
      revealedIndices: [0],
      revealed_indices: [0],
      blindIndices: [],
      lockIndices: [],
      goldIndex: null,
      padlockChains: [],
      difficulty: 5,
      cryptoHardness: 0.4,
      isLogical: false,
      createdAt: 123,
    };

    buildPuzzleMock
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockImplementationOnce(() => {
        throw new Error('DUMMY_SOLVER_UNSATISFIED');
      })
      .mockReturnValue(fallbackPuzzle ? { puzzlePrivate: fallbackPuzzle, puzzlePublic: {} } : {});

    runDummySolverMock.mockImplementation(({ revealedIndices }) => ({
      solvable: Array.isArray(revealedIndices) && revealedIndices.length >= 2,
      solvedRatio: Array.isArray(revealedIndices) && revealedIndices.length >= 2 ? 1 : 0.5,
      blindGuessRequired: false,
    }));

    validatePuzzleMock.mockImplementation((candidate) => ({
      valid: Array.isArray(candidate.prefilledIndices) && candidate.prefilledIndices.length <= 1,
      reasons:
        Array.isArray(candidate.prefilledIndices) && candidate.prefilledIndices.length <= 1
          ? []
          : ['A multi-letter word is fully prefilled.'],
    }));

    expect(() =>
      buildManualPuzzleWithSolverFallback({
        levelId: 'lvl_0045',
        dateKey: '2026-03-08',
        text: 'AB CD',
        author: 'AUTHOR',
        challengeType: 'QUOTE',
        source: 'MANUAL_INJECTED',
        difficulty: 5,
        logicalPercent: 10,
        previousMapping: null,
      })
    ).toThrow('DUMMY_SOLVER_UNSATISFIED');
    expect(buildPuzzleMock).toHaveBeenCalledTimes(5);
    expect(buildPuzzleMock).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        levelId: 'lvl_0045',
        seedKey: 'lvl_0045',
        skipSolvabilityCheck: true,
        applyObstructionsOnSkip: true,
      })
    );
  });

  it('rejects a manual puzzle when its normalized phrase is reserved by endless staging', async () => {
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    getBundledEndlessReservationOwnerMock.mockReturnValue('endless_0010');

    await expect(
      injectManualPuzzle({
        text: validPhrase.text,
        author: 'MODERATOR',
        difficulty: 8,
        challengeType: 'QUOTE',
      })
    ).rejects.toThrow('reserved by endless level endless_0010');

    expect(reserveUsedSignatureMock).not.toHaveBeenCalled();
    expect(savePuzzleMock).not.toHaveBeenCalled();
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });

  it('applies adaptive hardness bounds to manual injection validation', async () => {
    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 3,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeAdaptiveHardnessBoundsMock.mockResolvedValue({
      easy: {
        uniqueLetterBounds: { min: 5, max: 9 },
        cryptoHardnessBounds: { min: 0.16, max: 0.35 },
      },
      medium: {
        uniqueLetterBounds: { min: 9, max: 16 },
        cryptoHardnessBounds: { min: 0.43, max: 0.68 },
      },
      hard: {
        uniqueLetterBounds: { min: 12, max: 26 },
        cryptoHardnessBounds: { min: 0.58, max: 1 },
      },
    });

    await expect(
      injectManualPuzzle({
        text: hardValidPhrase.text,
        author: 'MODERATOR',
        difficulty: 2,
        challengeType: 'QUOTE',
      })
    ).rejects.toThrow('Injected puzzle quote invalid');

    expect(reserveUsedSignatureMock).not.toHaveBeenCalled();
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
  });
});

describe('publishDailyPost', () => {
  it('stores the published post id for the level', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily123');
    expect(setPuzzlePublishedPostIdMock).toHaveBeenCalledWith(
      'lvl_0003',
      't3_daily123',
      '2026-03-07'
    );
    expect(setPuzzlePublicationReceiptMock).toHaveBeenCalledWith(
      'lvl_0003',
      expect.objectContaining({
        postId: 't3_daily123',
        dateKey: '2026-03-07',
      })
    );
	    expect(submitCustomPostMock).toHaveBeenCalledWith(
	      expect.objectContaining({
	        entry: 'default',
        postData: expect.not.objectContaining({
          creatorUsername: expect.any(String),
          creatorAvatarUrl: expect.any(String),
        }),
	      })
	    );
	  });

  it('submits moderator-triggered publishes as the acting user when requested', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
      runAs: 'USER',
    });

    expect(postId).toBe('t3_daily123');
    expect(submitCustomPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runAs: 'USER',
      })
    );
  });

  it('fails publish when submitCustomPost returns without a post id', async () => {
    submitCustomPostMock.mockResolvedValue({ id: '' });

    await expect(
      publishDailyPost({
        levelId: 'lvl_0003',
        dateKey: '2026-03-07',
      })
    ).rejects.toThrow('submitCustomPost returned without a post id.');

    expect(setPuzzlePublishedPostIdMock).not.toHaveBeenCalled();
    expect(setPuzzlePublicationReceiptMock).not.toHaveBeenCalled();
  });

  it('fails publish when Reddit immediately marks the created post as removed', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });
    getPostByIdMock.mockResolvedValue({
      id: 't3_daily123',
      title: 'Daily Cipher #3',
      subredditName: 'decrypttest',
      approved: false,
      removed: true,
      spam: false,
      removedBy: 'AutoModerator',
      removedByCategory: 'automod_filtered',
    });

    await expect(
      publishDailyPost({
        levelId: 'lvl_0003',
        dateKey: '2026-03-07',
      })
    ).rejects.toThrow('removedByCategory=automod_filtered');

    expect(approveMock).toHaveBeenCalledWith('t3_daily123');
    expect(setPuzzlePublishedPostIdMock).not.toHaveBeenCalled();
    expect(setPuzzlePublicationReceiptMock).not.toHaveBeenCalled();
  });

  it('recovers publish when approval clears an auto-filtered post', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });
    getPostByIdMock
      .mockResolvedValueOnce({
        id: 't3_daily123',
        title: 'Daily Cipher #3',
        subredditName: 'decrypttest',
        approved: false,
        removed: true,
        spam: false,
        removedBy: 'AutoModerator',
        removedByCategory: 'automod_filtered',
      })
      .mockResolvedValueOnce({
        id: 't3_daily123',
        title: 'Daily Cipher #3',
        subredditName: 'decrypttest',
        approved: true,
        removed: false,
        spam: false,
        removedBy: undefined,
        removedByCategory: undefined,
      });

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily123');
    expect(approveMock).toHaveBeenCalledWith('t3_daily123');
    expect(setPuzzlePublishedPostIdMock).toHaveBeenCalledWith(
      'lvl_0003',
      't3_daily123',
      '2026-03-07'
    );
    expect(setPuzzlePublicationReceiptMock).toHaveBeenCalled();
  });

  it('repairs published state from the receipt without reposting', async () => {
    getPuzzlePublicationReceiptMock.mockResolvedValue({
      postId: 't3_daily123',
      dateKey: '2026-03-07',
      publishedAt: 123,
    });

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily123');
    expect(submitCustomPostMock).not.toHaveBeenCalled();
    expect(setPuzzlePublishedPostIdMock).toHaveBeenCalledWith(
      'lvl_0003',
      't3_daily123',
      '2026-03-07'
    );
  });

  it('retries persisting publish state before failing the request', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });
    setPuzzlePublishedPostIdMock
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValue(undefined);

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily123');
    expect(submitCustomPostMock).toHaveBeenCalledTimes(1);
    expect(setPuzzlePublishedPostIdMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the committed post when another publish request holds the lock', async () => {
    getPuzzlePublishedPostIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('t3_existing123');
    redisSetMock.mockImplementation((key) => {
      const keyText = String(key);
      if (keyText.includes('puzzle_publish_lock')) {
        return false;
      }
      if (keyText.includes('puzzle_generation_lock')) {
        return true;
      }
      if (keyText.includes('daily_challenge_type_seed')) {
        return false;
      }
      return true;
    });

    const postId = await publishDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_existing123');
    expect(submitCustomPostMock).not.toHaveBeenCalled();
  });
});

describe('publishAndActivateDailyPost', () => {
  it('activates the daily pointer only after the post is published', async () => {
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily123' });

    const postId = await publishAndActivateDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily123');
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0003');
    expect(submitCustomPostMock.mock.invocationCallOrder[0]).toBeLessThan(
      setDailyPointerMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it('reuses an existing published post id and only repairs activation on retry', async () => {
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing123');

    const postId = await publishAndActivateDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_existing123');
    expect(submitCustomPostMock).not.toHaveBeenCalled();
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0003');
  });

  it('does not activate the daily pointer if post creation fails', async () => {
    submitCustomPostMock.mockRejectedValue(new Error('reddit unavailable'));

    await expect(
      publishAndActivateDailyPost({
        levelId: 'lvl_0003',
        dateKey: '2026-03-07',
      })
    ).rejects.toThrow('reddit unavailable');

    expect(setDailyPointerMock).not.toHaveBeenCalled();
  });

  it('does not activate the daily pointer when an existing published post is removed', async () => {
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing123');
    getPostByIdMock.mockResolvedValue({
      id: 't3_existing123',
      title: 'Daily Cipher #3',
      subredditName: 'decrypttest',
      approved: false,
      removed: true,
      spam: false,
      removedBy: 'AutoModerator',
      removedByCategory: 'automod_filtered',
    });

    await expect(
      publishAndActivateDailyPost({
        levelId: 'lvl_0003',
        dateKey: '2026-03-07',
      })
    ).rejects.toThrow('removedByCategory=automod_filtered');

    expect(approveMock).toHaveBeenCalledWith('t3_existing123');
    expect(setDailyPointerMock).not.toHaveBeenCalled();
  });

  it('activates the daily pointer when approval clears an auto-filtered existing post', async () => {
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing123');
    getPostByIdMock
      .mockResolvedValueOnce({
        id: 't3_existing123',
        title: 'Daily Cipher #3',
        subredditName: 'decrypttest',
        approved: false,
        removed: true,
        spam: false,
        removedBy: 'AutoModerator',
        removedByCategory: 'automod_filtered',
      })
      .mockResolvedValueOnce({
        id: 't3_existing123',
        title: 'Daily Cipher #3',
        subredditName: 'decrypttest',
        approved: true,
        removed: false,
        spam: false,
        removedBy: undefined,
        removedByCategory: undefined,
      });

    const postId = await publishAndActivateDailyPost({
      levelId: 'lvl_0003',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_existing123');
    expect(approveMock).toHaveBeenCalledWith('t3_existing123');
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0003');
  });
});

describe('stagePuzzleForTomorrow', () => {
  it('fills both AUTO_DAILY slots for tomorrow when none are pre-generated', async () => {
    const challengeTypeSeed = 123456789;
    const expectedQueue = buildChallengeTypeQueueFromSeed(challengeTypeSeed);
    const baseType = expectedQueue[0] ?? 'QUOTE';

    getDecryptSettingsMock.mockResolvedValue({
      aiMaxRetries: 1,
      geminiApiKey: 'api-key',
      contentSafetyMode: 'strict',
      logicalCipherPercent: 10,
      publishHourUtc: 0,
      timezone: 'UTC',
    });
    computeGlobalDailyBiasMock.mockResolvedValue(0);
    peekNextLevelIdMock.mockResolvedValueOnce('lvl_0100').mockResolvedValueOnce('lvl_0101');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    generatePuzzlePhraseMock.mockResolvedValue({
      ...hardValidPhrase,
      challengeType: baseType,
    });
    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: hardValidPhrase.text },
      puzzlePublic: {},
    });

    const result = await stagePuzzleForTomorrow();

    expect(result).toEqual({
      dateKey: expect.any(String),
      levelIds: ['lvl_0100', 'lvl_0101'],
    });
    expect(savePuzzleMock).toHaveBeenCalledTimes(2);
    // Staged pointer is set once after the loop with the last generated puzzle id,
    // not on every iteration (Bug #5 fix — prevents first pointer being overwritten).
    expect(setStagedLevelIdMock).toHaveBeenCalledTimes(1);
    expect(setStagedLevelIdMock).toHaveBeenCalledWith('lvl_0101');
  });

  it('does not generate extra tomorrow dailies when another stage request already holds the date lock', async () => {
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0200']);
    redisSetMock.mockImplementation((key) => {
      const keyText = String(key);
      if (keyText.includes('daily_stage_lock')) {
        return false;
      }
      if (keyText.includes('puzzle_generation_lock')) {
        return true;
      }
      if (keyText.includes('daily_challenge_type_seed')) {
        return false;
      }
      return true;
    });

    const result = await stagePuzzleForTomorrow();

    expect(result.levelIds).toEqual(['lvl_0200']);
    expect(getNextLevelIdMock).not.toHaveBeenCalled();
    expect(savePuzzleMock).not.toHaveBeenCalled();
  });
});

describe('publishStagedPuzzle', () => {
  it('ignores a stale staged pointer and publishes another same-day AUTO_DAILY if available', async () => {
    const todayDateKey = new Date().toISOString().slice(0, 10);
    getStagedLevelIdMock.mockResolvedValue('lvl_missing');
    getPuzzlePrivateMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        levelId: 'lvl_0004',
        dateKey: todayDateKey,
      });
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0004']);
    getPuzzlePublishedPostIdMock.mockResolvedValue(null);
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily124' });

    const result = await publishStagedPuzzle();

    expect(clearStagedLevelIdMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      levelId: 'lvl_0004',
      dateKey: todayDateKey,
      postId: 't3_daily124',
    });
  });

  it('publishes another unpublished AUTO_DAILY for today when the staged pointer is already published', async () => {
    const todayDateKey = new Date().toISOString().slice(0, 10);
    getStagedLevelIdMock.mockResolvedValue('lvl_0003');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0003',
      dateKey: todayDateKey,
    });
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0003', 'lvl_0004']);
    getPuzzlePublishedPostIdMock
      .mockResolvedValueOnce('t3_existing123')
      .mockResolvedValueOnce(null);
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily124' });

    const result = await publishStagedPuzzle();

    expect(result).toEqual({
      levelId: 'lvl_0004',
      dateKey: todayDateKey,
      postId: 't3_daily124',
    });
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0004');
    expect(clearStagedLevelIdMock).not.toHaveBeenCalled();
  });

  it('returns the existing post id instead of reposting an already published staged puzzle', async () => {
    const todayDateKey = new Date().toISOString().slice(0, 10);
    getStagedLevelIdMock.mockResolvedValue('lvl_0003');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0003',
      dateKey: todayDateKey,
    });
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0003']);
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing123');

    const result = await publishStagedPuzzle();

    expect(result).toEqual({
      levelId: 'lvl_0003',
      dateKey: todayDateKey,
      postId: 't3_existing123',
    });
    expect(submitCustomPostMock).not.toHaveBeenCalled();
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0003');
    expect(clearStagedLevelIdMock).toHaveBeenCalledTimes(1);
  });

  it('throws instead of generating live content when no staged puzzle exists', async () => {
    getStagedLevelIdMock.mockResolvedValue(null);

    await expect(publishStagedPuzzle()).rejects.toThrow(
      'No staged puzzle is ready to publish.'
    );

    expect(getNextLevelIdMock).not.toHaveBeenCalled();
    expect(submitCustomPostMock).not.toHaveBeenCalled();
  });
});
