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

const defaultDailyAutomationEnabled = true;

export const parseDailyAutomationSetting = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
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
  const value = await settings.get<string | boolean>('dailyAutomationEnabled');
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
    settings.get<string>('contentSafetyMode'),
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
    5
  );

  return {
    publishHourUtc,
    timezone: timezoneValue ?? defaultSubredditSettings.timezone,
    logicalCipherPercent,
    aiMaxRetries,
    contentSafetyMode: safetyValue ?? defaultSubredditSettings.contentSafetyMode,
    geminiApiKey: (geminiKeyValue ?? '').trim(),
  };
};
