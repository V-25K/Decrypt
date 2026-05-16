import { describe, expect, it } from 'vitest';
import {
  coinEmoji,
  powerupLabel,
} from './constants';
import { getFeaturedOfferView } from './featured-offer-view';
import type { StoreProduct } from './types';

const offer = (overrides: Partial<StoreProduct> = {}): StoreProduct => ({
  sku: 'rookie_stash',
  displayName: 'Rookie Stash',
  description: 'Starter bundle',
  price: 25,
  isOneTime: true,
  usdApprox: 0.5,
  perks: {
    coins: 250,
    hearts: 1,
    hammer: 2,
    wand: 0,
    shield: 1,
    rocket: 0,
    infiniteHeartsHours: 0,
  },
  ...overrides,
});

describe('getFeaturedOfferView', () => {
  it('returns empty display data without an offer', () => {
    expect(getFeaturedOfferView(null)).toEqual({
      promotionLabel: '',
      perks: [],
      title: '',
    });
  });

  it('builds the featured offer label, positive perks, and title', () => {
    const view = getFeaturedOfferView(offer());

    expect(view.promotionLabel).toBe('One-Time Offer');
    expect(view.perks).toEqual([
      { key: 'coins', sprite: 'coin', value: 250 },
      { key: 'hearts', sprite: 'heart', value: 1 },
      { key: 'hammer', powerup: 'hammer', value: 2 },
      { key: 'shield', powerup: 'shield', value: 1 },
    ]);
    expect(view.title).toBe(
      `One-Time Offer: ${coinEmoji} x250, ${powerupLabel.hammer} x2, ${powerupLabel.shield} x1`
    );
  });

  it('falls back to a generic label for unknown offer SKUs', () => {
    expect(getFeaturedOfferView(offer({ sku: 'unknown_pack' })).promotionLabel).toBe('Offer');
  });
});
