import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/landing.css';

// Initialize i18n before rendering
import './i18n/config';

// PWA Service Worker registration
import { registerSW } from 'virtual:pwa-register';

// Register service worker with update callback
const updateSW = registerSW({
  onNeedRefresh() {
    // Dispatch custom event for PWA update notification component
    window.dispatchEvent(new CustomEvent('pwa-update-available', {
      detail: { updateSW }
    }));
  },
  onOfflineReady() {
    console.log('RawDrive is ready to work offline');
  },
  onRegistered(registration) {
    // Check for updates every hour
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
  onRegisterError(error) {
    console.error('Service worker registration failed:', error);
  },
});

/* =============================================================================
   Application Entry Point

   Mounts the React application to the DOM.
   ============================================================================= */

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <App />
    </React.Suspense>
  </React.StrictMode>
);
