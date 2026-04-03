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
  driftPhase: number;
  driftAmplitudeX: number;
  driftAmplitudeY: number;
  driftPeriodX: number;
  driftPeriodY: number;
  springStrength: number;
  velocityDamping: number;
  isPodium: boolean;
};

export type OutcomeCrowdViewport = {
  width: number;
  height: number;
};

export const outcomeCrowdGravity = 0.18;
export const outcomeCrowdCollisionPasses = 5;
const outcomeCrowdCollisionPadding = 1;

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

export const resolveOutcomeCrowdCollision = (
  first: OutcomeCrowdBubble,
  second: OutcomeCrowdBubble
): void => {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const minDistance =
    first.radius + second.radius + outcomeCrowdCollisionPadding;
  if (distance >= minDistance) {
    return;
  }

  const normalX = dx / distance;
  const normalY = dy / distance;
  const overlap = minDistance - distance;
  const firstWeight =
    first.isPlaceholder && !second.isPlaceholder
      ? 0.72
      : second.isPlaceholder && !first.isPlaceholder
        ? 0.42
        : 0.5;
  const secondWeight =
    second.isPlaceholder && !first.isPlaceholder
      ? 0.72
      : first.isPlaceholder && !second.isPlaceholder
        ? 0.42
        : 0.5;

  first.x -= normalX * overlap * firstWeight;
  first.y -= normalY * overlap * firstWeight;
  second.x += normalX * overlap * secondWeight;
  second.y += normalY * overlap * secondWeight;

  const relativeNormalVelocity =
    (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
  if (relativeNormalVelocity >= 0) {
    return;
  }

  const restitution = 0.16;
  const impulse = (-relativeNormalVelocity * (1 + restitution)) / 2;
  first.vx -= normalX * impulse;
  first.vy -= normalY * impulse;
  second.vx += normalX * impulse;
  second.vy += normalY * impulse;
};

export const settleOutcomeCrowdBoundary = (bubble: OutcomeCrowdBubble): void => {
  if (bubble.x <= bubble.minX) {
    bubble.x = bubble.minX;
    if (bubble.vx < 0) {
      bubble.vx *= -0.18;
    }
  } else if (bubble.x >= bubble.maxX) {
    bubble.x = bubble.maxX;
    if (bubble.vx > 0) {
      bubble.vx *= -0.18;
    }
  }

  if (bubble.y <= bubble.minY) {
    bubble.y = bubble.minY;
    if (bubble.vy < 0) {
      bubble.vy *= -0.12;
    }
    return;
  }

  if (bubble.y >= bubble.maxY) {
    bubble.y = bubble.maxY;
    if (bubble.vy > 0) {
      bubble.vy *= -0.1;
      if (Math.abs(bubble.vy) < 0.12) {
        bubble.vy = 0;
      }
    }
  }
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

      const supportedAboveAnotherBall =
        candidateY < floorY - bubble.radius - 1;
      const score =
        candidateY -
        Math.abs(candidateX - preferredX) * (compactViewport ? 0.18 : 0.14) +
        (supportedAboveAnotherBall ? 18 : 0);

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
      driftPhase: 0,
      driftAmplitudeX: Math.min(26, viewport.width * 0.03),
      driftAmplitudeY: 0,
      driftPeriodX: 0,
      driftPeriodY: 0,
      springStrength: isPodium ? 0.0032 : 0.0024,
      velocityDamping: isPodium ? 0.986 : 0.982,
      isPodium,
    };
  });

  return layoutOutcomeCrowdBubbles(crowdBubbles, viewport).map(
    (bubble, index) => {
      const jitter =
        Math.sin((index + 1) * 1.41) *
        Math.min(bubble.driftAmplitudeX, viewport.width * 0.025);
      return {
        ...bubble,
        x: clampNumber(bubble.anchorX + jitter, bubble.minX, bubble.maxX),
        y:
          bubble.radius +
          Math.min(viewport.height * 0.16, 12 + (index % 4) * 10),
        vx: Math.cos((index + 1) * 1.27) * 0.35,
        vy: 0,
      };
    }
  );
};
