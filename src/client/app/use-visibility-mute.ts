import { useEffect } from 'react';
import { pauseAllSfx } from '../sfx';

// Devvit inline-mode rule: "Use the visibilityChange handler to mute any sounds
// if a user scrolls away." Always-on, independent of the active screen — applies
// to gameplay SFX, result-screen celebrations, and any audio played in the inline
// shell when the preview lazy-imports the React game on completed/failed posts.
export const useVisibilityMute = (): void => {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseAllSfx();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
};
