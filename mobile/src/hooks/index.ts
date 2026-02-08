/**
 * Hooks index
 * Re-exports all custom hooks for easier importing
 */

// Gallery hooks
export {
  galleryKeys,
  useGalleries,
  useGallery,
  useGalleryAssets,
  useGalleryStats,
  useCreateGallery,
  useUpdateGallery,
  useDeleteGallery,
  usePublishGallery,
  useArchiveGallery,
  useStarAsset,
  useUnstarAsset,
  useRejectAsset,
  useUnrejectAsset,
} from './useGalleries';

// Dashboard hooks
export {
  dashboardKeys,
  useDashboardOverview,
  useTodaySchedule,
  useActivityFeed,
  useQuickStats,
} from './useDashboard';

// Notification hooks
export {
  notificationKeys,
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from './useNotifications';

// Client hooks
export {
  clientKeys,
  useClients,
  useClient,
  useClientGalleries,
  useSearchClients,
  useClientTags,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
} from './useClients';
