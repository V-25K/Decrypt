import { z } from 'zod';

export const endlessCatalogStatusSchema = z.object({
  available: z.boolean(),
  activeCatalogVersion: z.string().nullable(),
  runtimeCatalogVersion: z.string().nullable(),
  publishedLevelCount: z.number().int().nonnegative(),
  bundledVersions: z.array(z.string().min(1)).default([]),
});

export type EndlessCatalogStatus = z.infer<typeof endlessCatalogStatusSchema>;
