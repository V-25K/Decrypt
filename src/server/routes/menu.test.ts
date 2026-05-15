import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  contextMock,
  clearSubredditGameDataMock,
  createPostMock,
  formatModeratorRerollErrorMock,
  hasAdminAccessMock,
  publishLastGeneratedChallengeMock,
  rerollAndPublishMock,
} = vi.hoisted(() => ({
  contextMock: {
    subredditName: 'decrypttest',
    username: 'mod_user',
  },
  clearSubredditGameDataMock: vi.fn(),
  createPostMock: vi.fn(),
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

vi.mock('../core/playtest-reset', () => ({
  clearSubredditGameData: clearSubredditGameDataMock,
}));

vi.mock('../core/admin', () => ({
  formatModeratorRerollError: formatModeratorRerollErrorMock,
  publishLastGeneratedChallenge: publishLastGeneratedChallengeMock,
  rerollAndPublish: rerollAndPublishMock,
}));

vi.mock('../core/admin-auth', () => ({
  hasAdminAccess: hasAdminAccessMock,
}));

import { menu } from './menu';

afterEach(() => {
  contextMock.subredditName = 'decrypttest';
  contextMock.username = 'mod_user';
  clearSubredditGameDataMock.mockReset();
  createPostMock.mockReset();
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

  it('clears subreddit game data from the moderator menu', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    clearSubredditGameDataMock.mockResolvedValue({
      knownUsers: 2,
      sessions: 1,
      deletedKeys: 19,
    });

    const response = await menu.request('http://localhost/mod-clear-subreddit-data', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(clearSubredditGameDataMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      showToast: 'Cleared subreddit game data for 2 player(s), 1 session(s), and 19 key(s).',
    });
  });
});
