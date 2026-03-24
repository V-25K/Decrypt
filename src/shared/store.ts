export type BundlePerks = {
  coins: number;
  hearts: number;
  hammer: number;
  wand: number;
  shield: number;
  rocket: number;
  infiniteHeartsHours: number;
};

type BundleCatalogEntry = {
  isOneTime: boolean;
  perks: BundlePerks;
};

const emptyPerks: BundlePerks = {
  coins: 0,
  hearts: 0,
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
  infiniteHeartsHours: 0,
};

export const promotedOfferPrioritySkus = ['rookie_stash', 'decoder_pack'] as const;

const offerPromotionLabels: Record<string, string> = {
  rookie_stash: 'One-Time Offer',
  decoder_pack: 'Popular',
};

export const bundleCatalog: Record<string, BundleCatalogEntry> = {
  rookie_stash: {
    isOneTime: true,
    perks: {
      coins: 500,
      hearts: 0,
      hammer: 1,
      wand: 0,
      shield: 1,
      rocket: 0,
      infiniteHeartsHours: 0,
    },
  },
  decoder_pack: {
    isOneTime: false,
    perks: {
      coins: 2600,
      hearts: 0,
      hammer: 3,
      wand: 1,
      shield: 2,
      rocket: 1,
      infiniteHeartsHours: 2,
    },
  },
  cryptographer_vault: {
    isOneTime: false,
    perks: {
      coins: 13000,
      hearts: 0,
      hammer: 6,
      wand: 6,
      shield: 6,
      rocket: 6,
      infiniteHeartsHours: 24,
    },
  },
};

export const oneTimeOfferSkus = Object.entries(bundleCatalog)
  .filter((entry) => entry[1].isOneTime)
  .map((entry) => entry[0]);

const oneTimeOfferSkuSet: ReadonlySet<string> = new Set(oneTimeOfferSkus);

const goldToUsdMap = new Map<number, number>([
  [5, 0.1],
  [25, 0.5],
  [50, 1],
  [100, 2],
  [150, 3],
  [250, 5],
  [500, 10],
  [1000, 20],
  [2500, 50],
]);

export const isOneTimeOfferSku = (sku: string): boolean =>
  oneTimeOfferSkuSet.has(sku);

export const getBundlePerks = (sku: string): BundlePerks => {
  const entry = bundleCatalog[sku];
  if (!entry) {
    return emptyPerks;
  }
  return entry.perks;
};

export const getUsdApproxFromGold = (goldAmount: number): number | null =>
  goldToUsdMap.get(goldAmount) ?? null;

export const getOfferPromotionLabel = (sku: string): string =>
  offerPromotionLabels[sku] ?? 'Offer';
