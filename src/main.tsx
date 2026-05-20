import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Cache busting version
const VERSION = '1.0.1';
document.title = `Vero Photography v${VERSION}`;

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