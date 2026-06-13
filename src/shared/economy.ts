/**
 * Central knobs for the coin economy. Tuning goal: never pay-to-win (powerups
 * reduce score; nothing purchasable boosts it), but free income should not be
 * so generous that paid bundles feel pointless. Completion pays modestly,
 * endless farming tapers daily, and big one-time payouts live in quests.
 */

export const completionRewards = {
  baseCoins: 35,
  flawlessBonus: 15,
} as const;

/**
 * The flawless coin bonus rewards a genuinely clean, unassisted clear: no
 * mistakes, no power-ups, and not a continued run. Power-ups count here so that
 * buying your way through a puzzle is a real coin trade-off, not just a small
 * leaderboard dent.
 */
export const earnsFlawlessCoinBonus = (params: {
  mistakes: number;
  usedPowerups: number;
  continued: boolean;
}): boolean =>
  params.mistakes === 0 && params.usedPowerups === 0 && !params.continued;

export const communityJoinRewardCoins = 100;

export const coinHeartRefillCost = 350;
export const coinHeartTopUpCost = 150;
export const maxCoinHeartPurchasesPerDay = 2;

// Endless mode pays full rewards for the first clears of the day, half for
// the next stretch, then a flat trickle — keeps daily play rewarding without
// making endless an infinite coin printer.
export const endlessRewardTaper = {
  fullRewardClearsPerDay: 5,
  halfRewardClearsPerDay: 5,
  halfFactor: 0.5,
  floorCoins: 10,
} as const;

export const applyEndlessRewardTaper = (
  rewardCoins: number,
  clearsRewardedToday: number
): { coins: number; tapered: boolean } => {
  if (clearsRewardedToday < endlessRewardTaper.fullRewardClearsPerDay) {
    return { coins: rewardCoins, tapered: false };
  }
  const halfLimit =
    endlessRewardTaper.fullRewardClearsPerDay +
    endlessRewardTaper.halfRewardClearsPerDay;
  if (clearsRewardedToday < halfLimit) {
    return {
      coins: Math.max(
        endlessRewardTaper.floorCoins,
        Math.round(rewardCoins * endlessRewardTaper.halfFactor)
      ),
      tapered: true,
    };
  }
  return { coins: endlessRewardTaper.floorCoins, tapered: true };
};
