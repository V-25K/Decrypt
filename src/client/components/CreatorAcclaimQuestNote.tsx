import { useEffect, useState } from 'react';
import { trpc } from '../trpc';
import type { RouterOutputs } from '../app/types';

type CreatorProgressLevel =
  RouterOutputs['community']['getMyCreatorProgress']['levels'][number];

// Shown under the creator milestone quest: the player's closest challenge to
// the acclaim bar. Self-hides when the player has no approved challenges
// still working toward acclaim (and on any load error).
export const CreatorAcclaimQuestNote = () => {
  const [closest, setClosest] = useState<CreatorProgressLevel | null>(null);

  useEffect(() => {
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
        // ignore — leave the note hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!closest) {
    return null;
  }
  const { progress } = closest;
  const likePct = Math.round(progress.likeRatio * 100);
  return (
    <div
      className="hub-card app-surface rounded-lg border app-border px-3 py-2.5"
      data-testid="creator-acclaim-quest-note"
    >
      <p className="app-text text-[11px] font-black uppercase">
        Your closest challenge
      </p>
      <p className="app-text mt-0.5 text-[11px] font-semibold leading-snug">
        <span className="font-black">{progress.qualifiedPlays}/200 plays</span>
        {progress.totalVotes > 0 && (
          <>
            {' · '}
            {likePct}% liked ({progress.totalVotes}{' '}
            {progress.totalVotes === 1 ? 'vote' : 'votes'})
          </>
        )}
      </p>
      <p className="app-text-muted mt-0.5 text-[10px] font-semibold leading-snug">
        Reach 200 plays with 70%+ likes to earn the creator reward.
      </p>
    </div>
  );
};
