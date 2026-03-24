import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameApp } from './app/GameApp';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element for game render.');
}

createRoot(root).render(
  <StrictMode>
    <GameApp />
  </StrictMode>
);
