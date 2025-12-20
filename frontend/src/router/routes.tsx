import React, { Suspense, lazy } from 'react';
import { RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth';

/* =============================================================================
   Route Configuration

   Defines all application routes with lazy loading for code splitting.
   ============================================================================= */

// Loading fallback component
const PageLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-text-secondary">Loading...</p>
    </div>
  </div>
);

// Lazy load pages for code splitting
// Public pages
const LandingPage = lazy(() => import('../pages/public/LandingPage'));
const FeaturesPage = lazy(() => import('../pages/public/FeaturesPage'));
const PricingPage = lazy(() => import('../pages/public/PricingPage'));
const FAQPage = lazy(() => import('../pages/public/FAQPage'));
const HowItWorksPage = lazy(() => import('../pages/public/HowItWorksPage'));
const ContactPage = lazy(() => import('../pages/public/ContactPage'));

// Legal/Policy pages
const TermsPage = lazy(() => import('../pages/public/legal/terms'));
const PrivacyPage = lazy(() => import('../pages/public/legal/privacy'));
const RefundPage = lazy(() => import('../pages/public/legal/refund'));

// Auth pages
const SignInPage = lazy(() => import('../pages/public/SignInPage'));
const SignUpPage = lazy(() => import('../pages/public/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('../pages/public/ForgotPasswordPage'));

// Workspace pages
const DashboardPage = lazy(() => import('../pages/workspace/DashboardPage'));
const GalleriesPage = lazy(() => import('../pages/workspace/GalleriesPage'));
const GalleryCreatePage = lazy(() => import('../pages/workspace/GalleryCreatePage'));
const GalleryDetailPage = lazy(() => import('../pages/workspace/GalleryDetailPage'));
const TrashPage = lazy(() => import('../pages/workspace/TrashPage'));

// Wrapper for lazy loaded components
const LazyPage: React.FC<{ component: React.LazyExoticComponent<any> }> = ({
  component: Component,
}) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// Wrapper for protected lazy loaded components
// const ProtectedLazyPage: React.FC<{ component: React.LazyExoticComponent<any> }> = ({
//   component: Component,
// }) => (
//   <ProtectedRoute>
//     <Suspense fallback={<PageLoader />}>
//       <Component />
//     </Suspense>
//   </ProtectedRoute>
// );

// Public routes (landing pages, marketing)
export const publicRoutes: RouteObject[] = [
  {
    path: '/',
    element: <LazyPage component={LandingPage} />,
  },
  {
    path: '/features',
    element: <LazyPage component={FeaturesPage} />,
  },
  {
    path: '/pricing',
    element: <LazyPage component={PricingPage} />,
  },
  {
    path: '/faq',
    element: <LazyPage component={FAQPage} />,
  },
  {
    path: '/how-it-works',
    element: <LazyPage component={HowItWorksPage} />,
  },
  {
    path: '/contact',
    element: <LazyPage component={ContactPage} />,
  },
  // Legal/Policy pages
  {
    path: '/legal/terms',
    element: <LazyPage component={TermsPage} />,
  },
  {
    path: '/legal/privacy',
    element: <LazyPage component={PrivacyPage} />,
  },
  {
    path: '/legal/refund',
    element: <LazyPage component={RefundPage} />,
  },
];

// Auth routes
export const authRoutes: RouteObject[] = [
  {
    path: '/signin',
    element: <LazyPage component={SignInPage} />,
  },
  {
    path: '/signup',
    element: <LazyPage component={SignUpPage} />,
  },
  {
    path: '/forgot-password',
    element: <LazyPage component={ForgotPasswordPage} />,
  },
];

// Workspace routes (require authentication)
// Workspace routes (require authentication)
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout';

export const workspaceRoutes: RouteObject[] = [
  {
    path: '/workspace',
    element: (
      <ProtectedRoute>
        <WorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <LazyPage component={DashboardPage} />,
      },
      {
        path: 'galleries',
        element: <LazyPage component={GalleriesPage} />,
      },
      {
        path: 'galleries/new',
        element: <LazyPage component={GalleryCreatePage} />,
      },
      {
        path: 'galleries/:id',
        element: <LazyPage component={GalleryDetailPage} />,
      },
      {
        path: 'libraries',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'clients',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'shared',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'recent',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'favorites',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'trash',
        element: <LazyPage component={TrashPage} />,
      },
      {
        path: 'settings',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'settings/*',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
      {
        path: 'help',
        element: <LazyPage component={DashboardPage} />, // Placeholder
      },
    ],
  },
];

// 404 fallback
const NotFoundPage: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <h1 className="text-6xl font-bold text-text-primary mb-4">404</h1>
      <p className="text-xl text-text-secondary mb-8">Page not found</p>
      <a
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors"
      >
        Go Home
      </a>
    </div>
  </div>
);

export const fallbackRoute: RouteObject = {
  path: '*',
  element: <NotFoundPage />,
};

// All routes combined
export const routes: RouteObject[] = [
  ...publicRoutes,
  ...authRoutes,
  ...workspaceRoutes,
  fallbackRoute,
];

export default routes;
