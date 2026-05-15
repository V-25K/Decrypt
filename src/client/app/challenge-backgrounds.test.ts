import { describe, expect, it } from 'vitest';
import {
  challengeBackgroundAssets,
  getChallengeBackgroundAsset,
  getStableChallengeBackgroundIndex,
} from './challenge-backgrounds';

describe('challenge backgrounds', () => {
  it('uses the first background when no challenge key is available', () => {
    expect(getStableChallengeBackgroundIndex('')).toBe(0);
    expect(getStableChallengeBackgroundIndex(null)).toBe(0);
    expect(getChallengeBackgroundAsset(0)).toBe('/backgrounds/img1.webp');
  });

  it('returns a stable background index for the same challenge key', () => {
    const first = getStableChallengeBackgroundIndex('lvl_0001');
    const second = getStableChallengeBackgroundIndex('lvl_0001');

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(challengeBackgroundAssets.length);
  });

  it('maps the chosen index to a valid challenge background asset', () => {
    const index = getStableChallengeBackgroundIndex('lvl_0420');
    const asset = getChallengeBackgroundAsset(index);

    expect(challengeBackgroundAssets).toContain(asset);
  });
});
