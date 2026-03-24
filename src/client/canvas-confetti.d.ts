declare module 'canvas-confetti' {
  export type Shape = 'square' | 'circle';

  export type Options = {
    angle?: number;
    colors?: string[];
    decay?: number;
    disableForReducedMotion?: boolean;
    drift?: number;
    gravity?: number;
    origin?: {
      x?: number;
      y?: number;
    };
    particleCount?: number;
    scalar?: number;
    shapes?: Shape[];
    spread?: number;
    startVelocity?: number;
    ticks?: number;
    zIndex?: number;
  };

  export type CreateOptions = {
    resize?: boolean;
    useWorker?: boolean;
  };

  export type ConfettiLauncher = (options?: Options) => Promise<null> | null;

  type ConfettiStatic = ConfettiLauncher & {
    create(canvas: HTMLCanvasElement, options?: CreateOptions): ConfettiLauncher;
    reset(): void;
  };

  const confetti: ConfettiStatic;

  export default confetti;
}
