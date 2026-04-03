import { describe, expect, it } from 'vitest';
import { parseDailyAutomationSetting } from './config';

describe('parseDailyAutomationSetting', () => {
  it('defaults to enabled when value is missing or unknown', () => {
    expect(parseDailyAutomationSetting(undefined)).toBe(true);
    expect(parseDailyAutomationSetting(null)).toBe(true);
    expect(parseDailyAutomationSetting('')).toBe(true);
    expect(parseDailyAutomationSetting('unexpected')).toBe(true);
  });

  it('parses explicit enabled values', () => {
    expect(parseDailyAutomationSetting(true)).toBe(true);
    expect(parseDailyAutomationSetting('enabled')).toBe(true);
    expect(parseDailyAutomationSetting('true')).toBe(true);
    expect(parseDailyAutomationSetting('1')).toBe(true);
    expect(parseDailyAutomationSetting('on')).toBe(true);
  });

  it('parses explicit disabled values', () => {
    expect(parseDailyAutomationSetting(false)).toBe(false);
    expect(parseDailyAutomationSetting('disabled')).toBe(false);
    expect(parseDailyAutomationSetting('false')).toBe(false);
    expect(parseDailyAutomationSetting('0')).toBe(false);
    expect(parseDailyAutomationSetting('off')).toBe(false);
  });
});
