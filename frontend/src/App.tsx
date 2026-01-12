import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts';
import { ToastProvider } from './components/ui';
import { PWAUpdateNotification } from './components/ui/PWAUpdateNotification';
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

// Create QueryClient with sensible defaults for the application
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - cache garbage collection
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch on window focus by default
    },
    mutations: {
      retry: 0, // Don't retry mutations by default
    },
  },
});

const App: React.FC = () => {
  return (
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <AuthProvider>
            <ToastProvider position="bottom-center">
              <RouterProvider router={router} future={{ v7_startTransition: true }} />
              <PWAUpdateNotification />
            </ToastProvider>
          </AuthProvider>
        </HelmetProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
