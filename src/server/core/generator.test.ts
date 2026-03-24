import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32, shuffleWithRng } from './rng';
import type { ChallengeType } from '../../shared/game';

const {
  clearUsedSignatureMock,
  generatePuzzlePhraseMock,
  getDecryptSettingsMock,
  computeGlobalDailyBiasMock,
  clearStagedLevelIdMock,
  getNextLevelIdMock,
  getPuzzlePublishedPostIdMock,
  getStagedLevelIdMock,
  getPuzzlePrivateMock,
  reserveUsedSignatureMock,
  savePuzzleMock,
  setPuzzlePublishedPostIdMock,
  setStagedLevelIdMock,
  setDailyPointerMock,
  validatePuzzleMock,
  buildPuzzleMock,
  submitCustomPostMock,
  redisIncrByMock,
  redisGetMock,
  redisSetMock,
} = vi.hoisted(() => ({
  clearUsedSignatureMock: vi.fn(),
  generatePuzzlePhraseMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  computeGlobalDailyBiasMock: vi.fn(),
  clearStagedLevelIdMock: vi.fn(),
  getNextLevelIdMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  getStagedLevelIdMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  reserveUsedSignatureMock: vi.fn(),
  savePuzzleMock: vi.fn(),
  setPuzzlePublishedPostIdMock: vi.fn(),
  setStagedLevelIdMock: vi.fn(),
  setDailyPointerMock: vi.fn(),
  validatePuzzleMock: vi.fn(),
  buildPuzzleMock: vi.fn(),
  submitCustomPostMock: vi.fn(),
  redisIncrByMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest', subredditId: 't5_test' },
  reddit: {
    submitCustomPost: submitCustomPostMock,
  },
  redis: {
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
}));

vi.mock('./config', () => ({
  getDecryptSettings: getDecryptSettingsMock,
}));

vi.mock('./puzzle', () => ({
  buildPuzzle: buildPuzzleMock,
}));

vi.mock('./difficulty-calibration', () => ({
  computeGlobalDailyBias: computeGlobalDailyBiasMock,
}));

vi.mock('./puzzle-store', () => ({
  clearUsedSignature: clearUsedSignatureMock,
  clearStagedLevelId: clearStagedLevelIdMock,
  getNextLevelId: getNextLevelIdMock,
  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
  getStagedLevelId: getStagedLevelIdMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
  reserveUsedSignature: reserveUsedSignatureMock,
  savePuzzle: savePuzzleMock,
  setPuzzlePublishedPostId: setPuzzlePublishedPostIdMock,
  setStagedLevelId: setStagedLevelIdMock,
  setDailyPointer: setDailyPointerMock,
}));

vi.mock('./validation', () => ({
  validatePuzzle: validatePuzzleMock,
}));

import {
  generatePuzzleForDate,
  injectManualPuzzle,
  publishDailyPost,
  publishStagedPuzzle,
  PuzzleGenerationFailedError,
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

afterEach(() => {
  clearUsedSignatureMock.mockReset();
  generatePuzzlePhraseMock.mockReset();
  getDecryptSettingsMock.mockReset();
  computeGlobalDailyBiasMock.mockReset();
  clearStagedLevelIdMock.mockReset();
  getNextLevelIdMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  getStagedLevelIdMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  reserveUsedSignatureMock.mockReset();
  savePuzzleMock.mockReset();
  setPuzzlePublishedPostIdMock.mockReset();
  setStagedLevelIdMock.mockReset();
  setDailyPointerMock.mockReset();
  validatePuzzleMock.mockReset();
  buildPuzzleMock.mockReset();
  submitCustomPostMock.mockReset();
  redisIncrByMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
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
    getNextLevelIdMock.mockResolvedValue('lvl_0010');
    getPuzzlePrivateMock.mockResolvedValue(null);
    reserveUsedSignatureMock.mockResolvedValue(true);
    redisIncrByMock.mockResolvedValue(1);
    redisGetMock.mockImplementation((key) => {
      if (String(key).includes('daily_challenge_type_seed')) {
        return `${challengeTypeSeed}`;
      }
      return null;
    });
    redisSetMock.mockResolvedValue(false);

    generatePuzzlePhraseMock
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce({
        text: 'TOO SHORT',
        author: 'AUTHOR',
        challengeType: baseType,
      })
      .mockResolvedValueOnce({ ...validPhrase, challengeType: baseType });

    buildPuzzleMock.mockReturnValue({
      puzzlePrivate: { targetText: validPhrase.text },
      puzzlePublic: {},
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });

    const result = await generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'));

    expect(generatePuzzlePhraseMock).toHaveBeenCalledTimes(3);
    expect(generatePuzzlePhraseMock.mock.calls[0]?.[0]?.preferredType).toBe(
      baseType
    );
    expect(generatePuzzlePhraseMock.mock.calls[1]?.[0]?.preferredType).toBe(
      baseType
    );
    expect(generatePuzzlePhraseMock.mock.calls[2]?.[0]?.preferredType).toBe(
      baseType
    );
    expect(savePuzzleMock).toHaveBeenCalledTimes(1);
    expect(setDailyPointerMock).toHaveBeenCalledWith('lvl_0010');
    expect(result).toEqual({
      levelId: 'lvl_0010',
      dateKey: '2026-03-07',
    });
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
    getNextLevelIdMock.mockResolvedValue('lvl_0010');
    generatePuzzlePhraseMock.mockRejectedValue(new Error('api down'));
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
    redisSetMock.mockResolvedValue(false);

    await expect(
      generatePuzzleForDate(new Date('2026-03-07T00:00:00Z'))
    ).rejects.toBeInstanceOf(PuzzleGenerationFailedError);

    expect(generatePuzzlePhraseMock).toHaveBeenCalledTimes(3);
    expect(savePuzzleMock).not.toHaveBeenCalled();
    expect(setDailyPointerMock).not.toHaveBeenCalled();
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
    getNextLevelIdMock.mockResolvedValue('lvl_0042');
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
    getNextLevelIdMock.mockResolvedValue('lvl_0043');
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
      'lvl_0043'
    );
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
      't3_daily123'
    );
  });
});

describe('publishStagedPuzzle', () => {
  it('returns the existing post id instead of reposting an already published staged puzzle', async () => {
    const todayDateKey = new Date().toISOString().slice(0, 10);
    getStagedLevelIdMock.mockResolvedValue('lvl_0003');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0003',
      dateKey: todayDateKey,
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing123');

    const result = await publishStagedPuzzle();

    expect(result).toEqual({
      levelId: 'lvl_0003',
      dateKey: todayDateKey,
      postId: 't3_existing123',
    });
    expect(submitCustomPostMock).not.toHaveBeenCalled();
    expect(clearStagedLevelIdMock).toHaveBeenCalledTimes(1);
  });
});
