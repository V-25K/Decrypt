const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readErrorField = (error: unknown, field: string): unknown =>
  isRecord(error) ? error[field] : undefined;

export const redactSensitiveText = (value: string): string =>
  value
    .replace(/([?&](?:key|api[_-]?key)=)([^&\s"'`]+)/gi, '$1[REDACTED]')
    .replace(
      /((?:^|[\s"'`:=]))(AIza[0-9A-Za-z\-_]{16,})\b/g,
      '$1[REDACTED_API_KEY]'
    )
    .replace(/((?:key|api[_-]?key)\s*[:=]\s*)([^,\s}"'`]+)/gi, '$1[REDACTED]');

export const describeRequestError = (error: unknown): string => {
  if (error instanceof Error) {
    const parts = [
      `name=${redactSensitiveText(error.name ?? 'Error')}`,
      `message=${redactSensitiveText(error.message)}`,
    ];
    const code = readErrorField(error, 'code');
    const errno = readErrorField(error, 'errno');
    const details = readErrorField(error, 'details');
    const causeField = readErrorField(error, 'cause');
    if (code !== undefined) {
      parts.push(`code=${redactSensitiveText(String(code))}`);
    }
    if (errno !== undefined) {
      parts.push(`errno=${redactSensitiveText(String(errno))}`);
    }
    if (details !== undefined) {
      parts.push(`details=${redactSensitiveText(String(details))}`);
    }
    if (causeField !== undefined) {
      const cause =
        causeField instanceof Error
          ? `${redactSensitiveText(causeField.name)}: ${redactSensitiveText(causeField.message)}`
          : redactSensitiveText(String(causeField));
      parts.push(`cause=${cause}`);
    }
    return parts.join(' ');
  }
  return `value=${redactSensitiveText(String(error))}`;
};
