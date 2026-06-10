import { useEffect, useRef } from 'react';

// Closes the active overlay(s) on Escape while `enabled` is true. The callback
// is held in a ref so toggling overlay state doesn't churn the keydown listener.
export const useEscapeToClose = (
  enabled: boolean,
  onEscape: () => void
): void => {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscapeRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
};
