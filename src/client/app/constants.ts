import type { PowerupType } from './types';

export const coinEmoji = '\u{1FA99}';
export const crossMarkEmoji = '\u{274C}';
export const lockEmoji = '\u{1F512}';
export const wordContinuationGlyph = '\u{21B3}';
export const heartEmoji = '\u{2764}\u{FE0F}';
export const emptyHeartGlyph = '\u2661';

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

export const powerupCost: Record<PowerupType, number> = {
  hammer: 60,
  shield: 110,
  wand: 170,
  rocket: 240,
};

export const powerupIcon: Record<PowerupType, string> = {
  hammer: '\u{1F528}',
  wand: '\u{1FA84}',
  shield: '\u{1F6E1}\u{FE0F}',
  rocket: '\u{1F680}',
};

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
    hint: `${powerupIcon.hammer} Hammer targets one tile. ${powerupIcon.wand} Wand reveals a letter. ${powerupIcon.shield} Shield blocks one miss. ${powerupIcon.rocket} Rocket reveals multiple tiles.`,
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

export const endlessPreviewLevels = Array.from(
  { length: 12 },
  (_, index) => index + 1
);

export const maxOutcomeCrowdAvatars = 20;
export const outcomeCrowdScale = 0.75;
export const outcomeCrowdCollisionPadding = 2;
export const outcomeCrowdCollisionPasses = 2;

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
