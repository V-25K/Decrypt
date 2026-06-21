import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getLevelIdForPostMock, purgeCommunityChallengeByLevelMock } = vi.hoisted(() => ({
  getLevelIdForPostMock: vi.fn(),
  purgeCommunityChallengeByLevelMock: vi.fn(),
}));

vi.mock('../core/puzzle-store', () => ({
  getLevelIdForPost: getLevelIdForPostMock,
}));
vi.mock('../core/community', () => ({
  purgeCommunityChallengeByLevel: purgeCommunityChallengeByLevelMock,
}));

import { triggers } from './triggers';

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  getLevelIdForPostMock.mockReset();
  purgeCommunityChallengeByLevelMock.mockReset();
});

describe('triggers route', () => {
  it('acknowledges app install without scheduling deprecated staging jobs', async () => {
    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message: 'AppInstall received; daily automation runs at 00:00 UTC.',
    });
  });

  it('acknowledges app upgrade without scheduling deprecated staging jobs', async () => {
    const response = await triggers.request('http://localhost/on-app-upgrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppUpgrade' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message: 'AppUpgrade received; daily automation runs at 00:00 UTC.',
    });
  });

  it('purges a community challenge when its post is deleted', async () => {
    getLevelIdForPostMock.mockResolvedValue('lvl_0042');
    purgeCommunityChallengeByLevelMock.mockResolvedValue({ purged: true });

    const response = await triggers.request('http://localhost/on-post-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'PostDelete', postId: 't3_post42' }),
    });

    expect(response.status).toBe(200);
    expect(getLevelIdForPostMock).toHaveBeenCalledWith('t3_post42');
    expect(purgeCommunityChallengeByLevelMock).toHaveBeenCalledWith({
      levelId: 'lvl_0042',
      postId: 't3_post42',
    });
  });

  it('does not purge when the deleted post maps to no level', async () => {
    getLevelIdForPostMock.mockResolvedValue(null);

    const response = await triggers.request('http://localhost/on-post-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'PostDelete', postId: 't3_unknown' }),
    });

    expect(response.status).toBe(200);
    expect(purgeCommunityChallengeByLevelMock).not.toHaveBeenCalled();
  });

  it('acknowledges comment deletions (no stored comment content)', async () => {
    const response = await triggers.request('http://localhost/on-comment-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CommentDelete', commentId: 't1_c1' }),
    });

    expect(response.status).toBe(200);
  });
});
