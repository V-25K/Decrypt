import { useEffect, useRef, useState } from 'react';
import { trpc } from '../trpc';
import type { RouterOutputs } from '../app/types';

type CreatorProgressLevel =
  RouterOutputs['community']['getMyCreatorProgress']['levels'][number];

// Small ⓘ on the creator quest card. Tap/click (or keyboard) toggles a
// popover explaining the acclaim bar and showing the player's closest
// challenge. Progress is fetched on first open only.
export const CreatorAcclaimInfo = () => {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [closest, setClosest] = useState<CreatorProgressLevel | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open || loaded) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await trpc.community.getMyCreatorProgress.query();
        if (cancelled) {
          return;
        }
        const inProgress = result.levels.filter((level) => !level.acclaimed);
        const best = inProgress.reduce<CreatorProgressLevel | null>(
          (leading, level) =>
            !leading ||
            level.progress.qualifiedPlays > leading.progress.qualifiedPlays
              ? level
              : leading,
          null
        );
        setClosest(best);
      } catch {
        // ignore — the popover just shows the explanation without progress
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const likePct = closest ? Math.round(closest.progress.likeRatio * 100) : 0;

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="How creator acclaim works"
        aria-expanded={open}
        data-testid="creator-acclaim-info-button"
        className="app-text-muted inline-flex h-5 w-5 items-center justify-center rounded-full border app-border text-[10px] font-black leading-none hover:opacity-80"
        onClick={(event) => {
          // The whole quest card can be a claim button — keep this isolated.
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        i
      </button>
      {open && (
        <span
          data-testid="creator-acclaim-info-popover"
          className="app-surface-strong app-border absolute right-0 top-7 z-30 block w-56 rounded-lg border px-3 py-2.5 text-left shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="app-text block text-[11px] font-black">
            How this counts
          </span>
          <span className="app-text-muted mt-1 block text-[10px] font-semibold leading-snug">
            A challenge counts once players love it: 200+ plays with 70%+
            likes.
          </span>
          {loaded && (
            <span className="app-text mt-1.5 block text-[10px] font-semibold leading-snug">
              {closest ? (
                <>
                  Closest:{' '}
                  <span className="font-black">
                    {closest.progress.qualifiedPlays}/200 plays
                  </span>
                  {closest.progress.totalVotes > 0 && (
                    <>
                      {' · '}
                      {likePct}% liked ({closest.progress.totalVotes}{' '}
                      {closest.progress.totalVotes === 1 ? 'vote' : 'votes'})
                    </>
                  )}
                </>
              ) : (
                'No challenge on its way yet — share one from the Create tab!'
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
};
