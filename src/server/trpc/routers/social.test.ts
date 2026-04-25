import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getPuzzlePrivateMock,
  getShareCompletionReceiptMock,
  markLevelSharedOnceMock,
  clearLevelSharedMarkMock,
  shareResultAsCommentMock,
  trackShareQuestMock,
} = vi.hoisted(() => ({
  getPuzzlePrivateMock: vi.fn(),
  getShareCompletionReceiptMock: vi.fn(),
  markLevelSharedOnceMock: vi.fn(),
  clearLevelSharedMarkMock: vi.fn(),
  shareResultAsCommentMock: vi.fn(),
  trackShareQuestMock: vi.fn(),
}));

vi.mock('../../core/puzzle-store', () => ({
  getPuzzlePrivate: getPuzzlePrivateMock,
}));

vi.mock('../../core/share-receipts', () => ({
  getShareCompletionReceipt: getShareCompletionReceiptMock,
  markLevelSharedOnce: markLevelSharedOnceMock,
  clearLevelSharedMark: clearLevelSharedMarkMock,
}));

vi.mock('../../core/social', () => ({
  shareResultAsComment: shareResultAsCommentMock,
}));

vi.mock('../../core/game-service', () => ({
  trackShareQuest: trackShareQuestMock,
}));

import { socialRouter } from './social';

const caller = socialRouter.createCaller({
  userId: 't2_u1',
  username: 'tester',
  subredditName: 'decrypttest_dev',
  postId: 't3_test',
});

afterEach(() => {
  getPuzzlePrivateMock.mockReset();
  getShareCompletionReceiptMock.mockReset();
  markLevelSharedOnceMock.mockReset();
  clearLevelSharedMarkMock.mockReset();
  shareResultAsCommentMock.mockReset();
  trackShareQuestMock.mockReset();
});

describe('socialRouter.shareResult', () => {
  it('returns early when the level is already shared', async () => {
    getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-04-10' });
    getShareCompletionReceiptMock.mockResolvedValue({
      solveSeconds: 100,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 0,
      score: 500,
    });
    markLevelSharedOnceMock.mockResolvedValue(false);

    const result = await caller.shareResult({ levelId: 'lvl_0001' });

    expect(result).toEqual({
      success: true,
      reason: 'Result already shared for this level.',
      commentId: null,
    });
    expect(shareResultAsCommentMock).not.toHaveBeenCalled();
    expect(trackShareQuestMock).not.toHaveBeenCalled();
  });

  it('tracks quest progress on successful first share', async () => {
    getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-04-10' });
    getShareCompletionReceiptMock.mockResolvedValue({
      solveSeconds: 100,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 0,
      score: 500,
    });
    markLevelSharedOnceMock.mockResolvedValue(true);
    shareResultAsCommentMock.mockResolvedValue({
      success: true,
      reason: null,
      commentId: 't1_comment',
    });

    const result = await caller.shareResult({ levelId: 'lvl_0001' });

    expect(result).toEqual({
      success: true,
      reason: null,
      commentId: 't1_comment',
    });
    expect(trackShareQuestMock).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      dateKey: '2026-04-10',
    });
    expect(clearLevelSharedMarkMock).not.toHaveBeenCalled();
  });

  it('rolls back the share marker when comment submission fails', async () => {
    getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-04-10' });
    getShareCompletionReceiptMock.mockResolvedValue({
      solveSeconds: 100,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 0,
      score: 500,
    });
    markLevelSharedOnceMock.mockResolvedValue(true);
    shareResultAsCommentMock.mockResolvedValue({
      success: false,
      reason: 'submit failed',
      commentId: null,
    });

    const result = await caller.shareResult({ levelId: 'lvl_0001' });

    expect(result).toEqual({
      success: false,
      reason: 'submit failed',
      commentId: null,
    });
    expect(clearLevelSharedMarkMock).toHaveBeenCalledWith('t2_u1', 'lvl_0001');
    expect(trackShareQuestMock).not.toHaveBeenCalled();
  });
});
