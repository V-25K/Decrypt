import { OrderResultStatus } from '@devvit/web/client';
import { promotedOfferPrioritySkus } from '../../shared/store';

type ProductWithSku = {
  sku: string;
};

export const pickPromotedOffer = <Product extends ProductWithSku>(
  products: readonly Product[]
): Product | null => {
  for (const sku of promotedOfferPrioritySkus) {
    const match = products.find((entry) => entry.sku === sku);
    if (match) {
      return match;
    }
  }
  return null;
};

export const isSuccessfulOrderStatus = (status: unknown): boolean =>
  status === OrderResultStatus.STATUS_SUCCESS;

export const toPurchaseErrorMessage = (
  errorMessage: string | null | undefined
): string => {
  if (typeof errorMessage === 'string' && /order not placed/i.test(errorMessage)) {
    return 'Unable to place your order right now. Please try again.';
  }
  return errorMessage ?? 'Purchase canceled.';
};
