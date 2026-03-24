import { z } from 'zod';

export const serializeJson = (value: unknown): string => JSON.stringify(value);

export const parseWithSchema = <T>(
  input: string | undefined,
  schema: z.ZodType<T>,
  fallback: T
): T => {
  if (!input) {
    return fallback;
  }

  const parsedJson = JSON.parse(input);
  const result = schema.safeParse(parsedJson);

  if (!result.success) {
    return fallback;
  }

  return result.data;
};

export const formatDateKey = (now: Date): string => {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

