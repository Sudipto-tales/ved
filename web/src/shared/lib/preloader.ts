// Dismiss the boot preloader (the inline splash in index.html) once React has mounted.
// The splash is inlined in index.html so it paints before the JS bundle; we fade it out
// here — after the app's first paint — so there's no flash between splash and first render.
export function dismissPreloader(): void {
  const el = document.getElementById('app-preloader');
  if (!el) return;
  // Wait for the app's first paint (two rAFs) before starting the fade.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.classList.add('ved-pl--hidden');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      // Fallback removal in case transitionend doesn't fire (e.g. reduced-motion).
      window.setTimeout(() => el.remove(), 600);
    }),
  );
}
