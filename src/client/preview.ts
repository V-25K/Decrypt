import './preview.css';

import { requestExpandedMode } from '@devvit/web/client';
import {
  getChallengeBackgroundAsset,
  getStableChallengeBackgroundIndex,
} from './app/challenge-backgrounds';
import {
  readThemePreference,
  setExpandedChallengeModeIntent,
  setExpandedScreenIntent,
} from './app/game-storage';
import type {
  GameInlineStatusResponse,
  GamePreviewResponse,
  PuzzlePublic,
  PuzzlePublicTile,
} from '../shared/game';

const previewMaxWordsPerLine = 7;
const fallbackPreviewTitle = 'Can you decrypt this?';

type PreviewCreator = GamePreviewResponse['creator'];

type PreviewRenderToken =
  | {
    type: 'word';
    key: string;
    tiles: PuzzlePublicTile[];
  }
  | {
    type: 'separator';
    key: string;
    tile: PuzzlePublicTile;
  };

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
};

type PreviewDifficultyView = {
  label: string;
  tone: 'easy' | 'medium' | 'hard' | 'expert';
};

const getPreviewDifficultyView = (value: number | undefined): PreviewDifficultyView => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { label: 'Medium', tone: 'medium' };
  }
  if (value <= 3) {
    return { label: 'Easy', tone: 'easy' };
  }
  if (value <= 5) {
    return { label: 'Medium', tone: 'medium' };
  }
  if (value <= 8) {
    return { label: 'Hard', tone: 'hard' };
  }
  return { label: 'Expert', tone: 'expert' };
};

const openExpandedGame = async (event: MouseEvent): Promise<void> => {
  try {
    await requestExpandedMode(event, 'game');
  } catch (error) {
    console.error('Failed to enter expanded mode:', error);
  }
};

const openNextChallenge = async (
  event: MouseEvent,
  removedLevelId: string | null
): Promise<void> => {
  setExpandedScreenIntent('challenge');
  setExpandedChallengeModeIntent(
    'daily',
    null,
    'random',
    false,
    removedLevelId,
    true
  );
  await openExpandedGame(event);
};

const wireExpandedMode = (button: HTMLButtonElement): void => {
  button.addEventListener('click', (event) => {
    void openExpandedGame(event);
  });
};

const trimLineEdges = (line: PreviewRenderToken[]): PreviewRenderToken[] => {
  let start = 0;
  let end = line.length;

  while (start < end) {
    const token = line[start];
    if (token?.type === 'separator' && token.tile.displayChar === ' ') {
      start += 1;
      continue;
    }
    break;
  }

  while (end > start) {
    const token = line[end - 1];
    if (token?.type === 'separator' && token.tile.displayChar === ' ') {
      end -= 1;
      continue;
    }
    break;
  }

  return line.slice(start, end);
};

const tokenizeTiles = (tiles: PuzzlePublicTile[]): PreviewRenderToken[] => {
  const tokens: PreviewRenderToken[] = [];
  let current: PuzzlePublicTile[] = [];
  let wordIndex = 0;
  let separatorIndex = 0;

  const pushWord = () => {
    if (current.length === 0) {
      return;
    }
    tokens.push({
      type: 'word',
      key: `word-${wordIndex}`,
      tiles: current,
    });
    wordIndex += 1;
    current = [];
  };

  for (const tile of tiles) {
    if (!tile.isLetter) {
      pushWord();
      tokens.push({
        type: 'separator',
        key: `separator-${separatorIndex}`,
        tile,
      });
      separatorIndex += 1;
      continue;
    }
    current.push(tile);
  }

  pushWord();
  return tokens;
};

const chunkTokensByWordLimit = (
  tokens: PreviewRenderToken[],
  maxWordsPerLine: number
): PreviewRenderToken[][] => {
  if (tokens.length === 0 || maxWordsPerLine < 1) {
    return [tokens];
  }

  const lines: PreviewRenderToken[][] = [[]];
  let wordsInLine = 0;

  for (const token of tokens) {
    let currentLine = lines[lines.length - 1];
    if (!currentLine) {
      currentLine = [];
      lines.push(currentLine);
    }

    if (token.type === 'word') {
      if (wordsInLine >= maxWordsPerLine && currentLine.length > 0) {
        currentLine = trimLineEdges(currentLine);
        lines[lines.length - 1] = currentLine;
        currentLine = [];
        lines.push(currentLine);
        wordsInLine = 0;
      }
      currentLine.push(token);
      wordsInLine += 1;
      continue;
    }

    if (currentLine.length === 0 && token.tile.displayChar === ' ') {
      continue;
    }
    currentLine.push(token);
  }

  const cleaned = lines.map((line) => trimLineEdges(line)).filter((line) => line.length > 0);
  if (cleaned.length === 0) {
    return [tokens];
  }
  return cleaned;
};

const renderSeparator = (token: PreviewRenderToken): HTMLElement => {
  if (token.type !== 'separator') {
    return createElement('span');
  }
  if (token.tile.displayChar === ' ') {
    return createElement('span', 'preview-space');
  }
  const wrapper = createElement('span', 'preview-punctuation-tile');
  const mark = createElement('span', 'preview-punctuation', token.tile.displayChar);
  if (["'", '\u2019', '`', '"'].includes(token.tile.displayChar)) {
    mark.classList.add('preview-punctuation-top');
  } else if (['.', ',', '?', '!', ';', ':'].includes(token.tile.displayChar)) {
    mark.classList.add('preview-punctuation-bottom');
  } else {
    mark.classList.add('preview-punctuation-middle');
  }
  wrapper.append(mark);
  return wrapper;
};

const renderTile = (tile: PuzzlePublicTile): HTMLElement => {
  const tileElement = createElement(
    'span',
    [
      'preview-tile',
      tile.isLocked ? 'preview-tile-locked' : '',
      tile.isBlind ? 'preview-tile-blind' : '',
    ]
      .filter((className) => className.length > 0)
      .join(' ')
  );
  if (tile.isLocked) {
    const lockStack = createElement('span', 'preview-lock-stack');
    const lockIcon = createElement('img', 'preview-lock-sprite');
    lockIcon.src = '/ui_lock.png';
    lockIcon.alt = '';
    lockIcon.loading = 'eager';
    lockStack.append(lockIcon);
    tileElement.append(lockStack);
  }
  const mark = createElement(
    'span',
    'preview-tile-mark',
    tile.isLocked || tile.displayChar === '_' ? ' ' : tile.displayChar
  );
  const rule = createElement(
    'span',
    tile.isLocked ? 'preview-tile-rule preview-tile-rule-hidden' : 'preview-tile-rule'
  );
  const cipher = createElement('span', 'preview-tile-cipher');
  if (tile.isLocked) {
    cipher.textContent = ' ';
  } else if (tile.isBlind) {
    const questionIcon = createElement('img', 'preview-question-sprite');
    questionIcon.src = '/ui_question.png';
    questionIcon.alt = '';
    questionIcon.loading = 'eager';
    cipher.append(questionIcon);
  } else {
    cipher.textContent = tile.cipherNumber ? `${tile.cipherNumber}` : ' ';
  }

  tileElement.append(mark, rule, cipher);
  return tileElement;
};

const renderWord = (token: PreviewRenderToken): HTMLElement => {
  const word = createElement('span', 'preview-word');
  if (token.type !== 'word') {
    return word;
  }
  for (const tile of token.tiles) {
    word.append(renderTile(tile));
  }
  return word;
};

const renderPuzzle = (puzzle: PuzzlePublic): HTMLElement => {
  const mask = createElement('div', 'preview-puzzle-mask');
  const puzzleElement = createElement('div', 'preview-puzzle');
  const tokens = tokenizeTiles(puzzle.tiles);
  const lines = chunkTokensByWordLimit(tokens, previewMaxWordsPerLine);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) {
      continue;
    }
    const lineElement = createElement('div', 'preview-line');
    for (const token of line) {
      lineElement.append(token.type === 'word' ? renderWord(token) : renderSeparator(token));
    }
    puzzleElement.append(lineElement);
  }

  mask.append(puzzleElement);
  // A real element, not a mask pseudo: ::after is taken by the overflow "..."
  // indicator. Hidden entirely under prefers-reduced-motion (preview.css).
  const shimmer = createElement('span', 'preview-shimmer');
  shimmer.setAttribute('aria-hidden', 'true');
  mask.append(shimmer);
  return mask;
};

const updatePuzzleOverflowState = (mask: HTMLElement): void => {
  mask.classList.remove('preview-puzzle-overflow');
  const content = mask.firstElementChild;
  if (!(content instanceof HTMLElement)) {
    return;
  }
  const maskBox = mask.getBoundingClientRect();
  const contentBox = content.getBoundingClientRect();
  const overflows = contentBox.bottom > maskBox.bottom + 2;
  mask.classList.toggle('preview-puzzle-overflow', overflows);
};

const watchPuzzleOverflow = (mask: HTMLElement): void => {
  window.requestAnimationFrame(() => updatePuzzleOverflowState(mask));
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(() => updatePuzzleOverflowState(mask));
  }, {
    passive: true,
  });
};

const renderTitleRow = (titleText = fallbackPreviewTitle): HTMLElement => {
  const header = createElement('header', 'preview-top-row');
  header.append(createElement('div', 'preview-title', titleText || fallbackPreviewTitle));
  return header;
};

// One quiet line of facts — no containers, no icons. Separators are drawn
// by CSS so the text content stays clean for accessibility and tests.
const renderStatsLine = (preview: GamePreviewResponse): HTMLElement => {
  const stats = createElement('div', 'preview-stats');
  const difficultyView = getPreviewDifficultyView(preview.puzzle.difficulty);
  stats.append(
    createElement(
      'span',
      'preview-stat-plays',
      `${preview.challengeMetrics.plays.toLocaleString()} plays`
    ),
    createElement(
      'span',
      'preview-stat-win',
      `${preview.challengeMetrics.winRatePct}% solved`
    ),
    createElement(
      'span',
      `preview-stat-difficulty preview-difficulty-${difficultyView.tone}`,
      difficultyView.label
    )
  );
  return stats;
};

const renderFooter = (creator?: PreviewCreator, ctaLabel = 'Play'): HTMLElement => {
  const footer = createElement('div', 'preview-footer');
  footer.append(createElement('span', 'preview-cta', ctaLabel));
  if (creator?.username) {
    const username = creator.username;
    const creatorElement = createElement('span', 'preview-creator');
    if (creator.avatarUrl) {
      const avatar = createElement('span', 'preview-creator-avatar');
      const image = createElement('img', 'preview-creator-image');
      image.src = creator.avatarUrl;
      image.alt = username;
      avatar.append(image);
      creatorElement.append(avatar);
    } else {
      creatorElement.classList.add('preview-creator-no-avatar');
    }
    const creatorText = createElement('span', 'preview-creator-text');
    creatorText.append(
      createElement('span', 'preview-creator-label', 'by'),
      createElement('span', 'preview-creator-name', username)
    );
    creatorElement.append(creatorText);
    footer.append(creatorElement);
  }
  return footer;
};

// Branded loading skeleton. MUST mirror the static shell in preview.html
// exactly (that copy paints before any JS runs); the parity is pinned by a
// test in preview.test.ts. Styles live in public/boot.css.
const previewSkeletonTileCounts = [5, 4, 6] as const;

const renderSkeleton = (): HTMLElement => {
  const skeleton = createElement('div', 'preview-skeleton');
  skeleton.setAttribute('data-testid', 'preview-skeleton');
  skeleton.setAttribute('aria-busy', 'true');

  const puzzle = createElement('div', 'preview-skeleton-puzzle');
  for (const tileCount of previewSkeletonTileCounts) {
    const line = createElement('div', 'preview-skeleton-line');
    for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
      line.append(createElement('span', 'preview-skeleton-tile'));
    }
    puzzle.append(line);
  }

  skeleton.append(
    createElement('div', 'preview-skeleton-title'),
    puzzle,
    createElement('div', 'preview-skeleton-stats'),
    createElement('div', 'preview-skeleton-cta')
  );
  return skeleton;
};

const renderLoading = (root: HTMLElement): void => {
  root.replaceChildren(renderSkeleton());
};

const renderError = (root: HTMLElement): void => {
  const button = createElement('button', 'preview-shell preview-error');
  button.type = 'button';
  button.setAttribute('aria-label', 'Play Decrypt');
  button.append(
    renderTitleRow(),
    createElement('span', 'preview-status', 'Challenge preview unavailable'),
    renderFooter()
  );
  wireExpandedMode(button);
  root.replaceChildren(button);
};

const renderRemoved = (root: HTMLElement, levelId: string | null): void => {
  const button = createElement('button', 'preview-shell preview-removed');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open the next Decrypt challenge');
  const content = createElement('div', 'preview-removed-content');
  const lockIcon = createElement('img', 'preview-removed-icon-img');
  lockIcon.src = '/ui_lock.png';
  lockIcon.alt = '';
  lockIcon.loading = 'eager';
  content.append(
    lockIcon,
    createElement('span', 'preview-removed-title', 'Cipher removed'),
    createElement(
      'span',
      'preview-removed-copy',
      'This challenge left the game, but there is another one ready.'
    )
  );
  button.append(content, renderFooter(undefined, 'Next challenge'));
  button.addEventListener('click', (event) => {
    void openNextChallenge(event, levelId);
  });
  root.replaceChildren(button);
};

const renderPreview = (root: HTMLElement, preview: GamePreviewResponse): void => {
  const button = createElement('button', 'preview-shell');
  button.type = 'button';
  button.setAttribute('aria-label', 'Play Decrypt');
  const backgroundIndex = getStableChallengeBackgroundIndex(
    preview.puzzle.levelId || preview.levelId
  );
  button.style.setProperty(
    '--preview-background-image',
    `url("${getChallengeBackgroundAsset(backgroundIndex)}")`
  );

  const title = renderTitleRow(preview.previewTitle || fallbackPreviewTitle);
  const puzzleMask = renderPuzzle(preview.puzzle);

  button.append(title, puzzleMask, renderStatsLine(preview), renderFooter(preview.creator));
  wireExpandedMode(button);
  root.replaceChildren(button);
  watchPuzzleOverflow(puzzleMask);
};

const loadPreview = async (): Promise<GamePreviewResponse> => {
  const response = await fetch('/api/preview');
  if (!response.ok) {
    throw new Error(`Preview request failed: ${response.status}`);
  }
  return await response.json();
};

const loadPreviewStatus = async (): Promise<GameInlineStatusResponse> => {
  const response = await fetch('/api/preview-status');
  if (!response.ok) {
    throw new Error(`Preview status request failed: ${response.status}`);
  }
  return await response.json();
};

const mountCompletedGame = async (root: HTMLElement): Promise<void> => {
  root.setAttribute('data-initial-screen', 'challenge');
  root.classList.add('h-full');
  document.documentElement.classList.add('h-full');
  document.body.classList.add('h-full');
  document.body.classList.remove('preview-body');
  // Keep the loading skeleton on screen while the game chunk downloads;
  // clear only right before React takes the root.
  const gameModule = await import('./game');
  root.replaceChildren();
  gameModule.mountGame(root);
};

const mountPreview = async (): Promise<void> => {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing preview root element.');
  }

  // Mirror the player's theme (device-local, same source the app uses for its
  // first paint). Minimal swaps the photo backdrop for the flat minimal
  // palette; anything else — including no stored preference — keeps the photo
  // design, so this degrades safely.
  document.body.classList.toggle('preview-minimal', readThemePreference() === 'minimal');

  renderLoading(root);
  try {
	    const status = await loadPreviewStatus();
    if (status.removed) {
      renderRemoved(root, status.levelId);
      return;
    }
	    if (status.completed || status.failed) {
	      await mountCompletedGame(root);
      return;
    }
    const preview = await loadPreview();
    renderPreview(root, preview);
  } catch (error) {
    console.error('Failed to load challenge preview:', error);
    renderError(root);
  }
};

void mountPreview();
