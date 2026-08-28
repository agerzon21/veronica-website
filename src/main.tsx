import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { attemptChunkRecovery } from './components/ChunkErrorBoundary';

// Routes are code-split, so a deploy that lands while a tab is open leaves the
// page referencing chunk hashes that no longer exist. Vite fires this event
// when a dynamic import's preload fails; recovering here catches it before it
// ever reaches a render and becomes a white screen. attemptChunkRecovery has
// its own offline and reload-loop guards.
window.addEventListener('vite:preloadError', (event) => {
  if (attemptChunkRecovery()) event.preventDefault();
});

// NOTE: there was a `document.title = 'Vero Photography v1.0.1'` here. It ran at
// module scope and stomped the route-specific <title> that index.html and
// prerender-photos.mjs write, so every page showed the version string until
// Helmet caught up — including for GA4's auto-collected page_title, since gtag
// loads inside that window. It never did any cache busting either; that's
// Vite's content hash. Removed.

// Disable the browser's automatic scroll restoration. Otherwise the gallery
// modal closes via history.back() and the browser snaps the page back to
// scroll=0 (the saved scroll for the original /gallery/portraits entry),
// overriding ImageModal.handleClose's scroll-to-center-the-current-photo
// work. With manual restoration, our explicit scrollTo calls take effect.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 