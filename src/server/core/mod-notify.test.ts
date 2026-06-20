import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendPrivateMessageMock } = vi.hoisted(() => ({
  sendPrivateMessageMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditId: 't5_test', subredditName: 'decrypttest_dev' },
  reddit: {
    sendPrivateMessage: sendPrivateMessageMock,
  },
}));

import { sendCreatorNotification } from './mod-notify';

describe('sendCreatorNotification', () => {
  beforeEach(() => {
    sendPrivateMessageMock.mockReset();
    sendPrivateMessageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a DM to the creator and returns true', async () => {
    const sent = await sendCreatorNotification({
      toUsername: 'creator_one',
      subject: 'Your Decrypt challenge was approved',
      bodyMarkdown: 'It is live now.',
      logLabel: 'test',
    });

    expect(sent).toBe(true);
    expect(sendPrivateMessageMock).toHaveBeenCalledWith({
      to: 'creator_one',
      subject: 'Your Decrypt challenge was approved',
      text: 'It is live now.',
    });
  });

  it('strips a leading u/ from the recipient', async () => {
    await sendCreatorNotification({
      toUsername: 'u/creator_two',
      subject: 'subject',
      bodyMarkdown: 'body',
      logLabel: 'test',
    });

    expect(sendPrivateMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'creator_two' })
    );
  });

  it('skips and returns false when the recipient is empty', async () => {
    const sent = await sendCreatorNotification({
      toUsername: '   ',
      subject: 'subject',
      bodyMarkdown: 'body',
      logLabel: 'test',
    });

    expect(sent).toBe(false);
    expect(sendPrivateMessageMock).not.toHaveBeenCalled();
  });

  it('swallows delivery failures and returns false', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendPrivateMessageMock.mockRejectedValueOnce(new Error('NOT_WHITELISTED_BY_USER'));

    const sent = await sendCreatorNotification({
      toUsername: 'creator_three',
      subject: 'subject',
      bodyMarkdown: 'body',
      logLabel: 'test',
    });

    expect(sent).toBe(false);
  });
});
