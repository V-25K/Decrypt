import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameInlineStatusResponse, GamePreviewResponse } from '../shared/game';

const requestExpandedModeMock = vi.fn();
const mountGameMock = vi.fn();

vi.mock('@devvit/web/client', () => ({
  requestExpandedMode: requestExpandedModeMock,
}));

vi.mock('./game', () => ({
  mountGame: mountGameMock,
}));

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for preview render.');
};

const previewFixture = (): GamePreviewResponse => ({
  mode: 'daily',
  levelId: 'lvl_0001',
  previewTitle: 'Can you decrypt this?',
	  puzzle: {
	    levelId: 'lvl_0001',
	    dateKey: '2026-05-22',
	    author: 'UNKNOWN',
	    challengeType: 'BOOK_LINE',
    words: ['HELLO', 'WORLD'],
    difficulty: 4,
    heartsMax: 3,
	    tiles: [
	      {
	        index: 0,
        isLetter: true,
        displayChar: '_',
        cipherNumber: 1,
        isBlind: false,
        isGold: false,
	        isLocked: false,
	      },
	      {
	        index: 1,
	        isLetter: true,
	        displayChar: '_',
	        cipherNumber: null,
	        isBlind: false,
	        isGold: false,
	        isLocked: true,
	        lockChainId: 1,
	        lockRemainingKeys: 2,
	        lockTotalKeys: 2,
	      },
	      {
	        index: 2,
	        isLetter: true,
	        displayChar: '_',
	        cipherNumber: null,
	        isBlind: true,
	        isGold: false,
	        isLocked: false,
	      },
	    ],
	  },
  challengeMetrics: {
    plays: 7,
    wins: 3,
    winRatePct: 43,
  },
  creator: {
    username: 'very_long_creator_name_that_should_fit',
    avatarUrl: 'https://example.com/avatar.png',
  },
});

const mockFetchSequence = (
  status: GameInlineStatusResponse,
  preview?: GamePreviewResponse
) => {
  const responses = [status, ...(preview ? [preview] : [])];
  globalThis.fetch = vi.fn(async () => {
    const response = responses.shift();
    return new Response(JSON.stringify(response));
  });
};

describe('preview entrypoint', () => {
	  beforeEach(() => {
	    vi.resetModules();
	    requestExpandedModeMock.mockReset();
	    mountGameMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
	    document.body.innerHTML = '<div id="root"></div>';
	  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading glass while the preview request is pending', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    await import('./preview');

    expect(document.querySelector<HTMLImageElement>('[data-testid="loading-glass"]')?.src).toContain(
      '/loading_glass.png'
    );
  });

	  it('renders the puzzle preview for incomplete challenges', async () => {
	    mockFetchSequence({
	      levelId: 'lvl_0001',
      completed: false,
    }, previewFixture());

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.body.textContent ?? '').toContain('Play');
    expect(document.body.textContent ?? '').toContain('Can you decrypt this?');
    expect(document.body.textContent ?? '').toContain('Plays: 7');
    expect(document.body.textContent ?? '').toContain('Book lines (Medium)');
    expect(document.body.textContent ?? '').not.toContain('Book line lines');
    expect(document.body.textContent ?? '').toContain('Win: 43%');
    expect(document.querySelector('.preview-meta-inner')).toBeTruthy();
    expect(document.querySelector('.preview-title')).toBeTruthy();
	    expect(document.querySelector('.preview-creator-avatar')).toBeTruthy();
	    expect(document.querySelector<HTMLImageElement>('.preview-lock-sprite')?.src).toContain(
	      '/ui_lock.png'
	    );
	    expect(document.querySelector('.preview-lock-dot')).toBeNull();
	    expect(document.querySelector('.preview-tile-locked .preview-tile-rule-hidden')).toBeTruthy();
	    expect(document.querySelector<HTMLImageElement>('.preview-question-sprite')?.src).toContain(
	      '/ui_question.png'
	    );
    expect(document.querySelector('.preview-creator-name')?.textContent ?? '').toContain(
      'very_long_creator_name_that_should_fit'
    );
    expect(document.querySelector<HTMLElement>('.preview-shell')?.style.getPropertyValue(
      '--preview-background-image'
    )).toContain('/backgrounds/img');
    expect(document.querySelector('[data-testid="inline-powerup-grid"]')).toBeNull();
    expect(document.querySelector('[data-testid="inline-bundle-card"]')).toBeNull();
    expect(document.querySelector('.preview-shell')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('Challenge Completed');
    expect(mountGameMock).not.toHaveBeenCalled();
  });

  it('positions apostrophe punctuation at the top of the preview line', async () => {
    const preview = previewFixture();
    mockFetchSequence(
      {
        levelId: 'lvl_0001',
        completed: false,
      },
      {
        ...preview,
        puzzle: {
          ...preview.puzzle,
          words: ["IT'S"],
          tiles: [
            {
              index: 0,
              isLetter: true,
              displayChar: '_',
              cipherNumber: 1,
              isBlind: false,
              isGold: false,
              isLocked: false,
            },
            {
              index: 1,
              isLetter: true,
              displayChar: '_',
              cipherNumber: 2,
              isBlind: false,
              isGold: false,
              isLocked: false,
            },
            {
              index: 2,
              isLetter: false,
              displayChar: "'",
              cipherNumber: null,
              isBlind: false,
              isGold: false,
              isLocked: false,
            },
            {
              index: 3,
              isLetter: true,
              displayChar: '_',
              cipherNumber: 3,
              isBlind: false,
              isGold: false,
              isLocked: false,
            },
          ],
        },
      }
    );

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.querySelector('.preview-punctuation-tile')).toBeTruthy();
    expect(document.querySelector('.preview-punctuation-top')?.textContent).toBe("'");
    expect(document.querySelector('.preview-punctuation-bottom')).toBeNull();
  });

  it('renders creator text without an avatar when the creator has no snoovatar', async () => {
    const preview = previewFixture();
    mockFetchSequence(
      {
        levelId: 'lvl_0001',
        completed: false,
      },
      {
        ...preview,
        creator: {
          username: 'creator_without_avatar',
          avatarUrl: null,
        },
      }
    );

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.querySelector('.preview-creator')).toBeTruthy();
    expect(document.querySelector('.preview-creator-no-avatar')).toBeTruthy();
    expect(document.querySelector('.preview-creator-avatar')).toBeNull();
    expect(document.body.textContent ?? '').toContain('- Created by');
    expect(document.querySelector('.preview-creator-name')?.textContent ?? '').toContain(
      'creator_without_avatar'
    );
  });

  it('does not render creator chrome for generated daily previews without a creator', async () => {
    const preview = previewFixture();
    mockFetchSequence(
      {
        levelId: 'lvl_0001',
        completed: false,
      },
      {
        ...preview,
        creator: {
          username: null,
          avatarUrl: null,
        },
      }
    );

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.querySelector('.preview-creator')).toBeNull();
    expect(document.querySelector('.preview-creator-avatar')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Created by');
    expect(document.body.textContent ?? '').not.toContain('Decrypt');
  });

	  it('mounts the real game result path for completed challenges', async () => {
	    mockFetchSequence({
	      levelId: 'lvl_0001',
	      completed: true,
	    });

    await import('./preview');

    await waitFor(() => mountGameMock.mock.calls.length > 0);
    expect(mountGameMock).toHaveBeenCalledWith(document.getElementById('root'));
	    expect(document.getElementById('root')?.getAttribute('data-initial-screen')).toBe('challenge');
	    expect(document.querySelector('.preview-puzzle-mask')).toBeNull();
	  });

	  it('mounts the real game result path for failed challenges', async () => {
    mockFetchSequence({
      levelId: 'lvl_0001',
      completed: false,
      failed: true,
    });

    await import('./preview');

    await waitFor(() => mountGameMock.mock.calls.length > 0);
    expect(mountGameMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(document.getElementById('root')?.getAttribute('data-initial-screen')).toBe('challenge');
	    expect(document.querySelector('.preview-puzzle-mask')).toBeNull();
	  });

  it('renders a removed challenge card with a next challenge CTA', async () => {
    mockFetchSequence({
      levelId: 'lvl_removed',
      completed: false,
      failed: false,
      removed: true,
    });

    await import('./preview');

    await waitFor(() => (document.body.textContent ?? '').includes('Cipher removed'));
    expect(document.body.textContent ?? '').toContain(
      'This challenge left the game, but there is another one ready.'
    );
    expect(document.body.textContent ?? '').toContain('Next challenge');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    document
      .querySelector<HTMLButtonElement>('.preview-removed')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => requestExpandedModeMock.mock.calls.length > 0);
    expect(requestExpandedModeMock).toHaveBeenCalled();
    expect(localStorage.getItem('decrypt-expanded-screen-intent') ?? '').toContain(
      '"screen":"challenge"'
    );
    expect(
      localStorage.getItem('decrypt-expanded-challenge-mode-intent') ?? ''
    ).toContain('"excludeLevelId":"lvl_removed"');
    expect(
      localStorage.getItem('decrypt-expanded-challenge-mode-intent') ?? ''
    ).toContain('"ignorePostLevel":true');
  });
});
