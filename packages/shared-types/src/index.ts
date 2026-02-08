/**
 * @rawdrive/shared-types
 *
 * Shared TypeScript types for the RawDrive platform.
 * This package provides type definitions that are shared between
 * frontend, backend, and other services.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Invitation Types & Enums
// ---------------------------------------------------------------------------

// Core enums
export {
  InvitationStatus,
  RSVPStatus,
  EventType,
  TemplateCategory,
  GuestStatus,
} from './invitations';

// Media enums
export {
  MediaType,
  MediaPurpose,
  MediaProcessingStatus,
} from './invitations';

// Layout enums
export {
  LayoutMode,
  LayoutDensity,
} from './invitations';

// Source & verification enums
export {
  RSVPSource,
  CheckinVerificationMethod,
  DeviceType,
  ReferrerType,
} from './invitations';

// AI generation enums
export {
  AIGenerationType,
  AIGenerationStatus,
  ImageGenerationProvider,
} from './invitations';

// Notification & event enums
export {
  NotificationPreference,
  InvitationEventType,
  ActorType,
  RSVPQuestionType,
} from './invitations';

// Embedded/nested interfaces
export type {
  LayoutConfig,
  TemplateLayout,
  VenueInfo,
  RSVPCustomQuestion,
  RSVPSettings,
  MediaVariant,
} from './invitations';

// Sub-event interfaces
export type {
  SubEvent,
  CreateSubEventRequest,
  UpdateSubEventRequest,
} from './invitations';

// Media interfaces
export type {
  InvitationMedia,
  UploadMediaRequest,
  UploadMediaResponse,
} from './invitations';

// Template interfaces
export type {
  InvitationTemplate,
} from './invitations';

// Guest interfaces
export type {
  InvitationGuest,
  AddGuestRequest,
  UpdateGuestRequest,
  BulkAddGuestsRequest,
} from './invitations';

// RSVP interfaces
export type {
  InvitationRSVP,
  SubmitRSVPRequest,
  UpdateRSVPRequest,
  RSVPSubmitResponse,
  RSVPResponse,
  RSVPListResponse,
  RSVPExportOptions,
  RSVPExportResponse,
} from './invitations';

// Edit token interfaces
export type {
  RSVPEditToken,
  EditTokenValidationResult,
  ValidateEditTokenRequest,
} from './invitations';

// RSVP validation interfaces
export type {
  RSVPFieldValidationResult,
  RSVPValidationResult,
  RSVPValidationConstraints,
  RSVPFormConfig,
} from './invitations';

// Check-in interfaces
export type {
  InvitationCheckin,
  CheckinRequest,
} from './invitations';

// Analytics interfaces
export type {
  InvitationViewAnalytics,
  RSVPStats,
  CheckinStats,
  InvitationStats,
} from './invitations';

// AI generation interfaces
export type {
  InvitationAIGeneration,
  ImageGenerationSettings,
} from './invitations';

// Audit event interfaces
export type {
  InvitationEvent,
} from './invitations';

// ---------------------------------------------------------------------------
// Gallery Types & Enums
// ---------------------------------------------------------------------------

export { GalleryStatus, DownloadPolicy, ThemeMode, LayoutStyle, AssetStatus } from './gallery';

// ---------------------------------------------------------------------------
// Gradient Types
// ---------------------------------------------------------------------------

export { GradientType } from './gradient';
export type { GradientConfiguration, ColorStop } from './gradient';

// ---------------------------------------------------------------------------
// Common Types
// ---------------------------------------------------------------------------

export type { PaginationMeta, PaginatedResponse, ErrorResponse, SuccessResponse } from './common';

// ---------------------------------------------------------------------------
// LiveSync Types & Enums (Live Camera Sync)
// ---------------------------------------------------------------------------

// LiveSync enums
export {
  SyncMappingStatus,
  SyncSessionStatus,
  SyncFileState,
  FileEventType,
  SyncEventType,
  SyncErrorCode,
  SyncWebSocketMessageType,
} from './livesync';

// LiveSync mapping interfaces
export type {
  SyncMapping,
  CreateSyncMappingRequest,
  UpdateSyncMappingRequest,
  CreateSyncMappingResponse,
} from './livesync';

// LiveSync session interfaces
export type {
  SyncSession,
  StartSyncSessionRequest,
  StartSyncSessionResponse,
  SyncStatusUpdate,
  SyncProgress,
} from './livesync';

// LiveSync event interfaces
export type {
  SyncEvent,
  SyncFileInfo,
  FileEvent,
  ReportFileEventsRequest,
  ReportFileEventsResponse,
  FileUploadInstruction,
} from './livesync';

// LiveSync error interfaces
export type { SyncError } from './livesync';

// LiveSync statistics interfaces
export type {
  SyncMappingStats,
  WorkspaceSyncStats,
} from './livesync';

// LiveSync WebSocket interfaces
export type { SyncWebSocketMessage } from './livesync';

// LiveSync query interfaces
export type {
  ListSyncMappingsQuery,
  ListSyncSessionsQuery,
  ListSyncEventsQuery,
} from './livesync';

// ---------------------------------------------------------------------------
// Collaboration Types & Enums (Real-time Gallery Editing)
// ---------------------------------------------------------------------------

// Collaboration enums
export {
  EditSessionStatus,
  CollaborativeActionType,
  LockType,
  ConflictResolutionStrategy,
  CollaborationMessageType,
} from './collaboration';

// Core collaboration interfaces
export type {
  CollaboratorPresence,
  CursorPosition,
  EditSession,
  CollaborativeAction,
  CollaborativeActionPayload,
} from './collaboration';

// Action payload interfaces
export type {
  AssetAddPayload,
  AssetRemovePayload,
  AssetMovePayload,
  AssetReorderPayload,
  AssetUpdatePayload,
  CollectionCreatePayload,
  CollectionDeletePayload,
  CollectionRenamePayload,
  CollectionReorderPayload,
  GalleryUpdatePayload,
  AISuggestionPayload,
  CursorMovePayload,
  SelectionChangePayload,
} from './collaboration';

// Lock interfaces
export type {
  ResourceLock,
  LockRequest,
  LockResponse,
} from './collaboration';

// Conflict interfaces
export type {
  EditConflict,
  ConflictResolutionOption,
  ConflictResolutionRequest,
} from './collaboration';

// WebSocket message interfaces
export type {
  CollaborationMessage,
  JoinSessionMessage,
  SessionJoinedMessage,
  PresenceUpdateMessage,
  CursorUpdateMessage,
  ActionBroadcastMessage,
  ActionAckMessage,
  ConflictMessage,
  ChangeNotificationMessage,
} from './collaboration';

// API request/response interfaces
export type {
  CreateEditSessionRequest,
  CreateEditSessionResponse,
  GetSessionHistoryRequest,
  GetSessionHistoryResponse,
  UndoActionRequest,
  RedoActionRequest,
} from './collaboration';

// AI suggestion interfaces
export type {
  AISuggestion,
  AISuggestionPreview,
  RequestAISuggestionsRequest,
  RequestAISuggestionsResponse,
} from './collaboration';

// ---------------------------------------------------------------------------
// Platform Admin Types & Enums
// ---------------------------------------------------------------------------

// Admin enums
export {
  PlatformRoleType,
  AdminPermissionCategory,
  AdminPermission,
  PlatformRoleStatus,
  SupportAccessSessionStatus,
  SupportAccessReason,
  AdminAuditActionType,
  ModerationStatus,
  ViolationType,
} from './admin';

// Platform role interfaces
export type {
  PlatformRole,
  UserPlatformRole,
  PlatformAdmin,
  PlatformRoleWithStats,
} from './admin';

// Support access session interfaces
export type {
  SupportAccessSession,
  StartSupportAccessRequest,
  StartSupportAccessResponse,
  EndSupportAccessRequest,
} from './admin';

// Admin audit log interfaces
export type {
  AdminAuditLog,
  ListAdminAuditLogsQuery,
} from './admin';

// Content moderation interfaces
export type {
  ModerationCase,
  ModerationActionRequest,
  ListModerationCasesQuery,
} from './admin';

// Admin management request/response interfaces
export type {
  AssignPlatformRoleRequest,
  RevokePlatformRoleRequest,
  AdminWorkspaceSearchRequest,
  AdminWorkspaceSearchResult,
  ListPlatformAdminsQuery,
  ListSupportAccessSessionsQuery,
} from './admin';

// Permission check interfaces
export type {
  CheckPermissionRequest,
  CheckPermissionResponse,
} from './admin';

// Admin dashboard interfaces
export type {
  AdminDashboardStats,
} from './admin';

// ---------------------------------------------------------------------------
// Calendar & Booking Types & Enums
// ---------------------------------------------------------------------------

// Calendar enums
export {
  CalendarProvider,
  CalendarConnectionStatus,
  CalendarSyncDirection,
  BookingStatus,
  BookingPaymentStatus,
  DurationUnit,
  DayOfWeek,
  CancellationPolicyType,
  BookingSource,
  CalendarSyncErrorCode,
} from './calendar';

// Calendar integration interfaces
export type {
  CalendarIntegration,
  ConnectCalendarRequest,
  ConnectCalendarResponse,
  ExternalCalendarInfo,
  SelectCalendarRequest,
  UpdateCalendarIntegrationRequest,
  CalendarSyncStatus,
} from './calendar';

// Busy time interfaces
export type {
  BusyTimeBlock,
  GetBusyTimesRequest,
  GetBusyTimesResponse,
} from './calendar';

// Availability interfaces
export type {
  TimeWindow,
  DayAvailability,
  AvailabilitySettings,
  UpdateAvailabilitySettingsRequest,
  AvailabilityOverride,
  CreateAvailabilityOverrideRequest,
} from './calendar';

// Available slots interfaces
export type {
  AvailableSlot,
  GetAvailableSlotsRequest,
  GetAvailableSlotsResponse,
  GetAvailableDatesRequest,
  GetAvailableDatesResponse,
} from './calendar';

// Service type interfaces
export type {
  ServiceType,
  CreateServiceTypeRequest,
  UpdateServiceTypeRequest,
} from './calendar';

// Booking interfaces
export type {
  Booking,
  BookingRemindersSent,
  CreateBookingRequest,
  UpdateBookingRequest,
  CancelBookingRequest,
  RescheduleBookingRequest,
  RescheduleBookingResponse,
} from './calendar';

// Public booking flow interfaces
export type {
  PublicBookingPageConfig,
  CancellationPolicy,
  HoldSlotRequest,
  HoldSlotResponse,
  CompletePublicBookingRequest,
  CompletePublicBookingResponse,
  CheckBookingStatusRequest,
  PublicBookingSummary,
  ClientCancelBookingRequest,
  ClientCancelBookingResponse,
} from './calendar';

// Booking policies interfaces
export type {
  BookingPolicies,
  ReminderSettings,
  UpdateBookingPoliciesRequest,
} from './calendar';

// Calendar event interfaces
export type {
  CalendarEvent,
} from './calendar';

// Calendar query interfaces
export type {
  ListBookingsQuery,
  ListServiceTypesQuery,
  ListCalendarIntegrationsQuery,
} from './calendar';

// Calendar statistics interfaces
export type {
  BookingStats,
  CalendarViewData,
  GetCalendarViewRequest,
} from './calendar';

// ---------------------------------------------------------------------------
// Gallery Export Types & Enums
// ---------------------------------------------------------------------------

// Export format enums
export {
  ExportFormat,
  ExportStatus,
  PDFLayoutStyle,
  PDFPageSize,
  SlideshowTransition,
  SlideshowQuality,
  ImageResolution,
  CloudSyncItemStatus,
} from './export';

// Export configuration interfaces
export type {
  ZipExportConfig,
  PDFExportConfig,
  SlideshowExportConfig,
  CloudSyncConfig,
} from './export';

// Export job interfaces
export type {
  GalleryExport,
  GalleryExportSummary,
  CloudSyncItem,
  CloudProviderConnection,
} from './export';

// Export API request/response interfaces
export type {
  CreateExportRequest,
  CreateExportResponse,
  ListExportsQuery,
  ListExportsResponse,
  CancelExportRequest,
  RetryExportRequest,
  BatchExportRequest,
  BatchExportResponse,
  ConnectCloudProviderRequest,
  ConnectCloudProviderResponse,
  CloudProviderCallbackRequest,
  ListCloudConnectionsResponse,
  ExportStats,
} from './export';

// Export WebSocket message interfaces
export type {
  ExportProgressMessage,
  ExportCompletedMessage,
  ExportFailedMessage,
  ExportWebSocketMessage,
} from './export';

// ---------------------------------------------------------------------------
// Granular Permission Types & Enums
// ---------------------------------------------------------------------------

// Permission enums
export {
  PermissionConditionType,
  RoleAuditActionType,
  RoleAuditTargetType,
} from './permissions';

// Permission condition config interfaces
export type {
  GalleryStatusConditionConfig,
  GalleryIdsConditionConfig,
  ClientIdsConditionConfig,
  DateRangeConditionConfig,
  AssetTypeConditionConfig,
  TagFilterConditionConfig,
  SubGalleryIdsConditionConfig,
  CustomConditionConfig,
  PermissionConditionConfig,
} from './permissions';

// Permission condition interfaces
export type {
  PermissionCondition,
  CreatePermissionConditionRequest,
  UpdatePermissionConditionRequest,
} from './permissions';

// Granular permission interfaces
export type {
  GranularPermission,
  GrantGranularPermissionRequest,
  UpdateGranularPermissionRequest,
} from './permissions';

// Time-based role assignment interfaces
export type {
  TimeBasedRoleAssignment,
  GrantTimeBasedAccessRequest,
  RevokeTimeBasedAccessRequest,
} from './permissions';

// Role audit log interfaces
export type {
  RoleAuditLogEntry,
  ListRoleAuditLogsQuery,
} from './permissions';

// Permission delegation interfaces
export type {
  PermissionDelegationRule,
  CreateDelegationRuleRequest,
  UpdateDelegationRuleRequest,
} from './permissions';

// Permission check interfaces
export type {
  GranularPermissionCheckResult,
  CheckGranularPermissionRequest,
  EffectivePermissions,
} from './permissions';

// Permission response interfaces
export type {
  PermissionConditionListResponse,
  GranularPermissionListResponse,
  TimeBasedAssignmentListResponse,
  RoleAuditLogListResponse,
  DelegationRuleListResponse,
} from './permissions';

// ---------------------------------------------------------------------------
// Analytics & Reporting Types & Enums
// ---------------------------------------------------------------------------

// Analytics enums
export {
  AnalyticsEventType,
  AnalyticsEventCategory,
  AnalyticsActorType,
  AnalyticsDeviceType,
  AnalyticsPeriodType,
} from './analytics';

// Report enums
export {
  ReportType,
  DateRangeType,
  ReportExportFormat,
  ReportRunStatus,
  ReportExportStatus,
} from './analytics';

// Analytics event interfaces
export type {
  AnalyticsEvent,
  RecordAnalyticsEventRequest,
  AnalyticsEventSummary,
  EventCount,
  EventTypeBreakdown,
  GeographicBreakdown,
  DeviceBreakdown,
} from './analytics';

// Gallery analytics interfaces
export type {
  GalleryAnalytics,
  GalleryAnalyticsSummary,
  GalleryViewsTimeSeries,
  GalleryEngagementMetrics,
  GalleryDeviceStats,
  GallerySourceStats,
  GalleryShareLinkStats,
  TopGallery,
} from './analytics';

// Client analytics interfaces
export type {
  ClientAnalytics,
  ClientAnalyticsSummary,
  ClientActivityTimeSeries,
  ClientEngagementMetrics,
  ClientValueMetrics,
  ClientRecencyFrequencyMetrics,
  ClientChurnRisk,
  TopClient,
  ClientSegment,
} from './analytics';

// Custom report interfaces
export type {
  ReportRecipient,
  ReportSchedule,
  ReportMetricConfig,
  ReportFilterConfig,
  CustomReport,
  CreateCustomReportRequest,
  UpdateCustomReportRequest,
  CustomReportSummary,
} from './analytics';

// Report export interfaces
export type {
  ReportExport,
  ReportExportSummary,
  ReportExportDownloadInfo,
  GenerateReportExportRequest,
  ReportGenerationStatus,
} from './analytics';

// Dashboard analytics interfaces
export type {
  DashboardOverviewMetrics,
  DashboardQuickStats,
  RecentActivity,
  DashboardAnalyticsResponse,
} from './analytics';

// Analytics API query interfaces
export type {
  ListAnalyticsEventsQuery,
  GetGalleryAnalyticsQuery,
  GetClientAnalyticsQuery,
  ListCustomReportsQuery,
  ListReportExportsQuery,
} from './analytics';

// Analytics API response interfaces
export type {
  AnalyticsEventsListResponse,
  CustomReportsListResponse,
  ReportExportsListResponse,
  WorkspaceAnalyticsStats,
} from './analytics';

// ---------------------------------------------------------------------------
// Asset Cleanup Types & Enums
// ---------------------------------------------------------------------------

// Cleanup enums
export {
  CleanupRecommendationType,
  CleanupRecommendationStatus,
  CleanupJobStatus,
  CleanupJobType,
} from './cleanup';

// Cleanup recommendation interfaces
export type {
  DuplicateDetails,
  SimilarFaceDetails,
  UnusedDetails,
  CleanupRecommendationDetails,
  CleanupRecommendation,
} from './cleanup';

// Cleanup job interfaces
export type {
  CleanupJob,
  CreateCleanupJobRequest,
} from './cleanup';

// Cleanup settings interfaces
export type {
  CleanupSettings,
  UpdateCleanupSettingsRequest,
} from './cleanup';

// Cleanup summary interfaces
export type {
  StorageUsage,
  CleanupSummary,
} from './cleanup';

// Cleanup bulk action interfaces
export type {
  BulkRecommendationActionRequest,
  BulkActionResponse,
} from './cleanup';

// Cleanup list response interfaces
export type {
  CleanupRecommendationsListResponse,
  CleanupJobsListResponse,
} from './cleanup';

// ---------------------------------------------------------------------------
// Compliance Types & Enums (Audit & Compliance System)
// ---------------------------------------------------------------------------

// Data Subject Request enums
export {
  DSRRequestType,
  DSRStatus,
  DSRSource,
  DSRSubjectType,
  DSRPriority,
  DSRVerificationStatus,
} from './compliance';

// Legal Hold enums
export {
  LegalHoldType,
  LegalHoldStatus,
  LegalHoldPriority,
  LegalHoldScopeType,
} from './compliance';

// Retention Policy enums
export {
  RetentionPolicyType,
  RetentionPolicyStatus,
  RetentionActionOnExpiry,
  RetentionExecutionFrequency,
  RetentionExecutionStatus,
} from './compliance';

// Incident enums
export {
  IncidentType,
  IncidentCategory,
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus,
} from './compliance';

// Audit Export enums
export {
  AuditExportStatus,
  AuditExportFormat,
} from './compliance';

// Data Subject Request interfaces
export type {
  DataSubjectRequest,
  CreateDataSubjectRequestRequest,
  UpdateDataSubjectRequestRequest,
  DataSubjectRequestSummary,
} from './compliance';

// Legal Hold interfaces
export type {
  LegalHold,
  CreateLegalHoldRequest,
  UpdateLegalHoldRequest,
  LegalHoldSummary,
  LegalHoldResource,
} from './compliance';

// Retention Policy interfaces
export type {
  RetentionPolicy,
  CreateRetentionPolicyRequest,
  UpdateRetentionPolicyRequest,
  RetentionPolicySummary,
  RetentionPolicyExecution,
} from './compliance';

// Incident interfaces
export type {
  Incident,
  CreateIncidentRequest,
  UpdateIncidentRequest,
  IncidentSummary,
  IncidentUpdate,
  IncidentAffectedResource,
} from './compliance';

// Audit Log interfaces
export type {
  AuditLogEntry,
  AuditLogSummary,
  ListAuditLogsQuery,
  AuditExport,
  CreateAuditExportRequest,
} from './compliance';

// Compliance query interfaces
export type {
  ListDataSubjectRequestsQuery,
  ListLegalHoldsQuery,
  ListRetentionPoliciesQuery,
  ListIncidentsQuery,
} from './compliance';

// Compliance response interfaces
export type {
  DataSubjectRequestsListResponse,
  LegalHoldsListResponse,
  RetentionPoliciesListResponse,
  IncidentsListResponse,
  AuditLogsListResponse,
} from './compliance';

// Compliance statistics interfaces
export type {
  ComplianceDashboardStats,
  DSRStats,
  LegalHoldStats,
  IncidentStats,
} from './compliance';

// Helper interfaces
export type {
  StatusHistoryEntry,
  ChangeHistoryEntry,
  CustodianInfo,
  CustodianAcknowledgment,
  ScopeResource,
  DateRangeFilter,
  ExecutionError,
  ExecutionWarning,
  AffectedResource,
  IncidentTeamMember,
  IncidentAction,
  IncidentRecommendation,
  FollowUpAction,
  IncidentCommunication,
  TimelineEvent,
  IncidentAttachment,
} from './compliance';

// ---------------------------------------------------------------------------
// Album Collaboration Types & Enums (Real-time Collaborative Album Design)
// ---------------------------------------------------------------------------

// Album collaboration enums
export {
  AlbumStatus,
  AlbumType,
  SpreadType,
  ElementType,
  AlbumOperationType,
  CommentStatus,
  AlbumCollaborationSessionStatus,
  AlbumCollaborationMessageType,
} from './album-collaboration';

// Core album interfaces
export type {
  Album,
  AlbumSettings,
  AlbumSpread,
  AlbumSpreadElement,
  ElementContent,
  CropSettings,
  ImageFilters,
  ElementStyle,
  ShadowStyle,
  BorderStyle,
} from './album-collaboration';

// Template interfaces
export type {
  AlbumTemplate,
  SpreadTemplate,
  SpreadLayout,
  LayoutSlot,
  SlotConstraints,
} from './album-collaboration';

// Collaboration interfaces
export type {
  AlbumCollaborationSession,
  AlbumCollaboratorPresence,
  AlbumCursorPosition,
  AlbumOperation,
  VectorClock,
} from './album-collaboration';

// Version history interfaces
export type {
  AlbumVersion,
  AlbumSnapshot,
  VersionComparison,
  VersionChange,
} from './album-collaboration';

// Comment interfaces
export type {
  AlbumComment,
  MentionedUser,
  CommentPosition,
} from './album-collaboration';

// API request/response interfaces
export type {
  CreateAlbumRequest,
  UpdateAlbumRequest,
  CreateSpreadRequest,
  UpdateSpreadRequest,
  CreateElementRequest,
  UpdateElementRequest,
  CreateAlbumSessionRequest,
  CreateAlbumSessionResponse,
  ApplyOperationRequest,
  ApplyOperationResponse,
  OperationConflict,
  CreateVersionRequest,
  RollbackVersionRequest,
  CreateCommentRequest,
  ResolveCommentRequest,
} from './album-collaboration';

// WebSocket message interfaces
export type {
  AlbumCollaborationMessage,
  JoinAlbumSessionMessage,
  AlbumSessionJoinedMessage,
  AlbumPresenceUpdateMessage,
  AlbumCursorUpdateMessage,
  AlbumOperationBroadcastMessage,
  AlbumOperationAckMessage,
  AlbumCommentAddedMessage,
  AlbumCommentMentionMessage,
  AlbumVersionCreatedMessage,
  AlbumVersionRestoredMessage,
} from './album-collaboration';

// List/query interfaces
export type {
  ListAlbumsQuery,
  ListAlbumsResponse,
  ListVersionsQuery,
  ListVersionsResponse,
  ListCommentsQuery,
  ListCommentsResponse,
  ListTemplatesQuery,
  ListTemplatesResponse,
} from './album-collaboration';
