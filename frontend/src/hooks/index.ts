/* =============================================================================
   Custom Hooks - Central Export
   ============================================================================= */

export { useTheme, ThemeProvider, useThemeContext } from './useTheme';
export type { Theme, ResolvedTheme, ThemeProviderProps } from './useTheme';

export { useReducedMotion } from './useReducedMotion';
export { useFocusTrap } from './useFocusTrap';
export { useIntersectionObserver } from './useIntersectionObserver';

export { useGallery, useGalleryList } from './useGallery';
export { useGalleryAssets } from './useGalleryAssets';
export { useUpload } from './useUpload';
export type { UseUploadOptions, UseUploadReturn, UploadFile, UploadProgress } from './useUpload';

export { useABTest, useABTestValue, useAllABTests } from './useABTest';

export {
  useUserProfile,
  useTwoFactorAuth,
  usePasswordChange,
  useSessions,
  useNotificationPreferences,
  usePrivacySettings,
  useDataExport,
  useAccountDeletion,
} from './useUserSettings';

// Gemini Settings hooks
export {
  useGeminiSettings,
  useGeminiModels,
  useGeminiSettingsPage,
} from './useGeminiSettings';

// Admin Gemini hooks
export {
  useAdminGeminiModels,
  useAdminGeminiStats,
  useAdminGeminiModel,
} from './useAdminGemini';

// AI Job Polling hook
export {
  useJobPolling,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
} from './useJobPolling';
export type {
  JobStatus,
  JobPollingOptions,
  UseJobPollingReturn,
} from './useJobPolling';

// Search hooks
export { useSearch } from './useSearch';
export type { UseSearchOptions, UseSearchReturn } from './useSearch';

export { useCommandBar } from './useCommandBar';
export type { UseCommandBarReturn } from './useCommandBar';

// Gallery Export hooks
export {
  useGalleryExport,
  useExportsList,
  useExportDetail,
  useExportStats,
  useCloudConnections,
  useCreateExport,
  useCancelExport,
  useRetryExport,
  useBatchExport,
  useDisconnectCloudProvider,
  exportQueryKeys,
} from './useGalleryExport';

// Granular Permissions hooks
export {
  useEffectivePermissions,
  useHasPermission,
  useHasPermissions,
  useCheckGranularPermission,
  usePermissionConditions,
  useCreateCondition,
  useTimeBasedAssignments,
  useGrantTimeBasedAccess,
  useRevokeTimeBasedAccess,
  useRoleAuditLogs,
  useDelegationRules,
  useCreateDelegationRule,
  useGranularPermissions,
  useGrantGranularPermission,
  useRevokeGranularPermission,
  WORKSPACE_PERMISSIONS,
  PERMISSION_CONDITION_TYPES,
  ROLE_AUDIT_ACTION_TYPES,
} from './usePermissions';
export type {
  PermissionCondition,
  GranularPermission,
  TimeBasedAssignment,
  EffectivePermissions,
  GranularPermissionCheckResult,
  RoleAuditLogEntry,
  DelegationRule,
  WorkspacePermission,
  PermissionConditionType,
  RoleAuditActionType,
} from './usePermissions';

// Analytics hooks
export {
  useDashboardMetrics,
  useWorkspaceOverview,
  useQuickStats,
  useActivityFeed,
  useTopGalleries,
  useAnalyticsDashboard,
  invalidateAnalyticsCache,
  clearAllAnalyticsCaches,
} from './useAnalytics';
export type {
  UseDashboardMetricsOptions,
  UseDashboardMetricsReturn,
  UseWorkspaceOverviewOptions,
  UseWorkspaceOverviewReturn,
  UseQuickStatsOptions,
  UseQuickStatsReturn,
  UseActivityFeedOptions,
  UseActivityFeedReturn,
  UseTopGalleriesOptions,
  UseTopGalleriesReturn,
  UseAnalyticsDashboardOptions,
  UseAnalyticsDashboardReturn,
} from './useAnalytics';

// Gallery Analytics hooks
export {
  useGalleryAnalyticsDetails,
  useGalleryAnalyticsSummary,
  useGalleryViewsTimeSeries,
  useGalleryEngagement,
  useGalleryAnalyticsHistory,
  useCalculateGalleryAnalytics,
  useCompareGalleries,
  useGalleryAnalytics,
  invalidateGalleryAnalyticsCache,
  invalidateWorkspaceGalleryAnalyticsCache,
  clearAllGalleryAnalyticsCaches,
} from './useGalleryAnalytics';
export type {
  UseGalleryAnalyticsDetailsOptions,
  UseGalleryAnalyticsDetailsReturn,
  UseGalleryAnalyticsSummaryOptions,
  UseGalleryAnalyticsSummaryReturn,
  UseGalleryViewsTimeSeriesOptions,
  UseGalleryViewsTimeSeriesReturn,
  UseGalleryEngagementOptions,
  UseGalleryEngagementReturn,
  UseGalleryAnalyticsHistoryOptions,
  UseGalleryAnalyticsHistoryReturn,
  UseCalculateGalleryAnalyticsOptions,
  UseCalculateGalleryAnalyticsReturn,
  UseCompareGalleriesOptions,
  UseCompareGalleriesReturn,
  UseGalleryAnalyticsOptions,
  UseGalleryAnalyticsReturn,
} from './useGalleryAnalytics';

// Audit Logs hooks (Compliance)
export {
  useAuditLogs,
  useAuditLogEntry,
  useAuditExports,
  useAuditExport,
  useAuditLogSearch,
} from './useAuditLogs';
export type {
  UseAuditLogsOptions,
  UseAuditLogsReturn,
  UseAuditLogEntryOptions,
  UseAuditLogEntryReturn,
  UseAuditExportsOptions,
  UseAuditExportsReturn,
  UseAuditExportOptions,
  UseAuditExportReturn,
  UseAuditLogSearchOptions,
  UseAuditLogSearchReturn,
  AuditLogEntry,
  AuditLogSummary,
  AuditExport,
  ListAuditLogsQuery,
  CreateAuditExportRequest,
  AuditExportFormat,
  AuditExportStatus,
} from './useAuditLogs';
