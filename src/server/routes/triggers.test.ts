import { describe, expect, it } from 'vitest';
import { triggers } from './triggers';

describe('triggers route', () => {
  it('acknowledges app install without creating an immediate post', async () => {
    const response = await triggers.request('http://localhost/on-app-install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppInstall' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message:
        'Bootstrap trigger received (AppInstall); no immediate post created. Daily automation runs only via scheduler.',
    });
  });

  it('acknowledges app upgrade without creating an immediate post', async () => {
    const response = await triggers.request('http://localhost/on-app-upgrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AppUpgrade' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'success',
      message:
        'Bootstrap trigger received (AppUpgrade); no immediate post created. Daily automation runs only via scheduler.',
    });
  });
});
