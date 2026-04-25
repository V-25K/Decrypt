import { getOfferPromotionLabel } from '../../shared/store';
import { coinEmoji, heartEmoji, powerupIcon } from '../app/constants';
import type { StoreProduct } from '../app/types';
import { RedditTokenIcon } from '../components/Icons';

type ShopScreenProps = {
  shopProducts: StoreProduct[];
  offerBusy: boolean;
  onPurchase: (sku: string) => void;
};

const formatInfiniteHeartsDurationLabel = (hours: number): string => {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '0h';
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${hours}h`;
};

export const ShopScreen = ({
  shopProducts,
  offerBusy,
  onPurchase,
}: ShopScreenProps) => {
  const productsWithUiHints = shopProducts.map((product) => {
    const toolPerks = [
      { key: 'hearts', label: heartEmoji, value: product.perks.hearts },
      { key: 'hammer', label: powerupIcon.hammer, value: product.perks.hammer },
      { key: 'wand', label: powerupIcon.wand, value: product.perks.wand },
      { key: 'rocket', label: powerupIcon.rocket, value: product.perks.rocket },
      { key: 'shield', label: powerupIcon.shield, value: product.perks.shield },
    ].filter((entry) => entry.value > 0);
    const bonusHours = product.perks.infiniteHeartsHours;
    const isHeartOnly = product.perks.coins <= 0 && toolPerks.length === 0 && bonusHours > 0;

    return { product, toolPerks, bonusHours, isHeartOnly };
  });

  const heartOnlyProducts = productsWithUiHints.filter((entry) => entry.isHeartOnly);
  const bundleProducts = productsWithUiHints.filter((entry) => !entry.isHeartOnly);

  return (
    <section
      className="app-surface flex min-h-0 flex-1 flex-col"
      data-testid="shop-screen"
    >
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <div
          data-testid="shop-product-list"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {shopProducts.length === 0 ? (
            <div className="app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
              No bundles are available right now. Please check back soon.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {heartOnlyProducts.length > 0 && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {heartOnlyProducts.map(({ product, bonusHours }) => {
                    const promotionLabel = getOfferPromotionLabel(product.sku);
                    const hasPromotion = product.isOneTime || promotionLabel === 'Popular';
                    return (
                      <section
                        key={product.sku}
                        data-testid={`shop-product-card-${product.sku}`}
                        className={`app-surface relative overflow-hidden rounded-2xl border app-border p-3 ${
                          hasPromotion ? 'ring-2 ring-[rgba(255,122,48,0.35)]' : ''
                        }`}
                      >
                        <div className="mt-5 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="app-text min-w-0 truncate text-sm font-black uppercase leading-tight">
                              {product.displayName}
                            </h3>
                            <button
                              data-testid={`shop-buy-${product.sku}`}
                              type="button"
                              className="btn-3d btn-primary inline-flex w-fit shrink-0 rounded-xl px-4 py-2 text-sm font-black uppercase"
                              onClick={() => onPurchase(product.sku)}
                              disabled={offerBusy}
                            >
                              <span className="flex items-center justify-center gap-1.5">
                                <RedditTokenIcon className="h-4 w-4" />
                                {product.price}
                              </span>
                            </button>
                          </div>

                          <div className="app-surface-subtle flex items-center justify-between rounded-xl px-3 py-3">
                            <div className="flex items-center gap-2 text-[18px] font-black">
                              <span className="text-[20px] leading-none">{heartEmoji}</span>
                              <span>{formatInfiniteHeartsDurationLabel(bonusHours)}</span>
                            </div>
                            <div className="app-text-muted text-[11px] font-semibold uppercase">
                              Infinite
                            </div>
                          </div>

                          {hasPromotion && (
                            <div className="flex items-center justify-start">
                              <div className="badge-primary rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.02em]">
                                {product.isOneTime ? 'One Time Offer' : promotionLabel}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </section>
              )}

              {bundleProducts.map(({ product, toolPerks, bonusHours }) => {
                const promotionLabel = getOfferPromotionLabel(product.sku);
                const hasPromotion = product.isOneTime || promotionLabel === 'Popular';
                return (
                  <section
                    key={product.sku}
                    data-testid={`shop-product-card-${product.sku}`}
                    className={`app-surface relative overflow-hidden rounded-2xl border app-border p-3 ${
                      hasPromotion ? 'ring-2 ring-[rgba(255,122,48,0.35)]' : ''
                    }`}
                  >
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <h3 className="app-text min-w-0 truncate text-sm font-black uppercase leading-tight">
                        {product.displayName}
                      </h3>
                      <button
                        data-testid={`shop-buy-${product.sku}`}
                        type="button"
                        className="btn-3d btn-primary inline-flex w-fit shrink-0 rounded-xl px-4 py-2 text-sm font-black uppercase"
                        onClick={() => onPurchase(product.sku)}
                        disabled={offerBusy}
                      >
                        <span className="flex items-center gap-1.5">
                          <RedditTokenIcon className="h-4 w-4" />
                          {product.price}
                        </span>
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <div className="app-surface-subtle flex items-center gap-3 rounded-xl px-3 py-3 sm:min-w-[190px]">
                        <div className="text-[28px] leading-none">{coinEmoji}</div>
                        <div className="min-w-0">
                          <div className="app-text text-[11px] font-semibold uppercase leading-none">
                            Coins
                          </div>
                          <div className="app-text mt-1 text-[22px] font-black leading-none">
                            {product.perks.coins.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {toolPerks.slice(0, 5).map((perk) => (
                          <div
                            key={perk.key}
                            className="app-surface-subtle app-text flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black"
                          >
                            <span className="text-[18px] leading-none">{perk.label}</span>
                            <span className="leading-none">x{perk.value}</span>
                          </div>
                        ))}
                        {bonusHours > 0 && (
                          <div className="app-surface-subtle app-text col-span-2 flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black sm:col-span-1">
                            <span className="text-[18px] leading-none">{heartEmoji}</span>
                            <span className="leading-none">
                              {formatInfiniteHeartsDurationLabel(bonusHours)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {hasPromotion && (
                      <div className="mt-3 flex items-center justify-start">
                        <div className="badge-primary rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.02em]">
                          {product.isOneTime ? 'One Time Offer' : promotionLabel}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </section>
  );
};
