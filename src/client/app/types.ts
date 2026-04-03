import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../server/trpc';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Puzzle = RouterOutputs['game']['loadLevel']['puzzle'];
export type Profile = RouterOutputs['game']['bootstrap']['profile'];
export type Inventory = RouterOutputs['game']['bootstrap']['inventory'];
export type EndlessCatalogStatus = RouterOutputs['game']['bootstrap']['endlessCatalog'];
export type StoreProduct = RouterOutputs['store']['getProducts']['products'][number];
export type QuestStatus = RouterOutputs['quests']['getStatus'];
export type QuestProgress = QuestStatus['progress'];
export type PuzzlePublicTile = Puzzle['tiles'][number];
export type PowerupType = 'hammer' | 'wand' | 'shield' | 'rocket';
export type BuyDialogState = { item: PowerupType; quantity: number };
export type DeviceTier = 'mobile' | 'tablet' | 'desktop';
export type ChallengeMetrics = RouterOutputs['game']['loadLevel']['challengeMetrics'];
export type DailyLeaderboardEntry =
  RouterOutputs['leaderboard']['getDaily']['entries'][number];
export type AllTimeLeaderboardEntry =
  RouterOutputs['leaderboard']['getAllTime']['levels'][number];
export type RankSummary = RouterOutputs['leaderboard']['getRankSummary'];
export type AppScreen =
  | 'challenge'
  | 'home'
  | 'shop'
  | 'quest'
  | 'stats'
  | 'leaderboard';
export type LeaderboardTab = 'daily' | 'endless';
export type StatsTab = 'daily' | 'endless';
export type HomeTab = 'daily' | 'endless';
