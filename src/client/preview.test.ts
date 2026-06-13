import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import previewHtmlRaw from './preview.html?raw';
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

const elementSignature = (element: Element): string => {
  const attrs = ['data-testid', 'aria-busy']
    .map((name) => `${name}=${element.getAttribute(name) ?? ''}`)
    .join(' ');
  const children = Array.from(element.children).map(elementSignature);
  return `${element.tagName}.${element.className}[${attrs}](${children.join(',')})`;
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

  it('shows the branded skeleton while the preview request is pending', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    await import('./preview');

    expect(document.querySelector('[data-testid="preview-skeleton"]')).toBeTruthy();
    expect(document.querySelectorAll('.preview-skeleton-tile').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-testid="loading-glass"]')).toBeNull();
  });

  it('keeps the static preview.html skeleton in sync with the JS-rendered one', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    await import('./preview');

    const rendered = document.querySelector('#root [data-testid="preview-skeleton"]');
    const staticDocument = new DOMParser().parseFromString(previewHtmlRaw, 'text/html');
    const staticSkeleton = staticDocument.querySelector(
      '#root [data-testid="preview-skeleton"]'
    );
    if (!rendered || !staticSkeleton) {
      throw new Error('Skeleton missing from the rendered DOM or the static preview.html.');
    }
    expect(elementSignature(staticSkeleton)).toBe(elementSignature(rendered));
  });

	  it('renders the puzzle preview for incomplete challenges', async () => {
	    mockFetchSequence({
	      levelId: 'lvl_0001',
      completed: false,
    }, previewFixture());

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.querySelector('[data-testid="preview-skeleton"]')).toBeNull();
    expect(document.querySelector('.preview-cta')?.textContent).toBe('Play');
    expect(document.querySelector('.preview-cta img')).toBeNull();
    expect(document.querySelector('.preview-tap-hint')).toBeNull();
    expect(document.querySelector('.preview-eyebrow')).toBeNull();
    expect(document.body.textContent ?? '').toContain('Can you decrypt this?');
    expect(document.querySelector('.preview-stats')).toBeTruthy();
    expect(document.querySelector('.preview-stat-plays')?.textContent).toBe('7 plays');
    expect(document.querySelector('.preview-stat-win')?.textContent).toBe('43% solved');
    const difficulty = document.querySelector('.preview-stat-difficulty');
    expect(difficulty?.textContent).toBe('Medium');
    expect(difficulty?.classList.contains('preview-difficulty-medium')).toBe(true);
    expect(document.querySelector('.preview-stat-daily')).toBeNull();
    expect(document.querySelector('.preview-shimmer')).toBeTruthy();
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
    expect(document.querySelector('.preview-creator-label')?.textContent).toBe('by');
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
    expect(document.querySelector('.preview-creator-label')).toBeNull();
    // No "Daily #N" label anywhere — the stats line is just the metrics.
    expect(document.querySelector('.preview-stat-daily')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Daily #');
  });

  it('labels and tints the difficulty per tier band', async () => {
    const tierCases = [
      { difficulty: 2, tone: 'easy', label: 'Easy' },
      { difficulty: 7, tone: 'hard', label: 'Hard' },
      { difficulty: 9, tone: 'expert', label: 'Expert' },
    ];
    for (const tierCase of tierCases) {
      vi.resetModules();
      document.body.innerHTML = '<div id="root"></div>';
      const preview = previewFixture();
      mockFetchSequence(
        {
          levelId: 'lvl_0001',
          completed: false,
        },
        {
          ...preview,
          puzzle: { ...preview.puzzle, difficulty: tierCase.difficulty },
        }
      );

      await import('./preview');

      await waitFor(() => Boolean(document.querySelector('.preview-stat-difficulty')));
      const difficulty = document.querySelector('.preview-stat-difficulty');
      expect(difficulty?.textContent).toBe(tierCase.label);
      expect(difficulty?.classList.contains(`preview-difficulty-${tierCase.tone}`)).toBe(
        true
      );
    }
  });

  it('applies the minimal theme when the player prefers it', async () => {
    localStorage.setItem('decrypt-theme-preference-v1', 'minimal');
    mockFetchSequence({ levelId: 'lvl_0001', completed: false }, previewFixture());

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.body.classList.contains('preview-minimal')).toBe(true);
    expect(document.querySelector('.preview-shell')).toBeTruthy();
  });

  it('keeps the photo theme when no minimal preference is stored', async () => {
    mockFetchSequence({ levelId: 'lvl_0001', completed: false }, previewFixture());

    await import('./preview');

    await waitFor(() => Boolean(document.querySelector('.preview-puzzle-mask')));
    expect(document.body.classList.contains('preview-minimal')).toBe(false);
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
