import { afterEach, describe, expect, it, vi } from 'vitest';

const { contextState, submitCommentMock } = vi.hoisted(() => ({
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

import { shareResultAsComment } from './social';

afterEach(() => {
  contextState.postId = 't3_testpost';
  submitCommentMock.mockReset();
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
      score: 321,
    });

    expect(submitCommentMock).toHaveBeenCalledWith({
      id: 't3_testpost',
      text:
        '🔓 **Cracked the cipher!** Solved it in **01:35** for **321** points.\n' +
        '\n' +
        '❤️ Hearts to spare\n' +
        '\n' +
        'Think you can beat my run? Tap in and decrypt it. 👇',
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

  it('adds stronger highlight badges for flawless no-powerup clears', async () => {
    submitCommentMock.mockResolvedValue({ id: 't1_shared' });

    await shareResultAsComment({
      levelId: 'lvl_0042',
      solveSeconds: 88,
      mistakes: 0,
      heartsRemaining: 3,
      usedPowerups: 0,
      score: 777,
    });

    expect(submitCommentMock).toHaveBeenCalledWith({
      id: 't3_testpost',
      text:
        '🔓 **Flawless decrypt!** I cracked this cipher in **01:28** for **777** points.\n' +
        '\n' +
        '🎯 Flawless  ·  🧠 No power-ups  ·  ❤️ Hearts to spare\n' +
        '\n' +
        'Think you can beat my run? Tap in and decrypt it. 👇',
      runAs: 'USER',
    });
  });
});
