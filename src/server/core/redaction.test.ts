import { describe, expect, it } from 'vitest';
import { describeRequestError, redactSensitiveText } from './redaction';

describe('redactSensitiveText', () => {
  it('redacts Gemini-style API keys appearing as a query parameter', () => {
    const input =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini?key=AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(redactSensitiveText(input)).toContain('?key=[REDACTED]');
    expect(redactSensitiveText(input)).not.toContain('AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  it('redacts bare AIza-prefixed tokens embedded in plain text', () => {
    const input = 'oops the key leaked: AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ trailing';
    const out = redactSensitiveText(input);
    expect(out).toContain('[REDACTED_API_KEY]');
    expect(out).not.toContain('AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  it('redacts key=value and key: value pairs', () => {
    expect(redactSensitiveText('api_key=hunter2 something else')).toContain(
      'api_key=[REDACTED]'
    );
    const colonForm = redactSensitiveText('apiKey: hunter2 trailing');
    expect(colonForm).toContain('apiKey: [REDACTED]');
    expect(colonForm).not.toContain('hunter2');
  });

  it('leaves benign text untouched', () => {
    // Note: "key=..." substrings are intentionally redacted, so avoid any
    // identifier whose suffix collides (e.g. dateKey, levelKey).
    const input = 'just a normal log message about levelId=lvl_0001 stage=warmup';
    expect(redactSensitiveText(input)).toBe(input);
  });
});

describe('describeRequestError', () => {
  it('redacts API keys appearing inside an Error message', () => {
    const error = new Error(
      'fetch failed for https://example.com?key=AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ'
    );
    const out = describeRequestError(error);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(out).toContain('name=Error');
  });

  it('includes redacted code/errno/details/cause fields when present', () => {
    const cause = new Error('upstream timeout, api_key=hunter2');
    const error: Error & {
      code?: string;
      errno?: number;
      details?: string;
      cause?: unknown;
    } = Object.assign(new Error('outer api_key=secret'), {
      code: 'ETIMEDOUT',
      errno: -110,
      details: 'extra context with key=leaked',
      cause,
    });

    const out = describeRequestError(error);
    expect(out).toContain('code=ETIMEDOUT');
    expect(out).toContain('errno=-110');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('leaked');
  });

  it('handles string non-Error values by stringifying with redaction', () => {
    // describeRequestError calls String(error); for a string that round-trips.
    const out = describeRequestError('raw thrown string with api_key=leaked');
    expect(out).toContain('value=');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('leaked');
  });
});
