import {
  useCallback,
  useRef,
  type RefCallback,
} from 'react';
import type {
  ConfettiLauncher,
  Options as CanvasConfettiOptions,
} from 'canvas-confetti';
import { confettiPalette } from './constants';

export type CompletionConfettiApi = {
  launchCompletionConfetti: () => void;
  setConfettiCanvasNode: RefCallback<HTMLCanvasElement>;
};

export const canUseCanvasConfetti = (): boolean =>
  typeof navigator === 'undefined' || !/jsdom/i.test(navigator.userAgent);

export const canInitializeConfettiCanvas = (_canvas: HTMLCanvasElement): boolean => {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    /jsdom/i.test(navigator.userAgent)
  ) {
    return false;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return true;
};

export const withCompletionConfettiDefaults = (
  options: CanvasConfettiOptions
): CanvasConfettiOptions => ({
  colors: confettiPalette,
  disableForReducedMotion: true,
  scalar: 1.6,
  gravity: 0.82,
  decay: 0.93,
  ticks: 220,
  shapes: ['square'],
  ...options,
});

export const launchCompletionConfettiSequence = (
  fireConfettiBurst: (options: CanvasConfettiOptions) => void,
  schedule: (handler: () => void, delayMs: number) => void = (handler, delayMs) => {
    window.setTimeout(handler, delayMs);
  }
): void => {
  fireConfettiBurst({
    particleCount: 34,
    angle: 58,
    spread: 34,
    startVelocity: 31,
    drift: 0.14,
    origin: { x: 0.05, y: 0.98 },
  });
  fireConfettiBurst({
    particleCount: 34,
    angle: 122,
    spread: 34,
    startVelocity: 31,
    drift: -0.14,
    origin: { x: 0.95, y: 0.98 },
  });
  schedule(() => {
    fireConfettiBurst({
      particleCount: 26,
      angle: 64,
      spread: 28,
      startVelocity: 27,
      drift: 0.12,
      origin: { x: 0.08, y: 0.98 },
    });
    fireConfettiBurst({
      particleCount: 26,
      angle: 116,
      spread: 28,
      startVelocity: 27,
      drift: -0.12,
      origin: { x: 0.92, y: 0.98 },
    });
  }, 110);
};

export const useCompletionConfetti = (): CompletionConfettiApi => {
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiLauncherRef = useRef<ConfettiLauncher | null>(null);

  const setConfettiCanvasNode = useCallback((node: HTMLCanvasElement | null) => {
    confettiCanvasRef.current = node;
    confettiLauncherRef.current = null;
    if (!node) {
      return;
    }
    if (!canInitializeConfettiCanvas(node)) {
      return;
    }
    void (async () => {
      try {
        const module = await import('canvas-confetti');
        if (confettiCanvasRef.current !== node) {
          return;
        }
        const createConfetti = module.default.create;
        if (!createConfetti) {
          return;
        }
        confettiLauncherRef.current = createConfetti(node, {
          resize: true,
          useWorker: true,
        });
      } catch (_error) {
        try {
          const module = await import('canvas-confetti');
          if (confettiCanvasRef.current !== node) {
            return;
          }
          const createConfetti = module.default.create;
          if (!createConfetti) {
            return;
          }
          confettiLauncherRef.current = createConfetti(node, {
            resize: true,
            useWorker: false,
          });
        } catch (_fallbackError) {
          confettiLauncherRef.current = null;
        }
      }
    })();
  }, []);

  const fireConfettiBurst = useCallback((options: CanvasConfettiOptions) => {
    const sharedOptions = withCompletionConfettiDefaults(options);
    const launcher = confettiLauncherRef.current;
    if (!launcher) {
      if (!canUseCanvasConfetti()) {
        return;
      }
      void (async () => {
        try {
          const module = await import('canvas-confetti');
          await module.default(sharedOptions);
        } catch (_error) {
          // Best effort only.
        }
      })();
      return;
    }
    void launcher(sharedOptions);
  }, []);

  const launchCompletionConfetti = useCallback(() => {
    launchCompletionConfettiSequence(fireConfettiBurst);
  }, [fireConfettiBurst]);

  return {
    launchCompletionConfetti,
    setConfettiCanvasNode,
  };
};
