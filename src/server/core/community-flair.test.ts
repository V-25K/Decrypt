import { afterEach, describe, expect, it, vi } from 'vitest';

const { setUserFlairMock } = vi.hoisted(() => ({
  setUserFlairMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  reddit: {
    setUserFlair: setUserFlairMock,
  },
}));

import { syncCommunityFlair } from './community-flair';

afterEach(() => {
  setUserFlairMock.mockReset();
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
});
