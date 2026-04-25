import { describe, expect, it } from 'vitest';
import { buildOutcomeCrowdBubbles } from './outcome-crowd';

describe('buildOutcomeCrowdBubbles', () => {
  it('starts bubbles at their settled vertical anchors', () => {
    const bubbles = buildOutcomeCrowdBubbles(
      [
        'https://example.com/one.png',
        'https://example.com/two.png',
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      ],
      { width: 500, height: 300 }
    );

    expect(bubbles).toHaveLength(3);

    for (const bubble of bubbles) {
      expect(bubble.y).toBe(bubble.anchorY);
      expect(bubble.y).toBeGreaterThanOrEqual(bubble.minY);
      expect(bubble.y).toBeLessThanOrEqual(bubble.maxY);
    }
  });

  it('keeps two bubbles resting on the floor when there is enough width', () => {
    const bubbles = buildOutcomeCrowdBubbles(
      [
        'https://example.com/one.png',
        'https://example.com/two.png',
      ],
      { width: 720, height: 280 }
    );

    expect(bubbles).toHaveLength(2);

    for (const bubble of bubbles) {
      expect(bubble.y).toBe(bubble.maxY);
    }

    const [first, second] = bubbles;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) {
      return;
    }

    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    expect(distance).toBeGreaterThanOrEqual(first.radius + second.radius);
  });
});
