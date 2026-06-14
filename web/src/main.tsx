import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/providers';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
