import { getOfferPromotionLabel } from '../../shared/store';
import {
  coinEmoji,
  powerupLabel,
} from './constants';
import type {
  PowerupType,
  StoreProduct,
} from './types';

export type FeaturedPerk =
  | { key: 'coins'; sprite: 'coin'; value: number }
  | { key: 'hearts'; sprite: 'heart'; value: number }
  | { key: PowerupType; powerup: PowerupType; value: number };

export type FeaturedOfferView = {
  promotionLabel: string;
  perks: FeaturedPerk[];
  title: string;
};

export const getFeaturedOfferView = (
  offer: StoreProduct | null
): FeaturedOfferView => {
  if (!offer) {
    return {
      promotionLabel: '',
      perks: [],
      title: '',
    };
  }

  const promotionLabel = getOfferPromotionLabel(offer.sku);
  const perks = ([
    { key: 'coins', sprite: 'coin', value: offer.perks.coins },
    { key: 'hearts', sprite: 'heart', value: offer.perks.hearts },
    { key: 'hammer', powerup: 'hammer', value: offer.perks.hammer },
    { key: 'wand', powerup: 'wand', value: offer.perks.wand },
    { key: 'shield', powerup: 'shield', value: offer.perks.shield },
    { key: 'rocket', powerup: 'rocket', value: offer.perks.rocket },
  ] satisfies FeaturedPerk[]).filter((entry) => entry.value > 0);

  return {
    promotionLabel,
    perks,
    title: `${promotionLabel}: ${coinEmoji} x${offer.perks.coins}, ${powerupLabel.hammer} x${offer.perks.hammer}, ${powerupLabel.shield} x${offer.perks.shield}`,
  };
};
