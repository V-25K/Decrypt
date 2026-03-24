import type { PowerupType } from './types';

export const coinEmoji = '\u{1FA99}';
export const crossMarkEmoji = '\u{274C}';
export const lockEmoji = '\u{1F512}';
export const wordContinuationGlyph = '\u{21B3}';
export const heartEmoji = '\u{2764}\u{FE0F}';
export const emptyHeartGlyph = '\u2661';

export const heartRefillIntervalMs = 30 * 60 * 1000;
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

export const helpSections = [
  {
    title: 'How Decrypt Works',
    lines: [
      'Tap a blank tile, then type a letter using your device keyboard.',
      'Matching numbers always map to the same letter.',
    ],
  },
  {
    title: 'Goal',
    lines: ['Solve the full phrase before all mistakes are used.'],
  },
  {
    title: 'Powerups',
    lines: [
      '\u{1F528} Hammer: Reveal one selected tile.',
      '\u{1FA84} Wand: Reveal a helpful letter.',
      '\u{1F6E1}\u{FE0F} Shield: Blocks one wrong guess.',
      '\u{1F680} Rocket: Reveals multiple tiles.',
    ],
  },
  {
    title: 'Bundle + Shop',
    lines: [
      'Bundles give value packs for coins and powerups.',
      'Cart opens the shop.',
    ],
  },
];

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
