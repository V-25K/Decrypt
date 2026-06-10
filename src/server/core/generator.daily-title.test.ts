import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearUsedSignatureMock,
  getAllLevelIdsMock,
  getAutoDailyLevelIdsForDateMock,
  getPuzzleMappingMock,
  getPuzzlePrivateMock,
  getPuzzlePublicationReceiptMock,
  getPuzzlePublishedPostIdMock,
  getRecentUsedSignatureEntriesMock,
  peekNextLevelIdMock,
  reserveUsedSignatureMock,
  savePuzzleMock,
  setDailyPointerMock,
  setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostIdMock,
  submitCustomPostMock,
  getPostByIdMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  transferUsedSignatureReservationMock,
} = vi.hoisted(() => ({
  clearUsedSignatureMock: vi.fn(),
  getAllLevelIdsMock: vi.fn(),
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublicationReceiptMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  getRecentUsedSignatureEntriesMock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
  reserveUsedSignatureMock: vi.fn(),
  savePuzzleMock: vi.fn(),
  setDailyPointerMock: vi.fn(),
  setPuzzlePublicationReceiptMock: vi.fn(),
  setPuzzlePublishedPostIdMock: vi.fn(),
  submitCustomPostMock: vi.fn(),
  getPostByIdMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  transferUsedSignatureReservationMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest', subredditId: 't5_test' },
  reddit: {
    submitCustomPost: submitCustomPostMock,
    getPostById: getPostByIdMock,
    approve: vi.fn(),
  },
  redis: {
    del: redisDelMock,
    get: redisGetMock,
    set: redisSetMock,
  },
}));

vi.mock('./puzzle-store', () => ({
  PuzzleLevelAllocationConflictError: class PuzzleLevelAllocationConflictError extends Error {},
  clearUsedSignature: clearUsedSignatureMock,
  getAllLevelIds: getAllLevelIdsMock,
  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
  getPuzzleMapping: getPuzzleMappingMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublicationReceipt: getPuzzlePublicationReceiptMock,
  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
  getRecentUsedSignatureEntries: getRecentUsedSignatureEntriesMock,
  isOfficialDailyPuzzleSource: (source: string) =>
    source === 'AUTO_DAILY' || source === 'MANUAL_INJECTED',
  peekNextLevelId: peekNextLevelIdMock,
  reserveUsedSignature: reserveUsedSignatureMock,
  savePuzzle: savePuzzleMock,
  setDailyPointer: setDailyPointerMock,
  setPuzzlePublicationReceipt: setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostId: setPuzzlePublishedPostIdMock,
  transferUsedSignatureReservation: transferUsedSignatureReservationMock,
}));

import { publishDailyPost } from './generator';

const puzzleBySource = (params: {
  levelId: string;
  source: 'AUTO_DAILY' | 'COMMUNITY' | 'MANUAL_INJECTED';
  createdAt: number;
}) => ({
  levelId: params.levelId,
  dateKey: '2026-03-07',
  targetText: 'TEST PHRASE',
  author: 'AUTHOR',
  challengeType: 'QUOTE',
  cipherType: 'random',
  shiftAmount: null,
  mapping: {},
  reverseMapping: {},
  tiles: [],
  words: ['TEST'],
  prefilledIndices: [],
  revealedIndices: [],
  revealed_indices: [],
  blindIndices: [],
  goldIndex: null,
  padlockChains: [],
  difficulty: 5,
  isLogical: false,
  source: params.source,
  createdAt: params.createdAt,
});

describe('publishDailyPost daily title numbering', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    getPuzzlePublishedPostIdMock.mockResolvedValue(null);
    getPuzzlePublicationReceiptMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    redisGetMock.mockResolvedValue(null);
    submitCustomPostMock.mockResolvedValue({ id: 't3_daily124' });
    getPostByIdMock.mockResolvedValue({
      id: 't3_daily124',
      title: 'Daily Cipher #3',
      subredditName: 'decrypttest',
      approved: true,
      removed: false,
      spam: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearUsedSignatureMock.mockReset();
    getAllLevelIdsMock.mockReset();
    getAutoDailyLevelIdsForDateMock.mockReset();
    getPuzzleMappingMock.mockReset();
    getPuzzlePrivateMock.mockReset();
    getPuzzlePublicationReceiptMock.mockReset();
    getPuzzlePublishedPostIdMock.mockReset();
    getRecentUsedSignatureEntriesMock.mockReset();
    peekNextLevelIdMock.mockReset();
    reserveUsedSignatureMock.mockReset();
    savePuzzleMock.mockReset();
    setDailyPointerMock.mockReset();
    setPuzzlePublicationReceiptMock.mockReset();
    setPuzzlePublishedPostIdMock.mockReset();
    submitCustomPostMock.mockReset();
    getPostByIdMock.mockReset();
    redisDelMock.mockReset();
    redisGetMock.mockReset();
    redisSetMock.mockReset();
    transferUsedSignatureReservationMock.mockReset();
  });

  it('ignores player-made levels when numbering Daily Cipher posts', async () => {
    getAllLevelIdsMock.mockResolvedValue([
      'lvl_0001',
      'lvl_0002',
      'lvl_0003',
      'lvl_0004',
    ]);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => {
      const puzzles = {
        lvl_0001: puzzleBySource({
          levelId: 'lvl_0001',
          source: 'AUTO_DAILY',
          createdAt: 100,
        }),
        lvl_0002: puzzleBySource({
          levelId: 'lvl_0002',
          source: 'AUTO_DAILY',
          createdAt: 200,
        }),
        lvl_0003: puzzleBySource({
          levelId: 'lvl_0003',
          source: 'COMMUNITY',
          createdAt: 300,
        }),
        lvl_0004: puzzleBySource({
          levelId: 'lvl_0004',
          source: 'AUTO_DAILY',
          createdAt: 400,
        }),
      };
      return Reflect.get(puzzles, levelId) ?? null;
    });

    const postId = await publishDailyPost({
      levelId: 'lvl_0004',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily124');
    expect(submitCustomPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Daily Cipher #3',
        textFallback: {
          text: 'Daily Cipher #3. Open the interactive post to play.',
        },
      })
    );
  });

  it('counts manual injection as an official daily while ignoring player-made levels', async () => {
    getAllLevelIdsMock.mockResolvedValue([
      'lvl_0001',
      'lvl_0002',
      'lvl_0003',
      'lvl_0004',
    ]);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => {
      const puzzles = {
        lvl_0001: puzzleBySource({
          levelId: 'lvl_0001',
          source: 'AUTO_DAILY',
          createdAt: 100,
        }),
        lvl_0002: puzzleBySource({
          levelId: 'lvl_0002',
          source: 'MANUAL_INJECTED',
          createdAt: 200,
        }),
        lvl_0003: puzzleBySource({
          levelId: 'lvl_0003',
          source: 'COMMUNITY',
          createdAt: 300,
        }),
        lvl_0004: puzzleBySource({
          levelId: 'lvl_0004',
          source: 'MANUAL_INJECTED',
          createdAt: 400,
        }),
      };
      return Reflect.get(puzzles, levelId) ?? null;
    });

    const postId = await publishDailyPost({
      levelId: 'lvl_0004',
      dateKey: '2026-03-07',
    });

    expect(postId).toBe('t3_daily124');
    expect(submitCustomPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Daily Cipher #3',
        textFallback: {
          text: 'Daily Cipher #3. Open the interactive post to play.',
        },
      })
    );
  });
});
