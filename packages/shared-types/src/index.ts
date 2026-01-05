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
