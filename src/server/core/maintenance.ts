import { redis } from '@devvit/web/server';
import {
  keyAllTimeLevelsLeaderboard,
  keyAllTimeLogicLeaderboard,
  keyDailyLeaderboard,
  keyDailyPointer,
  keyDailyTierCursor,
  keyKnownUsersIndex,
  keyLevelPlayers,
  keyLevelQualifiedPlayers,
  keyLevelQualifiedWins,
  keyLevelWinners,
  keyPuzzlesByDate,
  keyPuzzlesIndex,
  keyPuzzlePublishedPost,
  keyPuzzlePrivate,
  keyPuzzlePublic,
  keyPuzzleStaged,
  keySessionIndex,
  keyUsedStrings,
  keyUserCompleted,
  keyUserEndlessLevelScores,
  keyUserInventory,
  keyUserProfile,
  keyUserPurchases,
  keyUserQuestDaily,
  keyUserQuestLifetime,
} from './keys';
import { getPuzzlePrivate } from './puzzle-store';
import { getIndexedSessionKeys } from './session';
import { getKnownUserIds } from './state';

export type ResetStorageSummary = {
  deletedKeys: number;
  discoveredLevels: number;
  discoveredUsers: number;
  discoveredDateKeys: number;
  discoveredSessionKeys: number;
};

export const resetInstallationStorage = async (): Promise<ResetStorageSummary> => {
  const keysToDelete = new Set<string>();
  const userIds = new Set<string>(await getKnownUserIds());
  const dateKeys = new Set<string>();

  const levelEntries = await redis.zRange(keyPuzzlesIndex, 0, -1, { by: 'rank' });
  const levelIds = levelEntries.map((entry) => entry.member);

  for (const levelId of levelIds) {
    keysToDelete.add(keyPuzzlePrivate(levelId));
    keysToDelete.add(keyPuzzlePublic(levelId));
    keysToDelete.add(keyPuzzlePublishedPost(levelId));
    keysToDelete.add(keyLevelPlayers(levelId));
    keysToDelete.add(keyLevelWinners(levelId));
    keysToDelete.add(keyLevelQualifiedPlayers(levelId));
    keysToDelete.add(keyLevelQualifiedWins(levelId));

    const [players, winners, qualifiedPlayers, qualifiedWins, puzzle] = await Promise.all([
      redis.zRange(keyLevelPlayers(levelId), 0, -1, { by: 'rank' }),
      redis.zRange(keyLevelWinners(levelId), 0, -1, { by: 'rank' }),
      redis.zRange(keyLevelQualifiedPlayers(levelId), 0, -1, { by: 'rank' }),
      redis.zRange(keyLevelQualifiedWins(levelId), 0, -1, { by: 'rank' }),
      getPuzzlePrivate(levelId),
    ]);

    for (const player of players) {
      userIds.add(player.member);
    }
    for (const winner of winners) {
      userIds.add(winner.member);
    }
    for (const player of qualifiedPlayers) {
      userIds.add(player.member);
    }
    for (const winner of qualifiedWins) {
      userIds.add(winner.member);
    }
    if (puzzle?.dateKey) {
      dateKeys.add(puzzle.dateKey);
    }
  }

  for (const dateKey of dateKeys) {
    keysToDelete.add(keyDailyLeaderboard(dateKey));
    keysToDelete.add(keyDailyTierCursor(dateKey));
    keysToDelete.add(keyPuzzlesByDate(dateKey));
  }

  for (const userId of userIds) {
    keysToDelete.add(keyUserProfile(userId));
    keysToDelete.add(keyUserInventory(userId));
    keysToDelete.add(keyUserPurchases(userId));
    keysToDelete.add(keyUserCompleted(userId));
    keysToDelete.add(keyUserEndlessLevelScores(userId));
    keysToDelete.add(keyUserQuestLifetime(userId));
    for (const dateKey of dateKeys) {
      keysToDelete.add(keyUserQuestDaily(userId, dateKey));
    }
  }

  const indexedSessionKeys = await getIndexedSessionKeys();
  for (const sessionKey of indexedSessionKeys) {
    keysToDelete.add(sessionKey);
  }

  keysToDelete.add(keyDailyPointer);
  keysToDelete.add(keyPuzzleStaged);
  keysToDelete.add(keyPuzzlesIndex);
  keysToDelete.add(keyUsedStrings);
  keysToDelete.add(keyAllTimeLevelsLeaderboard);
  keysToDelete.add(keyAllTimeLogicLeaderboard);
  keysToDelete.add(keyKnownUsersIndex);
  keysToDelete.add(keySessionIndex);

  for (const key of keysToDelete) {
    await redis.del(key);
  }

  return {
    deletedKeys: keysToDelete.size,
    discoveredLevels: levelIds.length,
    discoveredUsers: userIds.size,
    discoveredDateKeys: dateKeys.size,
    discoveredSessionKeys: indexedSessionKeys.length,
  };
};
