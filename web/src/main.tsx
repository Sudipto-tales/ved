import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/providers';
import { dismissPreloader } from '@/shared/lib/preloader';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

dismissPreloader();
