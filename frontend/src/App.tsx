import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts';
import { ToastProvider } from './components/ui';
import { routes } from './router';
import ErrorBoundary from './components/error/ErrorBoundary';
import { AppErrorFallback } from './components/error/ErrorFallbacks';

/* =============================================================================
   App Component

   Root application component that sets up routing and providers.
   ============================================================================= */

// Create browser router with v7 future flags for smooth migration
const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
  },
});

const App: React.FC = () => {
  return (
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <HelmetProvider>
        <AuthProvider>
          <ToastProvider position="bottom-center">
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </ToastProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
};

export default App;
