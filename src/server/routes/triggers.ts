import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnAppUpgradeRequest,
  OnCommentDeleteRequest,
  OnPostDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { warmGlobalScorePointsCutoff } from '../core/points-eligibility';
import { getLevelIdForPost } from '../core/puzzle-store';
import { purgeCommunityChallengeByLevel } from '../core/community';

export const triggers = new Hono();

type TriggerRouteResult = {
  body: TriggerResponse;
  statusCode: 200;
};

const handleAutomationBootstrapTrigger = async (
  input: OnAppInstallRequest | OnAppUpgradeRequest
): Promise<TriggerRouteResult> => {
  // Resolve+cache the global-points cutoff once per deploy so the hot win path
  // only ever reads a warm cache (Bug 4). Self-guarded; never throws.
  await warmGlobalScorePointsCutoff();
  if (input.type !== 'AppInstall') {
    return {
      body: {
        status: 'success',
        message: 'AppUpgrade received; daily automation runs at 00:00 UTC.',
      },
      statusCode: 200,
    };
  }

  return {
    body: {
      status: 'success',
      message: 'AppInstall received; daily automation runs at 00:00 UTC.',
    },
    statusCode: 200,
  };
};

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const response = await handleAutomationBootstrapTrigger(input);
  return c.json<TriggerResponse>(response.body, response.statusCode);
});

triggers.post('/on-app-upgrade', async (c) => {
  const input = await c.req.json<OnAppUpgradeRequest>();
  const response = await handleAutomationBootstrapTrigger(input);
  return c.json<TriggerResponse>(response.body, response.statusCode);
});

// Honor deletion of user content (Devvit safety rules). When a post is deleted
// on Reddit and it maps to a community challenge, purge the creator's stored
// text + identity + engagement. Auto-daily / mod-injected posts are app content,
// so the purge routine treats them as a no-op and leaves their data intact.
triggers.post('/on-post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>();
  const postId = input.postId;
  if (postId) {
    const levelId = await getLevelIdForPost(postId);
    if (levelId) {
      await purgeCommunityChallengeByLevel({ levelId, postId });
    }
  }
  return c.json<TriggerResponse>({ status: 'ok' }, 200);
});

// We store no comment content: share comments are generated and live only on
// Reddit, and our share receipts hold game stats keyed by user+level (retainable
// metadata). Registered so comment deletions are acknowledged and to cover any
// future comment-derived storage.
triggers.post('/on-comment-delete', async (c) => {
  await c.req.json<OnCommentDeleteRequest>();
  return c.json<TriggerResponse>({ status: 'ok' }, 200);
});
