import { describe, expect, it } from 'vitest';
import { friendlyErrorMessage } from './error-messages';

describe('friendlyErrorMessage', () => {
  it('keeps curated, human-readable server messages', () => {
    expect(
      friendlyErrorMessage(new Error('No lives left. Buy more hearts.'), 'fallback')
    ).toBe('No lives left. Buy more hearts.');
    expect(friendlyErrorMessage('You are caught up on daily ciphers.', 'fallback')).toBe(
      'You are caught up on daily ciphers.'
    );
  });

  it('falls back for transport and runtime errors', () => {
    for (const raw of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'request timed out',
      'Internal Server Error',
      'HTTP 503 Service Unavailable',
      'Unexpected token < in JSON at position 0',
      'TypeError: Cannot read properties of undefined',
      'ECONNREFUSED 127.0.0.1:443',
    ]) {
      expect(friendlyErrorMessage(new Error(raw), 'Something went wrong.')).toBe(
        'Something went wrong.'
      );
    }
  });

  it('falls back for empty, non-error, and overlong messages', () => {
    expect(friendlyErrorMessage(new Error('   '), 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage(null, 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage({ weird: true }, 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage('x'.repeat(200), 'fallback')).toBe('fallback');
  });
});
