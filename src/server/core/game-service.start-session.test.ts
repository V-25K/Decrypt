import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate, SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  getCompletedLevelsMock,
  getFailedLevelsMock,
  getDailyRetryCountMock,
  getDailyPointerMock,
  getAllLevelIdsMock,
  hasFailedLevelMock,
	  getPuzzlePrivateMock,
	  getPuzzlePublicMock,
	  getEndlessCatalogStatusMock,
	  getNextEndlessCatalogLevelIdMock,
	  isPuzzlePublishedVisibleMock,
  isPuzzleRemovedFromPlayMock,
	  getSessionStateMock,
  getUserProfileMock,
  hasContinuedLevelMock,
  saveUserProfileMock,
  markLevelContinuedMock,
  createSessionStateMock,
  saveSessionStateMock,
  heartsRemainingMock,
  recordLevelPlayMock,
  recordQualifiedLevelPlayMock,
  recordQualifiedLevelFailureMock,
  touchQualifiedLevelPlayMock,
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
	  getFailedLevelsMock: vi.fn(),
	  getDailyRetryCountMock: vi.fn(),
	  getDailyPointerMock: vi.fn(),
	  getAllLevelIdsMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublicMock: vi.fn(),
	  getEndlessCatalogStatusMock: vi.fn(),
	  getNextEndlessCatalogLevelIdMock: vi.fn(),
	  isPuzzlePublishedVisibleMock: vi.fn(),
  isPuzzleRemovedFromPlayMock: vi.fn(),
	  getSessionStateMock: vi.fn(),
	  getUserProfileMock: vi.fn(),
	  hasContinuedLevelMock: vi.fn(),
	  saveUserProfileMock: vi.fn(),
	  markLevelContinuedMock: vi.fn(),
  createSessionStateMock: vi.fn(),
  saveSessionStateMock: vi.fn(),
  heartsRemainingMock: vi.fn(),
  recordLevelPlayMock: vi.fn(),
  recordQualifiedLevelPlayMock: vi.fn(),
  recordQualifiedLevelFailureMock: vi.fn(),
  touchQualifiedLevelPlayMock: vi.fn(),
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
	  getFailedLevels: getFailedLevelsMock,
	  getDailyRetryCount: getDailyRetryCountMock,
  getInventory: vi.fn(),
	  getUserProfile: getUserProfileMock,
	  hasContinuedLevel: hasContinuedLevelMock,
	  hasFailedLevel: hasFailedLevelMock,
	  incrementDailyRetryCount: vi.fn(),
		  markLevelCompleted: vi.fn(),
		  markLevelContinued: markLevelContinuedMock,
		  markLevelFailed: vi.fn(),
		  unmarkLevelFailed: vi.fn(),
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
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getAllLevelIds: getAllLevelIdsMock,
  getDailyPointer: getDailyPointerMock,
	  getPuzzlePrivate: getPuzzlePrivateMock,
	  getPuzzlePublic: getPuzzlePublicMock,
	  isPuzzlePublishedVisible: isPuzzlePublishedVisibleMock,
  isPuzzleRemovedFromPlay: isPuzzleRemovedFromPlayMock,
	}));

vi.mock('./endless-catalog', () => ({
  getEndlessCatalogStatus: getEndlessCatalogStatusMock,
  getNextEndlessCatalogLevelId: getNextEndlessCatalogLevelIdMock,
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelFailure: recordQualifiedLevelFailureMock,
  recordQualifiedLevelPlay: recordQualifiedLevelPlayMock,
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: recordLevelPlayMock,
  recordLevelWin: vi.fn(),
  touchQualifiedLevelPlay: touchQualifiedLevelPlayMock,
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

import {
  continueSessionForLevel,
  loadLevelForUser,
  getCurrentPuzzleView,
  startSessionForLevel,
  submitGuessForSession,
} from './game-service';

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
  communityJoinRecorded: false,
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

const puzzleFixture = (): PuzzlePrivate => ({
  levelId: 'lvl_0001',
  dateKey: '2026-04-08',
  targetText: 'A B',
  author: 'TEST',
  challengeType: 'QUOTE',
  source: 'AUTO_DAILY',
  cipherType: 'random',
  shiftAmount: null,
  mapping: { A: 1, B: 2 },
  reverseMapping: { '1': 'A', '2': 'B' },
  tiles: [
    { index: 0, char: 'A', isLetter: true, wordIndex: 0 },
    { index: 1, char: ' ', isLetter: false, wordIndex: 0 },
    { index: 2, char: 'B', isLetter: true, wordIndex: 1 },
  ],
  words: ['A', 'B'],
  prefilledIndices: [],
  revealedIndices: [],
  revealed_indices: [],
  lockIndices: [],
  blindIndices: [],
  goldIndex: null,
  padlockChains: [],
  difficulty: 3,
  targetTimeSeconds: 60,
  starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
  isLogical: false,
  createdAt: 0,
});

beforeEach(() => {
  getFailedLevelsMock.mockResolvedValue(new Set<string>());
  hasContinuedLevelMock.mockResolvedValue(false);
  isPuzzleRemovedFromPlayMock.mockResolvedValue(false);
});

afterEach(() => {
  getCompletedLevelsMock.mockReset();
  getFailedLevelsMock.mockReset();
  getDailyRetryCountMock.mockReset();
  getDailyPointerMock.mockReset();
  getAllLevelIdsMock.mockReset();
  hasFailedLevelMock.mockReset();
  getPuzzlePrivateMock.mockReset();
	  getPuzzlePublicMock.mockReset();
	  getEndlessCatalogStatusMock.mockReset();
	  getNextEndlessCatalogLevelIdMock.mockReset();
	  isPuzzlePublishedVisibleMock.mockReset();
  isPuzzleRemovedFromPlayMock.mockReset();
	  getSessionStateMock.mockReset();
  getUserProfileMock.mockReset();
  hasContinuedLevelMock.mockReset();
  saveUserProfileMock.mockReset();
  markLevelContinuedMock.mockReset();
  createSessionStateMock.mockReset();
  saveSessionStateMock.mockReset();
  heartsRemainingMock.mockReset();
  recordLevelPlayMock.mockReset();
  recordQualifiedLevelPlayMock.mockReset();
  recordQualifiedLevelFailureMock.mockReset();
  touchQualifiedLevelPlayMock.mockReset();
  canStartChallengeMock.mockReset();
  applyHammerMock.mockReset();
  applyRocketMock.mockReset();
  applyWandMock.mockReset();
  checkPadlockStatusMock.mockReset();
  puzzleIsCompleteMock.mockReset();
  revealFromGuessMock.mockReset();
  tileIsLockedMock.mockReset();
  contextMock.postData = {};
});

describe('startSessionForLevel', () => {
  it('rejects removed puzzles before starting a session', async () => {
    isPuzzleRemovedFromPlayMock.mockResolvedValue(true);

    await expect(startSessionForLevel('lvl_removed', 'daily')).rejects.toThrow(
      'Puzzle is unavailable.'
    );

    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(createSessionStateMock).not.toHaveBeenCalled();
  });

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
    hasFailedLevelMock.mockResolvedValue(false);
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
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
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

  it('blocks free replay for failed daily challenges', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture());
    getSessionStateMock.mockResolvedValue(null);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    hasFailedLevelMock.mockResolvedValue(true);

    await expect(startSessionForLevel('lvl_0001', 'daily')).rejects.toThrow(
      'Challenge already failed.'
    );

    expect(createSessionStateMock).not.toHaveBeenCalled();
  });

  it('continues a failed active session while preserving revealed progress', async () => {
    const profile = profileFixture({ hearts: 2 });
    const failedSession = sessionFixture({
      activeLevelId: 'lvl_0001',
      mode: 'daily',
      mistakesMade: 3,
      wrongGuesses: 3,
      revealedIndices: [0, 2],
      guessCount: 5,
      usedPowerups: 1,
    });

    getSessionStateMock.mockResolvedValue(failedSession);
    getUserProfileMock.mockResolvedValue(profile);
    canStartChallengeMock.mockReturnValue(true);
    heartsRemainingMock.mockImplementation((session: SessionState) =>
      Math.max(0, 3 - session.mistakesMade)
    );

    const result = await continueSessionForLevel({
      levelId: 'lvl_0001',
      mode: 'daily',
    });

    expect(result.ok).toBe(true);
    expect(result.session).toMatchObject({
      activeLevelId: 'lvl_0001',
      mode: 'daily',
      mistakesMade: 0,
      wrongGuesses: 0,
      revealedIndices: [0, 2],
      guessCount: 5,
      usedPowerups: 1,
    });
    expect(saveSessionStateMock).toHaveBeenCalledWith(
      't2_test',
      't3_test',
      expect.objectContaining({
        mistakesMade: 0,
        wrongGuesses: 0,
        revealedIndices: [0, 2],
      })
    );
	  expect(saveUserProfileMock).toHaveBeenCalledWith('t2_test', profile);
	  expect(markLevelContinuedMock).toHaveBeenCalledWith('t2_test', 'lvl_0001');
	});

  it('allows continuing the same challenge more than once', async () => {
	    getSessionStateMock.mockResolvedValue(
	      sessionFixture({ mistakesMade: 3, wrongGuesses: 3 })
	    );
	    getUserProfileMock.mockResolvedValue(profileFixture({ hearts: 2 }));
	    canStartChallengeMock.mockReturnValue(true);
	    heartsRemainingMock.mockImplementation((session: SessionState) =>
	      Math.max(0, 3 - session.mistakesMade)
	    );

	    const result = await continueSessionForLevel({
	      levelId: 'lvl_0001',
	      mode: 'daily',
	    });

	    expect(result.ok).toBe(true);
	    expect(saveSessionStateMock).toHaveBeenCalled();
	  });

  it('allows replaying already completed endless levels', async () => {
    const createdSession = sessionFixture({
      activeLevelId: 'endless_0001',
      mode: 'endless',
    });
    getUserProfileMock.mockResolvedValue(profileFixture());
    getSessionStateMock.mockResolvedValue(null);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['endless_0001']));
    canStartChallengeMock.mockReturnValue(true);
    getPuzzlePrivateMock.mockResolvedValue({ prefilledIndices: [] });
    createSessionStateMock.mockResolvedValue(createdSession);
    heartsRemainingMock.mockReturnValue(3);

    const result = await startSessionForLevel('endless_0001', 'endless');

    expect(result.ok).toBe(true);
    expect(createSessionStateMock).toHaveBeenCalledWith({
      userId: 't2_test',
      postId: 't3_test',
      levelId: 'endless_0001',
      mode: 'endless',
      prefilledIndices: [],
    });
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
    expect(recordQualifiedLevelPlayMock).toHaveBeenCalledWith(
      'lvl_0001',
      't2_test',
      expect.any(Number)
    );
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
    expect(recordQualifiedLevelPlayMock).not.toHaveBeenCalled();
    expect(touchQualifiedLevelPlayMock).toHaveBeenCalledWith(
      'lvl_0001',
      't2_test',
      expect.any(Number)
    );
    expect(saveSessionStateMock).toHaveBeenCalledWith(
      't2_test',
      't3_test',
      expect.objectContaining({
        startTimestamp: 123456,
        guessCount: 3,
      })
    );
  });

  it('records qualified failure telemetry with the active daily retry count on game over', async () => {
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        guessCount: 1,
        wrongGuesses: 0,
        mistakesMade: 0,
      })
    );
    getPuzzlePrivateMock.mockResolvedValue({
      prefilledIndices: [],
      padlockChains: [],
      tiles: [],
      targetTimeSeconds: 60,
    });
    getUserProfileMock.mockResolvedValue(profileFixture());
    getDailyRetryCountMock.mockResolvedValue(2);
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
    heartsRemainingMock.mockReturnValue(0);

    const result = await submitGuessForSession({
      levelId: 'lvl_0001',
      tileIndex: 0,
      guessedLetter: 'x',
    });

    expect(result.ok).toBe(true);
    expect(result.isGameOver).toBe(true);
    expect(recordQualifiedLevelFailureMock).toHaveBeenCalledWith(
      'lvl_0001',
      't2_test',
      expect.objectContaining({
        mistakes: 1,
        usedPowerups: 0,
        retryCount: 2,
        targetTimeSeconds: 60,
      })
    );
  });
});

describe('getCurrentPuzzleView', () => {
  it('ignores caller-provided revealedIndices when no active session exists', async () => {
	  isPuzzlePublishedVisibleMock.mockResolvedValue(true);
  isPuzzleRemovedFromPlayMock.mockResolvedValue(false);
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(null);
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });

    const base = await getCurrentPuzzleView({
      levelId: 'lvl_0001',
    });
    const forged = await getCurrentPuzzleView({
      levelId: 'lvl_0001',
      revealedIndices: [0, 2],
    });

    expect(forged).toEqual(base);
  });

  it('uses session revealed indices even when caller provides forged indices', async () => {
    isPuzzlePublishedVisibleMock.mockResolvedValue(true);
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        activeLevelId: 'lvl_0001',
        revealedIndices: [2],
      })
    );
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });

    const fromSession = await getCurrentPuzzleView({
      levelId: 'lvl_0001',
    });
    const forged = await getCurrentPuzzleView({
      levelId: 'lvl_0001',
      revealedIndices: [0],
    });

    expect(forged).toEqual(fromSession);
  });

  it('rejects unpublished puzzle views before loading puzzle data', async () => {
    isPuzzlePublishedVisibleMock.mockResolvedValue(false);

    await expect(
      getCurrentPuzzleView({
        levelId: 'lvl_9999',
      })
    ).rejects.toThrow('Puzzle is unavailable.');

    expect(getPuzzlePrivateMock).not.toHaveBeenCalled();
  });
});

describe('loadLevelForUser', () => {
  it('rejects unpublished requested daily levels', async () => {
    isPuzzlePublishedVisibleMock.mockResolvedValue(false);

    await expect(
      loadLevelForUser({
        mode: 'daily',
        requestedLevelId: 'lvl_9999',
      })
    ).rejects.toThrow('Puzzle is unavailable.');

    expect(getPuzzlePublicMock).not.toHaveBeenCalled();
  });

  it('rejects removed requested daily levels even when the old post still exists', async () => {
    isPuzzlePublishedVisibleMock.mockResolvedValue(true);
    isPuzzleRemovedFromPlayMock.mockResolvedValue(true);

    await expect(
      loadLevelForUser({
        mode: 'daily',
        requestedLevelId: 'lvl_removed',
      })
    ).rejects.toThrow('Puzzle is unavailable.');

    expect(getPuzzlePublicMock).not.toHaveBeenCalled();
  });

  it('loads a published requested daily level', async () => {
    isPuzzlePublishedVisibleMock.mockResolvedValue(true);
    getPuzzlePublicMock.mockResolvedValue({
      levelId: 'lvl_0001',
      dateKey: '2026-04-08',
      cipherText: '1 2',
      author: 'TEST',
      challengeType: 'QUOTE',
      tiles: [
        { index: 0, value: '1', isLetter: true, wordIndex: 0 },
        { index: 1, value: ' ', isLetter: false, wordIndex: 0 },
        { index: 2, value: '2', isLetter: true, wordIndex: 1 },
      ],
      words: ['A', 'B'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices: [],
      blindIndices: [],
      padlockChains: [],
      goldIndex: null,
      difficulty: 3,
      targetTimeSeconds: 60,
      starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
      isLogical: false,
      source: 'AUTO_DAILY',
      cipherType: 'random',
      shiftAmount: null,
      createdAt: 0,
    });
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    getSessionStateMock.mockResolvedValue(null);

    const result = await loadLevelForUser({
      mode: 'daily',
      requestedLevelId: 'lvl_0001',
    });

    expect(result.levelId).toBe('lvl_0001');
    expect(getPuzzlePublicMock).toHaveBeenCalledWith('lvl_0001');
  });

  it('loads the next older uncompleted published daily archive level', async () => {
    getAllLevelIdsMock.mockResolvedValue(['lvl_old', 'lvl_current', 'lvl_new']);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['lvl_current']));
    getPuzzlePrivateMock.mockImplementation((levelId: string) => {
      if (levelId === 'lvl_old') {
        return Promise.resolve({ ...puzzleFixture(), levelId, createdAt: 100 });
      }
      if (levelId === 'lvl_current') {
        return Promise.resolve({ ...puzzleFixture(), levelId, createdAt: 200 });
      }
      return Promise.resolve({ ...puzzleFixture(), levelId, createdAt: 300 });
    });
    isPuzzlePublishedVisibleMock.mockResolvedValue(true);
    getPuzzlePublicMock.mockResolvedValue({
      levelId: 'lvl_old',
      dateKey: '2026-04-07',
      cipherText: '1 2',
      author: 'TEST',
      challengeType: 'QUOTE',
      tiles: [
        { index: 0, value: '1', isLetter: true, wordIndex: 0 },
        { index: 1, value: ' ', isLetter: false, wordIndex: 0 },
        { index: 2, value: '2', isLetter: true, wordIndex: 1 },
      ],
      words: ['A', 'B'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices: [],
      blindIndices: [],
      padlockChains: [],
      goldIndex: null,
      difficulty: 3,
      targetTimeSeconds: 60,
      starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
      isLogical: false,
      source: 'AUTO_DAILY',
      cipherType: 'random',
      shiftAmount: null,
      createdAt: 300,
    });
    getSessionStateMock.mockResolvedValue(null);

    const result = await loadLevelForUser({
      mode: 'daily',
      dailyArchive: true,
      excludeLevelId: 'lvl_current',
    });

    expect(result.levelId).toBe('lvl_old');
    expect(getPuzzlePublicMock).toHaveBeenCalledWith('lvl_old');
  });

  it('reports caught up when every daily archive level is completed', async () => {
    getAllLevelIdsMock.mockResolvedValue(['lvl_current']);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['lvl_current']));

    await expect(
      loadLevelForUser({
        mode: 'daily',
        dailyArchive: true,
        excludeLevelId: 'lvl_current',
      })
    ).rejects.toThrow("You're all caught up.");

    expect(getPuzzlePublicMock).not.toHaveBeenCalled();
  });

  it('uses daily archive navigation instead of the post level when requested', async () => {
    contextMock.postData = { levelId: 'lvl_current' };
    getAllLevelIdsMock.mockResolvedValue(['lvl_old', 'lvl_current']);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['lvl_current']));
    getPuzzlePrivateMock.mockImplementation((levelId: string) => {
      if (levelId === 'lvl_current') {
        return Promise.resolve({ ...puzzleFixture(), levelId, createdAt: 200 });
      }
      return Promise.resolve({ ...puzzleFixture(), levelId, createdAt: 100 });
    });
    isPuzzlePublishedVisibleMock.mockResolvedValue(true);
    getPuzzlePublicMock.mockResolvedValue({
      levelId: 'lvl_old',
      dateKey: '2026-04-07',
      cipherText: '1 2',
      author: 'TEST',
      challengeType: 'QUOTE',
      tiles: [
        { index: 0, value: '1', isLetter: true, wordIndex: 0 },
        { index: 1, value: ' ', isLetter: false, wordIndex: 0 },
        { index: 2, value: '2', isLetter: true, wordIndex: 1 },
      ],
      words: ['A', 'B'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices: [],
      blindIndices: [],
      padlockChains: [],
      goldIndex: null,
      difficulty: 3,
      targetTimeSeconds: 60,
      starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
      isLogical: false,
      source: 'AUTO_DAILY',
      cipherType: 'random',
      shiftAmount: null,
      createdAt: 100,
    });
    getSessionStateMock.mockResolvedValue(null);

    const result = await loadLevelForUser({
      mode: 'daily',
      dailyArchive: true,
      excludeLevelId: 'lvl_current',
    });

    expect(result.levelId).toBe('lvl_old');
    expect(getPuzzlePublicMock).toHaveBeenCalledWith('lvl_old');
  });

  it('does not select a replay when all matching endless levels are completed', async () => {
    getNextEndlessCatalogLevelIdMock.mockResolvedValue({
      levelId: null,
      reason: 'all_completed',
    });

    await expect(
      loadLevelForUser({
        mode: 'endless',
        categoryFilter: 'QUOTE',
      })
    ).rejects.toThrow("You're all caught up.");

    expect(getNextEndlessCatalogLevelIdMock).toHaveBeenCalledWith(
      't2_test',
      'QUOTE',
      'random'
    );
    expect(getPuzzlePublicMock).not.toHaveBeenCalled();
  });

  it('passes category and sort to the endless selector', async () => {
    getNextEndlessCatalogLevelIdMock.mockResolvedValue({
      levelId: 'endless_0001',
      reason: 'available',
    });
    getPuzzlePublicMock.mockResolvedValue({
      levelId: 'endless_0001',
      dateKey: '2026-04-08',
      cipherText: '1 2',
      author: 'TEST',
      challengeType: 'PROVERB',
      tiles: [
        { index: 0, value: '1', isLetter: true, wordIndex: 0 },
        { index: 1, value: ' ', isLetter: false, wordIndex: 0 },
        { index: 2, value: '2', isLetter: true, wordIndex: 1 },
      ],
      words: ['A', 'B'],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      lockIndices: [],
      blindIndices: [],
      padlockChains: [],
      goldIndex: null,
      difficulty: 3,
      targetTimeSeconds: 60,
      starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
      isLogical: false,
      source: 'COMMUNITY',
      cipherType: 'random',
      shiftAmount: null,
      createdAt: 0,
    });
    getSessionStateMock.mockResolvedValue(null);

    await loadLevelForUser({
      mode: 'endless',
      categoryFilter: 'PROVERB',
      endlessSort: 'latest',
    });

    expect(getNextEndlessCatalogLevelIdMock).toHaveBeenCalledWith(
      't2_test',
      'PROVERB',
      'latest'
    );
  });
});
