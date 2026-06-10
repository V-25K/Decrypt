import { useEffect, useRef } from 'react';

// Devvit posts run inside an iframe; when the parent regains focus
// (e.g. the Reddit tab is foregrounded again) the embedded webview also
// regains focus. We use this to re-read the current view mode (inline vs.
// expanded) because the user may have navigated between them while the
// iframe was backgrounded.
//
// The callback is held in a ref so re-renders don't churn the window
// listener (avoiding handler-thrash during heavy GameApp updates).
export const useWebViewFocus = (onFocus: () => void): void => {
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  useEffect(() => {
    const handler = () => onFocusRef.current();
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);
};
