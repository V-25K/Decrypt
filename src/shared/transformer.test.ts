import { describe, expect, it } from 'vitest';
import { transformer } from './transformer';

describe('transformer', () => {
  it('uses identity transforms for JSON-only tRPC payloads', () => {
    const payload = {
      levelId: 'daily_2026_05_16',
      score: 1250,
      entries: [
        {
          userId: 't2_alpha',
          username: 'alpha',
        },
      ],
    };

    expect(transformer.input.serialize(payload)).toBe(payload);
    expect(transformer.input.deserialize(payload)).toBe(payload);
    expect(transformer.output.serialize(payload)).toBe(payload);
    expect(transformer.output.deserialize(payload)).toBe(payload);
  });
});
