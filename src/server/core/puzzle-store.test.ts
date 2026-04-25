import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  delMock,
  getMock,
  hDelMock,
  hGetMock,
  hMGetMock,
  hSetMock,
  incrByMock,
  mGetMock,
  setMock,
  watchMock,
  tx,
  zAddMock,
  zCardMock,
  zRangeMock,
  zRemMock,
} = vi.hoisted(() => ({
  delMock: vi.fn(),
  getMock: vi.fn(),
  hDelMock: vi.fn(),
  hGetMock: vi.fn(),
  hMGetMock: vi.fn(),
  hSetMock: vi.fn(),
  incrByMock: vi.fn(),
  mGetMock: vi.fn(),
  setMock: vi.fn(),
  watchMock: vi.fn(),
  tx: {
    unwatch: vi.fn(),
    discard: vi.fn(),
    multi: vi.fn(),
    set: vi.fn(),
    incrBy: vi.fn(),
    zAdd: vi.fn(),
    hSet: vi.fn(),
    exec: vi.fn(),
  },
  zAddMock: vi.fn(),
  zCardMock: vi.fn(),
  zRangeMock: vi.fn(),
  zRemMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    watch: watchMock,
    get: getMock,
    incrBy: incrByMock,
    set: setMock,
    del: delMock,
    hGet: hGetMock,
    hMGet: hMGetMock,
    hSet: hSetMock,
    hSetNX: vi.fn(),
    hDel: hDelMock,
    mGet: mGetMock,
    zAdd: zAddMock,
    zRem: zRemMock,
    zCard: zCardMock,
    zRange: zRangeMock,
  },
}));

import {
  countPublishedAutoDailyPuzzlesForDate,
  countPuzzlesForDate,
  getNextLevelId,
  peekNextLevelId,
  getPuzzleMapping,
  getRecentUsedSignatureEntries,
  savePuzzle,
} from './puzzle-store';

afterEach(() => {
  delMock.mockReset();
  getMock.mockReset();
  hDelMock.mockReset();
  hGetMock.mockReset();
  hMGetMock.mockReset();
  hSetMock.mockReset();
  incrByMock.mockReset();
  mGetMock.mockReset();
  setMock.mockReset();
  watchMock.mockReset();
  tx.unwatch.mockReset();
  tx.discard.mockReset();
  tx.multi.mockReset();
  tx.set.mockReset();
  tx.incrBy.mockReset();
  tx.zAdd.mockReset();
  tx.hSet.mockReset();
  tx.exec.mockReset();
  zAddMock.mockReset();
  zCardMock.mockReset();
  zRangeMock.mockReset();
  zRemMock.mockReset();
});

describe('getNextLevelId', () => {
  it('seeds the counter from the existing index size before incrementing', async () => {
    getMock.mockResolvedValue(null);
    zCardMock.mockResolvedValue(21);
    setMock.mockResolvedValue(true);
    incrByMock.mockResolvedValue(22);

    const levelId = await getNextLevelId();

    expect(levelId).toBe('lvl_0022');
    expect(zCardMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith('decrypt:state:level_id_counter', '21', {
      nx: true,
    });
    expect(incrByMock).toHaveBeenCalledWith('decrypt:state:level_id_counter', 1);
  });

  it('uses the atomic counter directly once it already exists', async () => {
    getMock.mockResolvedValue('22');
    incrByMock.mockResolvedValue(23);

    const levelId = await getNextLevelId();

    expect(levelId).toBe('lvl_0023');
    expect(zCardMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(incrByMock).toHaveBeenCalledWith('decrypt:state:level_id_counter', 1);
  });
});

describe('peekNextLevelId', () => {
  it('seeds the counter from the existing index size without incrementing', async () => {
    getMock.mockResolvedValue(null);
    zCardMock.mockResolvedValue(21);
    setMock.mockResolvedValue(true);

    const levelId = await peekNextLevelId();

    expect(levelId).toBe('lvl_0022');
    expect(zCardMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith('decrypt:state:level_id_counter', '21', {
      nx: true,
    });
    expect(incrByMock).not.toHaveBeenCalled();
  });

  it('reads the next level id from the existing counter without incrementing', async () => {
    getMock.mockResolvedValue('22');

    const levelId = await peekNextLevelId();

    expect(levelId).toBe('lvl_0023');
    expect(zCardMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(incrByMock).not.toHaveBeenCalled();
  });
});

describe('countPuzzlesForDate', () => {
  it('returns indexed count without scanning when date index exists', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    zCardMock.mockResolvedValue(4);

    const count = await countPuzzlesForDate('2026-04-10');

    expect(count).toBe(4);
    expect(zRangeMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs and falls back to full scan when date index is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    zCardMock.mockResolvedValue(0);
    zRangeMock.mockResolvedValue([]);

    const count = await countPuzzlesForDate('2026-04-10');

    expect(count).toBe(0);
    expect(zRangeMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[countPuzzlesForDate] date index missing for 2026-04-10, running full scan'
    );
    errorSpy.mockRestore();
  });
});

describe('savePuzzle', () => {
  it('allocates and saves the puzzle atomically in a transaction', async () => {
    watchMock.mockResolvedValue(tx);
    getMock.mockResolvedValue('6');
    tx.exec.mockResolvedValue(['ok']);

    const puzzlePrivate = {
      levelId: 'pending:abc',
      dateKey: '2026-04-10',
      targetText: 'TEST PHRASE',
      author: 'AUTHOR',
      challengeType: 'QUOTE',
      source: 'AUTO_DAILY',
      cipherType: 'random',
      shiftAmount: null,
      mapping: { A: 1 },
      reverseMapping: { '1': 'A' },
      tiles: [
        {
          index: 0,
          char: 'T',
          isLetter: true,
          wordIndex: 0,
        },
      ],
      words: ['TEST'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      blindIndices: [],
      goldIndex: null,
      padlockChains: [],
      difficulty: 5,
      isLogical: false,
      createdAt: 123,
    };

    const puzzlePublic = {
      levelId: 'pending:abc',
      dateKey: '2026-04-10',
      author: 'AUTHOR',
      challengeType: 'QUOTE',
      words: ['TEST'],
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 1,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
      difficulty: 5,
      heartsMax: 3,
    };

    const allocated = await savePuzzle({
      puzzlePrivate,
      puzzlePublic,
      normalizedSignature: 'ABC123',
      tokenSignature: 'A:B:C',
      expectedLevelId: 'lvl_0007',
    });

    expect(allocated).toBe('lvl_0007');
    expect(tx.multi).toHaveBeenCalledTimes(1);
    expect(tx.incrBy).toHaveBeenCalledWith('decrypt:state:level_id_counter', 1);
    expect(tx.set).toHaveBeenCalledWith(
      'decrypt:puzzle:lvl_0007:private',
      expect.stringContaining('"levelId":"lvl_0007"')
    );
    expect(tx.set).toHaveBeenCalledWith(
      'decrypt:puzzle:lvl_0007:public',
      expect.stringContaining('"levelId":"lvl_0007"')
    );
    expect(tx.hSet).toHaveBeenCalledWith('decrypt:history:used_strings', {
      ABC123: 'lvl_0007',
    });
    expect(delMock).not.toHaveBeenCalled();
  });

  it('throws a conflict when the predicted next level id changes before save', async () => {
    watchMock.mockResolvedValue(tx);
    getMock.mockResolvedValue('7');

    await expect(
      savePuzzle({
        puzzlePrivate: {
          levelId: 'pending:abc',
          dateKey: '2026-04-10',
          targetText: 'TEST PHRASE',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
          source: 'AUTO_DAILY',
          cipherType: 'random',
          shiftAmount: null,
          mapping: { A: 1 },
          reverseMapping: { '1': 'A' },
          tiles: [{ index: 0, char: 'T', isLetter: true, wordIndex: 0 }],
          words: ['TEST'],
          prefilledIndices: [],
          revealedIndices: [],
          revealed_indices: [],
          blindIndices: [],
          goldIndex: null,
          padlockChains: [],
          difficulty: 5,
          isLogical: false,
          createdAt: 123,
        },
        puzzlePublic: {
          levelId: 'pending:abc',
          dateKey: '2026-04-10',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
          words: ['TEST'],
          tiles: [
            {
              index: 0,
              isLetter: true,
              displayChar: '_',
              cipherNumber: 1,
              isBlind: false,
              isGold: false,
              isLocked: false,
            },
          ],
          difficulty: 5,
          heartsMax: 3,
        },
        normalizedSignature: 'ABC123',
        expectedLevelId: 'lvl_0007',
      })
    ).rejects.toMatchObject({
      name: 'PuzzleLevelAllocationConflictError',
      expectedLevelId: 'lvl_0007',
      actualLevelId: 'lvl_0008',
    });

    expect(tx.unwatch).toHaveBeenCalledTimes(1);
    expect(tx.multi).not.toHaveBeenCalled();
  });

  it('discards the watched transaction before retrying after a pre-exec failure', async () => {
    watchMock.mockResolvedValue(tx);
    getMock.mockResolvedValue('6');
    tx.set.mockRejectedValueOnce(new Error('queue failed'));
    tx.exec.mockResolvedValue(['ok']);

    const puzzlePrivate = {
      levelId: 'pending:abc',
      dateKey: '2026-04-10',
      targetText: 'TEST PHRASE',
      author: 'AUTHOR',
      challengeType: 'QUOTE',
      source: 'AUTO_DAILY',
      cipherType: 'random',
      shiftAmount: null,
      mapping: { A: 1 },
      reverseMapping: { '1': 'A' },
      tiles: [
        {
          index: 0,
          char: 'T',
          isLetter: true,
          wordIndex: 0,
        },
      ],
      words: ['TEST'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      blindIndices: [],
      goldIndex: null,
      padlockChains: [],
      difficulty: 5,
      isLogical: false,
      createdAt: 123,
    };

    const puzzlePublic = {
      levelId: 'pending:abc',
      dateKey: '2026-04-10',
      author: 'AUTHOR',
      challengeType: 'QUOTE',
      words: ['TEST'],
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 1,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
      difficulty: 5,
      heartsMax: 3,
    };

    const allocated = await savePuzzle({
      puzzlePrivate,
      puzzlePublic,
      normalizedSignature: 'ABC123',
      tokenSignature: 'A:B:C',
      expectedLevelId: 'lvl_0007',
    });

    expect(allocated).toBe('lvl_0007');
    expect(tx.discard).toHaveBeenCalledTimes(1);
    expect(tx.unwatch).not.toHaveBeenCalled();
    expect(watchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getRecentUsedSignatureEntries', () => {
  it('preserves positional alignment when hMGet returns sparse metadata', async () => {
    zRangeMock.mockResolvedValue([
      { member: 'SIG_A', score: 3 },
      { member: 'SIG_B', score: 2 },
      { member: 'SIG_C', score: 1 },
    ]);
    hMGetMock.mockResolvedValue(['TOK_A', null, 'TOK_C']);

    const entries = await getRecentUsedSignatureEntries(3);

    expect(hMGetMock).toHaveBeenCalledWith('decrypt:history:used_signature_meta', [
      'SIG_A',
      'SIG_B',
      'SIG_C',
    ]);
    expect(entries).toEqual([
      { normalizedSignature: 'SIG_A', tokenSignature: 'TOK_A' },
      { normalizedSignature: 'SIG_B', tokenSignature: null },
      { normalizedSignature: 'SIG_C', tokenSignature: 'TOK_C' },
    ]);
  });

  it('falls back to hGet fan-out when hMGet is unavailable in the install', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    zRangeMock.mockResolvedValue([
      { member: 'SIG_A', score: 3 },
      { member: 'SIG_B', score: 2 },
    ]);
    hMGetMock.mockRejectedValue(new Error('hMGet disabled'));
    hGetMock
      .mockResolvedValueOnce('TOK_A')
      .mockResolvedValueOnce(null);

    const entries = await getRecentUsedSignatureEntries(2);

    expect(hGetMock).toHaveBeenNthCalledWith(
      1,
      'decrypt:history:used_signature_meta',
      'SIG_A'
    );
    expect(hGetMock).toHaveBeenNthCalledWith(
      2,
      'decrypt:history:used_signature_meta',
      'SIG_B'
    );
    expect(entries).toEqual([
      { normalizedSignature: 'SIG_A', tokenSignature: 'TOK_A' },
      { normalizedSignature: 'SIG_B', tokenSignature: null },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hMGet unavailable, falling back to hGet fan-out')
    );
    warnSpy.mockRestore();
  });
});

describe('getPuzzleMapping', () => {
  it('reads the lightweight mapping key', async () => {
    getMock.mockResolvedValue(JSON.stringify({ A: 1, B: 2 }));

    await expect(getPuzzleMapping('lvl_0042')).resolves.toEqual({ A: 1, B: 2 });
  });
});

describe('countPublishedAutoDailyPuzzlesForDate', () => {
  it('returns indexed count when the published AUTO_DAILY index is initialized', async () => {
    zCardMock.mockResolvedValue(2);
    getMock.mockResolvedValue('1');

    const count = await countPublishedAutoDailyPuzzlesForDate('2026-04-10');

    expect(count).toBe(2);
    expect(mGetMock).not.toHaveBeenCalled();
  });

  it('backfills the published AUTO_DAILY index when missing', async () => {
    const storedPuzzles: Record<string, string> = {
      'decrypt:puzzle:lvl_0001:private': JSON.stringify({
        levelId: 'lvl_0001',
        dateKey: '2026-04-10',
        source: 'AUTO_DAILY',
        targetText: 'TEST ONE',
        author: 'AUTHOR',
        challengeType: 'QUOTE',
        cipherType: 'random',
        shiftAmount: null,
        mapping: { A: 1 },
        reverseMapping: { '1': 'A' },
        tiles: [{ index: 0, char: 'T', isLetter: true, wordIndex: 0 }],
        words: ['TEST'],
        prefilledIndices: [],
        revealedIndices: [],
        revealed_indices: [],
        blindIndices: [],
        goldIndex: null,
        padlockChains: [],
        difficulty: 5,
        isLogical: false,
        createdAt: 111,
      }),
      'decrypt:puzzle:lvl_0002:private': JSON.stringify({
        levelId: 'lvl_0002',
        dateKey: '2026-04-10',
        source: 'AUTO_DAILY',
        targetText: 'TEST TWO',
        author: 'AUTHOR',
        challengeType: 'QUOTE',
        cipherType: 'random',
        shiftAmount: null,
        mapping: { B: 2 },
        reverseMapping: { '2': 'B' },
        tiles: [{ index: 0, char: 'T', isLetter: true, wordIndex: 0 }],
        words: ['TEST'],
        prefilledIndices: [],
        revealedIndices: [],
        revealed_indices: [],
        blindIndices: [],
        goldIndex: null,
        padlockChains: [],
        difficulty: 5,
        isLogical: false,
        createdAt: 222,
      }),
    };
    zCardMock
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);
    getMock.mockImplementation(async (key: string) => {
      if (key === 'decrypt:puzzles:auto_daily_published_initialized:2026-04-10') {
        return null;
      }
      return storedPuzzles[key] ?? null;
    });
    zRangeMock
      .mockResolvedValueOnce([
        { member: 'lvl_0001', score: 111 },
        { member: 'lvl_0002', score: 222 },
      ]);
    mGetMock.mockResolvedValue(['t3_one', 't3_two']);

    const count = await countPublishedAutoDailyPuzzlesForDate('2026-04-10');

    expect(count).toBe(2);
    expect(zAddMock).toHaveBeenCalledWith('decrypt:puzzles:auto_daily_published:2026-04-10', {
      member: 'lvl_0001',
      score: 111,
    });
    expect(zAddMock).toHaveBeenCalledWith('decrypt:puzzles:auto_daily_published:2026-04-10', {
      member: 'lvl_0002',
      score: 222,
    });
    expect(setMock).toHaveBeenCalledWith(
      'decrypt:puzzles:auto_daily_published_initialized:2026-04-10',
      '1'
    );
  });
});
