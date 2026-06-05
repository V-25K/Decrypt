import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generatePuzzleForDateMock,
  getDailyPointerMock,
  getPuzzlePrivateMock,
  getPuzzlePublishedPostIdMock,
  publishAndActivateDailyPostMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  redisWatchMock,
  transactionDelMock,
  transactionExecMock,
  transactionMultiMock,
  transactionUnwatchMock,
} = vi.hoisted(() => ({
  generatePuzzleForDateMock: vi.fn(),
  getDailyPointerMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisWatchMock: vi.fn(),
  transactionDelMock: vi.fn(),
  transactionExecMock: vi.fn(),
  transactionMultiMock: vi.fn(),
  transactionUnwatchMock: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: getDailyPointerMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
}));

vi.mock('./generator', () => ({
  generatePuzzleForDate: generatePuzzleForDateMock,
  publishAndActivateDailyPost: publishAndActivateDailyPostMock,
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
    watch: redisWatchMock,
  },
}));

import { createPost } from './post';
import { keyDailyPostCreateLock } from './keys';

beforeEach(() => {
  redisSetMock.mockImplementation(async () => 'OK');
  redisGetMock.mockImplementation(async () => {
    const lockSetCall = redisSetMock.mock.calls.find(
      (call) => call[0] === keyDailyPostCreateLock
    );
    const token = lockSetCall?.[1];
    return typeof token === 'string' ? token : undefined;
  });
  redisDelMock.mockResolvedValue(undefined);
  transactionMultiMock.mockResolvedValue(undefined);
  transactionDelMock.mockResolvedValue(undefined);
  transactionExecMock.mockResolvedValue([1]);
  transactionUnwatchMock.mockResolvedValue(undefined);
  redisWatchMock.mockResolvedValue({
    multi: transactionMultiMock,
    del: transactionDelMock,
    exec: transactionExecMock,
    unwatch: transactionUnwatchMock,
  });
});

afterEach(() => {
  generatePuzzleForDateMock.mockReset();
  getDailyPointerMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
  redisDelMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisWatchMock.mockReset();
  transactionDelMock.mockReset();
  transactionExecMock.mockReset();
  transactionMultiMock.mockReset();
  transactionUnwatchMock.mockReset();
});

describe('createPost', () => {
  it('publishes and activates an existing unpublished daily pointer', async () => {
    getDailyPointerMock.mockResolvedValue('lvl_0200');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0200',
      dateKey: '2026-03-09',
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue(null);
    publishAndActivateDailyPostMock.mockResolvedValue('t3_daily200');

    const result = await createPost();

    expect(redisSetMock).toHaveBeenCalledWith(
      keyDailyPostCreateLock,
      expect.any(String),
      expect.objectContaining({
        nx: true,
        expiration: expect.any(Date),
      })
    );
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0200',
      dateKey: '2026-03-09',
      runAs: 'APP',
    });
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 't3_daily200' });
  });

  it('returns the existing post for an already published daily pointer', async () => {
    getDailyPointerMock.mockResolvedValue('lvl_0202');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0202',
      dateKey: '2026-03-11',
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing202');

    const result = await createPost();

    expect(result).toEqual({ id: 't3_existing202' });
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });

  it('generates, then publishes and activates when no current pointer is usable', async () => {
    getDailyPointerMock.mockResolvedValue(null);
    generatePuzzleForDateMock.mockResolvedValue({
      levelId: 'lvl_0201',
      dateKey: '2026-03-10',
    });
    publishAndActivateDailyPostMock.mockResolvedValue('t3_daily201');

    const result = await createPost();

    expect(redisSetMock.mock.invocationCallOrder[0]).toBeLessThan(
      generatePuzzleForDateMock.mock.invocationCallOrder[0]
    );
    expect(generatePuzzleForDateMock).toHaveBeenCalledTimes(1);
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0201',
      dateKey: '2026-03-10',
      runAs: 'APP',
    });
    expect(result).toEqual({ id: 't3_daily201' });
  });

  it('fails before reading the daily pointer when post creation is locked', async () => {
    redisSetMock.mockResolvedValue(null);

    await expect(createPost()).rejects.toThrow(
      'Post creation already in progress. Please wait a moment.'
    );

    expect(getDailyPointerMock).not.toHaveBeenCalled();
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });

  it('does not delete the lock when the lock token no longer belongs to this caller', async () => {
    redisGetMock.mockResolvedValue('other-caller-token');
    getDailyPointerMock.mockResolvedValue('lvl_0203');
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0203',
      dateKey: '2026-03-12',
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing203');

    const result = await createPost();

    expect(result).toEqual({ id: 't3_existing203' });
    expect(transactionUnwatchMock).toHaveBeenCalledTimes(1);
    expect(transactionDelMock).not.toHaveBeenCalled();
    expect(transactionExecMock).not.toHaveBeenCalled();
    expect(redisDelMock).not.toHaveBeenCalled();
  });
});
