import { useEffect, useRef } from 'react';

type UseHeaderClockParams = {
  // Only ticks while the challenge is actively in play. Hand-off conditions
  // (overlays, end-of-game) gate this from the caller.
  enabled: boolean;
  intervalMs?: number;
  onTick: (nowTs: number) => void;
};

// One-second tick used by the challenge header to refresh the live timer
// (and downstream UI like the fast-solve bonus countdown). Separate from
// the heartbeat hook so display refresh and server sync can vary
// independently. The onTick ref shields the interval from re-render churn.
export const useHeaderClock = ({
  enabled,
  intervalMs = 1000,
  onTick,
}: UseHeaderClockParams): void => {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    onTickRef.current(Date.now());
    const intervalId = window.setInterval(() => {
      onTickRef.current(Date.now());
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs]);
};
