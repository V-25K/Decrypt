import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const viewerQuery = vi.fn();
const previewQuery = vi.fn();
const navigateToMock = vi.fn();

vi.mock('../trpc', () => ({
  trpc: {
    game: {
      viewer: { query: viewerQuery },
      preview: { query: previewQuery },
    },
  },
}));

vi.mock('@devvit/web/client', () => ({
  navigateTo: navigateToMock,
  showToast: vi.fn(),
}));

// Stub the heavy game so this test only exercises GameRoot's gating decision:
// if it renders, the viewer was treated as logged-in.
vi.mock('./GameApp', () => ({
  GameApp: () => React.createElement('div', { 'data-testid': 'game-app' }),
}));

let container: HTMLDivElement;
let root: Root;

const previewFixture = () => ({
  mode: 'daily' as const,
  levelId: 'lvl_0001',
  previewTitle: 'Can you decrypt this?',
  puzzle: {
    levelId: 'lvl_0001',
    dateKey: '2026-02-24',
    author: 'UNKNOWN',
    challengeType: 'QUOTE' as const,
    words: ['HI'],
    difficulty: 5,
    heartsMax: 3,
    tiles: [
      { index: 0, isLetter: true, displayChar: '_', cipherNumber: 1, isBlind: false, isGold: false, isLocked: false },
      { index: 1, isLetter: true, displayChar: '_', cipherNumber: 2, isBlind: false, isGold: false, isLocked: false },
    ],
  },
  challengeMetrics: { plays: 42, wins: 21, winRatePct: 50 },
  communityVotes: null,
  creator: { username: null, avatarUrl: null },
});

const flushAsync = async () => {
  for (let index = 0; index < 25; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const renderRoot = async () => {
  const { GameRoot } = await import('./GameRoot');
  await act(async () => {
    root.render(React.createElement(GameRoot));
  });
  await flushAsync();
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  viewerQuery.mockReset();
  previewQuery.mockReset();
  navigateToMock.mockReset();
  vi.resetModules();
});

describe('GameRoot login gating', () => {
  it('shows the read-only logged-out screen (not the game) for logged-out visitors', async () => {
    viewerQuery.mockResolvedValue({ isLoggedIn: false });
    previewQuery.mockResolvedValue(previewFixture());

    await renderRoot();

    expect(container.querySelector('[data-testid="logged-out-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="game-app"]')).toBeNull();
    expect(container.textContent).toContain('Log in to play');
    expect(container.textContent).toContain('42 plays');
  });

  it('sends logged-out visitors to Reddit login when the CTA is tapped', async () => {
    viewerQuery.mockResolvedValue({ isLoggedIn: false });
    previewQuery.mockResolvedValue(previewFixture());

    await renderRoot();

    const button = container.querySelector(
      '[data-testid="logged-out-login"]'
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(navigateToMock).toHaveBeenCalledWith('https://www.reddit.com/login/');
  });

  it('mounts the full game for logged-in visitors', async () => {
    viewerQuery.mockResolvedValue({ isLoggedIn: true });

    await renderRoot();

    expect(container.querySelector('[data-testid="game-app"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="logged-out-screen"]')).toBeNull();
    expect(previewQuery).not.toHaveBeenCalled();
  });

  it('fails open to the full game when the viewer probe rejects', async () => {
    viewerQuery.mockRejectedValue(new Error('network down'));

    await renderRoot();

    expect(container.querySelector('[data-testid="game-app"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="logged-out-screen"]')).toBeNull();
  });
});
