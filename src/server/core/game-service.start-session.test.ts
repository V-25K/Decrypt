import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  getCompletedLevelsMock,
  getPuzzlePrivateMock,
  getSessionStateMock,
  getUserProfileMock,
  saveUserProfileMock,
  createSessionStateMock,
  saveSessionStateMock,
  heartsRemainingMock,
  recordLevelPlayMock,
  recordQualifiedLevelPlayMock,
  canStartChallengeMock,
  applyHammerMock,
  applyRocketMock,
  applyWandMock,
  checkPadlockStatusMock,
  puzzleIsCompleteMock,
  revealFromGuessMock,
  tileIsLockedMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  getCompletedLevelsMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  createSessionStateMock: vi.fn(),
  saveSessionStateMock: vi.fn(),
  heartsRemainingMock: vi.fn(),
  recordLevelPlayMock: vi.fn(),
  recordQualifiedLevelPlayMock: vi.fn(),
  canStartChallengeMock: vi.fn(),
  applyHammerMock: vi.fn(),
  applyRocketMock: vi.fn(),
  applyWandMock: vi.fn(),
  checkPadlockStatusMock: vi.fn(),
  puzzleIsCompleteMock: vi.fn(),
  revealFromGuessMock: vi.fn(),
  tileIsLockedMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
}));

vi.mock('./state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getInventory: vi.fn(),
  getUserProfile: getUserProfileMock,
  hasFailedLevel: vi.fn(),
  markLevelCompleted: vi.fn(),
  markLevelFailed: vi.fn(),
  registerKnownUser: vi.fn(),
  saveInventory: vi.fn(),
  saveUserProfile: saveUserProfileMock,
}));

vi.mock('./session', () => ({
  clearSessionState: vi.fn(),
  createSessionState: createSessionStateMock,
  getSessionState: getSessionStateMock,
  heartsRemaining: heartsRemainingMock,
  saveSessionState: saveSessionStateMock,
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublic: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: recordQualifiedLevelPlayMock,
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: recordLevelPlayMock,
  recordLevelWin: vi.fn(),
}));

vi.mock('./gameplay', () => ({
  applyHammer: applyHammerMock,
  applyRocket: applyRocketMock,
  applyWand: applyWandMock,
  checkPadlockStatus: checkPadlockStatusMock,
  puzzleIsComplete: puzzleIsCompleteMock,
  revealFromGuess: revealFromGuessMock,
  tileIsLocked: tileIsLockedMock,
}));

vi.mock('./hearts', () => ({
  canStartChallenge: canStartChallengeMock,
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

import { startSessionForLevel, submitGuessForSession } from './game-service';

const profileFixture = (overrides?: Partial<UserProfile>): UserProfile => ({
  coins: 0,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 0,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  dailyFlawlessWins: 0,
  endlessFlawlessWins: 0,
  dailySpeedWins: 0,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 0,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 0,
  endlessFirstTryWins: 0,
  questsCompleted: 0,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 0,
  audioEnabled: true,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
});

const sessionFixture = (
  overrides?: Partial<SessionState>
): SessionState => ({
  activeLevelId: 'lvl_0001',
  mode: 'daily',
  startTimestamp: 123456,
  activeMs: 0,
  lastSeenAt: 0,
  mistakesMade: 1,
  shieldIsActive: false,
  revealedIndices: [],
  usedPowerups: 0,
  wrongGuesses: 1,
  guessCount: 3,
  ...overrides,
});

afterEach(() => {
  getCompletedLevelsMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getSessionStateMock.mockReset();
  getUserProfileMock.mockReset();
  saveUserProfileMock.mockReset();
  createSessionStateMock.mockReset();
  saveSessionStateMock.mockReset();
  heartsRemainingMock.mockReset();
  recordLevelPlayMock.mockReset();
  recordQualifiedLevelPlayMock.mockReset();
  canStartChallengeMock.mockReset();
  applyHammerMock.mockReset();
  applyRocketMock.mockReset();
  applyWandMock.mockReset();
  checkPadlockStatusMock.mockReset();
  puzzleIsCompleteMock.mockReset();
  revealFromGuessMock.mockReset();
  tileIsLockedMock.mockReset();
});

describe('startSessionForLevel', () => {
  it('reuses existing session and avoids replay-count inflation', async () => {
    const existing = sessionFixture({
      activeLevelId: 'lvl_0001',
      mode: 'daily',
    });
    getUserProfileMock.mockResolvedValue(
      profileFixture({ dailyChallengesPlayed: 48 })
    );
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    getSessionStateMock.mockResolvedValue(existing);
    heartsRemainingMock.mockReturnValue(2);

    const result = await startSessionForLevel('lvl_0001', 'daily');

    expect(result.ok).toBe(true);
    expect(result.session).toEqual(existing);
    expect(result.heartsRemaining).toBe(2);
    expect(canStartChallengeMock).not.toHaveBeenCalled();
    expect(getPuzzlePrivateMock).not.toHaveBeenCalled();
    expect(recordLevelPlayMock).not.toHaveBeenCalled();
    expect(createSessionStateMock).not.toHaveBeenCalled();
    expect(saveUserProfileMock).not.toHaveBeenCalled();
  });

  it('does not increment played counters when creating a new daily session', async () => {
    const profile = profileFixture({ dailyChallengesPlayed: 2 });
    const createdSession = sessionFixture({
      activeLevelId: 'lvl_0001',
      mode: 'daily',
    });

    getUserProfileMock.mockResolvedValue(profile);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    getSessionStateMock.mockResolvedValue(null);
    canStartChallengeMock.mockReturnValue(true);
    getPuzzlePrivateMock.mockResolvedValue({ prefilledIndices: [0] });
    createSessionStateMock.mockResolvedValue(createdSession);
    heartsRemainingMock.mockReturnValue(3);

    const result = await startSessionForLevel('lvl_0001', 'daily');

    expect(result.ok).toBe(true);
    expect(recordLevelPlayMock).not.toHaveBeenCalled();
    expect(createSessionStateMock).toHaveBeenCalledWith({
      userId: 't2_test',
      postId: 't3_test',
      levelId: 'lvl_0001',
      mode: 'daily',
      prefilledIndices: [0],
    });
    expect(saveUserProfileMock).not.toHaveBeenCalled();
  });

  it('does not increment played counters when creating a new endless session', async () => {
    const profile = profileFixture({ endlessChallengesPlayed: 5 });
    const createdSession = sessionFixture({
      activeLevelId: 'endless_0001',
      mode: 'endless',
    });

    getUserProfileMock.mockResolvedValue(profile);
    getSessionStateMock.mockResolvedValue(null);
    canStartChallengeMock.mockReturnValue(true);
    getPuzzlePrivateMock.mockResolvedValue({ prefilledIndices: [] });
    createSessionStateMock.mockResolvedValue(createdSession);
    heartsRemainingMock.mockReturnValue(3);

    const result = await startSessionForLevel('endless_0001', 'endless');

    expect(result.ok).toBe(true);
    expect(recordLevelPlayMock).not.toHaveBeenCalled();
    expect(saveUserProfileMock).not.toHaveBeenCalled();
  });
});

describe('submitGuessForSession', () => {
  it('counts the first guess as a played challenge and updates profile counters', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(500000);
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        guessCount: 0,
        wrongGuesses: 0,
        mistakesMade: 0,
      })
    );
    getPuzzlePrivateMock.mockResolvedValue({
      prefilledIndices: [],
      padlockChains: [],
      tiles: [],
    });
    getUserProfileMock.mockResolvedValue(
      profileFixture({
        dailyChallengesPlayed: 2,
        endlessChallengesPlayed: 4,
      })
    );
    tileIsLockedMock.mockReturnValue(false);
    revealFromGuessMock.mockReturnValue({
      isCorrect: false,
      revealedTiles: [],
    });
    checkPadlockStatusMock.mockReturnValue({
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
    });
    puzzleIsCompleteMock.mockReturnValue(false);
    heartsRemainingMock.mockReturnValue(2);

    const result = await submitGuessForSession({
      levelId: 'lvl_0001',
      tileIndex: 0,
      guessedLetter: 'a',
    });

    expect(result.ok).toBe(true);
    expect(recordLevelPlayMock).toHaveBeenCalledWith('lvl_0001', 't2_test');
    expect(recordQualifiedLevelPlayMock).toHaveBeenCalledWith('lvl_0001', 't2_test');
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      't2_test',
      expect.objectContaining({
        dailyChallengesPlayed: 3,
        endlessChallengesPlayed: 4,
      })
    );
    expect(saveSessionStateMock).toHaveBeenCalledTimes(1);
    expect(saveSessionStateMock).toHaveBeenCalledWith(
      't2_test',
      't3_test',
      expect.objectContaining({
        startTimestamp: 500000,
        guessCount: 1,
      })
    );
    nowSpy.mockRestore();
  });

  it('does not recount played challenge after the first guess', async () => {
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        activeLevelId: 'lvl_0001',
        mode: 'endless',
        guessCount: 2,
      })
    );
    getPuzzlePrivateMock.mockResolvedValue({
      prefilledIndices: [],
      padlockChains: [],
      tiles: [],
    });
    tileIsLockedMock.mockReturnValue(false);
    revealFromGuessMock.mockReturnValue({
      isCorrect: true,
      revealedTiles: [],
    });
    checkPadlockStatusMock.mockReturnValue({
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
    });
    puzzleIsCompleteMock.mockReturnValue(false);
    heartsRemainingMock.mockReturnValue(2);

    const result = await submitGuessForSession({
      levelId: 'lvl_0001',
      tileIndex: 0,
      guessedLetter: 'z',
    });

    expect(result.ok).toBe(true);
    expect(recordLevelPlayMock).not.toHaveBeenCalled();
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(recordQualifiedLevelPlayMock).toHaveBeenCalledWith('lvl_0001', 't2_test');
    expect(saveSessionStateMock).toHaveBeenCalledWith(
      't2_test',
      't3_test',
      expect.objectContaining({
        startTimestamp: 123456,
        guessCount: 3,
      })
    );
  });
});
