import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  hasAdminAccessMock,
  injectAndPublishManualPuzzleMock,
  preflightManualChallengeForPublishMock,
} = vi.hoisted(() => ({
  hasAdminAccessMock: vi.fn(),
  injectAndPublishManualPuzzleMock: vi.fn(),
  preflightManualChallengeForPublishMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: {
    subredditName: 'decrypttest',
    username: 'mod_user',
  },
}));

vi.mock('../core/admin-auth', () => ({
  hasAdminAccess: hasAdminAccessMock,
}));

vi.mock('../core/admin', () => ({
  ManualChallengePreflightFailedError: class ManualChallengePreflightFailedError extends Error {
    constructor(public validation: unknown) {
      super('preflight failed');
      this.name = 'ManualChallengePreflightFailedError';
    }
  },
  injectAndPublishManualPuzzle: injectAndPublishManualPuzzleMock,
  preflightManualChallengeForPublish: preflightManualChallengeForPublishMock,
}));

import { forms } from './forms';

afterEach(() => {
  hasAdminAccessMock.mockReset();
  injectAndPublishManualPuzzleMock.mockReset();
  preflightManualChallengeForPublishMock.mockReset();
});

describe('mod-inject-submit', () => {
  it('routes moderator form submissions through the adjustment path', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      naturalDifficulty: 'medium',
      achievableTierRange: ['medium'],
      reasons: [],
      suggestions: [],
    });
    injectAndPublishManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0123',
      dateKey: '2026-03-08',
      postId: 't3_manual123',
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Never settle for less than your best',
        author: 'test author',
        difficulty: 'medium',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
      difficulty: 5,
      challengeType: 'QUOTE',
    });
    expect(injectAndPublishManualPuzzleMock).toHaveBeenCalledWith({
      text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
      author: 'TEST AUTHOR',
      difficulty: 5,
      challengeType: 'QUOTE',
      allowAdjustment: true,
      skipPreflight: true,
    });
    await expect(response.json()).resolves.toEqual({
      showToast: 'Manual puzzle published: lvl_0123',
    });
  });

  it('shows the saved level id when publish fails after injection', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      naturalDifficulty: 'medium',
      achievableTierRange: ['medium'],
      reasons: [],
      suggestions: [],
    });
    injectAndPublishManualPuzzleMock.mockRejectedValue({
      name: 'ManualPuzzlePublishFailedError',
      levelId: 'lvl_0456',
      dateKey: '2026-03-08',
      message: 'publish failed',
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Never settle for less than your best',
        author: 'test author',
        difficulty: 'medium',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Puzzle saved as lvl_0456 but post publish failed. Use "Post Last Generated Challenge" to retry.',
    });
  });

  it('shows a tier hint before publish when the quote cannot reach the selected profile', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      naturalDifficulty: 'expert',
      achievableTierRange: ['hard', 'expert'],
      reasons: ['Target tier warmup not achievable with this text.'],
      suggestions: ['Use text with more repeated letters and common words.'],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Jumping zebras vex quick waltz drum rhythms',
        author: 'test author',
        difficulty: 'warmup',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast:
        'This text is naturally expert. Achievable tiers: Hard, Expert. Use text with more repeated letters and common words.',
    });
  });

  it('shows a structural mismatch hint when the quote fits no supported tier at all', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      naturalDifficulty: 'hard',
      achievableTierRange: [],
      reasons: ['Quote length 39 does not satisfy hard tier bounds.'],
      suggestions: ['Try a longer quote if you want Hard or Expert.'],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'BOLD THINKERS NAVIGATE UNCERTAIN WORLDS',
        author: 'test author',
        difficulty: 'hard',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast:
        "This text doesn't currently fit any supported tier. Quote length 39 does not satisfy hard tier bounds. Try a longer quote if you want Hard or Expert.",
    });
  });

  it('rejects unsupported text characters instead of silently sanitizing them', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Curly quote “test”',
        author: 'test author',
        difficulty: 'medium',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).not.toHaveBeenCalled();
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast:
        "Puzzle text contains unsupported characters. Use letters, numbers, spaces, and , . ' ! ? ; : ( ) - only.",
    });
  });

  it('rejects invalid difficulty instead of defaulting silently', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Never settle for less than your best',
        author: 'test author',
        difficulty: 'mystery',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Invalid difficulty. Choose Warmup, Medium, Hard, or Expert.',
    });
  });
});
