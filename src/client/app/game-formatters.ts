import type { CSSProperties } from 'react';
import {
  getCommunityFlairStyle,
  getQuestProgressValue,
  questCatalog,
  questProgressionGroups,
  type QuestDefinition,
  type QuestReward,
} from '../../shared/quests';
import type { Inventory, PowerupType, QuestProgress } from './types';

export const questCards: QuestDefinition[] = questCatalog;

export type QuestRewardDisplayItem =
  | { key: 'coins'; kind: 'coins'; count: number }
  | { key: PowerupType; kind: 'powerup'; count: number; powerup: PowerupType };

export const groupedQuestIds = new Set(
  Object.values(questProgressionGroups).flat()
);

export const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatQuestReward = (
  reward: QuestReward
): { items: QuestRewardDisplayItem[]; flair: string | null } => {
  const items: QuestRewardDisplayItem[] = [];
  if (reward.coins > 0) {
    items.push({ key: 'coins', kind: 'coins', count: reward.coins });
  }
  const inventoryParts: Array<{ key: keyof Inventory; powerup: PowerupType }> = [
    { key: 'hammer', powerup: 'hammer' },
    { key: 'wand', powerup: 'wand' },
    { key: 'shield', powerup: 'shield' },
    { key: 'rocket', powerup: 'rocket' },
  ];
  for (const item of inventoryParts) {
    const count = reward.inventory[item.key] ?? 0;
    if (count > 0) {
      items.push({
        key: item.powerup,
        kind: 'powerup',
        count,
        powerup: item.powerup,
      });
    }
  }
  return {
    items,
    flair: reward.flair,
  };
};

export const flairChipStyle = (
  flair: string,
  active: boolean
): CSSProperties | undefined => {
  const style = getCommunityFlairStyle(flair);
  if (!style) {
    return undefined;
  }
  return {
    backgroundColor: style.backgroundColor,
    color: style.textColor === 'dark' ? '#111111' : '#ffffff',
    borderColor: '#111111',
    opacity: active ? 1 : 0.82,
  };
};

export const flairTagStyle = (flair: string): CSSProperties | undefined => {
  const style = getCommunityFlairStyle(flair);
  if (!style) {
    return undefined;
  }
  return {
    backgroundColor: style.backgroundColor,
    color: style.textColor === 'dark' ? '#111111' : '#ffffff',
    borderColor: '#111111',
  };
};

export const getVisibleMilestoneIds = (
  progress: QuestProgress,
  claimedSet: Set<string>
): Set<string> => {
  const visible = new Set<string>();
  for (const group of Object.values(questProgressionGroups)) {
    for (const questId of group) {
      const quest = questCards.find((entry) => entry.id === questId);
      if (!quest) {
        continue;
      }
      const current = getQuestProgressValue(quest, progress);
      const completed = current >= quest.target;
      const claimed = claimedSet.has(questId);
      if (!(completed && claimed)) {
        visible.add(questId);
        break;
      }
    }
  }
  return visible;
};

export const isQuestHidden = (
  quest: QuestDefinition,
  progress: QuestProgress,
  claimedSet: Set<string>
): boolean => {
  const current = getQuestProgressValue(quest, progress);
  const completed = current >= quest.target;
  const claimed = claimedSet.has(quest.id);
  return completed && claimed;
};

export const formatChallengeType = (value: string | undefined): string => {
  const normalized = (value ?? 'QUOTE')
    .toUpperCase()
    .replace(/[^A-Z_]/g, '')
    .trim();
  if (normalized.length === 0) {
    return 'Quote';
  }
  switch (normalized) {
    case 'LYRIC_LINE':
      return 'Lyric';
    case 'MOVIE_LINE':
      return 'Movie';
    case 'ANIME_LINE':
      return 'Anime';
    case 'SPEECH_LINE':
      return 'Speech';
    case 'BOOK_LINE':
      return 'Book';
    case 'TV_LINE':
      return 'TV';
    case 'SAYING':
      return 'Saying';
    case 'PROVERB':
      return 'Proverb';
    case 'QUOTE':
    default:
      return 'Quote';
  }
};

export const formatDifficultyLabel = (value: number | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Medium';
  }
  if (value <= 3) {
    return 'Easy';
  }
  if (value <= 5) {
    return 'Medium';
  }
  if (value <= 8) {
    return 'Hard';
  }
  return 'Expert';
};

export const formatLeaderboardName = (entry: {
  username?: string | null;
  userId: string;
}): string => {
  if (entry.username && entry.username.trim().length > 0) {
    return entry.username;
  }
  return entry.userId.startsWith('t2_') ? entry.userId.slice(3) : entry.userId;
};

export const formatStatDuration = (seconds: number | null | undefined): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '--';
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const formatRankLabel = (rank: number | null | undefined): string =>
  typeof rank === 'number' && Number.isFinite(rank) && rank > 0 ? `#${rank}` : '--';

export const computeAverageSolveSeconds = (
  totalSeconds: number | null | undefined,
  clears: number | null | undefined
): number | null => {
  if (
    typeof totalSeconds !== 'number' ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return null;
  }
  if (typeof clears !== 'number' || !Number.isFinite(clears)) {
    return null;
  }
  const normalizedClears = Math.floor(clears);
  if (normalizedClears <= 0) {
    return null;
  }
  return Math.round(totalSeconds / normalizedClears);
};
