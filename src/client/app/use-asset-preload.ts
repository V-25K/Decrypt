import { useEffect } from 'react';
import { preloadImageBatch, warmImagePreloads } from './asset-preload';

type UseAssetPreloadParams = {
  // Images fetched with high priority on mount. Block first-paint visuals.
  critical: string[];
  // Images warmed in the background after a short idle window, so they're
  // already cached when the user navigates to the result screen.
  deferred: string[];
  deferDelayMs?: number;
  criticalTimeoutMs?: number;
  deferredTimeoutMs?: number;
};

// Warms the image cache for the post entry. Critical assets race the first
// paint; deferred assets ride in once the main thread settles.
export const useAssetPreload = ({
  critical,
  deferred,
  deferDelayMs = 120,
  criticalTimeoutMs = 2200,
  deferredTimeoutMs = 2600,
}: UseAssetPreloadParams): void => {
  useEffect(() => {
    void preloadImageBatch(critical, {
      fetchPriority: 'high',
      timeoutMs: criticalTimeoutMs,
    });
    const deferredTimer = window.setTimeout(() => {
      warmImagePreloads(deferred, {
        fetchPriority: 'low',
        timeoutMs: deferredTimeoutMs,
      });
    }, deferDelayMs);
    return () => {
      window.clearTimeout(deferredTimer);
    };
    // The asset arrays are static module-level constants in the caller;
    // intentionally not in the dep array to avoid re-firing the warm-up
    // pass if the caller passes a new array reference on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
