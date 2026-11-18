import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import './site.css';
import { Site } from './Site';

// Landing page do Rudge: entrada separada do app (não registra service worker,
// não lê nem grava dados da conta).
createRoot(document.getElementById('site')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
