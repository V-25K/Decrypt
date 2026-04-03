import type { Inventory, QuestProgress } from './game';

export type QuestCategory = 'daily' | 'milestone';

export type QuestGroupKey =
  | 'wordsmith'
  | 'flawless'
  | 'spender'
  | 'purchase'
  | 'dailyTop'
  | 'endless';

export type QuestReward = {
  coins: number;
  inventory: Partial<Inventory>;
  flair: string | null;
};

export type CommunityFlairStyle = {
  backgroundColor: string;
  textColor: 'light' | 'dark';
};

export type QuestDefinition = {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  progressField: keyof QuestProgress;
  target: number;
  binary?: boolean;
  groupKey?: QuestGroupKey;
  reward: QuestReward;
};

export const questCatalog: QuestDefinition[] = [
  {
    id: 'daily_play_1',
    title: 'First Clear',
    description: 'Complete 1 level today.',
    category: 'daily',
    progressField: 'dailyPlayCount',
    target: 1,
    reward: { coins: 15, inventory: {}, flair: null },
  },
  {
    id: 'daily_play_3',
    title: 'On a Roll',
    description: 'Complete 3 levels today.',
    category: 'daily',
    progressField: 'dailyPlayCount',
    target: 3,
    reward: { coins: 25, inventory: {}, flair: null },
  },
  {
    id: 'daily_share_1',
    title: 'Share It',
    description: 'Share your score in the comments.',
    category: 'daily',
    progressField: 'dailyShareCount',
    target: 1,
    reward: { coins: 15, inventory: {}, flair: null },
  },
  {
    id: 'daily_fast_under_120',
    title: 'Quick Clear',
    description: 'Finish one level under 2 minutes.',
    category: 'daily',
    progressField: 'dailyFastWin',
    target: 1,
    binary: true,
    reward: { coins: 0, inventory: { hammer: 1 }, flair: null },
  },
  {
    id: 'daily_under_5min',
    title: 'Steady Solve',
    description: 'Finish one level under 5 minutes.',
    category: 'daily',
    progressField: 'dailyUnder5Min',
    target: 1,
    binary: true,
    reward: { coins: 15, inventory: {}, flair: null },
  },
  {
    id: 'daily_no_mistake',
    title: 'Clean Sheet',
    description: 'Complete one level with zero mistakes.',
    category: 'daily',
    progressField: 'dailyNoMistake',
    target: 1,
    binary: true,
    reward: { coins: 30, inventory: {}, flair: null },
  },
  {
    id: 'daily_no_powerups',
    title: 'Bare Hands',
    description: 'Complete one level with no powerups.',
    category: 'daily',
    progressField: 'dailyNoPowerup',
    target: 1,
    binary: true,
    reward: { coins: 0, inventory: { shield: 1 }, flair: null },
  },
  {
    id: 'milestone_wordsmith_50',
    title: 'Wordsmith I',
    description: 'Solve 50 words total.',
    category: 'milestone',
    progressField: 'lifetimeWordsmith',
    target: 50,
    groupKey: 'wordsmith',
    reward: { coins: 60, inventory: {}, flair: 'Quick Reader' },
  },
  {
    id: 'milestone_wordsmith_200',
    title: 'Wordsmith II',
    description: 'Solve 200 words total.',
    category: 'milestone',
    progressField: 'lifetimeWordsmith',
    target: 200,
    groupKey: 'wordsmith',
    reward: { coins: 140, inventory: {}, flair: 'Close Reader' },
  },
  {
    id: 'milestone_wordsmith_500',
    title: 'Wordsmith III',
    description: 'Solve 500 words total.',
    category: 'milestone',
    progressField: 'lifetimeWordsmith',
    target: 500,
    groupKey: 'wordsmith',
    reward: { coins: 300, inventory: {}, flair: 'Cipher Reader' },
  },
  {
    id: 'milestone_wordsmith_1000',
    title: 'Wordsmith IV',
    description: 'Solve 1000 words total.',
    category: 'milestone',
    progressField: 'lifetimeWordsmith',
    target: 1000,
    groupKey: 'wordsmith',
    reward: { coins: 650, inventory: {}, flair: 'Golden Brain' },
  },
  {
    id: 'milestone_flawless_5',
    title: 'Clean Slate',
    description: 'Win 5 levels with zero mistakes.',
    category: 'milestone',
    progressField: 'lifetimeFlawless',
    target: 5,
    groupKey: 'flawless',
    reward: { coins: 70, inventory: {}, flair: 'Steady Hand' },
  },
  {
    id: 'milestone_flawless_10',
    title: 'No Misses',
    description: 'Win 10 levels with zero mistakes.',
    category: 'milestone',
    progressField: 'lifetimeFlawless',
    target: 10,
    groupKey: 'flawless',
    reward: { coins: 140, inventory: {}, flair: 'Sure Footed' },
  },
  {
    id: 'milestone_flawless_20',
    title: 'Perfect Run',
    description: 'Win 20 levels with zero mistakes.',
    category: 'milestone',
    progressField: 'lifetimeFlawless',
    target: 20,
    groupKey: 'flawless',
    reward: { coins: 280, inventory: {}, flair: 'Clean Solver' },
  },
  {
    id: 'milestone_flawless_50',
    title: 'Locked In',
    description: 'Win 50 levels with zero mistakes.',
    category: 'milestone',
    progressField: 'lifetimeFlawless',
    target: 50,
    groupKey: 'flawless',
    reward: { coins: 550, inventory: {}, flair: 'Unshaken' },
  },
  {
    id: 'milestone_flawless_100',
    title: 'Untouchable',
    description: 'Win 100 levels with zero mistakes.',
    category: 'milestone',
    progressField: 'lifetimeFlawless',
    target: 100,
    groupKey: 'flawless',
    reward: { coins: 1000, inventory: {}, flair: 'Untouchable' },
  },
  {
    id: 'milestone_spent_500',
    title: 'Pocket Change',
    description: 'Spend 500 coins total.',
    category: 'milestone',
    progressField: 'lifetimeCoinsSpent',
    target: 500,
    groupKey: 'spender',
    reward: { coins: 20, inventory: { hammer: 1 }, flair: 'Well Stocked' },
  },
  {
    id: 'milestone_spent_2000',
    title: 'Stocked Up',
    description: 'Spend 2000 coins total.',
    category: 'milestone',
    progressField: 'lifetimeCoinsSpent',
    target: 2000,
    groupKey: 'spender',
    reward: { coins: 35, inventory: { shield: 1 }, flair: 'Big Buyer' },
  },
  {
    id: 'milestone_spent_10000',
    title: 'Loaded Out',
    description: 'Spend 10000 coins total.',
    category: 'milestone',
    progressField: 'lifetimeCoinsSpent',
    target: 10000,
    groupKey: 'spender',
    reward: { coins: 125, inventory: { wand: 2 }, flair: 'Treasure Room' },
  },
  {
    id: 'milestone_spent_50000',
    title: 'Deep Pockets',
    description: 'Spend 50000 coins total.',
    category: 'milestone',
    progressField: 'lifetimeCoinsSpent',
    target: 50000,
    groupKey: 'spender',
    reward: {
      coins: 700,
      inventory: { shield: 2, wand: 4, rocket: 4 },
      flair: 'Deep Pockets',
    },
  },
  {
    id: 'milestone_purchase_1',
    title: 'First Purchase',
    description: 'Complete your first bundle purchase.',
    category: 'milestone',
    progressField: 'lifetimePurchases',
    target: 1,
    groupKey: 'purchase',
    reward: { coins: 0, inventory: { hammer: 1, shield: 1 }, flair: 'First Patron' },
  },
  {
    id: 'milestone_purchase_3',
    title: 'Regular Supporter',
    description: 'Complete 3 bundle purchases.',
    category: 'milestone',
    progressField: 'lifetimePurchases',
    target: 3,
    groupKey: 'purchase',
    reward: { coins: 100, inventory: { wand: 1, shield: 1 }, flair: 'Regular' },
  },
  {
    id: 'milestone_purchase_10',
    title: 'House Favorite',
    description: 'Complete 10 bundle purchases.',
    category: 'milestone',
    progressField: 'lifetimePurchases',
    target: 10,
    groupKey: 'purchase',
    reward: {
      coins: 300,
      inventory: { shield: 2, wand: 2, rocket: 1 },
      flair: 'House Favorite',
    },
  },
  {
    id: 'milestone_daily_top_1',
    title: 'First Crown',
    description: 'Finish #1 on the daily leaderboard once.',
    category: 'milestone',
    progressField: 'lifetimeDailyTopRanks',
    target: 1,
    groupKey: 'dailyTop',
    reward: { coins: 100, inventory: {}, flair: 'Front Runner' },
  },
  {
    id: 'milestone_daily_top_10',
    title: 'Ten Crowns',
    description: 'Finish #1 on the daily leaderboard 10 times.',
    category: 'milestone',
    progressField: 'lifetimeDailyTopRanks',
    target: 10,
    groupKey: 'dailyTop',
    reward: { coins: 300, inventory: {}, flair: 'Crown Holder' },
  },
  {
    id: 'milestone_daily_top_20',
    title: 'Twenty Crowns',
    description: 'Finish #1 on the daily leaderboard 20 times.',
    category: 'milestone',
    progressField: 'lifetimeDailyTopRanks',
    target: 20,
    groupKey: 'dailyTop',
    reward: { coins: 700, inventory: {}, flair: 'Top Table' },
  },
  {
    id: 'milestone_daily_top_50',
    title: 'Fifty Crowns',
    description: 'Finish #1 on the daily leaderboard 50 times.',
    category: 'milestone',
    progressField: 'lifetimeDailyTopRanks',
    target: 50,
    groupKey: 'dailyTop',
    reward: { coins: 1600, inventory: {}, flair: 'Headliner' },
  },
  {
    id: 'milestone_daily_top_100',
    title: 'Hundred Crowns',
    description: 'Finish #1 on the daily leaderboard 100 times.',
    category: 'milestone',
    progressField: 'lifetimeDailyTopRanks',
    target: 100,
    groupKey: 'dailyTop',
    reward: { coins: 3000, inventory: {}, flair: 'Hall of Fame' },
  },
  {
    id: 'milestone_endless_20',
    title: 'Long Run',
    description: 'Clear 20 endless levels total.',
    category: 'milestone',
    progressField: 'lifetimeEndlessClears',
    target: 20,
    groupKey: 'endless',
    reward: { coins: 60, inventory: {}, flair: 'Long Run' },
  },
  {
    id: 'milestone_endless_40',
    title: 'Deep Run',
    description: 'Clear 40 endless levels total.',
    category: 'milestone',
    progressField: 'lifetimeEndlessClears',
    target: 40,
    groupKey: 'endless',
    reward: { coins: 140, inventory: {}, flair: 'Deep Run' },
  },
  {
    id: 'milestone_endless_80',
    title: 'Marathon',
    description: 'Clear 80 endless levels total.',
    category: 'milestone',
    progressField: 'lifetimeEndlessClears',
    target: 80,
    groupKey: 'endless',
    reward: { coins: 300, inventory: {}, flair: 'Marathoner' },
  },
  {
    id: 'milestone_endless_150',
    title: 'No Finish Line',
    description: 'Clear 150 endless levels total.',
    category: 'milestone',
    progressField: 'lifetimeEndlessClears',
    target: 150,
    groupKey: 'endless',
    reward: { coins: 650, inventory: {}, flair: 'No Finish Line' },
  },
];

export const questCatalogById = questCatalog.reduce<Record<string, QuestDefinition>>(
  (catalog, quest) => {
    catalog[quest.id] = quest;
    return catalog;
  },
  {}
);

export const questProgressionGroups: Record<QuestGroupKey, string[]> = {
  wordsmith: questCatalog
    .filter((quest) => quest.groupKey === 'wordsmith')
    .map((quest) => quest.id),
  flawless: questCatalog
    .filter((quest) => quest.groupKey === 'flawless')
    .map((quest) => quest.id),
  spender: questCatalog
    .filter((quest) => quest.groupKey === 'spender')
    .map((quest) => quest.id),
  purchase: questCatalog
    .filter((quest) => quest.groupKey === 'purchase')
    .map((quest) => quest.id),
  dailyTop: questCatalog
    .filter((quest) => quest.groupKey === 'dailyTop')
    .map((quest) => quest.id),
  endless: questCatalog
    .filter((quest) => quest.groupKey === 'endless')
    .map((quest) => quest.id),
};

const communityFlairStyleByGroup: Record<QuestGroupKey, CommunityFlairStyle> = {
  wordsmith: { backgroundColor: '#8ecdf8', textColor: 'dark' },
  flawless: { backgroundColor: '#7ddc92', textColor: 'dark' },
  spender: { backgroundColor: '#f2c94c', textColor: 'dark' },
  purchase: { backgroundColor: '#f5b38a', textColor: 'dark' },
  dailyTop: { backgroundColor: '#f48aa4', textColor: 'dark' },
  endless: { backgroundColor: '#78d6c6', textColor: 'dark' },
};

const flairGroupByName = questCatalog.reduce<Record<string, QuestGroupKey>>(
  (lookup, quest) => {
    if (quest.reward.flair && quest.groupKey) {
      lookup[quest.reward.flair] = quest.groupKey;
    }
    return lookup;
  },
  {}
);

export const getCommunityFlairStyle = (
  flair: string
): CommunityFlairStyle | null => {
  const normalizedFlair = flair.trim();
  if (normalizedFlair.length === 0) {
    return null;
  }
  const groupKey = flairGroupByName[normalizedFlair];
  return groupKey ? communityFlairStyleByGroup[groupKey] : communityFlairStyleByGroup.wordsmith;
};

export const getQuestProgressValue = (
  quest: QuestDefinition,
  progress: QuestProgress
): number => {
  const rawValue = progress[quest.progressField];
  if (quest.binary) {
    return rawValue ? 1 : 0;
  }
  return typeof rawValue === 'number' ? rawValue : 0;
};

export const isQuestDefinitionComplete = (
  quest: QuestDefinition,
  progress: QuestProgress
): boolean => getQuestProgressValue(quest, progress) >= quest.target;
