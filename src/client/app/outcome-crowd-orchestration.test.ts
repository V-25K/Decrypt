import { describe, expect, it } from 'vitest';
import {
  getInitialOutcomeCrowdViewport,
  getOutcomeCrowdAvatarUrls,
  toUsernameAvatarDataUrl,
} from './outcome-crowd-orchestration';

describe('getOutcomeCrowdAvatarUrls', () => {
  it('uses snoovatar URLs when present', () => {
    expect(
      getOutcomeCrowdAvatarUrls([
        { userId: 't2_one', username: 'one', snoovatarUrl: 'https://example.com/a.png' },
      ])
    ).toEqual(['https://example.com/a.png']);
  });

  it('falls back to generated username avatars', () => {
    const [avatarUrl] = getOutcomeCrowdAvatarUrls([
      { userId: 't2_player_two', username: null, snoovatarUrl: null },
    ]);

    expect(avatarUrl).toBe(toUsernameAvatarDataUrl('player_two'));
    expect(avatarUrl?.startsWith('data:image/svg+xml,')).toBe(true);
  });
});

describe('getInitialOutcomeCrowdViewport', () => {
  it('returns a non-negative viewport', () => {
    expect(getInitialOutcomeCrowdViewport().width).toBeGreaterThanOrEqual(0);
    expect(getInitialOutcomeCrowdViewport().height).toBeGreaterThanOrEqual(0);
  });
});
