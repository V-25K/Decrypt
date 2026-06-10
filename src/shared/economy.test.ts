import { describe, expect, it } from 'vitest';
import {
  applyEndlessRewardTaper,
  completionRewards,
  endlessRewardTaper,
} from './economy';

describe('applyEndlessRewardTaper', () => {
  const fullReward = completionRewards.baseCoins + completionRewards.flawlessBonus;

  it('pays full rewards for the first five clears of the day', () => {
    for (let clears = 0; clears < endlessRewardTaper.fullRewardClearsPerDay; clears += 1) {
      expect(applyEndlessRewardTaper(fullReward, clears)).toEqual({
        coins: fullReward,
        tapered: false,
      });
    }
  });

  it('pays half rewards for clears six through ten', () => {
    const result = applyEndlessRewardTaper(fullReward, 5);
    expect(result.tapered).toBe(true);
    expect(result.coins).toBe(Math.round(fullReward * endlessRewardTaper.halfFactor));
    expect(applyEndlessRewardTaper(fullReward, 9).tapered).toBe(true);
  });

  it('never halves below the floor', () => {
    const result = applyEndlessRewardTaper(12, 5);
    expect(result.coins).toBe(endlessRewardTaper.floorCoins);
  });

  it('pays the flat floor beyond ten clears', () => {
    expect(applyEndlessRewardTaper(fullReward, 10)).toEqual({
      coins: endlessRewardTaper.floorCoins,
      tapered: true,
    });
    expect(applyEndlessRewardTaper(fullReward, 50)).toEqual({
      coins: endlessRewardTaper.floorCoins,
      tapered: true,
    });
  });
});
