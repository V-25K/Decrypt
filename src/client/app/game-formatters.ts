import type { CSSProperties } from 'react';
import {
  getCommunityFlairStyle,
  getQuestProgressValue,
  questCatalog,
  questProgressionGroups,
  type QuestDefinition,
  type QuestReward,
} from '../../shared/quests';
import { coinEmoji, powerupIcon } from './constants';
import type { Inventory, QuestProgress } from './types';

export const questCards: QuestDefinition[] = questCatalog;

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
): { reward: string; flair: string | null } => {
  const parts: string[] = [];
  if (reward.coins > 0) {
    parts.push(`${coinEmoji} +${reward.coins}`);
  }
  const inventoryParts: Array<{ key: keyof Inventory; icon: string }> = [
    { key: 'hammer', icon: powerupIcon.hammer },
    { key: 'wand', icon: powerupIcon.wand },
    { key: 'shield', icon: powerupIcon.shield },
    { key: 'rocket', icon: powerupIcon.rocket },
  ];
  for (const item of inventoryParts) {
    const count = reward.inventory[item.key] ?? 0;
    if (count > 0) {
      parts.push(`${item.icon} +${count}`);
    }
  }
  return {
    reward: parts.join(' '),
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
  if (value <= 7) {
    return 'Medium';
  }
  if (value >= 9) {
    return 'Expert';
  }
  return 'Hard';
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
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
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
