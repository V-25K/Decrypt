import { afterEach, describe, expect, it, vi } from 'vitest';

const { computeScoreMock, contextState, submitCommentMock } = vi.hoisted(() => ({
  computeScoreMock: vi.fn(() => 321),
  contextState: {
    postId: 't3_testpost' as string | undefined,
  },
  submitCommentMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextState,
  reddit: {
    submitComment: submitCommentMock,
  },
}));

vi.mock('./leaderboard', () => ({
  computeScore: computeScoreMock,
}));

import { shareResultAsComment } from './social';

afterEach(() => {
  contextState.postId = 't3_testpost';
  submitCommentMock.mockReset();
  computeScoreMock.mockClear();
});

describe('shareResultAsComment', () => {
  it('submits the score summary as a user comment on the current post', async () => {
    submitCommentMock.mockResolvedValue({ id: 't1_shared' });

    const result = await shareResultAsComment({
      levelId: 'lvl_0001',
      solveSeconds: 95,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 3,
      score: null,
    });

    expect(computeScoreMock).toHaveBeenCalledWith({
      solveSeconds: 95,
      mistakes: 1,
      usedPowerups: 3,
    });
    expect(submitCommentMock).toHaveBeenCalledWith({
      id: 't3_testpost',
      text: 'Cleared the challenge!\nScore: 321\nPowerups used: 3\nMistakes: 1\nTime: 01:35',
      runAs: 'USER',
    });
    expect(result).toEqual({
      success: true,
      reason: null,
      commentId: 't1_shared',
    });
  });

  it('returns the underlying failure message when comment submission fails', async () => {
    submitCommentMock.mockRejectedValue(new Error('Missing SUBMIT_COMMENT scope'));

    const result = await shareResultAsComment({
      levelId: 'lvl_0001',
      solveSeconds: 95,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 3,
      score: 999,
    });

    expect(result).toEqual({
      success: false,
      reason: 'Missing SUBMIT_COMMENT scope',
      commentId: null,
    });
  });

  it('fails fast when there is no current post context', async () => {
    contextState.postId = undefined;

    const result = await shareResultAsComment({
      levelId: 'lvl_0001',
      solveSeconds: 95,
      mistakes: 1,
      heartsRemaining: 2,
      usedPowerups: 3,
      score: 999,
    });

    expect(submitCommentMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      reason: 'Missing post context.',
      commentId: null,
    });
  });
});
