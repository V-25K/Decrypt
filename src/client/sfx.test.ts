import { afterEach, describe, expect, it, vi } from 'vitest';

const storageKey = 'decrypt-sfx-enabled-v1';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});

describe('sfx storage', () => {
  it('reads the sessionStorage fallback when localStorage has no preference', async () => {
    sessionStorage.setItem(storageKey, '0');
    vi.resetModules();

    const { disposeSfx, isSfxEnabled } = await import('./sfx');

    expect(isSfxEnabled()).toBe(false);
    disposeSfx();
  });

  it('persists SFX preference to both localStorage and sessionStorage', async () => {
    vi.resetModules();
    const { disposeSfx, setSfxEnabled } = await import('./sfx');

    setSfxEnabled(false);

    expect(localStorage.getItem(storageKey)).toBe('0');
    expect(sessionStorage.getItem(storageKey)).toBe('0');
    disposeSfx();
  });
});
