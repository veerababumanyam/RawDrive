/**
 * Biometric Consent Types
 *
 * GDPR Article 9 compliant biometric consent management for face detection.
 * Feature: Face Detection Audit Remediation (002-face-audit-remediation)
 */

/**
 * Consent status for biometric data processing.
 */
export type BiometricConsentStatus =
  | 'not_granted'
  | 'granted'
  | 'withdrawn'
  | 'pending_deletion';

/**
 * Biometric settings response from API.
 */
export interface BiometricSettingsResponse {
  workspace_id: string;
  face_detection_enabled: boolean;
  consent_status: BiometricConsentStatus;
  consent_granted_at: string | null;
  public_face_search_enabled: boolean;
  auto_clustering_enabled: boolean;
  ai_processing_consent: boolean;
}

/**
 * Request to grant biometric consent.
 */
export interface BiometricConsentGrantRequest {
  policy_version: string;
}

/**
 * Response from consent grant operation.
 */
export interface ConsentGrantResponse {
  success: boolean;
  message: string;
  settings: BiometricSettingsResponse;
}

/**
 * Request to withdraw biometric consent.
 */
export interface BiometricConsentWithdrawRequest {
  reason?: string;
}

/**
 * Response from consent withdraw operation.
 */
export interface ConsentWithdrawResponse {
  success: boolean;
  message: string;
  settings: BiometricSettingsResponse;
  deletion_job_scheduled: boolean;
}

/**
 * Request to update biometric settings.
 */
export interface BiometricSettingsUpdateRequest {
  face_detection_enabled?: boolean;
  public_face_search_enabled?: boolean;
  auto_clustering_enabled?: boolean;
  ai_processing_consent?: boolean;
}

/**
 * Consent history entry.
 */
export interface ConsentHistoryEntry {
  id: string;
  workspace_id: string;
  action: 'grant' | 'withdraw' | 'settings_update';
  performed_by_user_id: string;
  performed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  policy_version: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Consent history response from API.
 */
export interface ConsentHistoryResponse {
  items: ConsentHistoryEntry[];
  total: number;
  page: number;
  page_size: number;
}
