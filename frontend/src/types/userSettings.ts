/**
 * User Settings Types
 * TypeScript interfaces for user profile, security, notifications, privacy, and account deletion.
 * Matches backend schemas from backend/src/app/api/schemas.py
 */

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export interface NotificationChannelPrefs {
  gallery_activity: boolean;
  client_interactions: boolean;
  system_alerts: boolean;
  marketing: boolean;
}

export interface NotificationPreferences {
  email: NotificationChannelPrefs;
  in_app: NotificationChannelPrefs;
}

// ---------------------------------------------------------------------------
// Privacy Settings
// ---------------------------------------------------------------------------

export interface PrivacySettings {
  analytics_enabled: boolean;
  public_profile_enabled: boolean;
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

export interface ExtendedUserProfile {
  user_id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  preferred_language: string;
  created_at: string;
  workspace_id?: string | null;

  // Profile fields
  avatar_url?: string | null;
  job_title?: string | null;
  phone?: string | null;
  timezone: string;
  bio?: string | null;

  // Security status
  totp_enabled: boolean;
  last_password_changed_at?: string | null;

  // Deletion status
  deletion_requested_at?: string | null;
}

export interface UpdateProfileRequest {
  display_name?: string;
  job_title?: string | null;
  phone?: string | null;
  timezone?: string;
  bio?: string | null;
  preferred_language?: string;
}

export interface AvatarUploadResponse {
  avatar_url: string;
  thumbnails: Record<string, string>;
}

export interface EmailChangeRequest {
  new_email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Security Settings
// ---------------------------------------------------------------------------

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qr_code_uri: string;
  qr_code_svg?: string | null;
  issuer: string;
}

export interface Verify2FARequest {
  code: string;
}

export interface TwoFactorEnabledResponse {
  message: string;
  backup_codes: string[];
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  enabled_at?: string | null;
  backup_codes_remaining?: number | null;
}

export interface Disable2FARequest {
  password: string;
  code: string;
}

export interface PasswordConfirmRequest {
  password: string;
}

export interface BackupCodesResponse {
  backup_codes: string[];
}

export interface SessionLocation {
  country?: string | null;
  country_code?: string | null;
  city?: string | null;
  region?: string | null;
}

export interface SessionItem {
  session_id: string;
  device_info?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  location?: SessionLocation | null;
  created_at: string;
  last_used_at: string;
  is_current: boolean;
}

export interface SessionListResponse {
  items: SessionItem[];
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export interface UpdateNotificationPreferencesRequest {
  email?: Partial<NotificationChannelPrefs>;
  in_app?: Partial<NotificationChannelPrefs>;
}

export interface NotificationPreferencesResponse {
  email: NotificationChannelPrefs;
  in_app: NotificationChannelPrefs;
}

// ---------------------------------------------------------------------------
// Privacy Settings
// ---------------------------------------------------------------------------

export interface UpdatePrivacySettingsRequest {
  analytics_enabled?: boolean;
  public_profile_enabled?: boolean;
}

export interface PrivacySettingsResponse {
  analytics_enabled: boolean;
  public_profile_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Data Export
// ---------------------------------------------------------------------------

export type DataExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface DataExportResponse {
  export_id: string;
  status: DataExportStatus;
  requested_at: string;
  completed_at?: string | null;
  download_url?: string | null;
  expires_at?: string | null;
}

// ---------------------------------------------------------------------------
// Account Deletion
// ---------------------------------------------------------------------------

export interface DeleteAccountRequest {
  password: string;
  reason?: string;
}

export type DeletionStatus = 'pending' | 'cancelled' | 'processing' | 'completed' | 'failed';

export interface AccountDeletionResponse {
  deletion_id: string;
  status: DeletionStatus;
  reason?: string | null;
  requested_at: string;
  scheduled_deletion_at: string;
  cancelled_at?: string | null;
  completed_at?: string | null;
  days_until_deletion: number;
  can_cancel: boolean;
  message: string;
}

export interface DeletionStatusResponse {
  has_pending_deletion: boolean;
  deletion_id?: string | null;
  scheduled_deletion_at?: string | null;
  days_until_deletion?: number | null;
  can_cancel?: boolean;
}

// Legacy interface for compatibility
export interface DeletionRequestResponse {
  request_id: string;
  requested_at: string;
  scheduled_deletion_at: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

export type NotificationCategory = keyof NotificationChannelPrefs;
export type NotificationChannel = 'email' | 'in_app';

export interface MessageResponse {
  message: string;
  success?: boolean;
}
