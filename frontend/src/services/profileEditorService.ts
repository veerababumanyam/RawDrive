/**
 * Profile Editor Service
 *
 * Frontend service for interacting with the Profile Editor API.
 * Provides methods for profile management, visibility controls,
 * theme customization, and version control.
 */

import { apiClient } from './api';
import type {
  Theme,
  ThemeFilters,
  ThemeCustomization,
  ProfileVisibilityConfig,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
  ProfileVersion,
  ProfileExport,
  EnhancedCompanyProfile,
} from '@/types/profileEditor';

// =============================================================================
// API Paths
// =============================================================================

const PROFILE_EDITOR_PATHS = {
  // Profile
  profile: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/profile`,
  publish: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/publish`,
  unpublish: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/unpublish`,

  // Visibility
  visibility: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/visibility`,
  visibilityPresets: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/visibility/presets`,
  applyPreset: (workspaceId: string, presetKey: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/visibility/presets/${presetKey}/apply`,

  // Theme
  themes: '/api/v1/themes',
  themeById: (themeId: string) => `/api/v1/themes/${themeId}`,
  themesByCategory: (category: string) => `/api/v1/themes/categories/${category}`,
  applyTheme: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/theme/apply`,

  // Customization
  customization: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization`,
  customizationColors: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization/colors`,
  customizationTypography: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization/typography`,
  customizationLayout: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization/layout`,
  customizationPresets: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization/presets`,
  customizationReset: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/customization/reset`,

  // Versions
  versions: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/versions`,
  snapshot: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/versions/snapshot`,
  restoreVersion: (workspaceId: string, versionId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/versions/${versionId}/restore`,

  // Export/Import
  exportProfile: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/export`,
  importProfile: (workspaceId: string) =>
    `/api/v1/workspaces/${workspaceId}/profile-editor/import`,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract data from API response or throw error
 */
function extractData<T>(response: { data?: T; error?: { code: string; message: string } }): T {
  if (response.error) {
    throw new Error(response.error.message || 'API request failed');
  }
  if (response.data === undefined) {
    throw new Error('No data returned from API');
  }
  return response.data;
}

/**
 * Extract data from API response, returning null on error
 */
function extractDataOrNull<T>(response: { data?: T; error?: { code: string; message: string } }): T | null {
  if (response.error || response.data === undefined) {
    return null;
  }
  return response.data;
}

// =============================================================================
// Profile Editor Service Class
// =============================================================================

class ProfileEditorService {
  private static instance: ProfileEditorService;

  private constructor() {}

  public static getInstance(): ProfileEditorService {
    if (!ProfileEditorService.instance) {
      ProfileEditorService.instance = new ProfileEditorService();
    }
    return ProfileEditorService.instance;
  }

  // ===========================================================================
  // Profile Management
  // ===========================================================================

  /**
   * Get profile for editing
   */
  async getProfile(workspaceId: string): Promise<EnhancedCompanyProfile> {
    const response = await apiClient.get<{ data: EnhancedCompanyProfile }>(
      PROFILE_EDITOR_PATHS.profile(workspaceId)
    );
    const wrapper = extractData(response);
    return wrapper.data;
  }

  /**
   * Update profile fields
   */
  async updateProfile(
    workspaceId: string,
    updates: Partial<EnhancedCompanyProfile>
  ): Promise<EnhancedCompanyProfile> {
    const response = await apiClient.patch<{ data: EnhancedCompanyProfile }>(
      PROFILE_EDITOR_PATHS.profile(workspaceId),
      updates
    );
    const wrapper = extractData(response);
    return wrapper.data;
  }

  /**
   * Publish profile
   */
  async publishProfile(
    workspaceId: string,
    options?: { createSnapshot?: boolean; snapshotLabel?: string }
  ): Promise<{ success: boolean; published_at: string; public_url: string; version_id?: string }> {
    const response = await apiClient.post<{ success: boolean; published_at: string; public_url: string; version_id?: string }>(
      PROFILE_EDITOR_PATHS.publish(workspaceId),
      {
        create_snapshot: options?.createSnapshot ?? true,
        snapshot_label: options?.snapshotLabel,
      }
    );
    return extractData(response);
  }

  /**
   * Unpublish profile
   */
  async unpublishProfile(workspaceId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>(
      PROFILE_EDITOR_PATHS.unpublish(workspaceId),
      {}
    );
    return extractData(response);
  }

  // ===========================================================================
  // Visibility Management
  // ===========================================================================

  /**
   * Get visibility configuration
   */
  async getVisibility(workspaceId: string): Promise<ProfileVisibilityConfig> {
    const response = await apiClient.get<ProfileVisibilityConfig>(
      PROFILE_EDITOR_PATHS.visibility(workspaceId)
    );
    return extractData(response);
  }

  /**
   * Update visibility configuration
   */
  async updateVisibility(
    workspaceId: string,
    updates: {
      field_visibility?: Record<string, boolean>;
      social_visibility?: Record<string, boolean>;
    }
  ): Promise<ProfileVisibilityConfig> {
    const response = await apiClient.patch<ProfileVisibilityConfig>(
      PROFILE_EDITOR_PATHS.visibility(workspaceId),
      updates
    );
    return extractData(response);
  }

  /**
   * Save current visibility as preset
   */
  async saveVisibilityPreset(
    workspaceId: string,
    name: string
  ): Promise<ProfileVisibilityConfig> {
    const response = await apiClient.post<ProfileVisibilityConfig>(
      PROFILE_EDITOR_PATHS.visibilityPresets(workspaceId),
      { name }
    );
    return extractData(response);
  }

  /**
   * Get available visibility presets
   */
  async getVisibilityPresets(): Promise<{ presets: { key: string; name: string }[] }> {
    const response = await apiClient.get<{ presets: { key: string; name: string }[] }>(
      `${PROFILE_EDITOR_PATHS.themes.replace('/themes', '')}/visibility/presets`
    );
    return extractData(response);
  }

  /**
   * Apply a built-in visibility preset
   */
  async applyVisibilityPreset(
    workspaceId: string,
    presetKey: string
  ): Promise<ProfileVisibilityConfig> {
    const response = await apiClient.post<ProfileVisibilityConfig>(
      PROFILE_EDITOR_PATHS.applyPreset(workspaceId, presetKey),
      {}
    );
    return extractData(response);
  }

  // ===========================================================================
  // Theme Management
  // ===========================================================================

  /**
   * Get all available themes
   */
  async getThemes(filters?: ThemeFilters): Promise<Theme[]> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.is_premium !== undefined) params.append('is_premium', String(filters.is_premium));
    if (filters?.is_popular !== undefined) params.append('is_popular', String(filters.is_popular));
    if (filters?.supports_dark_mode !== undefined)
      params.append('supports_dark_mode', String(filters.supports_dark_mode));
    if (filters?.search) params.append('search', filters.search);

    const url = params.toString()
      ? `${PROFILE_EDITOR_PATHS.themes}?${params}`
      : PROFILE_EDITOR_PATHS.themes;

    const response = await apiClient.get<Theme[]>(url);
    return extractData(response);
  }

  /**
   * Get theme by ID
   */
  async getTheme(themeId: string): Promise<Theme> {
    const response = await apiClient.get<Theme>(PROFILE_EDITOR_PATHS.themeById(themeId));
    return extractData(response);
  }

  /**
   * Get themes by category
   */
  async getThemesByCategory(category: string): Promise<Theme[]> {
    const response = await apiClient.get<Theme[]>(PROFILE_EDITOR_PATHS.themesByCategory(category));
    return extractData(response);
  }

  /**
   * Apply theme to profile
   */
  async applyTheme(
    workspaceId: string,
    themeId: string
  ): Promise<{ data: EnhancedCompanyProfile }> {
    const response = await apiClient.post<{ data: EnhancedCompanyProfile }>(
      `${PROFILE_EDITOR_PATHS.applyTheme(workspaceId)}?theme_id=${themeId}`,
      {}
    );
    return extractData(response);
  }

  // ===========================================================================
  // Theme Customization
  // ===========================================================================

  /**
   * Get current theme customization
   */
  async getCustomization(workspaceId: string): Promise<ThemeCustomization | null> {
    const response = await apiClient.get<ThemeCustomization>(
      PROFILE_EDITOR_PATHS.customization(workspaceId)
    );
    return extractDataOrNull(response);
  }

  /**
   * Update color customization
   */
  async updateColors(
    workspaceId: string,
    colors: Partial<ColorPalette>
  ): Promise<ThemeCustomization> {
    const response = await apiClient.patch<ThemeCustomization>(
      PROFILE_EDITOR_PATHS.customizationColors(workspaceId),
      colors
    );
    return extractData(response);
  }

  /**
   * Update typography customization
   */
  async updateTypography(
    workspaceId: string,
    typography: Partial<TypographyConfig>
  ): Promise<ThemeCustomization> {
    const response = await apiClient.patch<ThemeCustomization>(
      PROFILE_EDITOR_PATHS.customizationTypography(workspaceId),
      typography
    );
    return extractData(response);
  }

  /**
   * Update layout customization
   */
  async updateLayout(
    workspaceId: string,
    layout: Partial<LayoutPreferences>
  ): Promise<ThemeCustomization> {
    const response = await apiClient.patch<ThemeCustomization>(
      PROFILE_EDITOR_PATHS.customizationLayout(workspaceId),
      layout
    );
    return extractData(response);
  }

  /**
   * Save customization as preset
   */
  async saveCustomizationPreset(
    workspaceId: string,
    name: string
  ): Promise<ThemeCustomization> {
    const response = await apiClient.post<ThemeCustomization>(
      PROFILE_EDITOR_PATHS.customizationPresets(workspaceId),
      { name }
    );
    return extractData(response);
  }

  /**
   * Reset customization to theme defaults
   */
  async resetCustomization(workspaceId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>(
      PROFILE_EDITOR_PATHS.customizationReset(workspaceId),
      {}
    );
    return extractData(response);
  }

  // ===========================================================================
  // Version Control
  // ===========================================================================

  /**
   * Create a manual snapshot
   */
  async createSnapshot(
    workspaceId: string,
    label?: string
  ): Promise<ProfileVersion> {
    const response = await apiClient.post<ProfileVersion>(
      PROFILE_EDITOR_PATHS.snapshot(workspaceId),
      { label }
    );
    return extractData(response);
  }

  /**
   * Get version history
   */
  async getVersions(workspaceId: string, limit = 30): Promise<ProfileVersion[]> {
    const response = await apiClient.get<ProfileVersion[]>(
      `${PROFILE_EDITOR_PATHS.versions(workspaceId)}?limit=${limit}`
    );
    return extractData(response);
  }

  /**
   * Restore a previous version
   */
  async restoreVersion(
    workspaceId: string,
    versionId: string
  ): Promise<{ data: EnhancedCompanyProfile; message: string }> {
    const response = await apiClient.post<{ data: EnhancedCompanyProfile; message: string }>(
      PROFILE_EDITOR_PATHS.restoreVersion(workspaceId, versionId),
      {}
    );
    return extractData(response);
  }

  // ===========================================================================
  // Export/Import
  // ===========================================================================

  /**
   * Export profile configuration
   */
  async exportProfile(workspaceId: string): Promise<ProfileExport> {
    const response = await apiClient.post<ProfileExport>(
      PROFILE_EDITOR_PATHS.exportProfile(workspaceId),
      {}
    );
    return extractData(response);
  }

  /**
   * Import profile configuration
   */
  async importProfile(
    workspaceId: string,
    importData: ProfileExport
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      PROFILE_EDITOR_PATHS.importProfile(workspaceId),
      importData
    );
    return extractData(response);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Toggle a single field visibility
   */
  async toggleFieldVisibility(
    workspaceId: string,
    field: string,
    visible: boolean
  ): Promise<ProfileVisibilityConfig> {
    return this.updateVisibility(workspaceId, {
      field_visibility: { [field]: visible },
    });
  }

  /**
   * Toggle a single social platform visibility
   */
  async toggleSocialVisibility(
    workspaceId: string,
    platform: string,
    visible: boolean
  ): Promise<ProfileVisibilityConfig> {
    return this.updateVisibility(workspaceId, {
      social_visibility: { [platform]: visible },
    });
  }

  /**
   * Show all fields
   */
  async showAllFields(workspaceId: string): Promise<ProfileVisibilityConfig> {
    return this.applyVisibilityPreset(workspaceId, 'full');
  }

  /**
   * Hide all fields (minimal preset)
   */
  async hideAllFields(workspaceId: string): Promise<ProfileVisibilityConfig> {
    return this.applyVisibilityPreset(workspaceId, 'minimal');
  }
}

// Export singleton instance
export const profileEditorService = ProfileEditorService.getInstance();

// Export the class for testing
export { ProfileEditorService };
