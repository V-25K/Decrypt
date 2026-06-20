import { afterEach, describe, expect, it, vi } from 'vitest';
import { computePrefersVirtualKeyboard } from './use-prefers-virtual-keyboard';

const stubMatchMedia = (matchesByQuery: Record<string, boolean>) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matchesByQuery[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computePrefersVirtualKeyboard', () => {
  it('is true on a coarse-pointer (touch) device — phones and tablets', () => {
    stubMatchMedia({ '(pointer: coarse)': true });
    expect(computePrefersVirtualKeyboard()).toBe(true);
  });

  it('is true when the device cannot hover', () => {
    stubMatchMedia({ '(hover: none)': true });
    expect(computePrefersVirtualKeyboard()).toBe(true);
  });

  it('is false on a fine-pointer, hover-capable desktop', () => {
    stubMatchMedia({ '(pointer: coarse)': false, '(hover: none)': false });
    expect(computePrefersVirtualKeyboard()).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(computePrefersVirtualKeyboard()).toBe(false);
  });
});
