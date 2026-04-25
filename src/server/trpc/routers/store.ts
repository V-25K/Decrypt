import { payments } from '@devvit/web/server';
import { TRPCError } from '@trpc/server';
import { storeProductsResponseSchema } from '../../../shared/game';
import { getBundlePerks, getUsdApproxFromGold, isOneTimeOfferSku } from '../../../shared/store';
import { getPurchasedSkus } from '../../core/state';
import { router } from '../base';
import { publicProcedure } from '../procedures';

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
  getProducts: publicProcedure.query(async ({ ctx }) => {
    try {
      const result = await payments.getProducts();
      const purchasedSkus = ctx.userId ? await getPurchasedSkus(ctx.userId) : new Set<string>();
      const normalized = result.products
        .filter(
          (product) =>
            !(isOneTimeOfferSku(product.sku) && purchasedSkus.has(product.sku))
        )
        .map(mapProductDisplayName);

      return storeProductsResponseSchema.parse({
        products: normalized,
      });
    } catch (error) {
      console.error('[store.getProducts] failed:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to load store products right now.',
      });
    }
  }),
});
