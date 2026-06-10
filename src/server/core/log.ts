import { describeRequestError, redactSensitiveText } from './redaction';

type LogPayload = Record<string, unknown>;

// Centralized logger so every call site automatically passes through the same
// redactor (kills Gemini-style keys, ?key=..., api_key= patterns) before
// touching console. Format is a single line per call to keep Devvit's hosted
// log stream cheap; structured fields are key=value tokens.
//
// Usage:
//   logInfo('scheduler.publish-daily', 'configuration check', { dateKey, automationEnabled });
//   logWarn('payments.fulfill', 'rollback retried', { orderId });
//   logError('payments.refund', 'restore failed', error, { orderId, userId });

const formatScalar = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
  if (value instanceof Error) return describeRequestError(value);
  try {
    return JSON.stringify(value);
  } catch (_serializeError) {
    return String(value);
  }
};

const formatPayload = (payload: LogPayload | undefined): string => {
  if (!payload) return '';
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    tokens.push(`${key}=${redactSensitiveText(formatScalar(value))}`);
  }
  return tokens.length === 0 ? '' : ` ${tokens.join(' ')}`;
};

const compose = (scope: string, message: string, payload?: LogPayload): string =>
  `[${scope}] ${redactSensitiveText(message)}${formatPayload(payload)}`;

export const logInfo = (
  scope: string,
  message: string,
  payload?: LogPayload
): void => {
  console.log(compose(scope, message, payload));
};

export const logWarn = (
  scope: string,
  message: string,
  payload?: LogPayload
): void => {
  console.warn(compose(scope, message, payload));
};

export const logError = (
  scope: string,
  message: string,
  error?: unknown,
  payload?: LogPayload
): void => {
  const errorPart =
    error === undefined ? '' : ` ${describeRequestError(error)}`;
  console.error(`${compose(scope, message, payload)}${errorPart}`);
};
