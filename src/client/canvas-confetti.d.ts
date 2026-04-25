declare module 'canvas-confetti' {
  export type Options = Record<string, unknown>;
  export type CreateTypes = unknown;

  export type ConfettiFunction = {
    (options?: Options): Promise<null> | null;
    create?: (...args: unknown[]) => ConfettiFunction;
    reset?: () => void;
  };

  export type ConfettiLauncher = ConfettiFunction;

  const confetti: ConfettiFunction;
  export default confetti;
}
