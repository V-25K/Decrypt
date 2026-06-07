import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  contextMock,
  createPostMock,
  buildShadowCalibrationPreviewMock,
  formatModeratorRerollErrorMock,
  hasAdminAccessMock,
  publishLastGeneratedChallengeMock,
  rerollAndPublishMock,
} = vi.hoisted(() => ({
  contextMock: {
    subredditName: 'decrypttest',
    username: 'mod_user',
  },
  createPostMock: vi.fn(),
  buildShadowCalibrationPreviewMock: vi.fn(),
  formatModeratorRerollErrorMock: vi.fn(),
  hasAdminAccessMock: vi.fn(),
  publishLastGeneratedChallengeMock: vi.fn(),
  rerollAndPublishMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
}));

vi.mock('../core/post', () => ({
  createPost: createPostMock,
}));

vi.mock('../core/admin', () => ({
  formatModeratorRerollError: formatModeratorRerollErrorMock,
  publishLastGeneratedChallenge: publishLastGeneratedChallengeMock,
  rerollAndPublish: rerollAndPublishMock,
}));

vi.mock('../core/admin-auth', () => ({
  hasAdminAccess: hasAdminAccessMock,
}));

vi.mock('../core/difficulty-calibration', () => ({
  buildShadowCalibrationPreview: buildShadowCalibrationPreviewMock,
}));

import { menu } from './menu';

afterEach(() => {
  contextMock.subredditName = 'decrypttest';
  contextMock.username = 'mod_user';
  createPostMock.mockReset();
  buildShadowCalibrationPreviewMock.mockReset();
  formatModeratorRerollErrorMock.mockReset();
  hasAdminAccessMock.mockReset();
  publishLastGeneratedChallengeMock.mockReset();
  rerollAndPublishMock.mockReset();
});

describe('menu routes', () => {
  it('opens a quote-first manual inject form without asking for difficulty up front', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await menu.request('http://localhost/mod-inject', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.showForm.name).toBe('mod_inject_form');
    expect(body.showForm.form.acceptLabel).toBe('Analyze Quote');
    expect(body.showForm.form.description).toContain('Step 1 of 2');
    expect(
      body.showForm.form.fields.some((field: { name: string }) => field.name === 'difficulty')
    ).toBe(false);
  });

  it('navigates to the created post for post-create', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    createPostMock.mockResolvedValue({ id: 't3_created123' });

    const response = await menu.request('http://localhost/post-create', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      navigateTo: 'https://reddit.com/comments/t3_created123',
    });
  });

  it('keeps the moderator on the current page after rerolling a challenge', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    rerollAndPublishMock.mockResolvedValue({
      levelId: 'lvl_0200',
      dateKey: '2026-03-08',
      postId: 't3_reroll200',
    });

    const response = await menu.request('http://localhost/mod-reroll', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Rerolled and published lvl_0200',
    });
  });

  it('keeps the moderator on the current page after posting the last generated challenge', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    publishLastGeneratedChallengeMock.mockResolvedValue({
      levelId: 'lvl_0201',
      postId: 't3_post201',
      challengeType: 'QUOTE',
      difficulty: 8,
      alreadyPublished: false,
    });

    const response = await menu.request('http://localhost/mod-post-last-generated', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Posted lvl_0201: QUOTE (8/10)',
    });
  });

  it('keeps the moderator on the current page when the last generated challenge was already posted', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    publishLastGeneratedChallengeMock.mockResolvedValue({
      levelId: 'lvl_0202',
      postId: 't3_post202',
      challengeType: 'QUOTE',
      difficulty: 5,
      alreadyPublished: true,
    });

    const response = await menu.request('http://localhost/mod-post-last-generated', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      showToast: 'lvl_0202 was already posted.',
    });
  });

  it('opens a confirmation form before clearing subreddit game data', async () => {
    hasAdminAccessMock.mockResolvedValue(true);

    const response = await menu.request('http://localhost/mod-clear-subreddit-data', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.showForm.name).toBe('mod_clear_subreddit_data_form');
    expect(body.showForm.form.description).toContain('permanently clears');
    expect(body.showForm.form.fields).toContainEqual(
      expect.objectContaining({
        name: 'confirmation',
        placeholder: 'CLEAR',
      })
    );
  });

  it('opens a difficulty calibration status form with tier breakdowns', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    buildShadowCalibrationPreviewMock.mockResolvedValue({
      readyLevels: 7,
      averageStaticShadowDelta: 0.42,
      maxStaticShadowDelta: 2.1,
      generatedAt: 1,
      tierBreakdown: {
        warmup: { readyLevels: 1, averageDelta: -0.2, suggestEasier: 1, suggestHarder: 0 },
        medium: { readyLevels: 3, averageDelta: 0.7, suggestEasier: 0, suggestHarder: 2 },
        hard: { readyLevels: 2, averageDelta: 1.1, suggestEasier: 0, suggestHarder: 1 },
        expert: { readyLevels: 1, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
      },
      reviewCandidates: [],
    });

    const response = await menu.request('http://localhost/mod-difficulty-calibration', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.showForm.name).toBe('mod_difficulty_calibration_status_form');
    const summaryField = body.showForm.form.fields.find(
      (field: { name: string }) => field.name === 'summary'
    );
    expect(summaryField.defaultValue).toContain('Ready levels: 7');
    expect(summaryField.defaultValue).toContain('Medium: 3 ready, avg +0.7');
    expect(summaryField.defaultValue).toContain('Hard: 2 ready, avg +1.1');
  });
});
