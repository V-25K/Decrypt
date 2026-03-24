import { afterEach, describe, expect, it, vi } from 'vitest';

const { getModeratorsAllMock, getModeratorsMock } = vi.hoisted(() => {
  const all = vi.fn();
  return {
    getModeratorsAllMock: all,
    getModeratorsMock: vi.fn(() => ({
      all,
    })),
  };
});

vi.mock('@devvit/web/server', () => ({
  reddit: {
    getModerators: getModeratorsMock,
  },
}));

import {
  hasAdminAccess,
  isAllowlistedAdmin,
  isSubredditModerator,
} from './admin-auth';

afterEach(() => {
  getModeratorsMock.mockClear();
  getModeratorsAllMock.mockReset();
});

describe('admin auth', () => {
  it('allows configured allowlist usernames', async () => {
    const allowed = await hasAdminAccess({
      subredditName: 'decrypttest_dev',
      username: 'your_reddit_username',
    });
    expect(allowed).toBe(true);
    expect(isAllowlistedAdmin('YOUR_REDDIT_USERNAME')).toBe(true);
    expect(getModeratorsMock).not.toHaveBeenCalled();
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
});

