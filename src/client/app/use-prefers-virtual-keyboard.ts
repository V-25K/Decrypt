import { useEffect, useState } from 'react';

// A touch-first device (phone OR tablet) has no physical keyboard, so it needs
// the in-app custom keyboard regardless of how wide its viewport reports. We key
// off the PRIMARY pointer/hover capabilities rather than width:
//   - phones & tablets  → primary pointer is coarse / cannot hover → true
//   - desktop with mouse → fine pointer + hover → false (use physical keyboard)
//   - touch-screen laptop → primary pointer still fine + hover → false (it has
//     a real keyboard), even though it also has a coarse pointer
// This is what fixes tablets, which Reddit can report as wide "desktop"
// viewports and which previously fell through to the (absent) device keyboard.
const coarsePointerQuery = '(pointer: coarse)';
const noHoverQuery = '(hover: none)';

const matches = (query: string): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
};

export const computePrefersVirtualKeyboard = (): boolean =>
  matches(coarsePointerQuery) || matches(noHoverQuery);

export const usePrefersVirtualKeyboard = (): boolean => {
  const [prefers, setPrefers] = useState<boolean>(computePrefersVirtualKeyboard);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const queries = [coarsePointerQuery, noHoverQuery].map((q) =>
      window.matchMedia(q)
    );
    const sync = () => setPrefers(computePrefersVirtualKeyboard());
    sync();
    for (const mql of queries) {
      mql.addEventListener('change', sync);
    }
    return () => {
      for (const mql of queries) {
        mql.removeEventListener('change', sync);
      }
    };
  }, []);

  return prefers;
};
