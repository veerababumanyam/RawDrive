import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, SearchProvider } from './contexts';
import { ToastProvider } from './components/ui';
import { routes } from './router';

/* =============================================================================
   App Component

   Root application component that sets up routing and providers.
   ============================================================================= */

// Create browser router with v7 future flags
const router = createBrowserRouter(routes, {
  future: {
  },
});

const App: React.FC = () => {
  return (
    <HelmetProvider>
      <AuthProvider>
        <ToastProvider position="bottom-center">
          <SearchProvider>
            <RouterProvider router={router} />
          </SearchProvider>
        </ToastProvider>
      </AuthProvider>
    </HelmetProvider>
  );
};

export default App;
