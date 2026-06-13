import { afterEach, describe, expect, it, vi } from 'vitest';

const { setUserFlairMock, redisGetMock, redisSetMock } = vi.hoisted(() => ({
  setUserFlairMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  reddit: {
    setUserFlair: setUserFlairMock,
  },
  redis: {
    get: redisGetMock,
    set: redisSetMock,
  },
}));

import { buildUserFlairText, syncCommunityFlair } from './community-flair';

afterEach(() => {
  setUserFlairMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
});

describe('syncCommunityFlair', () => {
  it('syncs equipped flairs to the subreddit user flair', async () => {
    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: 'Quick Reader',
    });

    expect(setUserFlairMock).toHaveBeenCalledWith({
      subredditName: 'decrypttest',
      username: 'tester',
      text: 'Quick Reader',
      backgroundColor: '#8ecdf8',
      textColor: 'dark',
    });
  });

  it('uses different colors for different flair families', async () => {
    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: 'Front Runner',
    });

    expect(setUserFlairMock).toHaveBeenLastCalledWith({
      subredditName: 'decrypttest',
      username: 'tester',
      text: 'Front Runner',
      backgroundColor: '#f48aa4',
      textColor: 'dark',
    });
  });

  it('clears subreddit flair styling when no flair is equipped', async () => {
    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: '',
    });

    expect(setUserFlairMock).toHaveBeenCalledWith({
      subredditName: 'decrypttest',
      username: 'tester',
      text: '',
      backgroundColor: 'transparent',
      textColor: 'dark',
    });
  });

  it('appends the global rank after the equipped flair', async () => {
    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: 'Living Legend',
      globalRank: 42,
    });

    expect(setUserFlairMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Living Legend · #42' })
    );
  });

  it('shows just the rank when no flair is equipped', async () => {
    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: '',
      globalRank: 7,
    });

    expect(setUserFlairMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: '#7' })
    );
  });

  it('skips the Reddit call when the cached flair text is unchanged', async () => {
    redisGetMock.mockResolvedValue('Living Legend · #42');

    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: 'Living Legend',
      globalRank: 42,
      userId: 't2_player',
    });

    expect(setUserFlairMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
  });

  it('writes and caches the flair text when it changes', async () => {
    redisGetMock.mockResolvedValue('Living Legend · #99');

    await syncCommunityFlair({
      subredditName: 'decrypttest',
      username: 'tester',
      flair: 'Living Legend',
      globalRank: 42,
      userId: 't2_player',
    });

    expect(setUserFlairMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Living Legend · #42' })
    );
    expect(redisSetMock).toHaveBeenCalledWith(
      'decrypt:user:t2_player:flair_text',
      'Living Legend · #42'
    );
  });
});

describe('buildUserFlairText', () => {
  it('joins flair and rank, or falls back to whichever is present', () => {
    expect(buildUserFlairText('Living Legend', 42)).toBe('Living Legend · #42');
    expect(buildUserFlairText('Living Legend', null)).toBe('Living Legend');
    expect(buildUserFlairText('', 7)).toBe('#7');
    expect(buildUserFlairText('', null)).toBe('');
    expect(buildUserFlairText('Living Legend', 0)).toBe('Living Legend');
  });
});
