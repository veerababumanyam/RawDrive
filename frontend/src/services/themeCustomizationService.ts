/**
 * Theme Customization Service
 *
 * Service for managing theme customizations including colors, typography,
 * and layout preferences. Supports presets and workspace isolation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type {
  ThemeCustomization,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
  Theme,
  GradientConfig,
} from '@/types/profileEditor';
import { getDefaultTheme } from '@/constants/themes';
import apiClient, { type ApiResponse } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface CustomizationPreset {
  preset_id: string;
  name: string;
  description?: string;
  customization: ThemeCustomization;
  created_at: string;
}

export interface ColorUpdateOptions {
  primary?: string;
  secondary?: string;
  accent?: string;
  neutral?: string[];
  addGradient?: GradientConfig;
  removeGradientIndex?: number;
}

export interface TypographyUpdateOptions {
  heading_font?: Partial<TypographyConfig['heading_font']>;
  body_font?: Partial<TypographyConfig['body_font']>;
  accent_font?: Partial<TypographyConfig['heading_font']>;
}

export interface LayoutUpdateOptions {
  spacing?: 'compact' | 'normal' | 'spacious';
  hero_style?: 'card' | 'full-bleed';
  section_layout?: 'single-column' | 'two-column';
}

export interface CustomizationDiff {
  field: string;
  original: unknown;
  modified: unknown;
}

type CustomizationChangeListener = (customization: ThemeCustomization | null) => void;

// =============================================================================
// Theme Customization Service Class
// =============================================================================

class ThemeCustomizationService {
  private static instance: ThemeCustomizationService;

  private currentCustomization: ThemeCustomization | null = null;
  private baseTheme: Theme | null = null;
  private presets: Map<string, CustomizationPreset> = new Map();
  private listeners: Set<CustomizationChangeListener> = new Set();
  private workspaceId: string | null = null;

  private constructor() {}

  public static getInstance(): ThemeCustomizationService {
    if (!ThemeCustomizationService.instance) {
      ThemeCustomizationService.instance = new ThemeCustomizationService();
    }
    return ThemeCustomizationService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace context
   */
  initialize(workspaceId: string, theme?: Theme): void {
    this.workspaceId = workspaceId;
    this.baseTheme = theme || getDefaultTheme();
    this.currentCustomization = null;
  }

  /**
   * Set the base theme for customization
   */
  setBaseTheme(theme: Theme): void {
    this.baseTheme = theme;
    // Reset customization when base theme changes
    if (this.currentCustomization?.theme_id !== theme.theme_id) {
      this.currentCustomization = null;
      this.notifyListeners(null);
    }
  }

  // ===========================================================================
  // Customization CRUD
  // ===========================================================================

  /**
   * Get current customization
   */
  getCustomization(): ThemeCustomization | null {
    return this.currentCustomization;
  }

  /**
   * Set customization directly
   */
  setCustomization(customization: ThemeCustomization | null): void {
    this.currentCustomization = customization;
    this.notifyListeners(customization);
  }

  /**
   * Update customization with partial changes
   */
  updateCustomization(changes: Partial<ThemeCustomization>): ThemeCustomization {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    this.currentCustomization = {
      ...this.currentCustomization,
      ...changes,
      updated_at: new Date().toISOString(),
    };

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  /**
   * Reset all customizations
   */
  resetCustomization(): void {
    this.currentCustomization = null;
    this.notifyListeners(null);
  }

  // ===========================================================================
  // Color Customization
  // ===========================================================================

  /**
   * Update color palette
   */
  updateColors(options: ColorUpdateOptions): ThemeCustomization {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    const currentColors = this.currentCustomization.custom_colors || {};
    const newColors: Partial<ColorPalette> = { ...currentColors };

    if (options.primary !== undefined) {
      newColors.primary = options.primary;
    }
    if (options.secondary !== undefined) {
      newColors.secondary = options.secondary;
    }
    if (options.accent !== undefined) {
      newColors.accent = options.accent;
    }
    if (options.neutral !== undefined) {
      newColors.neutral = options.neutral;
    }

    // Handle gradients
    if (options.addGradient) {
      const gradients = [...(newColors.gradients || [])];
      gradients.push(options.addGradient);
      newColors.gradients = gradients;
    }

    if (options.removeGradientIndex !== undefined) {
      const gradients = [...(newColors.gradients || [])];
      gradients.splice(options.removeGradientIndex, 1);
      newColors.gradients = gradients.length > 0 ? gradients : undefined;
    }

    this.currentCustomization.custom_colors = newColors;
    this.currentCustomization.updated_at = new Date().toISOString();

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  /**
   * Set primary color
   */
  setPrimaryColor(color: string): ThemeCustomization {
    return this.updateColors({ primary: color });
  }

  /**
   * Set secondary color
   */
  setSecondaryColor(color: string): ThemeCustomization {
    return this.updateColors({ secondary: color });
  }

  /**
   * Set accent color
   */
  setAccentColor(color: string): ThemeCustomization {
    return this.updateColors({ accent: color });
  }

  /**
   * Add a gradient to the palette
   */
  addGradient(gradient: GradientConfig): ThemeCustomization {
    return this.updateColors({ addGradient: gradient });
  }

  /**
   * Remove a gradient from the palette
   */
  removeGradient(index: number): ThemeCustomization {
    return this.updateColors({ removeGradientIndex: index });
  }

  /**
   * Reset colors to theme defaults
   */
  resetColors(): ThemeCustomization {
    if (!this.currentCustomization) {
      return this.createEmptyCustomization();
    }

    const { custom_colors, ...rest } = this.currentCustomization;
    this.currentCustomization = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  // ===========================================================================
  // Typography Customization
  // ===========================================================================

  /**
   * Update typography settings
   */
  updateTypography(options: TypographyUpdateOptions): ThemeCustomization {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    const currentTypo = this.currentCustomization.custom_typography || {};
    const newTypo: Partial<TypographyConfig> = { ...currentTypo };

    if (options.heading_font) {
      newTypo.heading_font = {
        ...((currentTypo.heading_font || this.baseTheme?.default_typography.heading_font) as TypographyConfig['heading_font']),
        ...options.heading_font,
      };
    }

    if (options.body_font) {
      newTypo.body_font = {
        ...((currentTypo.body_font || this.baseTheme?.default_typography.body_font) as TypographyConfig['body_font']),
        ...options.body_font,
      };
    }

    if (options.accent_font) {
      newTypo.accent_font = {
        ...((currentTypo.accent_font || this.baseTheme?.default_typography.accent_font) as TypographyConfig['heading_font']),
        ...options.accent_font,
      };
    }

    this.currentCustomization.custom_typography = newTypo;
    this.currentCustomization.updated_at = new Date().toISOString();

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  /**
   * Set heading font family
   */
  setHeadingFont(fontFamily: string, source: 'web' | 'custom' = 'web'): ThemeCustomization {
    return this.updateTypography({
      heading_font: { family: fontFamily, source },
    });
  }

  /**
   * Set body font family
   */
  setBodyFont(fontFamily: string, source: 'web' | 'custom' = 'web'): ThemeCustomization {
    return this.updateTypography({
      body_font: { family: fontFamily, source },
    });
  }

  /**
   * Set accent font family
   */
  setAccentFont(fontFamily: string, source: 'web' | 'custom' = 'web'): ThemeCustomization {
    return this.updateTypography({
      accent_font: { family: fontFamily, source },
    });
  }

  /**
   * Reset typography to theme defaults
   */
  resetTypography(): ThemeCustomization {
    if (!this.currentCustomization) {
      return this.createEmptyCustomization();
    }

    const { custom_typography, ...rest } = this.currentCustomization;
    this.currentCustomization = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  // ===========================================================================
  // Layout Customization
  // ===========================================================================

  /**
   * Update layout preferences
   */
  updateLayout(options: LayoutUpdateOptions): ThemeCustomization {
    if (!this.currentCustomization) {
      this.currentCustomization = this.createEmptyCustomization();
    }

    const currentLayout = this.currentCustomization.custom_layout || {};
    const newLayout: Partial<LayoutPreferences> = {
      ...currentLayout,
      ...options,
    };

    this.currentCustomization.custom_layout = newLayout;
    this.currentCustomization.updated_at = new Date().toISOString();

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  /**
   * Set spacing preference
   */
  setSpacing(spacing: 'compact' | 'normal' | 'spacious'): ThemeCustomization {
    return this.updateLayout({ spacing });
  }

  /**
   * Set hero style
   */
  setHeroStyle(heroStyle: 'card' | 'full-bleed'): ThemeCustomization {
    return this.updateLayout({ hero_style: heroStyle });
  }

  /**
   * Set section layout
   */
  setSectionLayout(layout: 'single-column' | 'two-column'): ThemeCustomization {
    return this.updateLayout({ section_layout: layout });
  }

  /**
   * Reset layout to theme defaults
   */
  resetLayout(): ThemeCustomization {
    if (!this.currentCustomization) {
      return this.createEmptyCustomization();
    }

    const { custom_layout, ...rest } = this.currentCustomization;
    this.currentCustomization = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  // ===========================================================================
  // Preset Management
  // ===========================================================================

  /**
   * Save current customization as a preset
   */
  async saveAsPreset(name: string, description?: string): Promise<CustomizationPreset> {
    if (!this.currentCustomization || !this.workspaceId) {
      throw new Error('No customization or workspace to save');
    }

    const preset: CustomizationPreset = {
      preset_id: `preset-${Date.now()}`,
      name,
      description,
      customization: {
        ...this.currentCustomization,
        name,
        is_preset: true,
      },
      created_at: new Date().toISOString(),
    };

    // Save locally
    this.presets.set(preset.preset_id, preset);

    // Save to backend
    try {
      await apiClient.post(`/v1/workspaces/${this.workspaceId}/profile-editor/customization-presets`, {
        name,
        description,
        customization: this.currentCustomization,
      });
    } catch (error) {
      console.error('Failed to save preset to backend:', error);
    }

    return preset;
  }

  /**
   * Load a preset
   */
  loadPreset(presetId: string): ThemeCustomization | null {
    const preset = this.presets.get(presetId);
    if (!preset) {
      return null;
    }

    this.currentCustomization = { ...preset.customization };
    this.notifyListeners(this.currentCustomization);
    return this.currentCustomization;
  }

  /**
   * Delete a preset
   */
  async deletePreset(presetId: string): Promise<boolean> {
    const deleted = this.presets.delete(presetId);

    if (deleted && this.workspaceId) {
      try {
        await apiClient.delete(
          `/v1/workspaces/${this.workspaceId}/profile-editor/customization-presets/${presetId}`
        );
      } catch (error) {
        console.error('Failed to delete preset from backend:', error);
      }
    }

    return deleted;
  }

  /**
   * Get all presets
   */
  getPresets(): CustomizationPreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * Load presets from backend
   */
  async loadPresets(): Promise<void> {
    if (!this.workspaceId) return;

    try {
      const response = await apiClient.get<CustomizationPreset[]>(
        `/v1/workspaces/${this.workspaceId}/profile-editor/customization-presets`
      );

      if (response.data) {
        this.presets.clear();
        for (const preset of response.data) {
          this.presets.set(preset.preset_id, preset);
        }
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }

  // ===========================================================================
  // Computed Values
  // ===========================================================================

  /**
   * Get effective color palette (base + customization)
   */
  getEffectiveColors(): ColorPalette {
    if (!this.baseTheme) {
      return getDefaultTheme().base_colors;
    }

    const baseColors = this.baseTheme.base_colors;
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
   * Get effective typography (base + customization)
   */
  getEffectiveTypography(): TypographyConfig {
    if (!this.baseTheme) {
      return getDefaultTheme().default_typography;
    }

    const baseTypo = this.baseTheme.default_typography;
    const customTypo = this.currentCustomization?.custom_typography;

    if (!customTypo) {
      return baseTypo;
    }

    return {
      heading_font: customTypo.heading_font
        ? { ...baseTypo.heading_font, ...customTypo.heading_font }
        : baseTypo.heading_font,
      body_font: customTypo.body_font
        ? { ...baseTypo.body_font, ...customTypo.body_font }
        : baseTypo.body_font,
      accent_font: customTypo.accent_font || baseTypo.accent_font,
    };
  }

  /**
   * Get effective layout (base + customization)
   */
  getEffectiveLayout(): LayoutPreferences {
    if (!this.baseTheme) {
      return getDefaultTheme().layout_config;
    }

    const baseLayout = this.baseTheme.layout_config;
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
   * Check if any customizations have been made
   */
  hasChanges(): boolean {
    if (!this.currentCustomization) return false;

    return !!(
      this.currentCustomization.custom_colors ||
      this.currentCustomization.custom_typography ||
      this.currentCustomization.custom_layout
    );
  }

  /**
   * Get diff between current customization and base theme
   */
  getDiff(): CustomizationDiff[] {
    if (!this.currentCustomization || !this.baseTheme) {
      return [];
    }

    const diffs: CustomizationDiff[] = [];

    // Color diffs
    if (this.currentCustomization.custom_colors) {
      const colors = this.currentCustomization.custom_colors;
      const base = this.baseTheme.base_colors;

      if (colors.primary && colors.primary !== base.primary) {
        diffs.push({ field: 'colors.primary', original: base.primary, modified: colors.primary });
      }
      if (colors.secondary && colors.secondary !== base.secondary) {
        diffs.push({ field: 'colors.secondary', original: base.secondary, modified: colors.secondary });
      }
      if (colors.accent && colors.accent !== base.accent) {
        diffs.push({ field: 'colors.accent', original: base.accent, modified: colors.accent });
      }
    }

    // Typography diffs
    if (this.currentCustomization.custom_typography) {
      const typo = this.currentCustomization.custom_typography;
      const base = this.baseTheme.default_typography;

      if (typo.heading_font?.family && typo.heading_font.family !== base.heading_font.family) {
        diffs.push({
          field: 'typography.heading_font',
          original: base.heading_font.family,
          modified: typo.heading_font.family,
        });
      }
      if (typo.body_font?.family && typo.body_font.family !== base.body_font.family) {
        diffs.push({
          field: 'typography.body_font',
          original: base.body_font.family,
          modified: typo.body_font.family,
        });
      }
    }

    // Layout diffs
    if (this.currentCustomization.custom_layout) {
      const layout = this.currentCustomization.custom_layout;
      const base = this.baseTheme.layout_config;

      if (layout.spacing && layout.spacing !== base.spacing) {
        diffs.push({ field: 'layout.spacing', original: base.spacing, modified: layout.spacing });
      }
      if (layout.hero_style && layout.hero_style !== base.hero_style) {
        diffs.push({ field: 'layout.hero_style', original: base.hero_style, modified: layout.hero_style });
      }
      if (layout.section_layout && layout.section_layout !== base.section_layout) {
        diffs.push({ field: 'layout.section_layout', original: base.section_layout, modified: layout.section_layout });
      }
    }

    return diffs;
  }

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  /**
   * Subscribe to customization changes
   */
  subscribe(listener: CustomizationChangeListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state
    listener(this.currentCustomization);

    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================================================
  // API Persistence
  // ===========================================================================

  /**
   * Save customization to backend
   */
  async saveCustomization(): Promise<ApiResponse<ThemeCustomization>> {
    if (!this.workspaceId || !this.currentCustomization) {
      throw new Error('No workspace or customization to save');
    }

    return apiClient.post<ThemeCustomization>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/customization`,
      this.currentCustomization
    );
  }

  /**
   * Load customization from backend
   */
  async loadCustomization(customizationId: string): Promise<ThemeCustomization | null> {
    if (!this.workspaceId) return null;

    try {
      const response = await apiClient.get<ThemeCustomization>(
        `/v1/workspaces/${this.workspaceId}/profile-editor/customization/${customizationId}`
      );

      if (response.data) {
        this.currentCustomization = response.data;
        this.notifyListeners(this.currentCustomization);
        return this.currentCustomization;
      }

      return null;
    } catch (error) {
      console.error('Failed to load customization:', error);
      return null;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createEmptyCustomization(): ThemeCustomization {
    return {
      customization_id: `temp-${Date.now()}`,
      workspace_id: this.workspaceId || '',
      theme_id: this.baseTheme?.theme_id || '',
      is_preset: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private notifyListeners(customization: ThemeCustomization | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(customization);
      } catch (error) {
        console.error('Customization listener error:', error);
      }
    });
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.currentCustomization = null;
    this.baseTheme = null;
    this.presets.clear();
    this.listeners.clear();
    this.workspaceId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const themeCustomizationService = ThemeCustomizationService.getInstance();

// Export class for testing
export { ThemeCustomizationService };
