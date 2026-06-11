import type { PowerupType } from './types';

export type HudSpriteType = 'coin' | 'heart';
export type UiSpriteType =
  | 'create'
  | 'home'
  | 'key'
  | 'lock'
  | 'question'
  | 'shop'
  | 'quest'
  | 'stats'
  | 'leaderboard'
  | 'settings'
  | 'sound'
  | 'thumbUp'
  | 'thumbDown';

export const coinEmoji = '\u{1FA99}';
export const crossMarkEmoji = '\u{274C}';
export const wordContinuationGlyph = '\u{21B3}';
export const heartEmoji = '\u{2764}\u{FE0F}';
export const infiniteHeartsIcon = '\u267E\u{FE0F}';

export const heartRefillIntervalMs = 30 * 60 * 1000;
export const challengeHeartbeatIntervalMs = 10 * 1000;
export const inlineMaxWordsPerLine = 8;
export const maxWordTileColumns = 12;

export const powerupLabel: Record<PowerupType, string> = {
  hammer: 'Hammer',
  wand: 'Wand',
  shield: 'Shield',
  rocket: 'Rocket',
};

export const powerupAssetPath: Record<PowerupType, string> = {
  hammer: '/powerup_hammer.png',
  wand: '/powerup_wand.png',
  shield: '/powerup_shield.png',
  rocket: '/powerup_rocket.png',
};

export const hudSpriteLabel: Record<HudSpriteType, string> = {
  coin: 'Coins',
  heart: 'Heart',
};

export const hudSpriteAssetPath: Record<HudSpriteType, string> = {
  coin: '/hud_coin.png',
  heart: '/hud_heart.png',
};

export const uiSpriteLabel: Record<UiSpriteType, string> = {
  create: 'Create',
  home: 'Home',
  key: 'Key',
  lock: 'Lock',
  question: 'Question mark',
  shop: 'Shop',
  quest: 'Quest',
  stats: 'Stats',
  leaderboard: 'Leaderboard',
  settings: 'Settings',
  sound: 'Sound',
  thumbUp: 'Thumbs up',
  thumbDown: 'Thumbs down',
};

export const uiSpriteAssetPath: Record<UiSpriteType, string> = {
  create: '/ui_create.png',
  home: '/ui_home.png',
  key: '/ui_key.png',
  lock: '/ui_lock.png',
  question: '/ui_question.png',
  shop: '/ui_shop.png',
  quest: '/ui_quest.png',
  stats: '/ui_stats.png',
  leaderboard: '/ui_leaderboard.png',
  settings: '/ui_settings.png',
  sound: '/ui_sound.png',
  thumbUp: '/ui_thumb_up.png',
  thumbDown: '/ui_thumb_down.png',
};

export const coinHeartRefillCost = 350;
export const coinHeartTopUpCost = 150;

export const helpSlides = [
  {
    id: 'guess',
    stepLabel: 'Step 1',
    title: 'Pick a tile and type',
    description:
      'Tap a blank tile, then enter a letter. The highlighted tile is where your next guess goes.',
    hint: 'You can play this way in both inline and expanded mode.',
  },
  {
    id: 'match',
    stepLabel: 'Step 2',
    title: 'Match repeated numbers',
    description:
      'The same number always stands for the same letter, so one good guess helps across the whole phrase.',
    hint: 'If 12 becomes S once, every 12 should be S.',
  },
  {
    id: 'survive',
    stepLabel: 'Step 3',
    title: 'Protect your mistakes',
    description:
      'Solve the phrase before your mistakes run out. Powerups can reveal tiles or save a risky move.',
    hint:
      'Hammer targets one tile. Wand reveals a letter. Shield blocks one miss. Rocket reveals multiple tiles.',
  },
  {
    id: 'finish',
    stepLabel: 'Step 4',
    title: 'Finish and climb',
    description:
      'Complete the challenge to lock in your result, earn coins, and move up the leaderboard.',
    hint: 'Cleaner and faster solves rank better.',
  },
] as const;

export const maxOutcomeCrowdAvatars = 20;
export const outcomeCrowdScale = 0.75;

export const confettiPalette = [
  '#6e5400',
  '#6c2d0d',
  '#23495a',
  '#315739',
  '#5e2940',
  '#5f401f',
];
export const outcomeCrowdPalette = [
  '#8ecdf8',
  '#f5b38a',
  '#78d6c6',
  '#f48aa4',
  '#b5c99a',
  '#d4b2f5',
  '#f7d774',
  '#8fd3ff',
  '#f3a683',
];
