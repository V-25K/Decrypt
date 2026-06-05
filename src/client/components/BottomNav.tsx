import { navItemClass } from '../app/ui';
import { UiSprite } from './UiSprite';
import type { MouseEvent } from 'react';

type BottomNavProps = {
  isShopScreen: boolean;
  isHomeScreen: boolean;
  isCommunityScreen: boolean;
  isQuestScreen: boolean;
  isStatsScreen: boolean;
  isLeaderboardScreen: boolean;
  hasClaimableQuest: boolean;
  communityNotificationCount: number;
  onOpenShop: () => void;
  onOpenHome: () => void;
  onOpenCommunity: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpenQuest: () => void;
  onOpenStats: () => void;
  onOpenLeaderboard: () => void;
};

export const BottomNav = ({
  isShopScreen,
  isHomeScreen,
  isCommunityScreen,
  isQuestScreen,
  isStatsScreen,
  isLeaderboardScreen,
  hasClaimableQuest,
  communityNotificationCount,
  onOpenShop,
  onOpenHome,
  onOpenCommunity,
  onOpenQuest,
  onOpenStats,
  onOpenLeaderboard,
}: BottomNavProps) => (
  <section
    className="bottom-nav-shell app-surface border-t app-border px-2 py-2"
    data-testid="bottom-nav"
  >
    <div className="flex items-center justify-center gap-1">
      <button
        data-testid="nav-shop"
        className={navItemClass(isShopScreen)}
        onClick={onOpenShop}
        aria-label="Shop"
        title="Shop"
      >
        <UiSprite icon="shop" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Shop
        </span>
      </button>
      <button
        data-testid="nav-home"
        className={navItemClass(isHomeScreen)}
        onClick={onOpenHome}
        aria-label="Home"
        title="Home"
      >
        <UiSprite icon="home" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Home
        </span>
      </button>
      <button
        data-testid="nav-create"
        className={`${navItemClass(isCommunityScreen)} relative`}
        onClick={onOpenCommunity}
        aria-label={
          communityNotificationCount > 0
            ? `Community, ${communityNotificationCount} item${communityNotificationCount === 1 ? '' : 's'} need attention`
            : 'Community'
        }
        title={
          communityNotificationCount > 0
            ? `${communityNotificationCount} community item${communityNotificationCount === 1 ? '' : 's'} need attention`
            : 'Community'
        }
      >
        <UiSprite icon="create" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Create
        </span>
        {communityNotificationCount > 0 && (
          <span
            className="pointer-events-none absolute -right-[2px] -top-[4px] flex min-h-4 min-w-4 items-center justify-center rounded-full border border-white/70 bg-red-500 px-1 text-[9px] font-black leading-none text-white shadow"
            data-testid="community-nav-badge"
          >
            {communityNotificationCount > 9 ? '9+' : communityNotificationCount}
          </span>
        )}
      </button>
      <button
        data-testid="nav-quest"
        className={`${navItemClass(isQuestScreen)} relative`}
        onClick={onOpenQuest}
        aria-label="Quests"
        title="Quests"
      >
        <UiSprite icon="quest" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Quests
        </span>
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
        <UiSprite icon="stats" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Stats
        </span>
      </button>
      <button
        data-testid="nav-leaderboard"
        className={navItemClass(isLeaderboardScreen)}
        onClick={onOpenLeaderboard}
        aria-label="Leaderboard"
        title="Leaderboard"
      >
        <UiSprite icon="leaderboard" decorative className="h-6 w-6" />
        <span className="max-w-[42px] truncate text-[9px] font-black uppercase leading-none">
          Ranks
        </span>
      </button>
    </div>
  </section>
);
