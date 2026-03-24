import { navItemClass } from '../app/ui';
import {
  HomeIcon,
  LeaderboardIcon,
  QuestIcon,
  ShopIcon,
  StatsIcon,
} from './Icons';

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
  <section className="app-surface border-t app-border px-2 py-2" data-testid="bottom-nav">
    <div className="flex items-center justify-center gap-5">
      <button
        data-testid="nav-shop"
        className={navItemClass(isShopScreen)}
        onClick={onOpenShop}
        aria-label="Shop"
        title="Shop"
      >
        <ShopIcon className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-home"
        className={navItemClass(isHomeScreen)}
        onClick={onOpenHome}
        aria-label="Home"
        title="Home"
      >
        <HomeIcon className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-quest"
        className={`${navItemClass(isQuestScreen)} relative`}
        onClick={onOpenQuest}
        aria-label="Quests"
        title="Quests"
      >
        <QuestIcon className="h-[30px] w-[30px]" />
        {hasClaimableQuest && (
          <span className="absolute right-[6px] top-[6px] h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>
      <button
        data-testid="nav-stats"
        className={navItemClass(isStatsScreen)}
        onClick={onOpenStats}
        aria-label="Stats"
        title="Stats"
      >
        <StatsIcon className="h-[30px] w-[30px]" />
      </button>
      <button
        data-testid="nav-leaderboard"
        className={navItemClass(isLeaderboardScreen)}
        onClick={onOpenLeaderboard}
        aria-label="Leaderboard"
        title="Leaderboard"
      >
        <LeaderboardIcon className="h-[30px] w-[30px]" />
      </button>
    </div>
  </section>
);
