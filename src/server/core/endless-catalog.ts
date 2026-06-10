import { endlessCatalogStatusSchema, type EndlessCatalogStatus } from '../../shared/endless';
import type { ChallengeType, EndlessSort } from '../../shared/game';
import {
  type CommunityEndlessSelection,
  getApprovedCommunityCount,
  getNextCommunityEndlessLevelId,
} from './community';

export const getRuntimeActiveEndlessCatalogVersion = async (): Promise<string | null> => {
  return null;
};

export const getEndlessCatalogStatus = async (): Promise<EndlessCatalogStatus> => {
  const publishedLevelCount = await getApprovedCommunityCount();
  return endlessCatalogStatusSchema.parse({
    available: publishedLevelCount > 0,
    activeCatalogVersion: publishedLevelCount > 0 ? 'Community Ciphers' : null,
    runtimeCatalogVersion: publishedLevelCount > 0 ? 'community' : null,
    publishedLevelCount,
    bundledVersions: [],
  });
};

export const ensureEndlessCatalogReady = async (): Promise<string | null> => {
  return null;
};

export const getNextEndlessCatalogLevelId = async (
  userId: string,
  categoryFilter?: ChallengeType | null,
  endlessSort: EndlessSort = 'random',
  playerRating?: number | null
): Promise<CommunityEndlessSelection> => {
  return await getNextCommunityEndlessLevelId({
    userId,
    categoryFilter,
    endlessSort,
    playerRating,
  });
};
