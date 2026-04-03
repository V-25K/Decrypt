import './index.css';

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GameApp } from './app/GameApp';
import { primeSfxOnBoot } from './sfx';

let mountedContainer: HTMLElement | null = null;
let mountedRoot: Root | null = null;

const renderGameApp = (root: Root) => {
  root.render(
    <StrictMode>
      <GameApp />
    </StrictMode>
  );
};

const resolveContainer = (container?: HTMLElement | null) => {
  const target = container ?? document.getElementById('root');
  if (!target) {
    throw new Error('Missing root element for game render.');
  }
  return target;
};

export const mountGame = (container?: HTMLElement | null): void => {
  const target = resolveContainer(container);

  if (mountedRoot && mountedContainer !== target) {
    mountedRoot.unmount();
    mountedRoot = null;
    mountedContainer = null;
  }

  if (!mountedRoot) {
    mountedRoot = createRoot(target);
    mountedContainer = target;
  }

  renderGameApp(mountedRoot);
};

export const unmountGame = (): void => {
  if (!mountedRoot) {
    return;
  }
  mountedRoot.unmount();
  mountedRoot = null;
  mountedContainer = null;
};

primeSfxOnBoot();
mountGame();
