import { afterEach, describe, expect, it, vi } from 'vitest';

// game-service pulls in @devvit/web/server and several sibling modules at import
// time; mock them so importing the (now-stubbed) retry export stays cheap and
// side-effect free. The stub itself touches none of these.
vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  redis: { watch: vi.fn(), hGet: vi.fn() },
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getDailyRetryCount: vi.fn(),
  getInventory: vi.fn(),
  getUserProfile: vi.fn(),
  hasFailedLevel: vi.fn(),
  incrementDailyRetryCount: vi.fn(),
  markLevelCompleted: vi.fn(),
  markLevelFailed: vi.fn(),
  unmarkLevelFailed: vi.fn(),
  registerKnownUser: vi.fn(),
  saveInventory: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock('./session', () => ({
  clearSessionState: vi.fn(),
  createSessionState: vi.fn(),
  getSessionState: vi.fn(),
  heartsRemaining: vi.fn(),
  saveSessionState: vi.fn(),
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: vi.fn(),
  getPuzzlePublic: vi.fn(),
  isPuzzleRemovedFromPlay: vi.fn(async () => false),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: vi.fn(),
  recordQualifiedLevelFailure: vi.fn(),
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: vi.fn(),
  recordLevelWin: vi.fn(),
  touchQualifiedLevelPlay: vi.fn(),
}));

vi.mock('./gameplay', () => ({
  applyHammer: vi.fn(),
  applyRocket: vi.fn(),
  applyWand: vi.fn(),
  checkPadlockStatus: vi.fn(),
  puzzleIsComplete: vi.fn(),
  revealFromGuess: vi.fn(),
  tileIsLocked: vi.fn(),
}));

vi.mock('./hearts', () => ({
  canStartChallenge: vi.fn(),
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: vi.fn(),
  updateQuestProgressOnCompletion: vi.fn(),
  updateQuestProgressOnShare: vi.fn(),
}));

import { purchaseDailyRetryForLevel } from './game-service';

afterEach(() => {
  vi.clearAllMocks();
});

describe('purchaseDailyRetryForLevel', () => {
  // A failed daily is now final — the result screen shows the answer instead of
  // offering a paid replay. The endpoint is kept only as a hard-rejecting stub so
  // any stale or crafted client call fails loudly rather than silently re-running
  // a puzzle whose answer the player has already seen.
  it('rejects a daily retry purchase', async () => {
    await expect(
      purchaseDailyRetryForLevel({ levelId: 'lvl_0001', mode: 'daily' })
    ).rejects.toThrow('Daily retries are no longer available.');
  });

  it('rejects an endless retry purchase', async () => {
    await expect(
      purchaseDailyRetryForLevel({ levelId: 'endless_0001', mode: 'endless' })
    ).rejects.toThrow('Daily retries are no longer available.');
  });
});
