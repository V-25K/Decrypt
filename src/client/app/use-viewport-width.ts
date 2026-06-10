import { useEffect, useRef } from 'react';

// Subscribes the caller to viewport-width updates via the window resize event.
// Single-purpose hook so GameApp's responsive layout reducer can stay focused
// on layout decisions rather than DOM listener wiring. The callback ref shields
// the resize listener from re-render churn.
export const useViewportWidth = (onResize: (width: number) => void): void => {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  useEffect(() => {
    const sync = () => onResizeRef.current(window.innerWidth);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
};
