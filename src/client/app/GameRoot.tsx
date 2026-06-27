import { useEffect, useState } from 'react';
import { trpc } from '../trpc';
import { LoadingScreen } from '../components/LoadingScreen';
import { LoggedOutScreen } from '../screens/LoggedOutScreen';
import { GameApp } from './GameApp';

type ViewerStatus = 'loading' | 'logged-in' | 'logged-out';

// Root gate: probe login state via the public game.viewer endpoint and mount the
// read-only LoggedOutScreen for logged-out visitors. The full game (GameApp)
// only mounts for logged-in users, so its authed bootstrap and effects never run
// for anonymous viewers. Any probe failure fails open to GameApp, which has its
// own bootstrap retry/error handling.
export const GameRoot = () => {
  const [status, setStatus] = useState<ViewerStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    const resolveViewer = async () => {
      try {
        const viewer = await trpc.game.viewer.query();
        if (!cancelled) {
          setStatus(viewer.isLoggedIn ? 'logged-in' : 'logged-out');
        }
      } catch {
        if (!cancelled) {
          setStatus('logged-in');
        }
      }
    };
    void resolveViewer();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return <LoadingScreen className="loading-screen-solid" />;
  }
  if (status === 'logged-out') {
    return <LoggedOutScreen />;
  }
  return <GameApp />;
};
