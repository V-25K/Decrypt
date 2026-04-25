import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseWithSchema } from './serde';

describe('parseWithSchema', () => {
  it('returns fallback when JSON is malformed', () => {
    const fallback = { value: 'fallback' };
    const schema = z.object({ value: z.string() });

    expect(parseWithSchema('{"value":', schema, fallback)).toEqual(fallback);
  });

  it('returns fallback when parsed JSON does not match schema', () => {
    const fallback = { value: 'fallback' };
    const schema = z.object({ value: z.string() });

    expect(parseWithSchema('{"value":42}', schema, fallback)).toEqual(fallback);
  });
});
