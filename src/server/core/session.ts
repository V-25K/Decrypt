import { redis } from '@devvit/web/server';
import { z } from 'zod';
import { heartsPerRun, sessionTtlSeconds } from './constants';
import { keySession, keySessionIndex } from './keys';
import { type SessionState, sessionSchema } from '../../shared/game';

const numberField = (
  hash: Record<string, string>,
  field: string,
  fallback: number
): number => {
  const raw = hash[field];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const revealedSchema = z.array(z.number().int().nonnegative());

const parseRevealed = (value: string | undefined): number[] => {
  if (!value) {
    return [];
  }
  const parsed = JSON.parse(value);
  const result = revealedSchema.safeParse(parsed);
  if (!result.success) {
    return [];
  }
  return result.data;
};

const serializeSession = (session: SessionState): Record<string, string> => ({
  activeLevelId: session.activeLevelId,
  mode: session.mode,
  startTimestamp: `${session.startTimestamp}`,
  mistakesMade: `${session.mistakesMade}`,
  shieldIsActive: session.shieldIsActive ? '1' : '0',
  revealedIndices: JSON.stringify(session.revealedIndices),
  usedPowerups: `${session.usedPowerups}`,
  wrongGuesses: `${session.wrongGuesses}`,
  guessCount: `${session.guessCount}`,
});

const trackSessionKey = async (sessionKey: string): Promise<void> => {
  await redis.hSet(keySessionIndex, {
    [sessionKey]: '1',
  });
};

const untrackSessionKey = async (sessionKey: string): Promise<void> => {
  await redis.hDel(keySessionIndex, [sessionKey]);
};

export const getIndexedSessionKeys = async (): Promise<string[]> =>
  await redis.hKeys(keySessionIndex);

export const getSessionState = async (
  userId: string,
  postId: string
): Promise<SessionState | null> => {
  const hash = await redis.hGetAll(keySession(userId, postId));
  if (Object.keys(hash).length === 0) {
    return null;
  }

  return sessionSchema.parse({
    activeLevelId: hash.activeLevelId ?? '',
    mode: hash.mode === 'endless' ? 'endless' : 'daily',
    startTimestamp: numberField(hash, 'startTimestamp', Date.now()),
    mistakesMade: numberField(hash, 'mistakesMade', 0),
    shieldIsActive: numberField(hash, 'shieldIsActive', 0) === 1,
    revealedIndices: parseRevealed(hash.revealedIndices),
    usedPowerups: numberField(hash, 'usedPowerups', 0),
    wrongGuesses: numberField(hash, 'wrongGuesses', 0),
    guessCount: numberField(hash, 'guessCount', 0),
  });
};

export const createSessionState = async (params: {
  userId: string;
  postId: string;
  levelId: string;
  mode: 'daily' | 'endless';
  prefilledIndices: number[];
}): Promise<SessionState> => {
  const session = sessionSchema.parse({
    activeLevelId: params.levelId,
    mode: params.mode,
    startTimestamp: Date.now(),
    mistakesMade: 0,
    shieldIsActive: false,
    revealedIndices: params.prefilledIndices,
    usedPowerups: 0,
    wrongGuesses: 0,
    guessCount: 0,
  });

  const sessionKey = keySession(params.userId, params.postId);
  await redis.hSet(sessionKey, serializeSession(session));
  await redis.expire(sessionKey, sessionTtlSeconds);
  await trackSessionKey(sessionKey);
  return session;
};

export const saveSessionState = async (
  userId: string,
  postId: string,
  session: SessionState
): Promise<void> => {
  const sessionKey = keySession(userId, postId);
  await redis.hSet(sessionKey, serializeSession(session));
  await redis.expire(sessionKey, sessionTtlSeconds);
  await trackSessionKey(sessionKey);
};

export const clearSessionState = async (
  userId: string,
  postId: string
): Promise<void> => {
  const sessionKey = keySession(userId, postId);
  await redis.del(sessionKey);
  await untrackSessionKey(sessionKey);
};

export const heartsRemaining = (session: SessionState): number =>
  Math.max(0, heartsPerRun - session.mistakesMade);
