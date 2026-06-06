import {
  maxOutcomeCrowdAvatars,
  outcomeCrowdPalette,
  outcomeCrowdScale,
} from './constants';

export type OutcomeCrowdBubble = {
  id: string;
  avatarUrl: string;
  rank: number;
  isPlaceholder: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  radius: number;
  z: number;
  anchorX: number;
  anchorY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  backgroundColor: string;
  isPodium: boolean;
};

export type OutcomeCrowdViewport = {
  width: number;
  height: number;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isOutcomeCrowdPlaceholderAvatar = (avatarUrl: string): boolean =>
  avatarUrl.startsWith('data:image/svg+xml');

export const syncOutcomeCrowdNodePosition = (
  node: HTMLDivElement,
  bubble: OutcomeCrowdBubble
): void => {
  node.style.transform = `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -50%)`;
};

const outcomeCrowdSizeForRank = (
  rank: number,
  viewportWidth: number,
  isCompactViewport: boolean
): number => {
  const compactScale = isCompactViewport ? 0.9 : 1;
  if (rank === 1) {
    return (
      clampNumber(viewportWidth * 0.24, 108, 156) *
      outcomeCrowdScale *
      compactScale
    );
  }
  if (rank === 2) {
    return (
      clampNumber(viewportWidth * 0.2, 92, 136) *
      outcomeCrowdScale *
      compactScale
    );
  }
  if (rank === 3) {
    return (
      clampNumber(viewportWidth * 0.17, 82, 120) *
      outcomeCrowdScale *
      compactScale
    );
  }
  if (rank === 4) {
    return (
      clampNumber(viewportWidth * 0.145, 72, 104) *
      outcomeCrowdScale *
      compactScale
    );
  }
  if (rank <= 10) {
    return (
      clampNumber(viewportWidth * 0.118, 56, 84) *
      outcomeCrowdScale *
      compactScale
    );
  }
  return (
    clampNumber(viewportWidth * 0.096, 46, 68) *
    outcomeCrowdScale *
    compactScale
  );
};

const outcomeCrowdPreferredXPct = (
  rank: number,
  totalBubbles: number,
  isCompactViewport: boolean
): number => {
  const compactSpreads = [
    0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.28, 0.44, 0.56, 0.72,
    0.9, 0.16, 0.32, 0.48, 0.64, 0.84, 0.24, 0.4, 0.6, 0.76,
  ];
  const wideSpreads = [
    0.5, 0.34, 0.66, 0.18, 0.82, 0.08, 0.24, 0.4, 0.56, 0.72,
    0.92, 0.14, 0.3, 0.46, 0.62, 0.78, 0.22, 0.38, 0.54, 0.7,
  ];
  const spreads = isCompactViewport ? compactSpreads : wideSpreads;
  const bubbleCount = Math.max(1, Math.min(totalBubbles, spreads.length));
  const preferred = spreads[rank - 1];
  if (preferred !== undefined) {
    return preferred;
  }
  const gap = bubbleCount === 1 ? 0 : 0.84 / (bubbleCount - 1);
  return 0.08 + ((rank - 1) % bubbleCount) * gap;
};

const layoutOutcomeCrowdBubbles = (
  bubbles: OutcomeCrowdBubble[],
  viewport: OutcomeCrowdViewport
): OutcomeCrowdBubble[] => {
  const minWallGap = 0;
  const floorY = viewport.height - minWallGap;
  const placed: OutcomeCrowdBubble[] = [];
  const sampleCount = viewport.width <= 480 ? 64 : 96;
  const compactViewport = viewport.width <= 480;

  for (const bubble of bubbles) {
    const minX = bubble.radius + minWallGap;
    const maxX = viewport.width - bubble.radius - minWallGap;
    const preferredX = clampNumber(
      viewport.width *
        outcomeCrowdPreferredXPct(bubble.rank, bubbles.length, compactViewport),
      minX,
      maxX
    );

    let bestX = preferredX;
    let bestY = bubble.radius + minWallGap;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
      const t = sampleIndex / sampleCount;
      const candidateX = minX + (maxX - minX) * t;
      let candidateY = floorY - bubble.radius;
      let blocked = false;

      for (const existing of placed) {
        const totalRadius = bubble.radius + existing.radius;
        const dx = Math.abs(candidateX - existing.x);
        if (dx >= totalRadius) {
          continue;
        }
        const dy = Math.sqrt(Math.max(0, totalRadius * totalRadius - dx * dx));
        candidateY = Math.min(candidateY, existing.y - dy);
        if (candidateY < bubble.radius + minWallGap) {
          blocked = true;
          break;
        }
      }

      if (blocked) {
        continue;
      }

      const score =
        candidateY -
        Math.abs(candidateX - preferredX) * (compactViewport ? 0.18 : 0.14);

      if (score > bestScore) {
        bestScore = score;
        bestX = candidateX;
        bestY = candidateY;
      }
    }

    placed.push({
      ...bubble,
      x: bestX,
      y: bestY,
      anchorX: bestX,
      anchorY: bestY,
      minX,
      maxX,
      minY: bubble.radius,
      maxY: floorY - bubble.radius,
    });
  }

  return placed;
};

export const buildOutcomeCrowdBubbles = (
  avatarUrls: string[],
  viewport: OutcomeCrowdViewport
): OutcomeCrowdBubble[] => {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return [];
  }
  const isCompactViewport = viewport.width <= 480;
  const visibleUrls = avatarUrls.slice(0, maxOutcomeCrowdAvatars);
  const crowdBubbles = visibleUrls.map((avatarUrl, index) => {
    const rank = index + 1;
    const size = outcomeCrowdSizeForRank(rank, viewport.width, isCompactViewport);
    const radius = size / 2;
    const isPodium = rank <= 3;
    const isPlaceholder = isOutcomeCrowdPlaceholderAvatar(avatarUrl);
    const backgroundColor =
      rank === 1
        ? '#d4af37'
        : rank === 2
          ? '#d8dde6'
          : rank === 3
            ? '#cd7f32'
            : rank === 4
              ? '#8fd3ff'
              : outcomeCrowdPalette[(rank - 5) % outcomeCrowdPalette.length] ?? '#8ecdf8';
    return {
      id: `outcome-crowd-${index}`,
      avatarUrl,
      rank,
      isPlaceholder,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size,
      radius,
      z: (isPlaceholder ? 20 : 100) - rank,
      anchorX: 0,
      anchorY: 0,
      minX: radius,
      maxX: viewport.width - radius,
      minY: radius,
      maxY: viewport.height - radius,
      backgroundColor,
      isPodium,
    };
  });

  return layoutOutcomeCrowdBubbles(crowdBubbles, viewport).map((bubble) => ({
    ...bubble,
    x: bubble.anchorX,
    y: bubble.anchorY,
    vx: 0,
    vy: 0,
  }));
};
