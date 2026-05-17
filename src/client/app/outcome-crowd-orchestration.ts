import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  maxOutcomeCrowdAvatars,
} from './constants';
import {
  preloadImageAsset,
  warmImagePreloads,
} from './asset-preload';
import { formatLeaderboardName } from './game-formatters';
import {
  buildOutcomeCrowdBubbles,
  syncOutcomeCrowdNodePosition,
  type OutcomeCrowdBubble,
  type OutcomeCrowdViewport,
} from './outcome-crowd';
import type { AppScreen } from './types';

const criticalOutcomeAvatarCount = 3;
const outcomeCrowdFallbackReadyMs = 650;

export type OutcomeCrowdLeaderboardEntry = {
  snoovatarUrl?: string | null;
  userId: string;
  username?: string | null;
};

export type OutcomeCrowdOrchestration = {
  completionCrowdAvatarUrls: string[];
  completionCrowdReady: boolean;
  handleOutcomeCrowdRef: (node: HTMLElement | null) => void;
  outcomeCrowdBubbles: OutcomeCrowdBubble[];
  setOutcomeCrowdBubbleNode: (id: string, node: HTMLDivElement | null) => void;
};

const deferOutcomeCrowdStateUpdate = (task: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    task();
    return () => undefined;
  }
  const timerId = window.setTimeout(task, 0);
  return () => window.clearTimeout(timerId);
};

const isLayoutlessTestEnv =
  typeof navigator !== 'undefined' && /jsdom|happy-dom/i.test(navigator.userAgent);

const escapeSvgText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const toUsernameAvatarDataUrl = (rawLabel: string): string => {
  const label = rawLabel.trim().length > 0 ? rawLabel.trim() : 'Player';
  const normalized = label.replace(/[^a-z0-9]/gi, '');
  const initialsRaw = normalized.slice(0, 2).toUpperCase();
  const initials = initialsRaw.length > 0 ? initialsRaw : 'P';
  const shortName =
    label.length <= 10 ? label : `${label.slice(0, 9).trim()}...`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="50" y="46" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-weight="900" font-size="34" fill="rgba(0,0,0,0.82)">${escapeSvgText(initials)}</text>
  <text x="50" y="74" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-weight="800" font-size="12" fill="rgba(0,0,0,0.7)">${escapeSvgText(shortName)}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const getOutcomeCrowdAvatarUrls = (
  entries: readonly OutcomeCrowdLeaderboardEntry[]
): string[] =>
  entries.map((entry) => {
    const rawUrl = entry.snoovatarUrl;
    if (typeof rawUrl === 'string' && rawUrl.trim().length > 0) {
      return rawUrl;
    }
    return toUsernameAvatarDataUrl(formatLeaderboardName(entry));
  });

export const readOutcomeCrowdViewport = (
  node: HTMLElement
): OutcomeCrowdViewport | null => {
  const bounds = node.getBoundingClientRect();
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  if (width > 0 && height > 0) {
    return { width, height };
  }
  if (isLayoutlessTestEnv) {
    return { width: 500, height: 300 };
  }
  return null;
};

export const getInitialOutcomeCrowdViewport = (): OutcomeCrowdViewport => ({
  width: isLayoutlessTestEnv ? 500 : 0,
  height: isLayoutlessTestEnv ? 300 : 0,
});

export const useOutcomeCrowdOrchestration = ({
  activeScreen,
  isComplete,
  loadLevelCrowdEntries,
  reloadKey,
}: {
  activeScreen: AppScreen;
  isComplete: boolean;
  loadLevelCrowdEntries: () => Promise<OutcomeCrowdLeaderboardEntry[]>;
  reloadKey?: string | null;
}): OutcomeCrowdOrchestration => {
  const outcomeCrowdRef = useRef<HTMLElement | null>(null);
  const outcomeCrowdBubblesRef = useRef<OutcomeCrowdBubble[]>([]);
  const outcomeCrowdNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [completionCrowdAvatarUrls, setCompletionCrowdAvatarUrls] = useState<string[]>([]);
  const [completionCrowdReady, setCompletionCrowdReady] = useState(false);
  const [outcomeCrowdViewport, setOutcomeCrowdViewport] = useState<OutcomeCrowdViewport>(
    getInitialOutcomeCrowdViewport
  );
  const [outcomeCrowdBubbles, setOutcomeCrowdBubbles] = useState<OutcomeCrowdBubble[]>([]);

  const handleOutcomeCrowdRef = useCallback((node: HTMLElement | null) => {
    outcomeCrowdRef.current = node;
    if (!node) {
      return;
    }
    const viewport = readOutcomeCrowdViewport(node);
    if (viewport) {
      setOutcomeCrowdViewport(viewport);
    }
  }, []);

  const setOutcomeCrowdBubbleNode = useCallback(
    (id: string, node: HTMLDivElement | null) => {
      const nodes = outcomeCrowdNodesRef.current;
      if (!node) {
        nodes.delete(id);
        return;
      }
      nodes.set(id, node);
      const bubble = outcomeCrowdBubblesRef.current.find((entry) => entry.id === id);
      if (!bubble) {
        return;
      }
      syncOutcomeCrowdNodePosition(node, bubble);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!isComplete) {
      const cancelReset = deferOutcomeCrowdStateUpdate(() => {
        setCompletionCrowdAvatarUrls([]);
        setOutcomeCrowdBubbles([]);
      });
      return () => {
        cancelled = true;
        cancelReset();
      };
    }
    const loadCrowd = async () => {
      try {
        const entries = await loadLevelCrowdEntries();
        if (cancelled) {
          return;
        }
        const avatars = getOutcomeCrowdAvatarUrls(entries);
        warmImagePreloads(
          avatars.filter((url) => !url.startsWith('data:image/svg+xml')),
          {
            fetchPriority: 'high',
          }
        );
        setCompletionCrowdAvatarUrls(avatars);
      } catch (_error) {
        if (!cancelled) {
          setCompletionCrowdAvatarUrls([]);
        }
      }
    };
    void loadCrowd();
    return () => {
      cancelled = true;
    };
  }, [isComplete, loadLevelCrowdEntries, reloadKey]);

  useEffect(() => {
    if (activeScreen !== 'challenge' || !isComplete || !completionCrowdReady) {
      return deferOutcomeCrowdStateUpdate(() => {
        setOutcomeCrowdViewport({ width: 0, height: 0 });
      });
    }
    const crowdElement = outcomeCrowdRef.current;
    if (!crowdElement) {
      return;
    }
    let retryFrameId = 0;
    const syncViewport = () => {
      const viewport = readOutcomeCrowdViewport(crowdElement);
      if (viewport) {
        setOutcomeCrowdViewport((previous) =>
          previous.width === viewport.width && previous.height === viewport.height
            ? previous
            : viewport
        );
        return;
      }
      retryFrameId = window.requestAnimationFrame(syncViewport);
    };
    syncViewport();
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncViewport())
        : null;
    observer?.observe(crowdElement);
    window.addEventListener('resize', syncViewport);
    return () => {
      window.cancelAnimationFrame(retryFrameId);
      observer?.disconnect();
      window.removeEventListener('resize', syncViewport);
    };
  }, [activeScreen, isComplete, completionCrowdAvatarUrls.length, completionCrowdReady]);

  useEffect(() => {
    const outcomeCrowdWidth = outcomeCrowdViewport.width;
    const outcomeCrowdHeight = outcomeCrowdViewport.height;
    if (
      activeScreen !== 'challenge' ||
      !isComplete ||
      outcomeCrowdWidth <= 0 ||
      outcomeCrowdHeight <= 0
    ) {
      outcomeCrowdBubblesRef.current = [];
      return deferOutcomeCrowdStateUpdate(() => {
        setOutcomeCrowdBubbles([]);
        setCompletionCrowdReady(false);
      });
    }
    if (completionCrowdAvatarUrls.length === 0) {
      outcomeCrowdBubblesRef.current = [];
      return deferOutcomeCrowdStateUpdate(() => {
        setOutcomeCrowdBubbles([]);
        setCompletionCrowdReady(true);
      });
    }

    const viewport = { width: outcomeCrowdWidth, height: outcomeCrowdHeight };
    const bubbles = buildOutcomeCrowdBubbles(completionCrowdAvatarUrls, viewport);
    outcomeCrowdBubblesRef.current = bubbles;
    const cancelBubbleState = deferOutcomeCrowdStateUpdate(() => {
      setOutcomeCrowdBubbles(bubbles);
    });
    const nodes = outcomeCrowdNodesRef.current;
    for (const bubble of bubbles) {
      const node = nodes.get(bubble.id);
      if (!node) {
        continue;
      }
      syncOutcomeCrowdNodePosition(node, bubble);
    }
    return cancelBubbleState;
  }, [activeScreen, isComplete, completionCrowdAvatarUrls, outcomeCrowdViewport]);

  useEffect(() => {
    if (!isComplete) {
      return deferOutcomeCrowdStateUpdate(() => {
        setCompletionCrowdReady(false);
      });
    }
    if (completionCrowdAvatarUrls.length === 0) {
      return deferOutcomeCrowdStateUpdate(() => {
        setCompletionCrowdReady(true);
      });
    }
    let cancelled = false;
    const urls = completionCrowdAvatarUrls.slice(0, maxOutcomeCrowdAvatars);
    const criticalUrls = urls.slice(0, Math.min(criticalOutcomeAvatarCount, urls.length));
    warmImagePreloads(urls, {
      fetchPriority: 'high',
      timeoutMs: 1900,
    });
    const fallback = window.setTimeout(() => {
      if (!cancelled) {
        setCompletionCrowdReady(true);
      }
    }, outcomeCrowdFallbackReadyMs);
    void Promise.all(
      criticalUrls.map((url) =>
        preloadImageAsset(url, { fetchPriority: 'high', timeoutMs: 1300 })
      )
    ).then(() => {
      if (!cancelled) {
        window.clearTimeout(fallback);
        setCompletionCrowdReady(true);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [isComplete, completionCrowdAvatarUrls]);

  return {
    completionCrowdAvatarUrls,
    completionCrowdReady,
    handleOutcomeCrowdRef,
    outcomeCrowdBubbles,
    setOutcomeCrowdBubbleNode,
  };
};
