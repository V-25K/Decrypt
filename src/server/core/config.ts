import { settings } from '@devvit/web/server';
import { defaultSubredditSettings } from './constants';

export type DecryptSettings = {
  publishHourUtc: number;
  timezone: string;
  logicalCipherPercent: number;
  aiMaxRetries: number;
  contentSafetyMode: string;
  geminiApiKey: string;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeSafetyModeSetting = (value: unknown): string => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0
      ? normalized
      : defaultSubredditSettings.contentSafetyMode;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }
  if (Array.isArray(value)) {
    const firstString = value.find((entry): entry is string => typeof entry === 'string');
    if (firstString) {
      const normalized = firstString.trim();
      return normalized.length > 0
        ? normalized
        : defaultSubredditSettings.contentSafetyMode;
    }
  }
  if (value && typeof value === 'object') {
    const candidate = Reflect.get(value, 'value');
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      return normalized.length > 0
        ? normalized
        : defaultSubredditSettings.contentSafetyMode;
    }
  }
  return defaultSubredditSettings.contentSafetyMode;
};

const defaultDailyAutomationEnabled = true;

const normalizeBooleanLikeSetting = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return `${value}`;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeBooleanLikeSetting(entry);
      if (normalized !== null) {
        return normalized;
      }
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const candidate = Reflect.get(value, 'value');
    return normalizeBooleanLikeSetting(candidate);
  }
  return null;
};

export const parseDailyAutomationSetting = (value: unknown): boolean => {
  const normalized = normalizeBooleanLikeSetting(value);
  if (normalized !== null) {
    if (['disabled', 'false', '0', 'off'].includes(normalized)) {
      return false;
    }
    if (['enabled', 'true', '1', 'on'].includes(normalized)) {
      return true;
    }
  }
  return defaultDailyAutomationEnabled;
};

export const getDailyAutomationEnabled = async (): Promise<boolean> => {
  const value = await settings.get<unknown>('dailyAutomationEnabled');
  return parseDailyAutomationSetting(value);
};

export const getDecryptSettings = async (): Promise<DecryptSettings> => {
  const [
    publishHourValue,
    timezoneValue,
    logicalPercentValue,
    retriesValue,
    safetyValue,
    geminiKeyValue,
  ] = await Promise.all([
    settings.get<number>('publishHourUtc'),
    settings.get<string>('timezone'),
    settings.get<number>('logicalCipherPercent'),
    settings.get<number>('aiMaxRetries'),
    settings.get<unknown>('contentSafetyMode'),
    settings.get<string>('geminiApiKey'),
  ]);

  const publishHourUtc = clamp(
    publishHourValue ?? defaultSubredditSettings.publishHourUtc,
    0,
    23
  );
  const logicalCipherPercent = clamp(
    logicalPercentValue ?? defaultSubredditSettings.logicalCipherPercent,
    0,
    100
  );
  const aiMaxRetries = clamp(
    retriesValue ?? defaultSubredditSettings.aiMaxRetries,
    1,
    8
  );

  return {
    publishHourUtc,
    timezone: timezoneValue ?? defaultSubredditSettings.timezone,
    logicalCipherPercent,
    aiMaxRetries,
    contentSafetyMode: normalizeSafetyModeSetting(safetyValue),
    geminiApiKey: (geminiKeyValue ?? '').trim(),
  };
};
