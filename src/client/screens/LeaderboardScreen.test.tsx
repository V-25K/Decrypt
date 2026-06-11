import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardScreen } from './LeaderboardScreen';

const { getDailyPageQuery, getGlobalPageQuery } = vi.hoisted(() => ({
  getDailyPageQuery: vi.fn(),
  getGlobalPageQuery: vi.fn(),
}));

vi.mock('../trpc', () => ({
  trpc: {
    leaderboard: {
      getDailyPage: {
        query: getDailyPageQuery,
      },
      getGlobalPage: {
        query: getGlobalPageQuery,
      },
    },
  },
}));

const dailyPageOne = {
  entries: [
    {
      userId: 't2_alpha',
      username: 'alpha',
      score: 420,
      solveSeconds: 45,
      snoovatarUrl: null,
    },
  ],
  hasNextPage: true,
  hasPreviousPage: false,
  totalCount: 120,
  pageInfo: {
    currentPage: 1,
    pageSize: 50,
    totalPages: 3,
  },
};

const dailyPageTwo = {
  ...dailyPageOne,
  hasPreviousPage: true,
  pageInfo: {
    currentPage: 2,
    pageSize: 50,
    totalPages: 3,
  },
};

const allTimePageOne = {
  entries: [
	    {
	      userId: 't2_bravo',
	      username: 'bravo',
	      score: 712,
	      rating: 712,
	      globalScore: 2400,
	      challengesCompleted: 12,
	      snoovatarUrl: null,
	    },
  ],
  hasNextPage: true,
  hasPreviousPage: false,
  totalCount: 151,
  pageInfo: {
    currentPage: 1,
    pageSize: 50,
    totalPages: 4,
  },
};

const allTimeLastPage = {
  ...allTimePageOne,
  hasNextPage: false,
  hasPreviousPage: true,
  pageInfo: {
    currentPage: 4,
    pageSize: 50,
    totalPages: 4,
  },
};

let container: HTMLDivElement;
let root: Root;

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const renderLeaderboard = async (
  props: Partial<Parameters<typeof LeaderboardScreen>[0]> = {}
) => {
  const defaultProps = {
    leaderboardTab: 'daily' as const,
    onTabChange: vi.fn(),
    currentUserRank: null,
    currentUserId: null,
    formatLeaderboardName: vi.fn(({ username, userId }) => username ?? userId),
    formatStatDuration: vi.fn((seconds) => `${seconds ?? '--'}s`),
  };
  const mergedProps = {
    ...defaultProps,
    ...props,
  };

  await act(async () => {
    root.render(<LeaderboardScreen {...mergedProps} />);
  });

  return mergedProps;
};

const getButton = (label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  getDailyPageQuery.mockReset();
  getGlobalPageQuery.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('LeaderboardScreen', () => {
  it('loads daily pages through the parameterized page query', async () => {
    getDailyPageQuery.mockResolvedValueOnce(dailyPageOne).mockResolvedValueOnce(dailyPageTwo);
    const { formatLeaderboardName } = await renderLeaderboard();

    await waitFor(() => getDailyPageQuery.mock.calls.length === 1);

    expect(getDailyPageQuery).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 50 });
    expect(formatLeaderboardName).toHaveBeenCalledTimes(dailyPageOne.entries.length);

    await act(async () => {
      getButton('Next').click();
      await Promise.resolve();
    });

    await waitFor(() => getDailyPageQuery.mock.calls.length === 2);

    expect(getDailyPageQuery).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 50 });
    expect(getGlobalPageQuery).not.toHaveBeenCalled();
  });

  it('loads the global last page through getGlobalPage', async () => {
    getGlobalPageQuery
      .mockResolvedValueOnce(allTimePageOne)
      .mockResolvedValueOnce(allTimeLastPage);

    await renderLeaderboard({
      leaderboardTab: 'global',
    });

    await waitFor(() => getGlobalPageQuery.mock.calls.length === 1);

    await act(async () => {
      getButton('Last').click();
      await Promise.resolve();
    });

    await waitFor(() => getGlobalPageQuery.mock.calls.length === 2);

	    expect(getGlobalPageQuery).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 50 });
	    expect(getGlobalPageQuery).toHaveBeenNthCalledWith(2, { page: 4, pageSize: 50 });
	    expect(getDailyPageQuery).not.toHaveBeenCalled();
	    expect(container.textContent ?? '').toContain('Total Points');
	    expect(container.textContent ?? '').toContain('2,400');
	  });
});
