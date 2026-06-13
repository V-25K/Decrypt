import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  applyChallengeEditMock,
  clearSubredditGameDataMock,
  duplicateMock,
  fitLineToTiersMock,
  hasAdminAccessMock,
  injectAndPublishManualPuzzleMock,
  publishFittedManualPuzzleMock,
} = vi.hoisted(() => ({
  applyChallengeEditMock: vi.fn(),
  clearSubredditGameDataMock: vi.fn(),
  duplicateMock: vi.fn(),
  fitLineToTiersMock: vi.fn(),
  hasAdminAccessMock: vi.fn(),
  injectAndPublishManualPuzzleMock: vi.fn(),
  publishFittedManualPuzzleMock: vi.fn(),
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
  applyChallengeEdit: applyChallengeEditMock,
  injectAndPublishManualPuzzle: injectAndPublishManualPuzzleMock,
  publishFittedManualPuzzle: publishFittedManualPuzzleMock,
}));

vi.mock('../core/board-fit-service', () => ({
  fitLineToTiers: fitLineToTiersMock,
}));

vi.mock('../core/validation-pipeline', () => ({
  createValidationPipeline: () => ({
    phase1: vi.fn(),
    phase1Structural: vi.fn(),
    phase2: vi.fn(),
    duplicate: duplicateMock,
  }),
}));

import { forms } from './forms';

type FitTier = 'warmup' | 'medium' | 'hard' | 'expert';

const fitReport = (params: {
  suggestedTier: FitTier;
  feasible: FitTier[];
  reasonsByTier?: Partial<Record<FitTier, string>>;
  textValid?: boolean;
  reasons?: string[];
}) => ({
  textHash: 'hash',
  layoutVersion: 'v1',
  textValid: params.textValid ?? true,
  reasons: params.reasons ?? [],
  suggestedTier: params.suggestedTier,
  tiers: (['warmup', 'medium', 'hard', 'expert'] as const).map((tier) => ({
    tier,
    feasible: params.feasible.includes(tier),
    reason: params.reasonsByTier?.[tier] ?? null,
    summary: null,
  })),
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  duplicateMock.mockResolvedValue({
    duplicate: false,
    normalizedSignature: 'sig',
    tokenSignature: 'tok',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  applyChallengeEditMock.mockReset();
  clearSubredditGameDataMock.mockReset();
  duplicateMock.mockReset();
  fitLineToTiersMock.mockReset();
  hasAdminAccessMock.mockReset();
  injectAndPublishManualPuzzleMock.mockReset();
  publishFittedManualPuzzleMock.mockReset();
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
  it('fits the quote and opens a review form bounded to feasible tiers', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    fitLineToTiersMock.mockResolvedValue(
      fitReport({
        suggestedTier: 'hard',
        feasible: ['medium', 'hard'],
        reasonsByTier: {
          warmup:
            'Easy doesn’t work for this line — its words are too unusual to solve without guessing.',
          expert: 'Expert needs at least 14 different letters; this line has 12.',
        },
      })
    );

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
    expect(fitLineToTiersMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'TEST AUTHOR',
      challengeType: 'QUOTE',
    });
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();
    expect(publishFittedManualPuzzleMock).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.showForm.name).toBe('mod_inject_review_form');
    expect(body.showForm.form.acceptLabel).toBe('Publish Selected Tier');
    expect(body.showForm.form.description).toContain('Detected difficulty: Hard.');
    expect(body.showForm.form.description).toContain('Achievable range: Medium -> Hard.');

    const textField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'text'
    );
    expect(textField.disabled).toBe(true);
    expect(textField.helpText).toContain('go back to step 1');

    const difficultyField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'difficulty'
    );
    expect(difficultyField.defaultValue).toEqual(['hard']);
    expect(difficultyField.options).toEqual([
      { label: 'Medium (5/10)', value: 'medium' },
      { label: 'Hard (8/10)', value: 'hard' },
    ]);

    // Mods see why the excluded tiers are not offered.
    const summaryField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'summary'
    );
    expect(summaryField.defaultValue).toContain('Not available:');
    expect(summaryField.defaultValue).toContain(
      'Expert needs at least 14 different letters'
    );
  });

  it('recommends the closest achievable tier when the suggestion is outside the feasible range', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    fitLineToTiersMock.mockResolvedValue(
      fitReport({ suggestedTier: 'expert', feasible: ['medium', 'hard'] })
    );

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

  it('shows the fit reason when no tier works for the quote', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    fitLineToTiersMock.mockResolvedValue(
      fitReport({
        suggestedTier: 'medium',
        feasible: [],
        reasonsByTier: {
          warmup:
            'Easy doesn’t work for this line — its words are too unusual to solve without guessing.',
        },
      })
    );

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
      showToast:
        'Easy doesn’t work for this line — its words are too unusual to solve without guessing.',
    });
  });

  it('shows a duplicate-content hint during analysis', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    fitLineToTiersMock.mockResolvedValue(
      fitReport({ suggestedTier: 'warmup', feasible: ['warmup', 'medium'] })
    );
    duplicateMock.mockResolvedValue({
      duplicate: true,
      reason: 'near duplicate',
      normalizedSignature: 'sig',
      tokenSignature: 'tok',
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
      showToast: 'Quote already used or too similar. Try another line.',
    });
  });

  it('rejects unsupported text characters during analysis instead of silently sanitizing them', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-inject-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Curly quote “test”',
        author: 'test author',
        challengeType: 'quote',
      }),
    });

    expect(response.status).toBe(200);
    expect(fitLineToTiersMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast:
        "Puzzle text contains unsupported characters. Use letters, numbers, spaces, and , . ' ! ? ; : ( ) - only.",
    });
  });
});

describe('mod-inject-review-submit', () => {
  it('publishes the cached fitted board for the selected tier without rebuilding', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    publishFittedManualPuzzleMock.mockResolvedValue({
      success: true,
      levelId: 'lvl_0123',
      dateKey: '2026-06-10',
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
    expect(publishFittedManualPuzzleMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'TEST AUTHOR',
      tier: 'hard',
      challengeType: 'QUOTE',
    });
    // The whole point of the fitted flow: no adjustment/rebuild path runs.
    expect(injectAndPublishManualPuzzleMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Hard puzzle published - "THE LIGHT WILL FALL PREY TO..."',
    });
  });

  it('shows the saved level id when publish fails after the review step', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    publishFittedManualPuzzleMock.mockRejectedValue({
      name: 'ManualPuzzlePublishFailedError',
      levelId: 'lvl_0456',
      dateKey: '2026-06-10',
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
      showToast:
        'Puzzle saved as lvl_0456 but post publish failed. Use "Post Last Generated Challenge" to retry.',
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
    expect(publishFittedManualPuzzleMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      showToast: 'Choose a publish tier from the reviewed options.',
    });
  });

  it('surfaces the fit error when the reviewed tier is no longer available', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    publishFittedManualPuzzleMock.mockResolvedValue({
      success: false,
      error:
        "This quote can't be published as Easy. Go back to step 1 and pick one of the listed tiers.",
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
    await expect(response.json()).resolves.toEqual({
      showToast:
        "This quote can't be published as Easy. Go back to step 1 and pick one of the listed tiers.",
    });
  });
});

describe('mod-edit-challenge-submit', () => {
  it('applies the edit and shows the result message', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    applyChallengeEditMock.mockResolvedValue({
      success: true,
      message: 'Medium challenge updated.',
    });

    const response = await forms.request('http://localhost/mod-edit-challenge-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        levelId: 'lvl_0042',
        text: 'The only way to do great work is to love what you do',
        author: 'New Author',
      }),
    });

    expect(response.status).toBe(200);
    expect(applyChallengeEditMock).toHaveBeenCalledWith({
      levelId: 'lvl_0042',
      text: 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
      author: 'New Author',
    });
    await expect(response.json()).resolves.toEqual({
      showToast: 'Medium challenge updated.',
    });
  });

  it('rejects when the challenge id is missing', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-edit-challenge-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Some quote here for the board',
        author: 'Author',
      }),
    });

    expect(response.status).toBe(200);
    expect(applyChallengeEditMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.showToast).toContain('Re-open the menu');
  });

  it('rejects empty challenge text', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await forms.request('http://localhost/mod-edit-challenge-submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        levelId: 'lvl_0042',
        text: '',
        author: 'Author',
      }),
    });

    expect(response.status).toBe(200);
    expect(applyChallengeEditMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.showToast).toContain('cannot be empty');
  });
});
