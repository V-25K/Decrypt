import { getOfferPromotionLabel } from '../../shared/store';
import { coinEmoji, heartEmoji, powerupIcon } from '../app/constants';
import type { StoreProduct } from '../app/types';
import { RedditTokenIcon } from '../components/Icons';

type ShopScreenProps = {
  shopProducts: StoreProduct[];
  offerBusy: boolean;
  onPurchase: (sku: string) => void;
};

export const ShopScreen = ({
  shopProducts,
  offerBusy,
  onPurchase,
}: ShopScreenProps) => (
  <section className="app-surface flex min-h-0 flex-1 flex-col" data-testid="shop-screen">
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
      <div data-testid="shop-product-list" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {shopProducts.length === 0 ? (
          <div className="app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
            No bundles available right now. For payment sandbox testing, run upload +
            playtest so products sync.
          </div>
        ) : (
          shopProducts.map((product) => {
            const promotionLabel = getOfferPromotionLabel(product.sku);
            const toolPerks = [
              { key: 'hearts', label: heartEmoji, value: product.perks.hearts },
              { key: 'hammer', label: powerupIcon.hammer, value: product.perks.hammer },
              { key: 'wand', label: powerupIcon.wand, value: product.perks.wand },
              { key: 'rocket', label: powerupIcon.rocket, value: product.perks.rocket },
              { key: 'shield', label: powerupIcon.shield, value: product.perks.shield },
            ].filter((entry) => entry.value > 0);
            const bonusHours = product.perks.infiniteHeartsHours;
            const hasPromotion = product.isOneTime || promotionLabel === 'Popular';
            return (
              <section
                key={product.sku}
                data-testid={`shop-product-card-${product.sku}`}
                className={`app-surface relative overflow-hidden rounded-2xl border app-border p-3 ${
                  hasPromotion ? 'ring-2 ring-[rgba(255,122,48,0.35)]' : ''
                }`}
              >
                {hasPromotion && (
                  <div className="badge-primary absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.02em]">
                    {product.isOneTime ? 'One Time Offer' : promotionLabel}
                  </div>
                )}
                <div className="mt-5 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] gap-2">
                  <div className="app-surface-subtle rounded-xl px-2 py-3 text-center">
                    <div className="text-[28px] leading-none">{coinEmoji}</div>
                    <div className="app-text mt-1 text-[22px] font-black leading-none">
                      {product.perks.coins.toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={`grid grid-cols-2 gap-1.5 ${
                      bonusHours > 0 ? 'grid-rows-[repeat(2,minmax(0,1fr))]' : ''
                    }`}
                  >
                    {toolPerks.slice(0, 4).map((perk) => (
                      <div
                        key={perk.key}
                        className="app-surface-subtle app-text flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black"
                      >
                        <span className="text-[18px] leading-none">{perk.label}</span>
                        <span className="leading-none">x{perk.value}</span>
                      </div>
                    ))}
                    {bonusHours > 0 && (
                      <div className="app-surface-subtle app-text col-span-2 flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[13px] font-black">
                        <span className="text-[18px] leading-none">{heartEmoji}</span>
                        <span className="leading-none">{bonusHours}h</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <h3 className="app-text min-w-0 text-sm font-black uppercase leading-tight">
                    {product.displayName}
                  </h3>
                  <button
                    data-testid={`shop-buy-${product.sku}`}
                    type="button"
                    className="btn-3d btn-primary shrink-0 rounded-xl px-4 py-2 text-sm font-black uppercase"
                    onClick={() => onPurchase(product.sku)}
                    disabled={offerBusy}
                  >
                    <span className="flex items-center gap-1.5">
                      <RedditTokenIcon className="h-4 w-4" />
                      {product.price}
                    </span>
                  </button>
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  </section>
);
