import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggers } from './triggers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('triggers route', () => {
  it('acknowledges app install without scheduling deprecated staging jobs', async () => {
    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message: 'AppInstall received; daily automation runs at 00:00 UTC.',
    });
  });

  it('acknowledges app upgrade without scheduling deprecated staging jobs', async () => {
    const response = await triggers.request('http://localhost/on-app-upgrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppUpgrade' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message: 'AppUpgrade received; daily automation runs at 00:00 UTC.',
    });
  });
});
