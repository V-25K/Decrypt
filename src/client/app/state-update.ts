export type StateUpdate<T> = T | ((previous: T) => T);

export const isStateUpdater = <T>(
  update: StateUpdate<T>
): update is (previous: T) => T => typeof update === 'function';

export const resolveStateUpdate = <T>(
  previous: T,
  update: StateUpdate<T>
): T => (isStateUpdater(update) ? update(previous) : update);
