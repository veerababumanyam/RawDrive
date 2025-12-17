import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts';
import { routes } from './router';

/* =============================================================================
   App Component

   Root application component that sets up routing and providers.
   ============================================================================= */

// Create browser router
const router = createBrowserRouter(routes);

const App: React.FC = () => {
  return (
    <HelmetProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </HelmetProvider>
  );
};

export default App;
