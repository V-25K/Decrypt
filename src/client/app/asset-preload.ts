type ImagePreloadOptions = {
  timeoutMs?: number;
  decode?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
};

const loadedImageSources = new Set<string>();
const imagePreloadPromises = new Map<string, Promise<boolean>>();
const connectedOrigins = new Set<string>();

const defaultPreloadTimeoutMs = 1800;

const canPreloadImages = (): boolean =>
  typeof window !== 'undefined' && typeof Image !== 'undefined';

const normalizeSources = (sources: string[]): string[] =>
  Array.from(
    new Set(
      sources
        .map((source) => source.trim())
        .filter((source) => source.length > 0)
    )
  );

const ensureOriginConnection = (source: string) => {
  if (typeof document === 'undefined') {
    return;
  }
  try {
    const url = new URL(source, window.location.href);
    if (url.origin === window.location.origin || connectedOrigins.has(url.origin)) {
      return;
    }
    connectedOrigins.add(url.origin);

    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = url.origin;
    document.head.appendChild(preconnect);

    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = url.origin;
    document.head.appendChild(dnsPrefetch);
  } catch (_error) {
    // Ignore invalid URLs.
  }
};

export const preloadImageAsset = (
  source: string,
  options: ImagePreloadOptions = {}
): Promise<boolean> => {
  const src = source.trim();
  if (src.length === 0 || !canPreloadImages()) {
    return Promise.resolve(false);
  }
  if (loadedImageSources.has(src)) {
    return Promise.resolve(true);
  }
  const existing = imagePreloadPromises.get(src);
  if (existing) {
    return existing;
  }

  ensureOriginConnection(src);
  const timeoutMs = options.timeoutMs ?? defaultPreloadTimeoutMs;
  const shouldDecode = options.decode !== false;

  const nextPromise = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = shouldDecode ? 'async' : 'sync';
    if (options.fetchPriority) {
      image.fetchPriority = options.fetchPriority;
    }

    let settled = false;
    let fallbackId = 0;
    const settle = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(fallbackId);
      image.onload = null;
      image.onerror = null;
      imagePreloadPromises.delete(src);
      if (ok) {
        loadedImageSources.add(src);
      }
      resolve(ok);
    };

    image.onload = () => settle(true);
    image.onerror = () => settle(false);
    image.src = src;

    fallbackId = window.setTimeout(() => {
      settle(image.complete && image.naturalWidth > 0);
    }, timeoutMs);

    if (image.complete) {
      settle(image.naturalWidth > 0);
    }

    if (shouldDecode && typeof image.decode === 'function') {
      void image.decode().then(() => settle(true)).catch(() => undefined);
    }
  });

  imagePreloadPromises.set(src, nextPromise);
  return nextPromise;
};

export const preloadImageBatch = (
  sources: string[],
  options: ImagePreloadOptions = {}
): Promise<boolean[]> =>
  Promise.all(
    normalizeSources(sources).map((source) => preloadImageAsset(source, options))
  );

export const warmImagePreloads = (
  sources: string[],
  options: ImagePreloadOptions = {}
): void => {
  const normalized = normalizeSources(sources);
  for (const source of normalized) {
    void preloadImageAsset(source, options);
  }
};
