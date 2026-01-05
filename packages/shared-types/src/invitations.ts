/**
 * Comprehensive TypeScript types for digital invitations.
 *
 * This module provides shared types for:
 * - Invitations and their lifecycle
 * - Sub-events (multi-event support)
 * - Templates and layouts
 * - Guests and RSVPs
 * - Media (video, audio, images)
 * - Analytics and AI generation
 *
 * @module invitations
 */

// ---------------------------------------------------------------------------
// Core Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Status of a digital invitation
 * Aligns with spec (draft, published, archived) while keeping legacy states for compatibility.
 */
export const InvitationStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
} as const;
export type InvitationStatus = typeof InvitationStatus[keyof typeof InvitationStatus];

/**
 * RSVP response status from a guest
 */
export const RSVPStatus = {
  PENDING: 'pending',
  ATTENDING: 'attending',
  NOT_ATTENDING: 'not_attending',
  MAYBE: 'maybe',
} as const;
export type RSVPStatus = typeof RSVPStatus[keyof typeof RSVPStatus];

/**
 * Type of event within an invitation
 */
export const EventType = {
  WEDDING: 'wedding',
  BIRTHDAY: 'birthday',
  ANNIVERSARY: 'anniversary',
  BABY_SHOWER: 'baby_shower',
  ENGAGEMENT: 'engagement',
  FESTIVAL: 'festival',
  CORPORATE: 'corporate',
  OTHER: 'other',
} as const;
export type EventType = typeof EventType[keyof typeof EventType];

/**
 * Category of invitation template
 */
export const TemplateCategory = {
  WEDDING: 'wedding',
  ENGAGEMENT: 'engagement',
  BIRTHDAY: 'birthday',
  BABY_SHOWER: 'baby_shower',
  CORPORATE: 'corporate',
  RELIGIOUS: 'religious',
  ANNIVERSARY: 'anniversary',
  FESTIVAL: 'festival',
  OTHER: 'other',
} as const;
export type TemplateCategory = typeof TemplateCategory[keyof typeof TemplateCategory];

/**
 * Guest invitation status
 */
export const GuestStatus = {
  INVITED: 'invited',
  VIEWED: 'viewed',
  RESPONDED: 'responded',
  CHECKED_IN: 'checked_in',
} as const;
export type GuestStatus = typeof GuestStatus[keyof typeof GuestStatus];

// ---------------------------------------------------------------------------
// Media Enums
// ---------------------------------------------------------------------------

/**
 * Type of media attached to an invitation
 */
export const MediaType = {
  VIDEO: 'video',
  AUDIO: 'audio',
  IMAGE: 'image',
} as const;
export type MediaType = typeof MediaType[keyof typeof MediaType];

/**
 * Purpose of media within an invitation
 */
export const MediaPurpose = {
  CONTENT: 'content',
  BACKGROUND: 'background',
  EFFECT: 'effect',
  MAIN_CARD: 'main_card',
  COVER: 'cover',
  GALLERY: 'gallery',
  LOGO: 'logo',
  PATTERN: 'pattern',
} as const;
export type MediaPurpose = typeof MediaPurpose[keyof typeof MediaPurpose];

/**
 * Processing status for media uploads
 */
export const MediaProcessingStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type MediaProcessingStatus = typeof MediaProcessingStatus[keyof typeof MediaProcessingStatus];

// ---------------------------------------------------------------------------
// Layout & Display Enums
// ---------------------------------------------------------------------------

/**
 * Layout mode for invitation display
 */
export const LayoutMode = {
  STANDARD: 'standard',
  CARD_ONLY: 'card_only',
  HYBRID: 'hybrid',
} as const;
export type LayoutMode = typeof LayoutMode[keyof typeof LayoutMode];

/**
 * Layout density for invitation content spacing
 */
export const LayoutDensity = {
  COMPACT: 'compact',
  NORMAL: 'normal',
  SPACIOUS: 'spacious',
} as const;
export type LayoutDensity = typeof LayoutDensity[keyof typeof LayoutDensity];

// ---------------------------------------------------------------------------
// Source & Verification Enums
// ---------------------------------------------------------------------------

/**
 * Source of RSVP submission
 */
export const RSVPSource = {
  WEB: 'web',
  QR_CODE: 'qr_code',
  WHATSAPP: 'whatsapp',
  EMAIL_LINK: 'email_link',
  PERSONAL_LINK: 'personal_link',
} as const;
export type RSVPSource = typeof RSVPSource[keyof typeof RSVPSource];

/**
 * Method used to verify check-in
 */
export const CheckinVerificationMethod = {
  QR_SCAN: 'qr_scan',
  MANUAL: 'manual',
  NAME_LOOKUP: 'name_lookup',
  TOKEN: 'token',
} as const;
export type CheckinVerificationMethod = typeof CheckinVerificationMethod[keyof typeof CheckinVerificationMethod];

/**
 * Device type for analytics tracking
 */
export const DeviceType = {
  PHONE: 'phone',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
  UNKNOWN: 'unknown',
} as const;
export type DeviceType = typeof DeviceType[keyof typeof DeviceType];

/**
 * Referrer type for analytics
 */
export const ReferrerType = {
  DIRECT: 'direct',
  SOCIAL: 'social',
  SEARCH: 'search',
  EMAIL: 'email',
  OTHER: 'other',
} as const;
export type ReferrerType = typeof ReferrerType[keyof typeof ReferrerType];

// ---------------------------------------------------------------------------
// AI Generation Enums
// ---------------------------------------------------------------------------

/**
 * Type of AI generation (text or image)
 */
export const AIGenerationType = {
  TEXT: 'text',
  IMAGE: 'image',
} as const;
export type AIGenerationType = typeof AIGenerationType[keyof typeof AIGenerationType];

/**
 * AI generation status
 */
export const AIGenerationStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
} as const;
export type AIGenerationStatus = typeof AIGenerationStatus[keyof typeof AIGenerationStatus];

/**
 * Image generation provider
 */
export const ImageGenerationProvider = {
  IMAGEN: 'imagen',
  NANO_BANANA: 'nano_banana',
  DALLE: 'dalle',
  MIDJOURNEY: 'midjourney',
} as const;
export type ImageGenerationProvider = typeof ImageGenerationProvider[keyof typeof ImageGenerationProvider];

// ---------------------------------------------------------------------------
// Notification & Event Enums
// ---------------------------------------------------------------------------

/**
 * Notification preference for RSVP alerts
 */
export const NotificationPreference = {
  IMMEDIATE: 'immediate',
  DAILY_DIGEST: 'daily_digest',
  DISABLED: 'disabled',
} as const;
export type NotificationPreference = typeof NotificationPreference[keyof typeof NotificationPreference];

/**
 * Event types for invitation audit log
 */
export const InvitationEventType = {
  CREATED: 'created',
  UPDATED: 'updated',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
  VIEWED: 'viewed',
  SHARED: 'shared',
  RSVP_RECEIVED: 'rsvp_received',
  RSVP_UPDATED: 'rsvp_updated',
  CHECKIN: 'checkin',
  EXPORTED: 'exported',
  DELETED: 'deleted',
} as const;
export type InvitationEventType = typeof InvitationEventType[keyof typeof InvitationEventType];

/**
 * Actor type for audit events
 */
export const ActorType = {
  USER: 'user',
  GUEST: 'guest',
  SYSTEM: 'system',
} as const;
export type ActorType = typeof ActorType[keyof typeof ActorType];

// ---------------------------------------------------------------------------
// RSVP Question Enums
// ---------------------------------------------------------------------------

/**
 * Type of custom RSVP question
 */
export const RSVPQuestionType = {
  TEXT: 'text',
  SELECT: 'select',
  CHECKBOX: 'checkbox',
} as const;
export type RSVPQuestionType = typeof RSVPQuestionType[keyof typeof RSVPQuestionType];

// ---------------------------------------------------------------------------
// Embedded / Nested Interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration for layout display
 */
export interface LayoutConfig {
  /** Display mode */
  mode: LayoutMode;
  /** Show overlay on hero section */
  show_hero_overlay: boolean;
  /** Show text details section */
  show_details_text: boolean;
}

/**
 * Template layout configuration
 */
export interface TemplateLayout {
  /** Ordered list of section identifiers */
  sections: string[];
  /** Font family mappings */
  fonts: Record<string, string>;
  /** Color scheme mappings */
  colors: Record<string, string>;
  /** Element position configurations */
  positions: Record<string, { x: number; y: number; width: string; height: string }>;
  /** Asset URL mappings */
  assets: Record<string, string>;
}

/**
 * Venue information
 */
export interface VenueInfo {
  /** Venue name */
  name?: string;
  /** Street address */
  address?: string;
  /** City */
  city?: string;
  /** State/Province */
  state?: string;
  /** Country (required) */
  country: string;
  /** Postal/ZIP code */
  postal_code?: string;
  /** Geographic latitude */
  latitude?: number;
  /** Geographic longitude */
  longitude?: number;
  /** URL to map (Google Maps, etc.) */
  map_url?: string;
}

/**
 * Custom RSVP question configuration
 */
export interface RSVPCustomQuestion {
  /** Question text */
  question: string;
  /** Question type */
  type: RSVPQuestionType;
  /** Options for select/checkbox types */
  options?: string[];
  /** Whether answer is required */
  required: boolean;
}

/**
 * RSVP settings configuration
 */
export interface RSVPSettings {
  /** Whether RSVP is enabled */
  enabled: boolean;
  /** RSVP deadline (ISO datetime) */
  deadline?: string;
  /** Maximum party size allowed */
  max_party_size: number;
  /** Collect dietary preferences */
  collect_dietary: boolean;
  /** Collect phone number */
  collect_phone: boolean;
  /** Custom questions */
  custom_questions: RSVPCustomQuestion[];
}

/**
 * Media variant for transcoded versions
 */
export interface MediaVariant {
  /** Format (mp4, webm, etc.) */
  format: string;
  /** Resolution (720p, 1080p, etc.) */
  resolution?: string;
  /** Storage object key */
  object_key: string;
  /** Public URL */
  url?: string;
  /** File size in bytes */
  size_bytes?: number;
}

// ---------------------------------------------------------------------------
// Sub-Event Interface
// ---------------------------------------------------------------------------

/**
 * Sub-event within a multi-event invitation
 * (e.g., Mehndi, Ceremony, Reception for weddings)
 */
export interface SubEvent {
  /** Unique sub-event identifier */
  sub_event_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Event name (1-200 chars) */
  name: string;
  /** Optional event type */
  event_type?: string;
  /** Event start datetime (ISO) */
  event_datetime: string;
  /** Event end datetime (ISO) */
  event_end_datetime?: string;
  /** Timezone (e.g., 'Asia/Kolkata') */
  event_timezone: string;
  /** Event description */
  description?: string;
  /** Venue name */
  venue_name?: string;
  /** Venue address */
  venue_address?: string;
  /** Venue city */
  venue_city?: string;
  /** Map URL */
  venue_map_url?: string;
  /** Display order (0-99) */
  display_order: number;
  /** Show countdown timer */
  show_countdown: boolean;
  /** Enable individual RSVP for this event */
  enable_individual_rsvp: boolean;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to create a sub-event
 */
export interface CreateSubEventRequest {
  name: string;
  event_type?: string;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone?: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_map_url?: string;
  display_order?: number;
  show_countdown?: boolean;
  enable_individual_rsvp?: boolean;
}

/**
 * Request to update a sub-event
 */
export interface UpdateSubEventRequest {
  name?: string;
  event_type?: string;
  event_datetime?: string;
  event_end_datetime?: string;
  event_timezone?: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_map_url?: string;
  display_order?: number;
  show_countdown?: boolean;
  enable_individual_rsvp?: boolean;
}

// ---------------------------------------------------------------------------
// Media Interface
// ---------------------------------------------------------------------------

/**
 * Media attachment for an invitation (video, audio, image)
 */
export interface InvitationMedia {
  /** Unique media identifier */
  media_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id?: string;
  /** Type of media */
  media_type: MediaType;
  /** Purpose of the media */
  purpose: MediaPurpose;
  /** Storage object key */
  object_key?: string;
  /** Original storage object key */
  original_object_key?: string;
  /** Original filename */
  original_filename?: string;
  /** Original MIME type */
  original_mime_type?: string;
  /** Original file size in bytes */
  original_size_bytes?: number;
  /** Public URL */
  url?: string;
  /** Media URL (alias) */
  media_url?: string;
  /** Upload URL (for initiation) */
  upload_url?: string;
  /** Original quality URL */
  original_url?: string;
  /** Thumbnail URL */
  thumbnail_url?: string;
  /** Transcoded variants */
  variants?: MediaVariant[];
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Duration in seconds (video/audio) */
  duration_seconds?: number;
  /** Processing status */
  processing_status: MediaProcessingStatus;
  /** Processing error message */
  processing_error?: string;
  /** When processing started */
  processing_started_at?: string;
  /** When processing completed */
  processing_completed_at?: string;
  /** Display position */
  position: number;
  /** Auto-play on load */
  autoplay: boolean;
  /** Loop playback */
  loop: boolean;
  /** Muted by default */
  muted: boolean;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at?: string;
  /** Creator user ID */
  created_by_user_id?: string;
}

/**
 * Request to upload media
 */
export interface UploadMediaRequest {
  media_type: MediaType;
  purpose?: MediaPurpose;
  filename: string;
  mime_type: string;
  size_bytes: number;
  position?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

/**
 * Response from media upload initiation
 */
export interface UploadMediaResponse {
  media_id: string;
  upload_url: string;
  object_key: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// Template Interface
// ---------------------------------------------------------------------------

/**
 * Invitation template definition
 */
export interface InvitationTemplate {
  /** Unique template identifier */
  template_id: string;
  /** Workspace ID (null for system templates) */
  workspace_id: string | null;
  /** Template name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Template description */
  description?: string;
  /** Template category */
  category: TemplateCategory;
  /** Sub-category */
  subcategory?: string;
  /** Searchable tags */
  tags: string[];
  /** Layout configuration */
  layout: TemplateLayout;
  /** Internationalized content */
  content_i18n: Record<string, Record<string, string>>;
  /** Supported language codes */
  supported_languages: string[];
  /** Preview image URL */
  preview_image_url?: string;
  /** Thumbnail URL */
  thumbnail_url?: string;
  /** Gradient configuration */
  gradient_config?: Record<string, unknown>;
  /** Animation configuration */
  animation_config?: Record<string, unknown>;
  /** Template is active */
  is_active: boolean;
  /** Premium template flag */
  is_premium: boolean;
  /** Featured template flag */
  is_featured?: boolean;
  /** Download/use count */
  download_count?: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Guest Interface
// ---------------------------------------------------------------------------

/**
 * Guest in an invitation guest list
 */
export interface InvitationGuest {
  /** Unique guest identifier */
  guest_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id?: string;
  /** Guest name */
  name: string;
  /** Guest email */
  email?: string;
  /** Guest phone */
  phone?: string;
  /** Salutation (Mr., Mrs., etc.) */
  salutation?: string;
  /** Group name for organization */
  group_name?: string;
  /** Personalized message for this guest */
  personalized_message?: string;
  /** Expected party size */
  expected_party_size: number;
  /** Personal access token */
  personal_token?: string;
  /** Invitation sent flag */
  invitation_sent: boolean;
  /** When invitation was sent */
  invitation_sent_at?: string;
  /** Invitation viewed flag */
  invitation_viewed: boolean;
  /** When invitation was viewed */
  invitation_viewed_at?: string;
  /** Current guest status */
  status?: GuestStatus;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to add a guest
 */
export interface AddGuestRequest {
  name: string;
  email?: string;
  phone?: string;
  salutation?: string;
  group_name?: string;
  personalized_message?: string;
  expected_party_size?: number;
}

/**
 * Request to update a guest
 */
export interface UpdateGuestRequest {
  name?: string;
  email?: string;
  phone?: string;
  salutation?: string;
  group_name?: string;
  personalized_message?: string;
  expected_party_size?: number;
}

/**
 * Request to bulk add guests
 */
export interface BulkAddGuestsRequest {
  guests: AddGuestRequest[];
}

// ---------------------------------------------------------------------------
// RSVP Interface
// ---------------------------------------------------------------------------

/**
 * RSVP response from a guest
 */
export interface InvitationRSVP {
  /** Unique RSVP identifier */
  rsvp_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Linked guest ID (if from guest list) */
  guest_id?: string;
  /** Sub-event ID (for multi-event RSVPs) */
  sub_event_id?: string;
  /** Guest name */
  guest_name: string;
  /** Guest email */
  guest_email: string;
  /** Guest phone */
  guest_phone?: string;
  /** Attending flag */
  attending: boolean;
  /** Party size */
  party_size: number;
  /** Names of party members */
  party_names: string[];
  /** Dietary preferences/restrictions */
  dietary_preferences?: string;
  /** Guest message */
  message?: string;
  /** Custom question answers */
  custom_answers: Record<string, string>;
  /** Source of RSVP */
  source: RSVPSource;
  /** RSVP status */
  status: RSVPStatus;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to submit an RSVP
 */
export interface SubmitRSVPRequest {
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  attending: boolean;
  party_size?: number;
  party_names?: string[];
  dietary_preferences?: string;
  message?: string;
  custom_answers?: Record<string, string>;
  sub_event_id?: string;
  /** Cloudflare Turnstile token for CAPTCHA verification */
  turnstile_token?: string;
}

/**
 * Request to update an existing RSVP
 */
export interface UpdateRSVPRequest {
  /** Update attendance status */
  attending?: boolean;
  /** Update party size */
  party_size?: number;
  /** Update party member names */
  party_names?: string[];
  /** Update dietary preferences */
  dietary_preferences?: string;
  /** Update guest message */
  message?: string;
  /** Update custom question answers */
  custom_answers?: Record<string, string>;
  /** Update RSVP status directly */
  status?: RSVPStatus;
}

/**
 * Response after successful RSVP submission
 */
export interface RSVPSubmitResponse {
  /** Unique RSVP identifier */
  rsvp_id: string;
  /** Edit token for modifying RSVP (only returned on initial submission) */
  edit_token?: string;
  /** Confirmation message */
  message: string;
  /** Deadline until which the RSVP can be edited (ISO datetime) */
  can_edit_until?: string;
}

/**
 * Full RSVP response with all details
 */
export interface RSVPResponse {
  /** Unique RSVP identifier */
  rsvp_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Linked guest ID (if from guest list) */
  guest_id?: string;
  /** Sub-event ID (for multi-event RSVPs) */
  sub_event_id?: string;
  /** Guest name */
  guest_name: string;
  /** Guest email (may be masked for privacy) */
  guest_email: string;
  /** Guest phone */
  guest_phone?: string;
  /** Attending flag */
  attending: boolean;
  /** Party size */
  party_size: number;
  /** Names of party members */
  party_names: string[];
  /** Dietary preferences/restrictions */
  dietary_preferences?: string;
  /** Guest message */
  message?: string;
  /** Custom question answers */
  custom_answers: Record<string, string>;
  /** Source of RSVP */
  source: RSVPSource;
  /** RSVP status */
  status: RSVPStatus;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Edit Token Interfaces
// ---------------------------------------------------------------------------

/**
 * Edit token information for RSVP modifications
 */
export interface RSVPEditToken {
  /** The edit token string (URL-safe base64) */
  token: string;
  /** Token expiration timestamp (ISO datetime) */
  expires_at: string;
  /** Whether the token is still valid */
  is_valid: boolean;
}

/**
 * Result of edit token validation
 */
export interface EditTokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** RSVP ID associated with the token */
  rsvp_id?: string;
  /** Invitation ID associated with the RSVP */
  invitation_id?: string;
  /** Guest name for display */
  guest_name?: string;
  /** Error message if validation failed */
  error?: string;
  /** Error code for programmatic handling */
  error_code?: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'RSVP_NOT_FOUND' | 'INVITATION_CLOSED';
}

/**
 * Request to validate an edit token
 */
export interface ValidateEditTokenRequest {
  /** The edit token to validate */
  edit_token: string;
}

// ---------------------------------------------------------------------------
// RSVP Validation Interfaces
// ---------------------------------------------------------------------------

/**
 * Validation result for a single field
 */
export interface RSVPFieldValidationResult {
  /** Field name */
  field: string;
  /** Whether the field value is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warning message (non-blocking) */
  warning?: string;
}

/**
 * Complete RSVP validation result
 */
export interface RSVPValidationResult {
  /** Overall validation status */
  valid: boolean;
  /** Individual field validation results */
  fields: RSVPFieldValidationResult[];
  /** Global errors (not tied to specific fields) */
  errors: string[];
  /** Global warnings */
  warnings: string[];
}

/**
 * RSVP validation constraints from invitation settings
 */
export interface RSVPValidationConstraints {
  /** Maximum allowed party size */
  max_party_size: number;
  /** Whether phone number is required */
  require_phone: boolean;
  /** Whether dietary preferences collection is enabled */
  collect_dietary: boolean;
  /** RSVP deadline (null if no deadline) */
  deadline?: string;
  /** Custom questions configuration */
  custom_questions: RSVPCustomQuestion[];
  /** Whether RSVP editing is allowed */
  allow_editing: boolean;
  /** Whether duplicate email RSVPs are allowed */
  allow_duplicate_email: boolean;
}

/**
 * RSVP form configuration for frontend rendering
 */
export interface RSVPFormConfig {
  /** Whether RSVP is enabled for this invitation */
  enabled: boolean;
  /** RSVP deadline (ISO datetime) */
  deadline?: string;
  /** Whether deadline has passed */
  deadline_passed: boolean;
  /** Maximum party size allowed */
  max_party_size: number;
  /** Whether to show dietary preferences field */
  show_dietary: boolean;
  /** Whether to show phone field */
  show_phone: boolean;
  /** Whether phone is required */
  require_phone: boolean;
  /** Custom questions to display */
  custom_questions: RSVPCustomQuestion[];
  /** Available RSVP status options */
  available_statuses: RSVPStatus[];
}

// ---------------------------------------------------------------------------
// RSVP List Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Paginated RSVP list response
 */
export interface RSVPListResponse {
  /** List of RSVPs */
  data: InvitationRSVP[];
  /** Alias for data for convenience */
  rsvps?: InvitationRSVP[];
  /** RSVP statistics */
  stats: RSVPStats;
  /** Pagination metadata */
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/**
 * RSVP export options
 */
export interface RSVPExportOptions {
  /** Export format */
  format: 'csv' | 'xlsx' | 'json';
  /** Fields to include in export */
  fields?: string[];
  /** Filter by status */
  status_filter?: RSVPStatus[];
  /** Include party names in separate rows */
  expand_party_names?: boolean;
}

/**
 * RSVP export response
 */
export interface RSVPExportResponse {
  /** Export file URL or data */
  url?: string;
  /** Export data (for JSON format) */
  data?: InvitationRSVP[];
  /** Export filename */
  filename: string;
  /** Total records exported */
  total_records: number;
}

// ---------------------------------------------------------------------------
// Check-in Interface
// ---------------------------------------------------------------------------

/**
 * Check-in record for event attendance
 */
export interface InvitationCheckin {
  /** Unique check-in identifier */
  checkin_id: string;
  /** Parent invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id?: string;
  /** Linked RSVP ID */
  rsvp_id?: string;
  /** Linked guest ID */
  guest_id?: string;
  /** Sub-event ID */
  sub_event_id?: string;
  /** Guest name */
  guest_name: string;
  /** Number of people checked in */
  party_size_checked_in: number;
  /** Verification method used */
  verification_method: CheckinVerificationMethod;
  /** User who performed check-in */
  checked_in_by_user_id?: string;
  /** Check-in timestamp */
  checked_in_at: string;
  /** Optional notes */
  notes?: string;
  /** Check-in location latitude */
  latitude?: number;
  /** Check-in location longitude */
  longitude?: number;
}

/**
 * Request to check in a guest
 */
export interface CheckinRequest {
  rsvp_id?: string;
  guest_id?: string;
  guest_name: string;
  party_size_checked_in?: number;
  verification_method?: CheckinVerificationMethod;
  qr_token_used?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

// ---------------------------------------------------------------------------
// Analytics Interfaces
// ---------------------------------------------------------------------------

/**
 * View analytics record
 */
export interface InvitationViewAnalytics {
  /** Unique view identifier */
  view_id: string;
  /** Invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id?: string;
  /** Hashed visitor identifier */
  visitor_hash?: string;
  /** Session identifier */
  session_id?: string;
  /** Device type */
  device_type: DeviceType;
  /** Browser name */
  browser?: string;
  /** Operating system */
  os?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country_code?: string;
  /** Region/State */
  region?: string;
  /** City */
  city?: string;
  /** Referrer domain */
  referrer_domain?: string;
  /** Referrer type */
  referrer_type: ReferrerType;
  /** View duration in seconds */
  duration_seconds?: number;
  /** Scrolled to RSVP section */
  scrolled_to_rsvp: boolean;
  /** Interacted with media */
  interacted_with_media: boolean;
  /** View timestamp */
  viewed_at: string;
}

/**
 * RSVP statistics summary
 */
export interface RSVPStats {
  total: number;
  attending: number;
  not_attending: number;
  pending: number;
  maybe: number;
  total_party_size: number;
}

/**
 * Check-in statistics summary
 */
export interface CheckinStats {
  total_checked_in: number;
  total_party_size: number;
  total_guests_checked_in?: number;
  expected_guests?: number;
  checkin_rate_percent?: number;
  first_checkin_at?: string;
  last_checkin_at?: string;
  by_method?: Record<string, { count: number; guests: number }>;
}

/**
 * Comprehensive invitation statistics
 */
export interface InvitationStats {
  invitation_id: string;
  title: string;
  event_datetime: string;
  status: InvitationStatus;
  view_count: number;
  unique_view_count: number;
  rsvp_total: number;
  attending_count: number;
  not_attending_count: number;
  pending_count: number;
  total_party_size: number;
  checked_in_count: number;
  total_checked_in_party: number;
  checkin_percentage: number;
}

// ---------------------------------------------------------------------------
// AI Generation Interfaces
// ---------------------------------------------------------------------------

/**
 * AI generation record for audit and tracking
 */
export interface InvitationAIGeneration {
  /** Unique generation identifier */
  generation_id: string;
  /** Invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** User who initiated generation */
  user_id: string;
  /** Type of generation */
  generation_type: AIGenerationType;
  /** Input prompt */
  prompt: string;
  /** Target field (headline, bio, background, etc.) */
  field_target?: string;
  /** Language code */
  language?: string;
  /** Provider used */
  provider?: string;
  /** Model used */
  model?: string;
  /** Generated options */
  generated_options?: unknown[];
  /** Index of selected option */
  selected_option_index?: number;
  /** Whether generation was used */
  was_used: boolean;
  /** Latency in milliseconds */
  latency_ms?: number;
  /** Tokens consumed */
  tokens_used?: number;
  /** Estimated cost */
  cost_estimate?: number;
  /** Generation status */
  status: AIGenerationStatus;
  /** Error message if failed */
  error_message?: string;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Image generation settings for a user
 */
export interface ImageGenerationSettings {
  /** Unique setting identifier */
  setting_id: string;
  /** User ID */
  user_id: string;
  /** Provider */
  provider: ImageGenerationProvider;
  /** API key validated flag */
  is_validated: boolean;
  /** Validation timestamp */
  validated_at?: string;
  /** Settings enabled flag */
  is_enabled: boolean;
  /** Credits used */
  credits_used: number;
  /** Last usage timestamp */
  last_used_at?: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Audit Event Interface
// ---------------------------------------------------------------------------

/**
 * Invitation audit event
 */
export interface InvitationEvent {
  /** Unique event identifier */
  event_id: string;
  /** Invitation ID */
  invitation_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Event type */
  event_type: InvitationEventType;
  /** Actor type */
  actor_type: ActorType;
  /** Actor user ID */
  actor_user_id?: string;
  /** Actor guest email */
  actor_guest_email?: string;
  /** Actor IP address */
  actor_ip_address?: string;
  /** Event data payload */
  event_data: Record<string, unknown>;
  /** Event timestamp */
  created_at: string;
}
