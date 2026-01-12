/**
 * TypeScript interfaces for Save The Date digital invitation system.
 *
 * Feature: 016-save-the-date
 *
 * This file re-exports types from @rawdrive/shared-types for backward compatibility.
 * New code should import directly from @rawdrive/shared-types.
 */

// ---------------------------------------------------------------------------
// Re-exports from @rawdrive/shared-types (Enums)
// ---------------------------------------------------------------------------

import {
  // Core enums
  InvitationStatus as SharedInvitationStatus,
  RSVPStatus as SharedRSVPStatus,
  EventType as SharedEventType,
  TemplateCategory as SharedTemplateCategory,
  GuestStatus as SharedGuestStatus,
  // Media enums
  MediaType as SharedMediaType,
  MediaPurpose as SharedMediaPurpose,
  MediaProcessingStatus as SharedMediaProcessingStatus,
  // Layout enums
  LayoutMode as SharedLayoutMode,
  LayoutDensity as SharedLayoutDensity,
  // Source & verification enums
  RSVPSource as SharedRSVPSource,
  CheckinVerificationMethod as SharedCheckinVerificationMethod,
  DeviceType as SharedDeviceType,
  ReferrerType as SharedReferrerType,
  // AI generation enums
  AIGenerationType as SharedAIGenerationType,
  AIGenerationStatus as SharedAIGenerationStatus,
  ImageGenerationProvider as SharedImageGenerationProvider,
  // Notification & event enums
  NotificationPreference as SharedNotificationPreference,
  InvitationEventType as SharedInvitationEventType,
  ActorType as SharedActorType,
  RSVPQuestionType as SharedRSVPQuestionType,
} from '@rawdrive/shared-types';

import type {
  // Core types
  InvitationStatus as InvitationStatusType,
  RSVPStatus as RSVPStatusType,
  EventType as EventTypeType,
  TemplateCategory as TemplateCategoryType,
  GuestStatus as GuestStatusType,
  // Media types
  MediaType as MediaTypeType,
  MediaPurpose as MediaPurposeType,
  MediaProcessingStatus as MediaProcessingStatusType,
  // Layout types
  LayoutMode as LayoutModeType,
  LayoutDensity as LayoutDensityType,
  // Source & verification types
  RSVPSource as RSVPSourceType,
  CheckinVerificationMethod as CheckinVerificationMethodType,
  DeviceType as DeviceTypeType,
  ReferrerType as ReferrerTypeType,
  // AI generation types
  AIGenerationType as AIGenerationTypeType,
  AIGenerationStatus as AIGenerationStatusType,
  ImageGenerationProvider as ImageGenerationProviderType,
  // Notification & event types
  NotificationPreference as NotificationPreferenceType,
  InvitationEventType as InvitationEventTypeType,
  ActorType as ActorTypeType,
  RSVPQuestionType as RSVPQuestionTypeType,
  // Interfaces
  LayoutConfig as SharedLayoutConfig,
  TemplateLayout as SharedTemplateLayout,
  VenueInfo as SharedVenueInfo,
  RSVPCustomQuestion as SharedRSVPCustomQuestion,
  RSVPSettings as SharedRSVPSettings,
  MediaVariant as SharedMediaVariant,
  SubEvent as SharedSubEvent,
  CreateSubEventRequest as SharedCreateSubEventRequest,
  UpdateSubEventRequest as SharedUpdateSubEventRequest,
  InvitationMedia as SharedInvitationMedia,
  UploadMediaRequest as SharedUploadMediaRequest,
  UploadMediaResponse as SharedUploadMediaResponse,
  InvitationTemplate as SharedInvitationTemplate,
  InvitationGuest as SharedInvitationGuest,
  AddGuestRequest as SharedAddGuestRequest,
  UpdateGuestRequest as SharedUpdateGuestRequest,
  BulkAddGuestsRequest as SharedBulkAddGuestsRequest,
  InvitationRSVP as SharedInvitationRSVP,
  SubmitRSVPRequest as SharedSubmitRSVPRequest,
  UpdateRSVPRequest as SharedUpdateRSVPRequest,
  RSVPSubmitResponse as SharedRSVPSubmitResponse,
  RSVPResponse as SharedRSVPResponse,
  RSVPListResponse as SharedRSVPListResponse,
  RSVPExportOptions as SharedRSVPExportOptions,
  RSVPExportResponse as SharedRSVPExportResponse,
  // Edit token interfaces
  RSVPEditToken as SharedRSVPEditToken,
  EditTokenValidationResult as SharedEditTokenValidationResult,
  ValidateEditTokenRequest as SharedValidateEditTokenRequest,
  // RSVP validation interfaces
  RSVPFieldValidationResult as SharedRSVPFieldValidationResult,
  RSVPValidationResult as SharedRSVPValidationResult,
  RSVPValidationConstraints as SharedRSVPValidationConstraints,
  RSVPFormConfig as SharedRSVPFormConfig,
  InvitationCheckin as SharedInvitationCheckin,
  CheckinRequest as SharedCheckinRequest,
  InvitationViewAnalytics as SharedInvitationViewAnalytics,
  RSVPStats as SharedRSVPStats,
  CheckinStats as SharedCheckinStats,
  InvitationStats as SharedInvitationStats,
  InvitationAIGeneration as SharedInvitationAIGeneration,
  ImageGenerationSettings as SharedImageGenerationSettings,
  InvitationEvent as SharedInvitationEvent,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Enums / Union Types - Re-exported for backward compatibility
// ---------------------------------------------------------------------------

/**
 * @deprecated Prefer importing directly from @rawdrive/shared-types.
 * These exports alias the shared package for backward compatibility.
 */
export const InvitationStatus = SharedInvitationStatus;
export type InvitationStatus = InvitationStatusType;

export const EventType = SharedEventType;
export type EventType = EventTypeType;

export const TemplateCategory = SharedTemplateCategory;
export type TemplateCategory = TemplateCategoryType;

export const RSVPStatus = SharedRSVPStatus;
export type RSVPStatus = RSVPStatusType;

export const GuestStatus = SharedGuestStatus;
export type GuestStatus = GuestStatusType;

// Media enums
export const MediaType = SharedMediaType;
export type MediaType = MediaTypeType;

export const MediaPurpose = SharedMediaPurpose;
export type MediaPurpose = MediaPurposeType;

export const MediaProcessingStatus = SharedMediaProcessingStatus;
export type MediaProcessingStatus = MediaProcessingStatusType;

// Layout enums
export const LayoutMode = SharedLayoutMode;
export type LayoutMode = LayoutModeType;

export const LayoutDensity = SharedLayoutDensity;
export type LayoutDensity = LayoutDensityType;

// Source & verification enums
export const RSVPSource = SharedRSVPSource;
export type RSVPSource = RSVPSourceType;

export const CheckinVerificationMethod = SharedCheckinVerificationMethod;
export type CheckinVerificationMethod = CheckinVerificationMethodType;

export const DeviceType = SharedDeviceType;
export type DeviceType = DeviceTypeType;

export const ReferrerType = SharedReferrerType;
export type ReferrerType = ReferrerTypeType;

// AI generation enums
export const AIGenerationType = SharedAIGenerationType;
export type AIGenerationType = AIGenerationTypeType;

export const AIGenerationStatus = SharedAIGenerationStatus;
export type AIGenerationStatus = AIGenerationStatusType;

export const ImageGenerationProvider = SharedImageGenerationProvider;
export type ImageGenerationProvider = ImageGenerationProviderType;

// Notification & event enums
export const NotificationPreference = SharedNotificationPreference;
export type NotificationPreference = NotificationPreferenceType;

export const InvitationEventType = SharedInvitationEventType;
export type InvitationEventType = InvitationEventTypeType;

export const ActorType = SharedActorType;
export type ActorType = ActorTypeType;

export const RSVPQuestionType = SharedRSVPQuestionType;
export type RSVPQuestionType = RSVPQuestionTypeType;

// Legacy type aliases for backward compatibility
export type ImagePurpose = 'cover' | 'gallery' | 'logo' | 'background' | 'pattern';

// ---------------------------------------------------------------------------
// Re-exported Interfaces from @rawdrive/shared-types
// ---------------------------------------------------------------------------

export type LayoutConfig = SharedLayoutConfig;
export type TemplateLayout = SharedTemplateLayout;
export type VenueInfo = SharedVenueInfo;
export type RSVPCustomQuestion = SharedRSVPCustomQuestion;
export type RSVPSettings = SharedRSVPSettings;
export type MediaVariant = SharedMediaVariant;
export type SubEvent = SharedSubEvent;
export type CreateSubEventRequest = SharedCreateSubEventRequest;
export type UpdateSubEventRequest = SharedUpdateSubEventRequest;
export type InvitationMedia = SharedInvitationMedia;
export type UploadMediaRequest = SharedUploadMediaRequest;
export type UploadMediaResponse = SharedUploadMediaResponse;
export type InvitationTemplate = SharedInvitationTemplate;
export type InvitationGuest = SharedInvitationGuest;
export type AddGuestRequest = SharedAddGuestRequest;
export type UpdateGuestRequest = SharedUpdateGuestRequest;
export type BulkAddGuestsRequest = SharedBulkAddGuestsRequest;
export type InvitationRSVP = SharedInvitationRSVP;
export type SubmitRSVPRequest = SharedSubmitRSVPRequest;
// Note: UpdateRSVPRequest is defined locally below (extends shared version)
export type RSVPResponse = SharedRSVPResponse;
// Note: RSVPListResponse is defined locally below (with additional fields)
export type RSVPExportOptions = SharedRSVPExportOptions;
export type RSVPExportResponse = SharedRSVPExportResponse;
// Edit token interfaces
export type RSVPEditToken = SharedRSVPEditToken;
export type EditTokenValidationResult = SharedEditTokenValidationResult;
export type ValidateEditTokenRequest = SharedValidateEditTokenRequest;
// RSVP validation interfaces
export type RSVPFieldValidationResult = SharedRSVPFieldValidationResult;
export type RSVPValidationResult = SharedRSVPValidationResult;
export type RSVPValidationConstraints = SharedRSVPValidationConstraints;
export type RSVPFormConfig = SharedRSVPFormConfig;
export type InvitationCheckin = SharedInvitationCheckin;
export type CheckinRequest = SharedCheckinRequest;
export type InvitationViewAnalytics = SharedInvitationViewAnalytics;
export type RSVPStats = SharedRSVPStats;
export type CheckinStats = SharedCheckinStats;
export type InvitationStats = SharedInvitationStats;
export type InvitationAIGeneration = SharedInvitationAIGeneration;
export type ImageGenerationSettings = SharedImageGenerationSettings;
export type InvitationEvent = SharedInvitationEvent;

// ---------------------------------------------------------------------------
// Frontend-Only Extended Types (not in shared-types)
// ---------------------------------------------------------------------------

/**
 * Template request types (frontend-specific)
 */
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: TemplateCategory;
  subcategory?: string;
  tags?: string[];
  layout?: Partial<TemplateLayout>;
  content_i18n?: Record<string, Record<string, string>>;
  supported_languages?: string[];
  preview_image_url?: string;
  thumbnail_url?: string;
  is_premium?: boolean;
}

export interface TaglineConfig {
  text: string;
  type: 'emoji' | 'icon' | 'image';
  value?: string; // icon name for 'icon', image URL for 'image'
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  subcategory?: string;
  tags?: string[];
  layout?: Partial<TemplateLayout>;
  content_i18n?: Record<string, Record<string, string>>;
  supported_languages?: string[];
  preview_image_url?: string;
  thumbnail_url?: string;
  is_active?: boolean;
  is_premium?: boolean;
}

export interface TemplateListResponse {
  data: InvitationTemplate[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface Invitation {
  invitation_id: string;
  workspace_id: string;
  slug: string; // Unique URL slug
  template_id?: string;
  customization: Record<string, unknown>;
  title: string;
  description?: string;
  event_type: EventType;
  event_datetime: string; // ISO datetime
  event_end_datetime?: string;
  event_timezone: string;
  venue: VenueInfo;
  host_names: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  rsvp_settings: RSVPSettings;
  cover_image_url?: string;
  /** 1200x630px image optimized for social sharing (WhatsApp, Facebook, Twitter) */
  og_image_url?: string;
  primary_language: string;
  secondary_language?: string;
  content_i18n: Record<string, Record<string, string>>;
  magic_link_id?: string;
  public_url?: string;
  password_protected: boolean;
  pin_protected: boolean;
  status: InvitationStatus;
  published_at?: string;
  auto_delete_enabled: boolean;
  auto_delete_days: number;
  scheduled_deletion_at?: string;
  view_count: number;
  unique_view_count: number;
  rsvp_count: number;
  /** Notification preference for RSVP alerts */
  notification_preference: NotificationPreference;

  // Design & Media
  video_object_key?: string;
  video_url?: string;
  audio_object_key?: string;
  audio_url?: string;
  layout_density?: LayoutDensity;
  font_heading?: string;
  font_body?: string;
  ai_generated_content?: Record<string, unknown>;
  has_sub_events: boolean;

  created_at: string;
  updated_at: string;
  created_by_user_id: string;
}

export interface CreateInvitationRequest {
  template_id?: string;
  title: string;
  description?: string;
  event_type?: EventType;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone?: string;
  venue?: Partial<VenueInfo>;
  host_names?: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  rsvp_settings?: Partial<RSVPSettings>;
  primary_language?: string;
  secondary_language?: string;
  customization?: Record<string, unknown>;
  notification_preference?: NotificationPreference;

  // Design & Media
  video_object_key?: string;
  audio_object_key?: string;
  layout_density?: LayoutDensity;
  font_heading?: string;
  font_body?: string;
  ai_generated_content?: Record<string, unknown>;
  has_sub_events?: boolean;
}

export interface UpdateInvitationRequest {
  title?: string;
  description?: string;
  template_id?: string;
  event_type?: EventType;
  event_datetime?: string;
  event_end_datetime?: string;
  event_timezone?: string;
  venue?: Partial<VenueInfo>;
  host_names?: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  rsvp_settings?: Partial<RSVPSettings>;
  primary_language?: string;
  secondary_language?: string;
  customization?: Record<string, unknown>;
  content_i18n?: Record<string, Record<string, string>>;
  password_protected?: boolean;
  password?: string;
  remove_password?: boolean;
  pin_protected?: boolean;
  pin?: string;
  remove_pin?: boolean;
  auto_delete_enabled?: boolean;
  auto_delete_days?: number;
  /** Notification preference for RSVP alerts */
  notification_preference?: NotificationPreference;

  // Design & Media
  video_object_key?: string;
  audio_object_key?: string;
  layout_density?: LayoutDensity;
  font_heading?: string;
  font_body?: string;
  ai_generated_content?: Record<string, unknown>;
  has_sub_events?: boolean;
}

export interface InvitationListItem {
  invitation_id: string;
  title: string;
  event_type: EventType;
  event_datetime: string;
  status: InvitationStatus;
  venue_name?: string;
  venue_city?: string;
  cover_image_url?: string;
  rsvp_count: number;
  view_count: number;
  created_at: string;
  published_at?: string;
}

export interface InvitationListResponse {
  data: InvitationListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ---------------------------------------------------------------------------
// Invitation Image Types
// ---------------------------------------------------------------------------

export interface InvitationImage {
  image_id: string;
  invitation_id: string;
  object_key: string;
  url: string;
  thumbnail_url?: string;
  /** 1200x630px image optimized for social sharing (cover images only) */
  og_image_url?: string;
  og_object_key?: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width?: number;
  height?: number;
  position: number;
  purpose: ImagePurpose;
  created_at: string;
}

export interface UploadInvitationImageRequest {
  purpose?: ImagePurpose;
  position?: number;
}

export interface InvitationImagesResponse {
  images: InvitationImage[];
  total: number;
}

export interface ReorderImagesRequest {
  image_ids: string[];
}

// ---------------------------------------------------------------------------
// Guest List Response Types
// ---------------------------------------------------------------------------

export interface GuestListResponse {
  data: InvitationGuest[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface SendInvitationsRequest {
  guest_ids?: string[];
  channel: 'email' | 'whatsapp' | 'both';
}

export interface SendInvitationsResponse {
  sent_count: number;
  failed_count: number;
  failures: Array<{ guest_id: string; error: string }>;
}

// ---------------------------------------------------------------------------
// RSVP Extended Types
// ---------------------------------------------------------------------------

/**
 * Request to update an existing RSVP
 * @deprecated Prefer importing UpdateRSVPRequest from @rawdrive/shared-types
 * This type is maintained for backward compatibility with existing frontend code.
 */
export type UpdateRSVPRequest = SharedUpdateRSVPRequest;

/**
 * Paginated RSVP list response with frontend-specific aliases
 * Extends the shared RSVPListResponse with additional convenience fields
 */
export interface RSVPListResponse extends SharedRSVPListResponse {
  /** Alias for meta.total for convenience (frontend-specific) */
  total?: number;
}

/**
 * Response after successful RSVP submission
 * @deprecated Prefer importing RSVPSubmitResponse from @rawdrive/shared-types
 */
export type RSVPSubmitResponse = SharedRSVPSubmitResponse;

// ---------------------------------------------------------------------------
// Check-in Extended Types
// ---------------------------------------------------------------------------

export interface CheckinListResponse {
  data: InvitationCheckin[];
  stats: CheckinStats;
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface QRTokenValidateRequest {
  token: string;
}

export interface QRTokenValidateResponse {
  valid: boolean;
  invitation_id?: string;
  rsvp_id?: string;
  guest_name?: string;
  expected_party_size?: number;
  already_checked_in: boolean;
  error?: string;
}

// Check-in Scanner Types (T118)
export interface ScanCheckinRequest {
  token: string;
  party_size_override?: number;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface ManualCheckinRequest {
  guest_name: string;
  party_size_checked_in: number;
  notes?: string;
}

export interface CheckinVerifyResponse {
  valid: boolean;
  rsvp_id?: string;
  guest_name?: string;
  guest_email?: string;
  party_size?: number;
  attending?: boolean;
  dietary_preferences?: string;
  already_checked_in: boolean;
  checkin_details?: InvitationCheckin;
  error?: string;
}

export interface CheckinResultResponse {
  success: boolean;
  checkin_id?: string;
  guest_name: string;
  party_size_checked_in: number;
  verification_method: CheckinVerificationMethod;
  checked_in_at?: string;
  already_checked_in: boolean;
  existing_checkin?: InvitationCheckin;
  message: string;
}

/** Stats response for RSVPs (used in check-in stats) */
export interface RSVPStatsResponse extends RSVPStats {
  // Extends base RSVPStats with potential additional fields
}

export interface CheckinStatsResponse {
  total_checkins: number;
  total_guests_checked_in: number;
  expected_guests: number;
  checkin_rate_percent: number;
  first_checkin_at?: string;
  last_checkin_at?: string;
  by_method: Record<string, { count: number; guests: number }>;
  rsvp_stats?: RSVPStatsResponse;
}

// ---------------------------------------------------------------------------
// Stats & Analytics Extended Types
// ---------------------------------------------------------------------------

export interface WorkspaceInvitationStats {
  total_invitations: number;
  draft_count: number;
  published_count: number;
  archived_count: number;
  total_rsvps: number;
  upcoming_events: number;
}

// ---------------------------------------------------------------------------
// Calendar/ICS Types
// ---------------------------------------------------------------------------

export interface GenerateICSRequest {
  include_venue_details?: boolean;
  alarm_minutes_before?: number;
}

export interface ICSResponse {
  ics_content: string;
  filename: string;
  content_type: string;
}

// ---------------------------------------------------------------------------
// Public/Guest View Types
// ---------------------------------------------------------------------------

export interface PublicInvitation {
  invitation_id: string;
  title: string;
  description?: string;
  event_type: EventType;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone: string;
  venue: VenueInfo;
  host_names: string[];
  cover_image_url?: string;
  /** 1200x630px image optimized for social sharing (WhatsApp, Facebook, Twitter) */
  og_image_url?: string;
  gallery_images: string[];
  rsvp_enabled: boolean;
  rsvp_deadline?: string;
  max_party_size: number;
  collect_dietary: boolean;
  collect_phone: boolean;
  custom_questions: RSVPCustomQuestion[];
  primary_language: string;
  secondary_language?: string;
  content_i18n: Record<string, Record<string, string>>;
  template_layout?: TemplateLayout;
  customization: Record<string, unknown>;
  video_object_key?: string;
  video_url?: string;
  audio_object_key?: string;
  audio_url?: string;
  layout_density?: LayoutDensity;
  font_heading?: string;
  font_body?: string;
  ai_generated_content?: Record<string, unknown>;
  has_sub_events?: boolean;
}

export interface AccessInvitationRequest {
  password?: string;
  pin?: string;
}

export interface AccessInvitationResponse {
  access_granted: boolean;
  invitation?: PublicInvitation;
  error?: string;
  requires_password: boolean;
  requires_pin: boolean;
}

// ---------------------------------------------------------------------------
// Audit Event Extended Types
// ---------------------------------------------------------------------------

export interface InvitationEventListResponse {
  data: InvitationEvent[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ---------------------------------------------------------------------------
// AI Content Generation Types (Phase 7)
// ---------------------------------------------------------------------------

export interface GenerateContentRequest {
  event_type: string;
  mood: string;
  tone?: string;
  language: string;
  additional_details?: string;
  host_names?: string[];
}

export interface GenerateContentResponse {
  title: string;
  description: string;
}
