/**
 * i18n Service
 *
 * API client service for language preference management.
 * Syncs language preferences between frontend and backend.
 *
 * Features:
 * - Get supported languages list
 * - Get/Set user language preferences
 * - Resolve effective locale for different contexts
 * - Workspace-level language defaults
 *
 * Feature: Localization & Regional Features
 * Task: T027 - Create language preference API service
 */

import { apiClient as api } from './api';
import type { LanguageCode } from '../i18n/config';

// =============================================================================
// TYPES
// =============================================================================

/** Language context for preferences */
export type LanguageContext =
  | 'ui'
  | 'email'
  | 'notification'
  | 'invoice'
  | 'gallery'
  | 'invitation'
  | 'report';

/** Source of language preference */
export type LanguagePreferenceSource =
  | 'user_selected'
  | 'browser_detected'
  | 'workspace_default'
  | 'system_default'
  | 'api_header'
  | 'url_param'
  | 'cookie'
  | 'imported';

/** Language information */
export interface LanguageInfo {
  code: string;
  name: string;
  native_name: string;
  direction: 'ltr' | 'rtl';
  flag_emoji?: string;
}

/** Language list response */
export interface LanguageListResponse {
  languages: LanguageInfo[];
  total: number;
}

/** Language preference response */
export interface LanguagePreferenceResponse {
  preference_id: string;
  context: LanguageContext;
  primary_language: string;
  fallback_language: string;
  date_locale: string;
  number_locale: string;
  currency_code: string;
  timezone: string;
  source: LanguagePreferenceSource;
  is_explicit: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Resolved locale response */
export interface ResolvedLocaleResponse {
  language: string;
  fallback: string;
  source: LanguagePreferenceSource;
  is_explicit: boolean;
  date_locale: string;
  number_locale: string;
  currency_code: string;
  timezone: string;
  direction: 'ltr' | 'rtl';
}

/** User preferences with resolved locale */
export interface UserLanguagePreferencesResponse {
  preferences: LanguagePreferenceResponse[];
  resolved_ui_locale: ResolvedLocaleResponse;
}

/** Set language request */
export interface SetLanguageRequest {
  language: string;
}

/** Update language preference request */
export interface UpdateLanguagePreferenceRequest {
  primary_language?: string;
  fallback_language?: string;
  date_locale?: string;
  number_locale?: string;
  currency_code?: string;
  timezone?: string;
}

// =============================================================================
// I18N SERVICE
// =============================================================================

export const i18nService = {
  // ===========================================================================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ===========================================================================

  /**
   * Get list of all supported languages.
   * No authentication required.
   */
  async getSupportedLanguages(): Promise<LanguageListResponse> {
    const response = await api.get<LanguageListResponse>('/api/v1/i18n/languages');
    if (!response.data) throw new Error('Failed to fetch languages');
    return response.data;
  },

  // ===========================================================================
  // USER PREFERENCE ENDPOINTS
  // ===========================================================================

  /**
   * Get current user's language preferences.
   *
   * @param workspaceId Optional workspace ID to filter preferences
   * @returns User preferences with resolved UI locale
   */
  async getUserPreferences(
    workspaceId?: string
  ): Promise<UserLanguagePreferencesResponse> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    const response = await api.get<UserLanguagePreferencesResponse>(
      `/api/v1/i18n/me/preferences${params}`
    );
    if (!response.data) throw new Error('Failed to fetch user preferences');
    return response.data;
  },

  /**
   * Get resolved locale for current user.
   *
   * @param context Context for locale resolution (default: 'ui')
   * @param workspaceId Optional workspace context
   * @returns Resolved locale with formatting preferences
   */
  async getResolvedLocale(
    context: LanguageContext = 'ui',
    workspaceId?: string
  ): Promise<ResolvedLocaleResponse> {
    const params = new URLSearchParams({ context });
    if (workspaceId) {
      params.append('workspace_id', workspaceId);
    }
    const response = await api.get<ResolvedLocaleResponse>(
      `/api/v1/i18n/me/locale?${params.toString()}`
    );
    if (!response.data) throw new Error('Failed to fetch resolved locale');
    return response.data;
  },

  /**
   * Set user's language preference for a context.
   *
   * @param context Context for the preference (ui, email, etc.)
   * @param language Language code to set
   * @param workspaceId Optional workspace for workspace-specific preference
   * @returns Updated preference record
   */
  async setUserLanguage(
    context: LanguageContext,
    language: LanguageCode | string,
    workspaceId?: string
  ): Promise<LanguagePreferenceResponse> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    const response = await api.put<LanguagePreferenceResponse>(
      `/api/v1/i18n/me/preferences/${context}${params}`,
      { language }
    );
    if (!response.data) throw new Error('Failed to set user language');
    return response.data;
  },

  /**
   * Update user's language preference for a context.
   *
   * @param context Context for the preference
   * @param updates Partial update data
   * @param workspaceId Optional workspace for workspace-specific preference
   * @returns Updated preference record
   */
  async updateUserLanguage(
    context: LanguageContext,
    updates: UpdateLanguagePreferenceRequest,
    workspaceId?: string
  ): Promise<LanguagePreferenceResponse> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    const response = await api.patch<LanguagePreferenceResponse>(
      `/api/v1/i18n/me/preferences/${context}${params}`,
      updates
    );
    if (!response.data) throw new Error('Failed to update user language');
    return response.data;
  },

  /**
   * Delete user's language preference for a context.
   * Reverts to the next level in the preference hierarchy.
   *
   * @param context Context to delete preference for
   * @param workspaceId Optional workspace for workspace-specific deletion
   */
  async deleteUserLanguage(
    context: LanguageContext,
    workspaceId?: string
  ): Promise<void> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    await api.delete(`/api/v1/i18n/me/preferences/${context}${params}`);
  },

  // ===========================================================================
  // WORKSPACE PREFERENCE ENDPOINTS
  // ===========================================================================

  /**
   * Get workspace default language preferences.
   *
   * @param workspaceId Workspace ID
   * @returns List of workspace language defaults
   */
  async getWorkspacePreferences(
    workspaceId: string
  ): Promise<LanguagePreferenceResponse[]> {
    const response = await api.get<LanguagePreferenceResponse[]>(
      `/api/v1/i18n/workspaces/${workspaceId}/preferences`
    );
    if (!response.data) throw new Error('Failed to fetch workspace preferences');
    return response.data;
  },

  /**
   * Set workspace default language for a context.
   *
   * @param workspaceId Workspace ID
   * @param context Context for the preference
   * @param language Language code to set
   * @returns Updated preference record
   */
  async setWorkspaceLanguage(
    workspaceId: string,
    context: LanguageContext,
    language: LanguageCode | string
  ): Promise<LanguagePreferenceResponse> {
    const response = await api.put<LanguagePreferenceResponse>(
      `/api/v1/i18n/workspaces/${workspaceId}/preferences/${context}`,
      { language }
    );
    if (!response.data) throw new Error('Failed to set workspace language');
    return response.data;
  },

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Sync frontend language with backend.
   * Call this when language changes in the frontend.
   *
   * @param language New language code
   * @param workspaceId Optional workspace context
   */
  async syncLanguage(
    language: LanguageCode | string,
    workspaceId?: string
  ): Promise<void> {
    try {
      await this.setUserLanguage('ui', language, workspaceId);
    } catch (error) {
      // Log but don't throw - localStorage will persist the preference
      console.warn('Failed to sync language preference to backend:', error);
    }
  },

  /**
   * Initialize language from backend preference.
   * Call this on app startup to sync with backend.
   *
   * @param workspaceId Optional workspace context
   * @returns Resolved language code or null if not authenticated
   */
  async initializeFromBackend(
    workspaceId?: string
  ): Promise<string | null> {
    try {
      const prefs = await this.getUserPreferences(workspaceId);
      return prefs.resolved_ui_locale.language;
    } catch (error) {
      // User might not be authenticated
      return null;
    }
  },
};

export default i18nService;
