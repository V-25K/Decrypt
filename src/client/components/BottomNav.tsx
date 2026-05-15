import { navItemClass } from '../app/ui';
import { UiSprite } from './UiSprite';

type BottomNavProps = {
  isShopScreen: boolean;
  isHomeScreen: boolean;
  isQuestScreen: boolean;
  isStatsScreen: boolean;
  isLeaderboardScreen: boolean;
  hasClaimableQuest: boolean;
  onOpenShop: () => void;
  onOpenHome: () => void;
  onOpenQuest: () => void;
  onOpenStats: () => void;
  onOpenLeaderboard: () => void;
};

export const BottomNav = ({
  isShopScreen,
  isHomeScreen,
  isQuestScreen,
  isStatsScreen,
  isLeaderboardScreen,
  hasClaimableQuest,
  onOpenShop,
  onOpenHome,
  onOpenQuest,
  onOpenStats,
  onOpenLeaderboard,
}: BottomNavProps) => (
  <section
    className="bottom-nav-shell app-surface border-t app-border px-2 py-2"
    data-testid="bottom-nav"
  >
    <div className="flex items-center justify-center gap-5">
      <button
        data-testid="nav-shop"
        className={navItemClass(isShopScreen)}
        onClick={onOpenShop}
        aria-label="Shop"
        title="Shop"
      >
        <UiSprite icon="shop" decorative className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-home"
        className={navItemClass(isHomeScreen)}
        onClick={onOpenHome}
        aria-label="Home"
        title="Home"
      >
        <UiSprite icon="home" decorative className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-quest"
        className={`${navItemClass(isQuestScreen)} relative`}
        onClick={onOpenQuest}
        aria-label="Quests"
        title="Quests"
      >
        <UiSprite icon="quest" decorative className="h-[30px] w-[30px]" />
        {hasClaimableQuest && (
          <span className="pointer-events-none absolute -right-[2px] -top-[2px] flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white/70 bg-red-500"></span>
          </span>
        )}
      </button>
      <button
        data-testid="nav-stats"
        className={navItemClass(isStatsScreen)}
        onClick={onOpenStats}
        aria-label="Stats"
        title="Stats"
      >
        <UiSprite icon="stats" decorative className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-leaderboard"
        className={navItemClass(isLeaderboardScreen)}
        onClick={onOpenLeaderboard}
        aria-label="Leaderboard"
        title="Leaderboard"
      >
        <UiSprite icon="leaderboard" decorative className="h-[30px] w-[30px]" />
      </button>
    </div>
  </section>
);
