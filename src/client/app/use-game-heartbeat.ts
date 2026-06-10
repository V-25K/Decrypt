import { useEffect, type MutableRefObject } from 'react';
import { trpc } from '../trpc';
import { challengeHeartbeatIntervalMs } from './constants';

type GameMode = 'daily' | 'endless';

type UseGameHeartbeatParams = {
  // True only while the challenge is actively in play (no overlays, no inflight
  // guesses, not complete/failed). Toggling this off tears down the interval.
  enabled: boolean;
  levelId: string;
  mode: GameMode;
  // Caller-owned ref that the hook flips during a send to coalesce overlapping
  // heartbeats. Lifted to the caller so the same ref can also gate other
  // request-in-flight UI logic (button disabled states, etc.).
  inFlightRef: MutableRefObject<boolean>;
};

// Drives the per-second heartbeat that keeps the server-side session clock
// advancing while the user has the post tab visible. Pauses on
// `visibilitychange → hidden` and resumes (with an immediate ping) on visible.
// Transient heartbeat failures are swallowed — scoring still advances when
// the player takes an action.
export const useGameHeartbeat = ({
  enabled,
  levelId,
  mode,
  inFlightRef,
}: UseGameHeartbeatParams): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const sendHeartbeat = async () => {
      if (cancelled || inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      try {
        await trpc.game.heartbeat.mutate({ levelId, mode });
      } catch (_error) {
        // Ignore transient heartbeat failures; scoring still advances on actions.
      } finally {
        inFlightRef.current = false;
      }
    };
    void sendHeartbeat();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void sendHeartbeat();
    }, challengeHeartbeatIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [enabled, inFlightRef, levelId, mode]);
};
