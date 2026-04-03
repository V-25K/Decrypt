import { payments } from '@devvit/web/server';
import { storeProductsResponseSchema } from '../../../shared/game';
import { getBundlePerks, getUsdApproxFromGold, isOneTimeOfferSku } from '../../../shared/store';
import { getPurchasedSkus } from '../../core/state';
import { router } from '../base';
import { authedProcedure } from '../procedures';

type ProductLike = {
  name?: string;
  sku: string;
  description?: string;
  price?: { amount?: number };
};

const mapProductDisplayName = (product: ProductLike) => ({
  sku: product.sku,
  displayName: product.name ?? product.sku,
  description: product.description ?? '',
  price: product.price?.amount ?? 1,
  isOneTime: isOneTimeOfferSku(product.sku),
  usdApprox: getUsdApproxFromGold(product.price?.amount ?? 1),
  perks: getBundlePerks(product.sku),
});

export const storeRouter = router({
  getProducts: authedProcedure.query(async ({ ctx }) => {
    const [result, purchasedSkus] = await Promise.all([
      payments.getProducts(),
      getPurchasedSkus(ctx.userId!),
    ]);
    const normalized = result.products
      .filter((product) => !(isOneTimeOfferSku(product.sku) && purchasedSkus.has(product.sku)))
      .map(mapProductDisplayName);
    return storeProductsResponseSchema.parse({
      products: normalized,
    });
  }),
});
