import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  generatePuzzleForDateMock,
  getDailyPointerMock,
  getPuzzlePrivateMock,
  getPuzzlePublishedPostIdMock,
  publishAndActivateDailyPostMock,
} = vi.hoisted(() => ({
  generatePuzzleForDateMock: vi.fn(),
  getDailyPointerMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
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
    set: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

import { createPost } from './post';

afterEach(() => {
  generatePuzzleForDateMock.mockReset();
  getDailyPointerMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
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

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0200',
      dateKey: '2026-03-09',
      runAs: 'APP',
    });
    expect(generatePuzzleForDateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 't3_daily200' });
  });

  it('generates, then publishes and activates when no current pointer is usable', async () => {
    getDailyPointerMock.mockResolvedValue(null);
    generatePuzzleForDateMock.mockResolvedValue({
      levelId: 'lvl_0201',
      dateKey: '2026-03-10',
    });
    publishAndActivateDailyPostMock.mockResolvedValue('t3_daily201');

    const result = await createPost();

    expect(generatePuzzleForDateMock).toHaveBeenCalledTimes(1);
    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0201',
      dateKey: '2026-03-10',
      runAs: 'APP',
    });
    expect(result).toEqual({ id: 't3_daily201' });
  });
});
