/**
 * TypeScript interfaces for Save The Date digital invitation system.
 *
 * Feature: 016-save-the-date
 */

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

export type InvitationStatus = 'draft' | 'published' | 'archived' | 'deleted';

export type EventType =
  | 'wedding'
  | 'birthday'
  | 'anniversary'
  | 'baby_shower'
  | 'engagement'
  | 'festival'
  | 'corporate'
  | 'other';

export type TemplateCategory =
  | 'wedding'
  | 'birthday'
  | 'anniversary'
  | 'baby_shower'
  | 'engagement'
  | 'festival'
  | 'corporate'
  | 'other';

export type RSVPStatus = 'pending' | 'confirmed' | 'declined' | 'maybe' | 'cancelled';

export type RSVPSource = 'web' | 'qr_code' | 'whatsapp' | 'email_link' | 'personal_link';

export type CheckinVerificationMethod = 'qr_scan' | 'manual' | 'name_lookup' | 'token';

export type InvitationEventType =
  | 'created'
  | 'updated'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'viewed'
  | 'shared'
  | 'rsvp_received'
  | 'rsvp_updated'
  | 'checkin'
  | 'exported'
  | 'deleted';

export type ImagePurpose = 'cover' | 'gallery' | 'logo' | 'background' | 'pattern';

// ---------------------------------------------------------------------------
// Embedded / Nested Types
// ---------------------------------------------------------------------------

export interface SubEvent {
  sub_event_id: string;
  invitation_id: string;
  workspace_id: string;
  name: string;
  event_type?: string;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_map_url?: string;
  display_order: number;
  show_countdown: boolean;
  enable_individual_rsvp: boolean;
  created_at: string;
  updated_at: string;
}

export type MediaType = 'video' | 'audio';
export type MediaPurpose = 'content' | 'background' | 'effect';
export type MediaProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface InvitationMedia {
  media_id: string;
  invitation_id: string;
  media_type: MediaType;
  purpose: MediaPurpose;
  object_key?: string; // legacy field (some APIs return original_object_key instead)
  original_object_key?: string;
  url?: string;
  media_url?: string; // fallback if backend returns media_url
  upload_url?: string; // available on initiation responses
  original_url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
  processing_status: MediaProcessingStatus;
  position: number;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  created_at: string;
}

export interface TemplateLayout {
  sections: string[];
  fonts: Record<string, string>;
  colors: Record<string, string>;
  positions: Record<string, { x: number; y: number; width: string; height: string }>;
  assets: Record<string, string>;
}

export interface VenueInfo {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  map_url?: string;
}

export interface RSVPCustomQuestion {
  question: string;
  type: 'text' | 'select' | 'checkbox';
  options?: string[];
  required: boolean;
}

export interface RSVPSettings {
  enabled: boolean;
  deadline?: string; // ISO datetime
  max_party_size: number;
  collect_dietary: boolean;
  collect_phone: boolean;
  custom_questions: RSVPCustomQuestion[];
}

// ---------------------------------------------------------------------------
// Template Types
// ---------------------------------------------------------------------------

export interface InvitationTemplate {
  template_id: string;
  workspace_id: string | null;
  name: string;
  slug: string;
  description?: string;
  category: TemplateCategory;
  subcategory?: string;
  tags: string[];
  layout: TemplateLayout;
  content_i18n: Record<string, Record<string, string>>;
  supported_languages: string[];
  preview_image_url?: string;
  thumbnail_url?: string;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
  updated_at: string;
}

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

// ---------------------------------------------------------------------------
// Invitation Types
// ---------------------------------------------------------------------------

export interface Invitation {
  invitation_id: string;
  workspace_id: string;
  template_id?: string;
  customization: Record<string, unknown>;
  title: string;
  slug?: string;
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
  /** Notification preference for RSVP alerts: 'immediate', 'daily_digest', or 'disabled' */
  notification_preference: 'immediate' | 'daily_digest' | 'disabled';

  // Design & Media
  video_object_key?: string;
  video_url?: string;
  audio_object_key?: string;
  audio_url?: string;
  layout_density?: 'compact' | 'normal' | 'spacious';
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
  notification_preference?: 'immediate' | 'daily_digest' | 'disabled';
  
  // Design & Media
  video_object_key?: string;
  audio_object_key?: string;
  layout_density?: 'compact' | 'normal' | 'spacious';
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
  notification_preference?: 'immediate' | 'daily_digest' | 'disabled';
  
  // Design & Media
  video_object_key?: string;
  audio_object_key?: string;
  layout_density?: 'compact' | 'normal' | 'spacious';
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
// Guest Types
// ---------------------------------------------------------------------------

export interface InvitationGuest {
  guest_id: string;
  invitation_id: string;
  name: string;
  email?: string;
  phone?: string;
  salutation?: string;
  group_name?: string;
  personalized_message?: string;
  expected_party_size: number;
  personal_token?: string;
  invitation_sent: boolean;
  invitation_sent_at?: string;
  invitation_viewed: boolean;
  invitation_viewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AddGuestRequest {
  name: string;
  email?: string;
  phone?: string;
  salutation?: string;
  group_name?: string;
  personalized_message?: string;
  expected_party_size?: number;
}

export interface UpdateGuestRequest {
  name?: string;
  email?: string;
  phone?: string;
  salutation?: string;
  group_name?: string;
  personalized_message?: string;
  expected_party_size?: number;
}

export interface BulkAddGuestsRequest {
  guests: AddGuestRequest[];
}

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
// RSVP Types
// ---------------------------------------------------------------------------

export interface InvitationRSVP {
  rsvp_id: string;
  invitation_id: string;
  workspace_id: string;
  guest_id?: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  attending: boolean;
  party_size: number;
  party_names: string[];
  dietary_preferences?: string;
  message?: string;
  custom_answers: Record<string, string>;
  source: RSVPSource;
  status: RSVPStatus;
  created_at: string;
  updated_at: string;
}

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
  /** T124: Cloudflare Turnstile verification token (required if CAPTCHA is enabled) */
  turnstile_token?: string;
}

export interface UpdateRSVPRequest {
  attending?: boolean;
  party_size?: number;
  party_names?: string[];
  dietary_preferences?: string;
  message?: string;
  custom_answers?: Record<string, string>;
  status?: RSVPStatus;
}

export interface RSVPStats {
  total: number;
  attending: number;
  not_attending: number;
  pending: number;
  maybe: number;
  total_party_size: number;
}

export interface RSVPListResponse {
  data: InvitationRSVP[];
  /** Alias for data for convenience */
  rsvps?: InvitationRSVP[];
  /** Alias for meta.total for convenience */
  total?: number;
  stats: RSVPStats;
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/** Alias for a single RSVP response (same as InvitationRSVP) */
export type RSVPResponse = InvitationRSVP;

export interface RSVPSubmitResponse {
  rsvp_id: string;
  edit_token?: string;
  message: string;
  can_edit_until?: string;
}

// ---------------------------------------------------------------------------
// Check-in Types
// ---------------------------------------------------------------------------

export interface InvitationCheckin {
  checkin_id: string;
  invitation_id: string;
  rsvp_id?: string;
  guest_id?: string;
  guest_name: string;
  party_size_checked_in: number;
  verification_method: CheckinVerificationMethod;
  checked_in_by_user_id?: string;
  checked_in_at: string;
  notes?: string;
}

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

export interface CheckinStats {
  total_checked_in: number;
  total_party_size: number;
  /** Alias for total_checked_in for convenience */
  total_guests_checked_in?: number;
  /** Expected total guests from RSVPs */
  expected_guests?: number;
  /** Check-in rate as percentage */
  checkin_rate_percent?: number;
}

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

// ---------------------------------------------------------------------------
// Check-in Scanner Types (T118)
// ---------------------------------------------------------------------------

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
// Stats & Analytics Types
// ---------------------------------------------------------------------------

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

export interface WorkspaceInvitationStats {
  total_invitations: number;
  draft_count: number;
  published_count: number;
  archived_count: number;
  total_rsvps: number;
  upcoming_events: number;
}

export interface InvitationViewAnalytics {
  view_id: string;
  invitation_id: string;
  device_type: 'phone' | 'tablet' | 'desktop' | 'unknown';
  browser?: string;
  os?: string;
  country_code?: string;
  city?: string;
  referrer_type: 'direct' | 'social' | 'search' | 'email' | 'other';
  duration_seconds?: number;
  scrolled_to_rsvp: boolean;
  interacted_with_media: boolean;
  viewed_at: string;
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
  layout_density?: 'compact' | 'normal' | 'spacious';
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
// Audit Event Types
// ---------------------------------------------------------------------------

export interface InvitationEvent {
  event_id: string;
  invitation_id: string;
  workspace_id: string;
  event_type: InvitationEventType;
  actor_type: 'user' | 'guest' | 'system';
  actor_user_id?: string;
  actor_guest_email?: string;
  actor_ip_address?: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

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
