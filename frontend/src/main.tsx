import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/landing.css';

// Initialize i18n before rendering
import './i18n/config';

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
