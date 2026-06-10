import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearSubredditGameDataMock,
  hasAdminAccessMock,
  injectAndPublishManualPuzzleMock,
  preflightManualChallengeForPublishMock,
} = vi.hoisted(() => ({
  clearSubredditGameDataMock: vi.fn(),
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

vi.mock('../core/playtest-reset', () => ({
  clearSubredditGameData: clearSubredditGameDataMock,
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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSubredditGameDataMock.mockReset();
  hasAdminAccessMock.mockReset();
  injectAndPublishManualPuzzleMock.mockReset();
  preflightManualChallengeForPublishMock.mockReset();
});

describe('mod-clear-subreddit-data-submit', () => {
  it('requires typed confirmation before clearing subreddit game data', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-clear-subreddit-data-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'clear' }),
    });

    expect(response.status).toBe(200);
    expect(clearSubredditGameDataMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Type CLEAR to confirm clearing subreddit game data.',
    });
  });

  it('rejects when the subreddit name confirmation is missing or wrong', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request(
      'http://localhost/mod-clear-subreddit-data-submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'CLEAR',
          subredditConfirmation: 'someothersubreddit',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(clearSubredditGameDataMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Type the subreddit name (decrypttest) to confirm.',
    });
  });

  it('accepts case-insensitive subreddit name confirmation', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    clearSubredditGameDataMock.mockResolvedValue({
      knownUsers: 0,
      sessions: 0,
      deletedKeys: 0,
    });

    const response = await forms.request(
      'http://localhost/mod-clear-subreddit-data-submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'CLEAR',
          subredditConfirmation: 'DECRYPTTEST',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(clearSubredditGameDataMock).toHaveBeenCalledTimes(1);
  });

  it('clears subreddit game data after typed confirmation', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    clearSubredditGameDataMock.mockResolvedValue({
      knownUsers: 2,
      sessions: 1,
      deletedKeys: 19,
    });

    const response = await forms.request('http://localhost/mod-clear-subreddit-data-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        confirmation: 'CLEAR',
        subredditConfirmation: 'decrypttest',
      }),
    });

    expect(response.status).toBe(200);
    expect(clearSubredditGameDataMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Cleared subreddit game data for 2 player(s), 1 session(s), and 19 key(s).',
    });
  });
});

describe('mod-inject-submit', () => {
  it('analyzes the quote first and opens a bounded review form instead of publishing immediately', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.629,
        uniqueLetterCount: 17,
        totalLetters: 30,
        wordCount: 7,
      },
      naturalDifficulty: 'hard',
      achievableTierRange: ['medium', 'hard'],
      reasons: [],
      suggestions: [],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'The light will fall prey to darkness',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      difficulty: undefined,
      challengeType: 'QUOTE',
    });
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.showForm.name).toBe('mod_inject_review_form');
    expect(body.showForm.form.acceptLabel).toBe('Publish Selected Tier');
    expect(body.showForm.form.description).toContain('Detected difficulty: Hard.');
    expect(body.showForm.form.description).toContain('Achievable range: Medium -> Hard.');

    const textField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'text'
    );
    expect(textField.disabled).toBe(true);
    expect(textField.required).toBeUndefined();
    expect(textField.helpText).toContain('go back to step 1');

    const difficultyField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'difficulty'
    );
    expect(difficultyField.defaultValue).toEqual(['hard']);
    expect(difficultyField.options).toEqual([
      { label: 'Medium (5/10)', value: 'medium' },
      { label: 'Hard (8/10)', value: 'hard' },
    ]);

    const summaryField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'summary'
    );
    expect(summaryField.defaultValue).toContain('Crypto hardness: 0.63 - balanced letter mix');

    const challengeTypeField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'challengeType'
    );
    expect(challengeTypeField.helpText).toContain('Speech is from public remarks');
  });

  it('recommends the closest achievable tier when the natural tier is just outside the valid range', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.79,
        uniqueLetterCount: 21,
        totalLetters: 34,
        wordCount: 6,
      },
      naturalDifficulty: 'expert',
      achievableTierRange: ['medium', 'hard'],
      reasons: [],
      suggestions: [],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Brilliant storms reveal the shape of patient minds',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.showForm.form.acceptLabel).toBe('Publish Selected Tier');

    const difficultyField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'difficulty'
    );
    expect(difficultyField.defaultValue).toEqual(['hard']);
  });

  it('shows a retry hint when preview verification fails during analysis', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      textProfile: {
        cryptoHardness: 0.42,
        uniqueLetterCount: 11,
      },
      naturalDifficulty: 'medium',
      achievableTierRange: ['medium', 'hard'],
      reasons: ['Could not verify buildability for this text [trace abc123ef]: preview timeout.'],
      suggestions: ['Try again in a moment, or use a different quote if the problem persists.'],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'To be or not to be, that is the question.',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: "The game engine couldn't preview this quote. Try again, or use a shorter quote.",
    });
  });

  it('shows a duplicate-content hint during analysis', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      textProfile: {
        cryptoHardness: 0.25,
        uniqueLetterCount: 8,
      },
      naturalDifficulty: 'warmup',
      achievableTierRange: ['warmup', 'medium'],
      reasons: ['Text conflicts with existing content: exact signature match.'],
      suggestions: ['Use a different quote; this one matches recent content too closely.'],
    });

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'To be or not to be',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Quote already used or too similar.',
    });
  });

  it('rejects unsupported text characters during analysis instead of silently sanitizing them', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Curly quote â€œtestâ€\u009d',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast:
        "Puzzle text contains unsupported characters. Use letters, numbers, spaces, and , . ' ! ? ; : ( ) - only.",
    });
  });
});

describe('mod-inject-review-submit', () => {
  it('publishes the reviewed quote using the selected bounded tier', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.629,
        uniqueLetterCount: 17,
        totalLetters: 30,
        wordCount: 7,
      },
      naturalDifficulty: 'hard',
      achievableTierRange: ['medium', 'hard'],
      reasons: [],
      suggestions: [],
    });
    injectAndPublishManualPuzzleMock.mockResolvedValue({
      success: true,
      levelId: 'lvl_0123',
      dateKey: '2026-03-08',
      postId: 't3_manual123',
      difficulty: 8,
    });

    const response = await forms.request('http://localhost/mod-inject-review-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'The light will fall prey to darkness',
        author: 'test author',
        difficulty: 'hard',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      difficulty: 8,
      challengeType: 'QUOTE',
    });
    expect(injectAndPublishManualPuzzleMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'TEST AUTHOR',
      difficulty: 8,
      challengeType: 'QUOTE',
      allowAdjustment: true,
      skipPreflight: true,
    });
    await expect(response.json()).resolves.toEqual({
      showToast: 'Hard puzzle published - "THE LIGHT WILL FALL PREY TO..."',
    });
  });

  it('surfaces tier adjustment in the publish toast', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.5,
        uniqueLetterCount: 12,
      },
      naturalDifficulty: 'hard',
      achievableTierRange: ['medium', 'hard'],
      reasons: [],
      suggestions: [],
    });
    injectAndPublishManualPuzzleMock.mockResolvedValue({
      success: true,
      levelId: 'lvl_0124',
      dateKey: '2026-03-08',
      postId: 't3_manual124',
      difficulty: 5,
    });

    const response = await forms.request('http://localhost/mod-inject-review-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'The light will fall prey to darkness',
        author: 'test author',
        difficulty: 'hard',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Medium puzzle published (adjusted from Hard) - "THE LIGHT WILL FALL PREY TO..."',
    });
  });

  it('shows the saved level id when publish fails after the review step', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.5,
        uniqueLetterCount: 12,
      },
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

    const response = await forms.request('http://localhost/mod-inject-review-submit', {
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

  it('blocks review publish when no bounded tier was chosen', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-inject-review-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Never settle for less than your best',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(preflightManualChallengeForPublishMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Choose a publish tier from the reviewed options.',
    });
  });

  it('shows a tier mismatch if the quote was edited into an unsupported difficulty before publish', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      textProfile: {
        cryptoHardness: 0.82,
        uniqueLetterCount: 23,
      },
      naturalDifficulty: 'expert',
      achievableTierRange: ['hard', 'expert'],
      reasons: ['Target tier warmup not achievable with this text.'],
      suggestions: ['Use text with more repeated letters and common words.'],
    });

    const response = await forms.request('http://localhost/mod-inject-review-submit', {
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
      showToast: "Selected Warmup doesn't fit. Best fit: Expert.",
    });
  });
});
