// Self-contained on purpose: preview.ts imports this, and the inline preview
// bundle must stay React-free and lean (see scripts/check-preview-bundle.mjs).
// Pinned to the preview-lite chunk in vite.config.ts.
export const formatLevelNumber = (rawLevelId: string): string => {
  const match = rawLevelId.match(/(\d+)$/);
  if (!match || !match[1]) {
    return rawLevelId;
  }
  return `${Number(match[1])}`;
};
