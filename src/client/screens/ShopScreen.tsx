import { getOfferPromotionLabel } from '../../shared/store';
import type { PowerupType, StoreProduct } from '../app/types';
import { ErrorCard } from '../components/ErrorCard';
import { HudSprite } from '../components/HudSprite';
import { RedditTokenIcon } from '../components/Icons';
import { PowerupSprite } from '../components/PowerupSprite';

type ShopScreenProps = {
  shopProducts: StoreProduct[];
  shopError: string | null;
  offerBusy: boolean;
  onPurchase: (sku: string) => void;
  onRetry: () => void;
};

type ToolPerk =
  | { key: 'hearts'; sprite: 'heart'; value: number }
  | { key: PowerupType; powerup: PowerupType; value: number };

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
  shopError,
  offerBusy,
  onPurchase,
  onRetry,
}: ShopScreenProps) => {
  const productsWithUiHints = shopProducts.map((product) => {
    const toolPerks = ([
      { key: 'hearts', sprite: 'heart', value: product.perks.hearts },
      { key: 'hammer', powerup: 'hammer', value: product.perks.hammer },
      { key: 'wand', powerup: 'wand', value: product.perks.wand },
      { key: 'rocket', powerup: 'rocket', value: product.perks.rocket },
      { key: 'shield', powerup: 'shield', value: product.perks.shield },
    ] satisfies ToolPerk[]).filter((entry) => entry.value > 0);
    const bonusHours = product.perks.infiniteHeartsHours;
    const isHeartOnly = product.perks.coins <= 0 && toolPerks.length === 0 && bonusHours > 0;

    return { product, toolPerks, bonusHours, isHeartOnly };
  });

  const heartOnlyProducts = productsWithUiHints.filter((entry) => entry.isHeartOnly);
  const bundleProducts = productsWithUiHints.filter((entry) => !entry.isHeartOnly);

  return (
    <section
      className="hub-screen app-surface flex min-h-0 flex-1 flex-col"
      data-testid="shop-screen"
    >
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <section className="hub-header-panel panel-clear mb-3 rounded-xl px-4 py-3 text-center">
          <h2 className="app-text text-base font-black uppercase tracking-[0.04em]">
            Shop
          </h2>
        </section>
        {shopError && (
          <div className="mb-3">
            <ErrorCard error={shopError} onRetry={onRetry} />
          </div>
        )}
        <div
          data-testid="shop-product-list"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {shopProducts.length === 0 ? (
            <div className="hub-card app-surface rounded-lg border app-border p-6 text-center">
              <p className="app-text text-sm font-black uppercase">Shop Is Restocking</p>
              <p className="app-text-muted mt-1 text-xs font-semibold">
                Bundles are unavailable right now. Check back soon.
              </p>
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
                        className={`hub-card hub-product-card panel-transparent relative overflow-hidden rounded-2xl border app-border p-3 ${
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

                          <div className="hub-subpanel app-surface-subtle flex items-center justify-between rounded-xl px-3 py-3">
                            <div className="flex items-center gap-2 text-[18px] font-black">
                              <HudSprite icon="heart" decorative className="h-6 w-6" />
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
                    className={`hub-card hub-product-card panel-transparent relative overflow-hidden rounded-2xl border app-border p-3 ${
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
                      <div className="hub-subpanel app-surface-subtle flex items-center gap-3 rounded-xl px-3 py-3 sm:min-w-[190px]">
                        <HudSprite icon="coin" decorative className="h-[30px] w-[30px]" />
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
                            className="hub-subpanel app-surface-subtle app-text flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black"
                          >
                            {'powerup' in perk ? (
                              <PowerupSprite
                                powerup={perk.powerup}
                                decorative
                                className="h-[18px] w-[18px]"
                              />
                            ) : (
                              <HudSprite icon={perk.sprite} decorative className="h-[18px] w-[18px]" />
                            )}
                            <span className="leading-none">x{perk.value}</span>
                          </div>
                        ))}
                        {bonusHours > 0 && (
                          <div className="hub-subpanel app-surface-subtle app-text col-span-2 flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black sm:col-span-1">
                            <HudSprite icon="heart" decorative className="h-[18px] w-[18px]" />
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
