import { afterEach, describe, expect, it, vi } from 'vitest';

const { getModeratorsAllMock, getModeratorsMock, redisMock } = vi.hoisted(() => {
  const all = vi.fn();
  // Default: cache miss (returns null so the live Reddit API is always called)
  const get = vi.fn().mockResolvedValue(null);
  const set = vi.fn().mockResolvedValue(undefined);
  return {
    getModeratorsAllMock: all,
    getModeratorsMock: vi.fn(() => ({
      all,
    })),
    redisMock: { get, set },
  };
});

vi.mock('@devvit/web/server', () => ({
  reddit: {
    getModerators: getModeratorsMock,
  },
  redis: redisMock,
}));

import {
  hasAdminAccess,
  isSubredditModerator,
} from './admin-auth';

afterEach(() => {
  getModeratorsMock.mockClear();
  getModeratorsAllMock.mockReset();
  redisMock.get.mockResolvedValue(null); // reset to cache-miss after each test
  redisMock.set.mockResolvedValue(undefined);
});

describe('admin auth', () => {
  it('does not allow hardcoded placeholder usernames without moderator access', async () => {
    getModeratorsAllMock.mockResolvedValue([]);

    const allowed = await hasAdminAccess({
      subredditName: 'decrypttest_dev',
      username: 'your_reddit_username',
    });
    expect(allowed).toBe(false);
    expect(getModeratorsMock).toHaveBeenCalledTimes(1);
  });

  it('recognizes moderators for subreddit', async () => {
    getModeratorsAllMock.mockResolvedValue([{ username: 'mod_user' }]);

    const isMod = await isSubredditModerator({
      subredditName: 'decrypttest_dev',
      username: 'mod_user',
    });

    expect(isMod).toBe(true);
    expect(getModeratorsMock).toHaveBeenCalledWith({
      subredditName: 'decrypttest_dev',
      username: 'mod_user',
      limit: 1,
    });
  });

  it('denies when neither allowlisted nor moderator', async () => {
    getModeratorsAllMock.mockResolvedValue([]);

    const allowed = await hasAdminAccess({
      subredditName: 'decrypttest_dev',
      username: 'regular_user',
    });

    expect(allowed).toBe(false);
  });

  it('surfaces moderator lookup failures instead of silently denying', async () => {
    getModeratorsAllMock.mockRejectedValue(new Error('reddit timeout'));

    await expect(
      hasAdminAccess({
        subredditName: 'decrypttest_dev',
        username: 'mod_user',
      })
    ).rejects.toThrow('reddit timeout');
  });
});
