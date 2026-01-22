/* @refresh reset - force update */
import { Suspense, lazy, ComponentType } from 'react';
import { RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth';
import ErrorBoundary from '../components/error/ErrorBoundary';
import { RouteErrorFallback } from '../components/error/ErrorFallbacks';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout';
import { RootLayout } from '../components/layout/RootLayout';

/* =============================================================================
   Route Configuration

   Defines all application routes with lazy loading for code splitting.
   ============================================================================= */

/**
 * Lazy import with retry for chunk load failures.
 * Retries failed dynamic imports up to 3 times with exponential backoff.
 * This handles stale cache issues after deployments.
 */
function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  interval = 1000
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await importFn();
      } catch (error) {
        // Only retry on chunk load errors
        const isChunkError = error instanceof Error &&
          (error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Loading chunk') ||
            error.message.includes('Loading CSS chunk'));

        if (!isChunkError || attempt === retries - 1) {
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, interval * Math.pow(2, attempt)));
      }
    }
    // This should never be reached, but TypeScript needs it
    throw new Error('Import failed after retries');
  });
}

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
const PublicProfilePage = lazy(() => import('../pages/public/PublicProfilePage'));
const PublicPersonalProfilePage = lazy(() => import('../pages/public/PublicPersonalProfilePage'));
const PublicGalleryPage = lazy(() => import('../pages/public/PublicGalleryPage'));
const PublicInvitationPage = lazy(() => import('../pages/public/PublicInvitationPage'));
const AlbumProofPage = lazy(() => import('../pages/public/AlbumProofPage'));

// Onboarding pages (automated onboarding system)
const OnboardingLayout = lazy(() => import('../pages/onboarding/OnboardingLayout'));
const PlanSelectionPage = lazy(() => import('../pages/onboarding/PlanSelectionPage'));
const RegistrationPage = lazy(() => import('../pages/onboarding/RegistrationPage'));
const EmailVerificationPage = lazy(() => import('../pages/onboarding/EmailVerificationPage'));
const PaymentPage = lazy(() => import('../pages/onboarding/PaymentPage'));
const SetupPage = lazy(() => import('../pages/onboarding/SetupPage'));

// Legal/Policy pages
const TermsPage = lazy(() => import('../pages/public/legal/terms'));
const PrivacyPage = lazy(() => import('../pages/public/legal/privacy'));
const RefundPage = lazy(() => import('../pages/public/legal/refund'));

// Solution pages
const ForMarketingPage = lazy(() => import('../pages/public/solutions/ForMarketingPage'));
const ForDeliveryPage = lazy(() => import('../pages/public/solutions/ForDeliveryPage'));
const ForBusinessPage = lazy(() => import('../pages/public/solutions/ForBusinessPage'));

// Auth pages - use lazyWithRetry for critical auth flows
const SignInPage = lazyWithRetry(() => import('../pages/public/SignInPage'));
const SignUpPage = lazyWithRetry(() => import('../pages/public/SignUpPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('../pages/public/ForgotPasswordPage'));

// Workspace pages
const DashboardPage = lazy(() => import('../pages/workspace/DashboardPage'));
const GalleriesPage = lazy(() => import('../pages/workspace/GalleriesPage'));
const GalleryPreviewPage = lazy(() => import('../pages/workspace/GalleryPreviewPage'));
const PeoplePage = lazy(() => import('../pages/workspace/PeoplePage'));
const FavoritesPage = lazy(() => import('../pages/workspace/FavoritesPage'));
const RecentPage = lazy(() => import('../pages/workspace/RecentPage'));
const GalleryCreatePage = lazy(() => import('../pages/workspace/GalleryCreatePage'));
const GalleryDetailPage = lazy(() => import('../pages/workspace/GalleryDetailPage'));
const GalleryDesignStudioPage = lazy(() => import('../pages/workspace/GalleryDesignStudioPage'));
const ReviewModePage = lazy(() => import('../pages/workspace/ReviewModePage'));
const RecycleBinPage = lazy(() => import('../pages/workspace/RecycleBinPage'));
const SharedDashboardPage = lazy(() => import('../pages/workspace/SharedDashboardPage'));

// Client CRM pages
const ClientsPage = lazy(() => import('../pages/workspace/ClientsPage'));
const ClientDetailPage = lazy(() => import('../pages/workspace/ClientDetailPage'));
const ClientFormPage = lazy(() => import('../pages/workspace/ClientFormPage'));
const VisitorsPage = lazy(() => import('../pages/workspace/VisitorsPage'));
const CompanyProfilePage = lazy(() => import('../pages/workspace/settings/CompanyProfilePage'));
const WorkspaceSettingsHub = lazy(() => import('../pages/workspace/settings/WorkspaceSettingsHub'));
const HelpSupportPage = lazy(() => import('../pages/workspace/settings/HelpSupportPage'));


// Digital Invitations pages (016-save-the-date)

// Digital Invitations pages (016-save-the-date)
const InvitationsPage = lazy(() => import('../pages/workspace/InvitationsPage'));
const InvitationCreatePage = lazy(() => import('../pages/workspace/InvitationCreatePage'));
const InvitationEditPage = lazy(() => import('../pages/workspace/InvitationEditPage'));
const InvitationDetailPage = lazy(() => import('../pages/workspace/InvitationDetailPage'));

// LiveSync (Live Camera Sync) page
const LiveSyncPage = lazy(() => import('../pages/workspace/LiveSyncPage'));

// Calendar & Booking Management page
const BookingsPage = lazy(() => import('../pages/workspace/BookingsPage'));

// Analytics & Reporting pages
const AnalyticsDashboardPage = lazy(() => import('../pages/workspace/AnalyticsDashboardPage'));
const GalleryAnalyticsPage = lazy(() => import('../pages/workspace/GalleryAnalyticsPage'));
const ReportsPage = lazy(() => import('../pages/workspace/ReportsPage'));

// Team Management pages
const TeamPage = lazy(() => import('../pages/workspace/TeamPage'));
const InvitationAcceptPage = lazy(() => import('../pages/public/InvitationAcceptPage'));

// User Settings pages
// Note: Individual settings pages are deprecated - use UserSettingsPage with tabs
const UserSettingsPage = lazy(() => import('../pages/settings/UserSettingsPage'));

// Admin pages
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const GeminiModelsPage = lazy(() => import('../pages/admin/GeminiModelsPage'));

// AI Dashboard pages - TODO: Implement these pages
// const SmartCurateDashboardPage = lazy(() => import('../pages/workspace/ai/SmartCurateDashboardPage'));
// const AIInsightsHistoryPage = lazy(() => import('../pages/workspace/ai/AIInsightsHistoryPage'));
// const AIToolsHubPage = lazy(() => import('../pages/workspace/ai/AIToolsHubPage'));

// Compliance pages (audit & compliance system)
const AuditLogsPage = lazy(() => import('../pages/admin/AuditLogsPage'));
const DataSubjectRequestsPage = lazy(() => import('../pages/admin/DataSubjectRequestsPage'));
const LegalHoldsPage = lazy(() => import('../pages/admin/LegalHoldsPage'));
const IncidentsPage = lazy(() => import('../pages/admin/IncidentsPage'));

// Wrapper for lazy loaded components
const LazyPage: React.FC<{ component: React.LazyExoticComponent<any> }> = ({
  component: Component,
}) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// Wrapper for critical lazy loaded components with error boundary
const CriticalLazyPage: React.FC<{ component: React.LazyExoticComponent<any> }> = ({
  component: Component,
}) => (
  <ErrorBoundary fallback={<RouteErrorFallback />}>
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  </ErrorBoundary>
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
  {
    path: '/p/:slug',
    element: <LazyPage component={PublicProfilePage} />,
  },
  // Personal profile public page (Digital Visiting Cards)
  {
    path: '/u/:slug',
    element: <LazyPage component={PublicPersonalProfilePage} />,
  },
  {
    path: '/g/:galleryId',
    element: <LazyPage component={PublicGalleryPage} />,
  },
  // Preview route - authenticated but renders like public gallery (no sidebar)
  {
    path: '/workspace/galleries/:id/preview',
    element: (
      <ProtectedRoute>
        <CriticalLazyPage component={GalleryPreviewPage} />
      </ProtectedRoute>
    ),
  },
  // Public invitation view (016-save-the-date)
  {
    path: '/i/:slug',
    element: <LazyPage component={PublicInvitationPage} />,
  },
  // Album proofing view (026-album-proofing)
  {
    path: '/album/:token',
    element: <LazyPage component={AlbumProofPage} />,
  },
  // Team invitation accept page (requires token in URL)
  {
    path: '/invite/:token',
    element: <CriticalLazyPage component={InvitationAcceptPage} />,
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
  // Solution pages
  {
    path: '/solutions/marketing',
    element: <LazyPage component={ForMarketingPage} />,
  },
  {
    path: '/solutions/delivery',
    element: <LazyPage component={ForDeliveryPage} />,
  },
  {
    path: '/solutions/business',
    element: <LazyPage component={ForBusinessPage} />,
  },
];

// Auth routes - use CriticalLazyPage to handle chunk load errors gracefully
export const authRoutes: RouteObject[] = [
  {
    path: '/signin',
    element: <CriticalLazyPage component={SignInPage} />,
  },
  {
    path: '/signup',
    element: <CriticalLazyPage component={SignUpPage} />,
  },
  {
    path: '/forgot-password',
    element: <CriticalLazyPage component={ForgotPasswordPage} />,
  },
];

// Onboarding routes (automated onboarding system)
// Public routes for new user registration flow
export const onboardingRoutes: RouteObject[] = [
  {
    path: '/onboarding',
    element: (
      <Suspense fallback={<PageLoader />}>
        <OnboardingLayout />
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: <LazyPage component={PlanSelectionPage} />,
      },
      {
        path: 'plans',
        element: <LazyPage component={PlanSelectionPage} />,
      },
      {
        path: 'register',
        element: <CriticalLazyPage component={RegistrationPage} />,
      },
      {
        path: 'verify-email',
        element: <CriticalLazyPage component={EmailVerificationPage} />,
      },
      {
        path: 'payment',
        element: <CriticalLazyPage component={PaymentPage} />,
      },
      {
        path: 'setup',
        element: <CriticalLazyPage component={SetupPage} />,
      },
    ],
  },
];

// Workspace routes (require authentication)

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
        element: <CriticalLazyPage component={GalleriesPage} />,
      },
      {
        path: 'galleries/new',
        element: <CriticalLazyPage component={GalleryCreatePage} />,
      },
      {
        path: 'galleries/:id',
        element: <CriticalLazyPage component={GalleryDetailPage} />,
      },
      {
        path: 'galleries/:id/design',
        element: <CriticalLazyPage component={GalleryDesignStudioPage} />,
      },
      {
        path: 'galleries/:id/review',
        element: <CriticalLazyPage component={ReviewModePage} />,
      },
      {
        path: 'people',
        element: <LazyPage component={PeoplePage} />,
      },
      // Team Management routes
      {
        path: 'team',
        element: <CriticalLazyPage component={TeamPage} />,
      },
      {
        path: 'clients',
        element: <CriticalLazyPage component={ClientsPage} />,
      },
      {
        path: 'clients/new',
        element: <CriticalLazyPage component={ClientFormPage} />,
      },
      {
        path: 'clients/:clientId',
        element: <CriticalLazyPage component={ClientDetailPage} />,
      },
      {
        path: 'clients/:clientId/edit',
        element: <CriticalLazyPage component={ClientFormPage} />,
      },
      {
        path: 'visitors',
        element: <LazyPage component={VisitorsPage} />,
      },
      {
        path: 'shared',
        element: <CriticalLazyPage component={SharedDashboardPage} />,
      },
      {
        path: 'recent',
        element: <LazyPage component={RecentPage} />,
      },
      {
        path: 'favorites',
        element: <LazyPage component={FavoritesPage} />,
      },
      {
        path: 'trash',
        element: <CriticalLazyPage component={RecycleBinPage} />,
      },
      {
        path: 'settings',
        element: <CriticalLazyPage component={WorkspaceSettingsHub} />,
      },
      {
        path: 'settings/:tabId',
        element: <CriticalLazyPage component={WorkspaceSettingsHub} />,
      },
      // Settings sub-routes are handled by the Hub component tabs
      // but we can add aliases/redirects if needed in the future.
      // Profile is now a tab in Hub.
      // Note: Additional workspace settings sub-routes can be added here as needed
      // The catch-all was removed to prevent confusing redirects to dashboard
      {
        path: 'help',
        element: <LazyPage component={HelpSupportPage} />,
      },
      // Digital Invitations routes (016-save-the-date)
      {
        path: 'invitations',
        element: <CriticalLazyPage component={InvitationsPage} />,
      },
      {
        path: 'invitations/new',
        element: <CriticalLazyPage component={InvitationCreatePage} />,
      },
      {
        path: 'invitations/:id',
        element: <CriticalLazyPage component={InvitationDetailPage} />,
      },
      {
        path: 'invitations/:id/edit',
        element: <CriticalLazyPage component={InvitationEditPage} />,
      },
      // LiveSync route
      {
        path: 'livesync',
        element: <CriticalLazyPage component={LiveSyncPage} />,
      },
      // Calendar & Booking Management routes
      {
        path: 'bookings',
        element: <CriticalLazyPage component={BookingsPage} />,
      },
      // Analytics & Reporting routes
      {
        path: 'analytics',
        element: <CriticalLazyPage component={AnalyticsDashboardPage} />,
      },
      {
        path: 'analytics/galleries/:galleryId',
        element: <CriticalLazyPage component={GalleryAnalyticsPage} />,
      },
      {
        path: 'reports',
        element: <CriticalLazyPage component={ReportsPage} />,
      },
      // AI Dashboard routes - TODO: Uncomment when pages are implemented
      // {
      //   path: 'ai/smart-curate',
      //   element: <CriticalLazyPage component={SmartCurateDashboardPage} />,
      // },
      // {
      //   path: 'ai/insights',
      //   element: <CriticalLazyPage component={AIInsightsHistoryPage} />,
      // },
      // {
      //   path: 'ai/tools',
      //   element: <CriticalLazyPage component={AIToolsHubPage} />,
      // },
    ],
  },
];

// User Settings routes (require authentication)
// Uses tabbed navigation within WorkspaceLayout - all settings on single /settings page
// Tab state managed via URL query parameter: /settings?tab=security
export const userSettingsRoutes: RouteObject[] = [
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <WorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <CriticalLazyPage component={UserSettingsPage} />,
      },
    ],
  },
];

// Admin routes (require authentication + admin role)
// Note: Admin role check is enforced by backend API
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <WorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <CriticalLazyPage component={AdminDashboardPage} />,
      },
      {
        path: 'dashboard',
        element: <CriticalLazyPage component={AdminDashboardPage} />,
      },
      {
        path: 'gemini-models',
        element: <CriticalLazyPage component={GeminiModelsPage} />,
      },
      // Compliance routes (audit & compliance system)
      {
        path: 'audit-logs',
        element: <CriticalLazyPage component={AuditLogsPage} />,
      },
      {
        path: 'data-subject-requests',
        element: <CriticalLazyPage component={DataSubjectRequestsPage} />,
      },
      {
        path: 'legal-holds',
        element: <CriticalLazyPage component={LegalHoldsPage} />,
      },
      {
        path: 'incidents',
        element: <CriticalLazyPage component={IncidentsPage} />,
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
  {
    element: <RootLayout />,
    children: [
      ...publicRoutes,
      ...authRoutes,
      ...onboardingRoutes,
      ...workspaceRoutes,
      ...userSettingsRoutes,
      ...adminRoutes,
      fallbackRoute,
    ],
  },
];

export default routes;
