import { context, reddit, redis } from '@devvit/web/server';
import {
  keyGenerationFailureLatest,
  keyGenerationFailureNotified,
} from './keys';

export type AutomatedFailureSource =
  | 'scheduler.generate-daily'
  | 'scheduler.publish-daily'
  | 'scheduler.verify-daily'
  | 'trigger.on-app-install';

type GenerationFailureRecord = {
  source: AutomatedFailureSource;
  dateKey: string;
  levelId: string | null;
  attempts: number | null;
  reason: string;
  happenedAt: string;
};

type SubredditId = `t5_${string}`;

const isSubredditId = (value: string): value is SubredditId =>
  value.startsWith('t5_');

const isObjectWithField = (
  value: unknown,
  field: string
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && field in value;

const readStringField = (
  value: unknown,
  field: string
): string | undefined => {
  if (!isObjectWithField(value, field)) {
    return undefined;
  }
  const candidate = value[field];
  return typeof candidate === 'string' ? candidate : undefined;
};

const readNumberField = (
  value: unknown,
  field: string
): number | undefined => {
  if (!isObjectWithField(value, field)) {
    return undefined;
  }
  const candidate = value[field];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? Math.floor(candidate)
    : undefined;
};

const describeFailure = (error: unknown): {
  reason: string;
  levelId: string | null;
  attempts: number | null;
} => {
  const reasonFromField = readStringField(error, 'reason');
  const reason =
    reasonFromField ??
    (error instanceof Error ? error.message : `value=${String(error)}`);

  return {
    reason,
    levelId: readStringField(error, 'levelId') ?? null,
    attempts: readNumberField(error, 'attempts') ?? null,
  };
};

const notificationExpiration = (): Date =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const resolveSubredditId = async (): Promise<SubredditId | null> => {
  if (context.subredditId && isSubredditId(context.subredditId)) {
    return context.subredditId;
  }
  if (!context.subredditName) {
    return null;
  }
  try {
    const subreddit = await reddit.getSubredditByName(context.subredditName);
    return isSubredditId(subreddit.id) ? subreddit.id : null;
  } catch (error) {
    console.error(
      `[reportAutomatedGenerationFailure] failed to resolve subreddit id: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};

export const reportAutomatedGenerationFailure = async (params: {
  source: AutomatedFailureSource;
  dateKey: string;
  error: unknown;
}): Promise<void> => {
  try {
    const details = describeFailure(params.error);
    const happenedAt = new Date().toISOString();
    const record: GenerationFailureRecord = {
      source: params.source,
      dateKey: params.dateKey,
      levelId: details.levelId,
      attempts: details.attempts,
      reason: details.reason,
      happenedAt,
    };

    await redis.set(keyGenerationFailureLatest, JSON.stringify(record));

    const notifiedKey = keyGenerationFailureNotified(params.dateKey);
    const wasNotified = await redis.get(notifiedKey);
    if (wasNotified) {
      return;
    }

    const lines = [
      'Automatic daily generation failed.',
      '',
      `Source: ${params.source}`,
      `Date key: ${params.dateKey}`,
      `Reason: ${details.reason}`,
      `Level: ${details.levelId ?? 'unknown'}`,
      `Attempts: ${details.attempts ?? 'unknown'}`,
      '',
      'Recommended action: use the manual inject flow if needed.',
    ];

    const subredditId = await resolveSubredditId();
    if (!subredditId) {
      console.error(
        '[reportAutomatedGenerationFailure] missing subreddit id, unable to send modmail'
      );
      return;
    }

    const conversationId = await reddit.modMail.createModNotification({
      subject: `[Decrypt] Generation failed for ${params.dateKey}`,
      bodyMarkdown: lines.join('\n'),
      subredditId,
    });

    await redis.set(
      notifiedKey,
      JSON.stringify({ happenedAt, conversationId, source: params.source }),
      { expiration: notificationExpiration() }
    );
  } catch (error) {
    console.error(
      `[reportAutomatedGenerationFailure] failed to notify mods: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
