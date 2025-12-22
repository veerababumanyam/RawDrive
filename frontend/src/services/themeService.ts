/**
 * Theme Service
 *
 * Frontend service for managing themes in the Public Profile Editor.
 * Provides theme listing, filtering, selection, and application functionality.
 *
 * Requirements: 3.1, 3.3, 3.4, 3.7
 */

import type {
  Theme,
  ThemeCategory,
  ThemeFilters,
  ThemeCustomization,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
} from '@/types/profileEditor';
import {
  PREBUILT_THEMES,
  getThemeById,
  getThemesByCategory,
  getPopularThemes,
  getPremiumThemes,
  getFreeThemes,
  searchThemes,
  getDefaultTheme,
  THEME_CATEGORY_INFO,
} from '@/constants/themes';
import apiClient, { type ApiResponse } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface ThemeListResponse {
  themes: Theme[];
  total: number;
  categories: Record<ThemeCategory, number>;
}

export interface ApplyThemeResult {
  success: boolean;
  theme: Theme;
  customization?: ThemeCustomization;
  error?: string;
}

export interface ThemeUsageStats {
  theme_id: string;
  usage_count: number;
  last_used_at?: string;
}

type ThemeChangeListener = (theme: Theme | null) => void;

// =============================================================================
// Theme Service Class
// =============================================================================

class ThemeService {
  private static instance: ThemeService;

  private currentTheme: Theme | null = null;
  private currentCustomization: ThemeCustomization | null = null;
  private listeners: Set<ThemeChangeListener> = new Set();
  private usageCache: Map<string, ThemeUsageStats> = new Map();

  private constructor() {
    // Initialize with default theme
    this.currentTheme = getDefaultTheme();
  }

  public static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  // ===========================================================================
  // Theme Listing Methods
  // ===========================================================================

  /**
   * List all available themes with optional filtering
   */
  listThemes(filters?: ThemeFilters): ThemeListResponse {
    let themes = [...PREBUILT_THEMES];

    // Apply filters
    if (filters) {
      if (filters.category) {
        themes = themes.filter((t) => t.category === filters.category);
      }

      if (filters.is_premium !== undefined) {
        themes = themes.filter((t) => t.is_premium === filters.is_premium);
      }

      if (filters.is_popular !== undefined) {
        themes = themes.filter((t) => t.is_popular === filters.is_popular);
      }

      if (filters.supports_dark_mode !== undefined) {
        themes = themes.filter((t) => t.supports_dark_mode === filters.supports_dark_mode);
      }

      if (filters.search) {
        const searchResults = searchThemes(filters.search);
        const searchIds = new Set(searchResults.map((t) => t.theme_id));
        themes = themes.filter((t) => searchIds.has(t.theme_id));
      }
    }

    // Calculate category counts
    const categories: Record<ThemeCategory, number> = {
      minimal: 0,
      bold: 0,
      elegant: 0,
      modern: 0,
      creative: 0,
      gradient: 0,
      dark: 0,
      nature: 0,
    };

    for (const theme of PREBUILT_THEMES) {
      categories[theme.category]++;
    }

    return {
      themes,
      total: themes.length,
      categories,
    };
  }

  /**
   * Get a single theme by ID
   */
  getTheme(themeId: string): Theme | undefined {
    return getThemeById(themeId);
  }

  /**
   * Get themes by category
   */
  getThemesByCategory(category: ThemeCategory): Theme[] {
    return getThemesByCategory(category);
  }

  /**
   * Get popular themes
   */
  getPopularThemes(): Theme[] {
    return getPopularThemes();
  }

  /**
   * Get premium themes
   */
  getPremiumThemes(): Theme[] {
    return getPremiumThemes();
  }

  /**
   * Get free themes
   */
  getFreeThemes(): Theme[] {
    return getFreeThemes();
  }

  /**
   * Search themes by query
   */
  searchThemes(query: string): Theme[] {
    return searchThemes(query);
  }

  /**
   * Get recommended themes (based on usage, popularity)
   */
  getRecommendedThemes(limit = 3): Theme[] {
    return [...PREBUILT_THEMES]
      .sort((a, b) => {
        // Weight popular themes higher
        const aScore = (a.is_popular ? 100 : 0) + a.usage_count;
        const bScore = (b.is_popular ? 100 : 0) + b.usage_count;
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  /**
   * Get category information
   */
  getCategoryInfo(category: ThemeCategory) {
    return THEME_CATEGORY_INFO[category];
  }

  /**
   * Get all category information
   */
  getAllCategoryInfo() {
    return THEME_CATEGORY_INFO;
  }

  // ===========================================================================
  // Theme Selection and Application
  // ===========================================================================

  /**
   * Get currently selected theme
   */
  getCurrentTheme(): Theme | null {
    return this.currentTheme;
  }

  /**
   * Get current customization
   */
  getCurrentCustomization(): ThemeCustomization | null {
    return this.currentCustomization;
  }

  /**
   * Apply a theme (locally, for preview)
   */
  applyTheme(themeId: string): ApplyThemeResult {
    const theme = getThemeById(themeId);

    if (!theme) {
      return {
        success: false,
        theme: this.currentTheme || getDefaultTheme(),
        error: `Theme not found: ${themeId}`,
      };
    }

    this.currentTheme = theme;
    this.currentCustomization = null; // Reset customization when switching themes
    this.notifyListeners(theme);
    this.trackUsage(themeId);

    return {
      success: true,
      theme,
    };
  }

  /**
   * Apply a theme with customization
   */
  applyThemeWithCustomization(
    themeId: string,
    customization: Partial<ThemeCustomization>
  ): ApplyThemeResult {
    const theme = getThemeById(themeId);

    if (!theme) {
      return {
        success: false,
        theme: this.currentTheme || getDefaultTheme(),
        error: `Theme not found: ${themeId}`,
      };
    }

    this.currentTheme = theme;
    this.currentCustomization = {
      customization_id: customization.customization_id || `temp-${Date.now()}`,
      workspace_id: customization.workspace_id || '',
      theme_id: themeId,
      name: customization.name,
      custom_colors: customization.custom_colors,
      custom_typography: customization.custom_typography,
      custom_layout: customization.custom_layout,
      is_preset: customization.is_preset || false,
      created_at: customization.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.notifyListeners(theme);
    this.trackUsage(themeId);

    return {
      success: true,
      theme,
      customization: this.currentCustomization,
    };
  }

  /**
   * Reset to default theme
   */
  resetToDefault(): void {
    this.currentTheme = getDefaultTheme();
    this.currentCustomization = null;
    this.notifyListeners(this.currentTheme);
  }

  // ===========================================================================
  // Theme Customization
  // ===========================================================================

  /**
   * Update color customization
   */
  updateColors(colors: Partial<ColorPalette>): void {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    this.currentCustomization.custom_colors = {
      ...this.currentCustomization.custom_colors,
      ...colors,
    };
    this.currentCustomization.updated_at = new Date().toISOString();

    if (this.currentTheme) {
      this.notifyListeners(this.currentTheme);
    }
  }

  /**
   * Update typography customization
   */
  updateTypography(typography: Partial<TypographyConfig>): void {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    this.currentCustomization.custom_typography = {
      ...this.currentCustomization.custom_typography,
      ...typography,
    };
    this.currentCustomization.updated_at = new Date().toISOString();

    if (this.currentTheme) {
      this.notifyListeners(this.currentTheme);
    }
  }

  /**
   * Update layout customization
   */
  updateLayout(layout: Partial<LayoutPreferences>): void {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    this.currentCustomization.custom_layout = {
      ...this.currentCustomization.custom_layout,
      ...layout,
    };
    this.currentCustomization.updated_at = new Date().toISOString();

    if (this.currentTheme) {
      this.notifyListeners(this.currentTheme);
    }
  }

  /**
   * Reset all customizations to theme defaults
   */
  resetCustomizations(): void {
    this.currentCustomization = null;

    if (this.currentTheme) {
      this.notifyListeners(this.currentTheme);
    }
  }

  /**
   * Check if current theme has customizations
   */
  hasCustomizations(): boolean {
    if (!this.currentCustomization) return false;

    return !!(
      this.currentCustomization.custom_colors ||
      this.currentCustomization.custom_typography ||
      this.currentCustomization.custom_layout
    );
  }

  // ===========================================================================
  // Computed Theme Values
  // ===========================================================================

  /**
   * Get effective colors (theme + customization)
   */
  getEffectiveColors(): ColorPalette {
    if (!this.currentTheme) {
      return getDefaultTheme().base_colors;
    }

    const baseColors = this.currentTheme.base_colors;
    const customColors = this.currentCustomization?.custom_colors;

    if (!customColors) {
      return baseColors;
    }

    return {
      primary: customColors.primary || baseColors.primary,
      secondary: customColors.secondary || baseColors.secondary,
      accent: customColors.accent || baseColors.accent,
      neutral: customColors.neutral || baseColors.neutral,
      gradients: customColors.gradients || baseColors.gradients,
    };
  }

  /**
   * Get effective typography (theme + customization)
   */
  getEffectiveTypography(): TypographyConfig {
    if (!this.currentTheme) {
      return getDefaultTheme().default_typography;
    }

    const baseTypo = this.currentTheme.default_typography;
    const customTypo = this.currentCustomization?.custom_typography;

    if (!customTypo) {
      return baseTypo;
    }

    return {
      heading_font: {
        ...baseTypo.heading_font,
        ...customTypo.heading_font,
      },
      body_font: {
        ...baseTypo.body_font,
        ...customTypo.body_font,
      },
      accent_font: customTypo.accent_font || baseTypo.accent_font,
    };
  }

  /**
   * Get effective layout (theme + customization)
   */
  getEffectiveLayout(): LayoutPreferences {
    if (!this.currentTheme) {
      return getDefaultTheme().layout_config;
    }

    const baseLayout = this.currentTheme.layout_config;
    const customLayout = this.currentCustomization?.custom_layout;

    if (!customLayout) {
      return baseLayout;
    }

    return {
      ...baseLayout,
      ...customLayout,
    };
  }

  /**
   * Generate CSS variables from current theme and customizations
   */
  generateCssVariables(): Record<string, string> {
    const colors = this.getEffectiveColors();
    const typography = this.getEffectiveTypography();
    const layout = this.getEffectiveLayout();

    const vars: Record<string, string> = {
      // Colors
      '--theme-primary': colors.primary,
      '--theme-secondary': colors.secondary,
      '--theme-accent': colors.accent,

      // Typography
      '--theme-font-heading': `"${typography.heading_font.family}", ${typography.heading_font.fallback.join(', ')}`,
      '--theme-font-body': `"${typography.body_font.family}", ${typography.body_font.fallback.join(', ')}`,

      // Layout
      '--theme-spacing':
        layout.spacing === 'compact' ? '0.75rem' :
        layout.spacing === 'spacious' ? '1.5rem' : '1rem',
    };

    // Add accent font if available
    if (typography.accent_font) {
      vars['--theme-font-accent'] = `"${typography.accent_font.family}", ${typography.accent_font.fallback.join(', ')}`;
    }

    // Add neutral scale
    if (colors.neutral) {
      colors.neutral.forEach((color, index) => {
        vars[`--theme-neutral-${index * 100 || 50}`] = color;
      });
    }

    // Add gradients
    if (colors.gradients) {
      colors.gradients.forEach((gradient, index) => {
        const direction = gradient.direction || '135deg';
        const stops = gradient.stops.join(', ');
        vars[`--theme-gradient-${index + 1}`] =
          gradient.type === 'linear'
            ? `linear-gradient(${direction}, ${stops})`
            : `radial-gradient(${stops})`;
      });
    }

    return vars;
  }

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  /**
   * Subscribe to theme changes
   */
  subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state
    if (this.currentTheme) {
      listener(this.currentTheme);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================================================
  // API Integration (for persisting selections)
  // ===========================================================================

  /**
   * Save theme selection to backend
   */
  async saveThemeSelection(
    workspaceId: string,
    _profileId: string,
    themeId: string,
    _customization?: Partial<ThemeCustomization>
  ): Promise<ApiResponse<{ theme_id: string; customization_id?: string }>> {
    try {
      // Call the apply theme endpoint - theme_id is passed as query param
      const response = await apiClient.post<{ theme_id: string; customization_id?: string }>(
        `/api/v1/workspaces/${workspaceId}/profile-editor/theme/apply?theme_id=${themeId}`,
        {}
      );
      return response;
    } catch (error) {
      console.error('Failed to save theme selection:', error);
      throw error;
    }
  }

  /**
   * Load theme selection from backend
   */
  async loadThemeSelection(
    workspaceId: string,
    profileId: string
  ): Promise<{ theme: Theme | null; customization: ThemeCustomization | null }> {
    try {
      const response = await apiClient.get<{
        theme_id: string;
        customization?: ThemeCustomization;
      }>(`/v1/workspaces/${workspaceId}/profile-editor/theme/${profileId}`);

      if (response.data) {
        const theme = getThemeById(response.data.theme_id) || null;
        const customization = response.data.customization || null;

        if (theme) {
          this.currentTheme = theme;
          this.currentCustomization = customization;
          this.notifyListeners(theme);
        }

        return { theme, customization };
      }

      return { theme: null, customization: null };
    } catch (error) {
      console.error('Failed to load theme selection:', error);
      return { theme: null, customization: null };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private notifyListeners(theme: Theme | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(theme);
      } catch (error) {
        console.error('Theme listener error:', error);
      }
    });
  }

  private createEmptyCustomization(): ThemeCustomization {
    return {
      customization_id: `temp-${Date.now()}`,
      workspace_id: '',
      theme_id: this.currentTheme?.theme_id || '',
      is_preset: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private trackUsage(themeId: string): void {
    const stats = this.usageCache.get(themeId) || {
      theme_id: themeId,
      usage_count: 0,
    };

    stats.usage_count++;
    stats.last_used_at = new Date().toISOString();
    this.usageCache.set(themeId, stats);
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.currentTheme = getDefaultTheme();
    this.currentCustomization = null;
    this.listeners.clear();
    this.usageCache.clear();
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const themeService = ThemeService.getInstance();

// Export class for testing
export { ThemeService };
