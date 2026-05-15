export const challengeBackgroundAssets = Array.from(
  { length: 12 },
  (_value, index) => `/backgrounds/img${index + 1}.webp`
);

export const getChallengeBackgroundAsset = (index: number): string =>
  challengeBackgroundAssets[index] ?? '/backgrounds/img1.webp';

export const getStableChallengeBackgroundIndex = (
  challengeKey: string | null | undefined
): number => {
  if (challengeBackgroundAssets.length <= 1) {
    return 0;
  }
  if (!challengeKey) {
    return 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < challengeKey.length; index += 1) {
    hash ^= challengeKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % challengeBackgroundAssets.length;
};
