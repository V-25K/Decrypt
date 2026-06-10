import { useEffect } from 'react';
import { primeSfx } from '../sfx';

// Prime the audio pipeline on mount, then re-prime once after the first real
// user interaction so the AudioContext is allowed to resume on browsers that
// require a user gesture before playing sound.
export const useSfxPriming = (): void => {
  useEffect(() => {
    primeSfx();
    let primedAfterInteraction = false;
    const onFirstInteraction = () => {
      if (primedAfterInteraction) {
        return;
      }
      primedAfterInteraction = true;
      primeSfx();
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction, true);
    };
    window.addEventListener('pointerdown', onFirstInteraction, { passive: true });
    window.addEventListener('keydown', onFirstInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction, true);
    };
  }, []);
};
