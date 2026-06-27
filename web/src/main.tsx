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

// Reset the one-time chunk-reload guard (router.tsx) once the app has survived a few seconds
// — so a later stale-chunk navigation can self-heal again, while a tight reload loop (which
// happens in well under this window) is still prevented.
setTimeout(() => {
  try {
    sessionStorage.removeItem('ved.chunkReload');
  } catch {
    /* sessionStorage unavailable */
  }
}, 5000);
