import { useEffect, useState } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { GamePreviewResponse, PuzzlePublicTile } from '../../shared/game';
import { trpc } from '../trpc';
import { LoadingScreen } from '../components/LoadingScreen';

// Reddit owns authentication — an app can't trigger login programmatically — so
// the CTA sends the visitor to Reddit's login page in their browser. After they
// log in and reopen the post, the normal authed game flow takes over.
const REDDIT_LOGIN_URL = 'https://www.reddit.com/login/';

type PreviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; preview: GamePreviewResponse };

type RenderToken =
  | { kind: 'word'; key: string; tiles: PuzzlePublicTile[] }
  | { kind: 'separator'; key: string; tile: PuzzlePublicTile };

// Group letter tiles into words separated by non-letter tiles so the read-only
// board wraps on spaces/punctuation instead of breaking in the middle of a word.
const tokenizeTiles = (tiles: PuzzlePublicTile[]): RenderToken[] => {
  const tokens: RenderToken[] = [];
  let word: PuzzlePublicTile[] = [];
  const flushWord = () => {
    if (word.length > 0) {
      tokens.push({ kind: 'word', key: `word-${tokens.length}`, tiles: word });
      word = [];
    }
  };
  for (const tile of tiles) {
    if (tile.isLetter) {
      word.push(tile);
      continue;
    }
    flushWord();
    tokens.push({ kind: 'separator', key: `separator-${tokens.length}`, tile });
  }
  flushWord();
  return tokens;
};

// A non-interactive rendering of the unsolved puzzle: every letter is a blank
// underline with its cipher number beneath, exactly how a player first sees it.
// Decorative only — guesses require logging in — so it's hidden from a11y trees.
const ReadonlyPuzzle = ({ tiles }: { tiles: PuzzlePublicTile[] }) => {
  const tokens = tokenizeTiles(tiles);
  return (
    <div
      className="flex max-w-md flex-wrap items-end justify-center gap-y-3"
      aria-hidden="true"
      data-testid="logged-out-puzzle"
    >
      {tokens.map((token) => {
        if (token.kind === 'word') {
          return (
            <span key={token.key} className="inline-flex items-end">
              {token.tiles.map((tile) => (
                <span
                  key={tile.index}
                  className="mx-px inline-flex flex-col items-center"
                >
                  <span className="h-6 w-5 border-b-2 border-white/45" />
                  <span className="mt-1 text-[10px] font-semibold tabular-nums text-white/55">
                    {tile.cipherNumber ?? ''}
                  </span>
                </span>
              ))}
            </span>
          );
        }
        if (token.tile.displayChar === ' ') {
          return <span key={token.key} className="w-3" />;
        }
        return (
          <span
            key={token.key}
            className="mx-px self-end pb-[1.1rem] text-base font-semibold text-white/70"
          >
            {token.tile.displayChar}
          </span>
        );
      })}
    </div>
  );
};

// Read-only "log in to play" interstitial shown when a logged-out visitor opens
// the expanded game. Lets them see today's puzzle and stats (sourced from the
// public preview endpoint) but gates play behind a Reddit login. The full game
// (GameApp) only mounts for logged-in users — see GameRoot.
export const LoggedOutScreen = () => {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      try {
        const preview = await trpc.game.preview.query();
        if (!cancelled) {
          setState({ status: 'ready', preview });
        }
      } catch {
        // Even if the preview can't load, still show the login CTA so a
        // logged-out visitor always has a way forward.
        if (!cancelled) {
          setState({ status: 'error' });
        }
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <LoadingScreen className="loading-screen-solid" />;
  }

  const preview = state.status === 'ready' ? state.preview : null;
  const title = preview?.previewTitle ?? 'Can you decrypt this?';

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto bg-neutral-950 px-6 py-10 text-center text-neutral-100"
      data-testid="logged-out-screen"
    >
      <h1 className="max-w-md text-balance text-xl font-bold tracking-tight">
        {title}
      </h1>

      {preview ? (
        <>
          <ReadonlyPuzzle tiles={preview.puzzle.tiles} />
          <p className="text-sm text-white/60">
            {preview.challengeMetrics.plays.toLocaleString()} plays
            {' · '}
            {preview.challengeMetrics.winRatePct}% solved
          </p>
        </>
      ) : null}

      <div className="flex max-w-xs flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => navigateTo(REDDIT_LOGIN_URL)}
          className="rounded-full bg-white px-8 py-3 text-base font-semibold text-neutral-900 transition-transform hover:scale-[1.02] active:scale-95"
          data-testid="logged-out-login"
        >
          Log in to play
        </button>
        <p className="text-sm text-white/55">
          Log in to your Reddit account to play today&apos;s puzzle, save your
          streak, and climb the leaderboard.
        </p>
      </div>
    </div>
  );
};
