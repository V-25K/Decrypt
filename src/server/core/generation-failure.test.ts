import { afterEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock, redisSetMock, createModNotificationMock } = vi.hoisted(
  () => ({
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    createModNotificationMock: vi.fn(),
  })
);

vi.mock('@devvit/web/server', () => ({
  context: { subredditId: 't5_test', subredditName: 'decrypttest' },
  redis: {
    get: redisGetMock,
    set: redisSetMock,
  },
  reddit: {
    modMail: {
      createModNotification: createModNotificationMock,
    },
  },
}));

import { reportAutomatedGenerationFailure } from './generation-failure';
import {
  keyGenerationFailureLatest,
  keyGenerationFailureNotified,
} from './keys';

afterEach(() => {
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  createModNotificationMock.mockReset();
});

describe('reportAutomatedGenerationFailure', () => {
  it('persists status and notifies mods on first failure for a date', async () => {
    redisGetMock.mockResolvedValue(undefined);
    redisSetMock.mockResolvedValue('OK');
    createModNotificationMock.mockResolvedValue('conversation_1');

    await reportAutomatedGenerationFailure({
      source: 'scheduler.generate-daily',
      dateKey: '2026-03-08',
      error: new Error('generation failed'),
    });

    expect(redisSetMock).toHaveBeenCalledWith(
      keyGenerationFailureLatest,
      expect.any(String)
    );
    expect(createModNotificationMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledWith(
      keyGenerationFailureNotified('2026-03-08'),
      expect.any(String),
      expect.objectContaining({ expiration: expect.any(Date) })
    );
  });

  it('avoids duplicate modmail when the date was already notified', async () => {
    redisGetMock.mockResolvedValue('already_notified');
    redisSetMock.mockResolvedValue('OK');

    await reportAutomatedGenerationFailure({
      source: 'scheduler.publish-daily',
      dateKey: '2026-03-08',
      error: new Error('still failing'),
    });

    expect(redisSetMock).toHaveBeenCalledWith(
      keyGenerationFailureLatest,
      expect.any(String)
    );
    expect(createModNotificationMock).not.toHaveBeenCalled();
  });
});
