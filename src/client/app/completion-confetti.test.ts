import { describe, expect, it } from 'vitest';
import {
  launchCompletionConfettiSequence,
  withCompletionConfettiDefaults,
} from './completion-confetti';
import { confettiPalette } from './constants';

describe('withCompletionConfettiDefaults', () => {
  it('applies shared completion confetti defaults and keeps overrides', () => {
    expect(
      withCompletionConfettiDefaults({
        particleCount: 10,
        gravity: 0.5,
      })
    ).toMatchObject({
      colors: confettiPalette,
      decay: 0.93,
      disableForReducedMotion: true,
      gravity: 0.5,
      particleCount: 10,
      scalar: 1.6,
      shapes: ['square'],
      ticks: 220,
    });
  });
});

describe('launchCompletionConfettiSequence', () => {
  it('fires two immediate and two delayed bursts', () => {
    const bursts: Array<{ angle?: number; particleCount?: number }> = [];
    const scheduled: Array<{ delayMs: number; handler: () => void }> = [];

    launchCompletionConfettiSequence(
      (options) => bursts.push(options),
      (handler, delayMs) => scheduled.push({ delayMs, handler })
    );

    expect(bursts).toEqual([
      expect.objectContaining({ angle: 58, particleCount: 34 }),
      expect.objectContaining({ angle: 122, particleCount: 34 }),
    ]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(110);

    scheduled[0]?.handler();

    expect(bursts).toEqual([
      expect.objectContaining({ angle: 58, particleCount: 34 }),
      expect.objectContaining({ angle: 122, particleCount: 34 }),
      expect.objectContaining({ angle: 64, particleCount: 26 }),
      expect.objectContaining({ angle: 116, particleCount: 26 }),
    ]);
  });
});
