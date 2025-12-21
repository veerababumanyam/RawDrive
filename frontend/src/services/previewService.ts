/**
 * Preview Service
 *
 * Frontend service for managing profile previews.
 * Provides debounced preview generation, caching, and refresh functionality.
 *
 * Requirements: 2.4, 2.5, 2.6, 11.7
 */

import type {
  EnhancedCompanyProfile,
  ProfileVisibilityConfig,
  ThemeCustomization,
  Theme,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
  DeviceMode,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface PreviewState {
  profile: EnhancedCompanyProfile | null;
  visibility: ProfileVisibilityConfig | null;
  theme: Theme | null;
  customization: ThemeCustomization | null;
  deviceMode: DeviceMode;
  timestamp: number;
}

export interface PreviewRenderData {
  /** Filtered profile data based on visibility settings */
  filteredProfile: Partial<EnhancedCompanyProfile>;
  /** Computed CSS variables from theme/customization */
  cssVariables: Record<string, string>;
  /** Font loading configuration */
  fonts: {
    heading: string;
    body: string;
    accent?: string;
    preloadUrls: string[];
  };
  /** Layout configuration */
  layout: LayoutPreferences;
  /** Device-specific viewport */
  viewport: {
    width: number;
    height: number;
    scale: number;
  };
}

export interface PreviewUpdateEvent {
  type: 'profile' | 'visibility' | 'theme' | 'customization' | 'device';
  timestamp: number;
  data: unknown;
}

type PreviewListener = (data: PreviewRenderData) => void;

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_DELAY_MS = 300;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

const DEVICE_VIEWPORTS: Record<DeviceMode, { width: number; height: number; scale: number }> = {
  phone: { width: 375, height: 667, scale: 1 },
  tablet: { width: 768, height: 1024, scale: 0.75 },
  desktop: { width: 1280, height: 800, scale: 0.5 },
};

const DEFAULT_COLORS: ColorPalette = {
  primary: '#2563EB',
  secondary: '#64748B',
  accent: '#06B6D4',
  neutral: ['#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A'],
};

const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  heading_font: {
    family: 'Inter',
    source: 'web',
    fallback: ['system-ui', 'sans-serif'],
    weights: [400, 500, 600, 700],
  },
  body_font: {
    family: 'Inter',
    source: 'web',
    fallback: ['system-ui', 'sans-serif'],
    weights: [400, 500],
  },
};

const DEFAULT_LAYOUT: LayoutPreferences = {
  spacing: 'normal',
  hero_style: 'card',
  section_layout: 'single-column',
};

// =============================================================================
// Preview Service Class
// =============================================================================

class PreviewService {
  private static instance: PreviewService;

  private state: PreviewState = {
    profile: null,
    visibility: null,
    theme: null,
    customization: null,
    deviceMode: 'desktop',
    timestamp: 0,
  };

  private cache: Map<string, { data: PreviewRenderData; expiresAt: number }> = new Map();
  private listeners: Set<PreviewListener> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdates: PreviewUpdateEvent[] = [];

  private constructor() {}

  public static getInstance(): PreviewService {
    if (!PreviewService.instance) {
      PreviewService.instance = new PreviewService();
    }
    return PreviewService.instance;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Subscribe to preview updates
   */
  subscribe(listener: PreviewListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state if available
    if (this.state.profile) {
      const previewData = this.generatePreviewSync();
      listener(previewData);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update profile data and trigger preview refresh
   */
  updateProfile(profile: EnhancedCompanyProfile): void {
    this.state.profile = profile;
    this.queueUpdate({ type: 'profile', timestamp: Date.now(), data: profile });
  }

  /**
   * Update visibility configuration and trigger preview refresh
   */
  updateVisibility(visibility: ProfileVisibilityConfig): void {
    this.state.visibility = visibility;
    this.queueUpdate({ type: 'visibility', timestamp: Date.now(), data: visibility });
  }

  /**
   * Update theme and trigger preview refresh
   */
  updateTheme(theme: Theme): void {
    this.state.theme = theme;
    this.queueUpdate({ type: 'theme', timestamp: Date.now(), data: theme });
  }

  /**
   * Update theme customization and trigger preview refresh
   */
  updateCustomization(customization: ThemeCustomization): void {
    this.state.customization = customization;
    this.queueUpdate({ type: 'customization', timestamp: Date.now(), data: customization });
  }

  /**
   * Update device mode and trigger preview refresh
   */
  setDeviceMode(deviceMode: DeviceMode): void {
    this.state.deviceMode = deviceMode;
    this.queueUpdate({ type: 'device', timestamp: Date.now(), data: deviceMode });
  }

  /**
   * Get current device mode
   */
  getDeviceMode(): DeviceMode {
    return this.state.deviceMode;
  }

  /**
   * Force immediate preview refresh
   */
  refreshPreview(): PreviewRenderData {
    this.clearCache();
    const previewData = this.generatePreviewSync();
    this.notifyListeners(previewData);
    return previewData;
  }

  /**
   * Generate preview data synchronously
   */
  generatePreview(): Promise<PreviewRenderData> {
    return Promise.resolve(this.generatePreviewSync());
  }

  /**
   * Get cached preview data if available
   */
  getCachedPreview(): PreviewRenderData | null {
    const cacheKey = this.generateCacheKey();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    return null;
  }

  /**
   * Clear all cached preview data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current preview state
   */
  getState(): PreviewState {
    return { ...this.state };
  }

  /**
   * Reset preview service state
   */
  reset(): void {
    this.state = {
      profile: null,
      visibility: null,
      theme: null,
      customization: null,
      deviceMode: 'desktop',
      timestamp: 0,
    };
    this.clearCache();
    this.pendingUpdates = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Queue an update and schedule debounced processing
   */
  private queueUpdate(event: PreviewUpdateEvent): void {
    this.pendingUpdates.push(event);
    this.state.timestamp = event.timestamp;

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule debounced processing
    this.debounceTimer = setTimeout(() => {
      this.processUpdates();
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Process all pending updates
   */
  private processUpdates(): void {
    if (this.pendingUpdates.length === 0) return;

    // Clear pending updates
    this.pendingUpdates = [];

    // Generate new preview data
    const previewData = this.generatePreviewSync();

    // Cache the result
    this.cachePreviewData(previewData);

    // Notify all listeners
    this.notifyListeners(previewData);
  }

  /**
   * Generate preview render data synchronously
   */
  private generatePreviewSync(): PreviewRenderData {
    const { profile, visibility, theme, customization, deviceMode } = this.state;

    // Filter profile based on visibility settings
    const filteredProfile = this.filterProfile(profile, visibility);

    // Compute CSS variables from theme and customization
    const cssVariables = this.computeCssVariables(theme, customization);

    // Get font configuration
    const fonts = this.getFontConfiguration(theme, customization);

    // Get layout configuration
    const layout = this.getLayoutConfiguration(theme, customization);

    // Get viewport for device mode
    const viewport = DEVICE_VIEWPORTS[deviceMode];

    return {
      filteredProfile,
      cssVariables,
      fonts,
      layout,
      viewport,
    };
  }

  /**
   * Filter profile fields based on visibility configuration
   */
  private filterProfile(
    profile: EnhancedCompanyProfile | null,
    visibility: ProfileVisibilityConfig | null
  ): Partial<EnhancedCompanyProfile> {
    if (!profile) return {};

    const fieldVisibility = visibility?.field_visibility || {};
    const socialVisibility = visibility?.social_visibility || {};

    const filtered: Partial<EnhancedCompanyProfile> = {};

    // Apply field visibility
    // Map visibility keys to profile keys
    const visibilityToProfileKey: Record<string, keyof EnhancedCompanyProfile | null> = {
      name: 'name',
      tagline: 'tagline',
      logo_url: 'logo_url',
      email: 'email',
      phone: 'phone',
      website: 'website',
      address: 'address_structured', // visibility uses 'address', profile uses 'address_structured'
      custom_links: 'custom_links',
    };

    for (const [visibilityKey, profileKey] of Object.entries(visibilityToProfileKey)) {
      if (!profileKey) continue;
      if ((fieldVisibility as Record<string, boolean>)[visibilityKey] !== false) {
        if (profileKey in profile) {
          (filtered as Record<string, unknown>)[profileKey] = profile[profileKey];
        }
      }
    }

    // Apply social visibility
    if ((fieldVisibility as Record<string, boolean>)['socials'] !== false && profile.socials) {
      const filteredSocials: Record<string, string> = {};
      for (const [platform, url] of Object.entries(profile.socials)) {
        if ((socialVisibility as Record<string, boolean>)[platform] !== false && url) {
          filteredSocials[platform] = url;
        }
      }
      if (Object.keys(filteredSocials).length > 0) {
        filtered.socials = filteredSocials;
      }
    }

    // Always include IDs and metadata
    filtered.profile_id = profile.profile_id;
    filtered.workspace_id = profile.workspace_id;

    return filtered;
  }

  /**
   * Compute CSS variables from theme and customization
   */
  private computeCssVariables(
    theme: Theme | null,
    customization: ThemeCustomization | null
  ): Record<string, string> {
    // Start with theme base colors or defaults
    const baseColors = theme?.base_colors || DEFAULT_COLORS;
    const customColors = customization?.custom_colors;

    // Merge custom colors over base colors
    const colors: ColorPalette = {
      primary: customColors?.primary || baseColors.primary,
      secondary: customColors?.secondary || baseColors.secondary,
      accent: customColors?.accent || baseColors.accent,
      neutral: customColors?.neutral || baseColors.neutral,
      gradients: customColors?.gradients || baseColors.gradients,
    };

    // Generate CSS variables
    const cssVariables: Record<string, string> = {
      '--color-primary': colors.primary,
      '--color-secondary': colors.secondary,
      '--color-accent': colors.accent,
    };

    // Add neutral scale
    if (colors.neutral) {
      colors.neutral.forEach((color, index) => {
        cssVariables[`--color-neutral-${index * 100 || 50}`] = color;
      });
    }

    // Add gradient definitions
    if (colors.gradients) {
      colors.gradients.forEach((gradient, index) => {
        const direction = gradient.direction || '135deg';
        const stops = gradient.stops.join(', ');
        cssVariables[`--gradient-${index + 1}`] =
          gradient.type === 'linear'
            ? `linear-gradient(${direction}, ${stops})`
            : `radial-gradient(${stops})`;
      });
    }

    // Get typography configuration
    const typography = this.getTypographyConfig(theme, customization);
    cssVariables['--font-heading'] = `"${typography.heading_font.family}", ${typography.heading_font.fallback.join(', ')}`;
    cssVariables['--font-body'] = `"${typography.body_font.family}", ${typography.body_font.fallback.join(', ')}`;
    if (typography.accent_font) {
      cssVariables['--font-accent'] = `"${typography.accent_font.family}", ${typography.accent_font.fallback.join(', ')}`;
    }

    // Get layout configuration
    const layout = this.getLayoutConfiguration(theme, customization);
    cssVariables['--spacing'] = layout.spacing === 'compact' ? '0.75rem' : layout.spacing === 'spacious' ? '1.5rem' : '1rem';

    return cssVariables;
  }

  /**
   * Get typography configuration from theme and customization
   */
  private getTypographyConfig(
    theme: Theme | null,
    customization: ThemeCustomization | null
  ): TypographyConfig {
    const baseTypography = theme?.default_typography || DEFAULT_TYPOGRAPHY;
    const customTypography = customization?.custom_typography;

    return {
      heading_font: {
        ...baseTypography.heading_font,
        ...customTypography?.heading_font,
      },
      body_font: {
        ...baseTypography.body_font,
        ...customTypography?.body_font,
      },
      accent_font: customTypography?.accent_font || baseTypography.accent_font,
    };
  }

  /**
   * Get font configuration for loading
   */
  private getFontConfiguration(
    theme: Theme | null,
    customization: ThemeCustomization | null
  ): PreviewRenderData['fonts'] {
    const typography = this.getTypographyConfig(theme, customization);
    const preloadUrls: string[] = [];

    // Build font URLs for preloading (Google Fonts format)
    const buildFontUrl = (fontConfig: TypographyConfig['heading_font']): string => {
      if (fontConfig.source === 'web') {
        const weights = fontConfig.weights.join(';');
        return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontConfig.family)}:wght@${weights}&display=swap`;
      }
      return '';
    };

    const headingUrl = buildFontUrl(typography.heading_font);
    if (headingUrl) preloadUrls.push(headingUrl);

    const bodyUrl = buildFontUrl(typography.body_font);
    if (bodyUrl && bodyUrl !== headingUrl) preloadUrls.push(bodyUrl);

    if (typography.accent_font) {
      const accentUrl = buildFontUrl(typography.accent_font);
      if (accentUrl && !preloadUrls.includes(accentUrl)) {
        preloadUrls.push(accentUrl);
      }
    }

    return {
      heading: typography.heading_font.family,
      body: typography.body_font.family,
      accent: typography.accent_font?.family,
      preloadUrls,
    };
  }

  /**
   * Get layout configuration
   */
  private getLayoutConfiguration(
    theme: Theme | null,
    customization: ThemeCustomization | null
  ): LayoutPreferences {
    const baseLayout = theme?.layout_config || DEFAULT_LAYOUT;
    const customLayout = customization?.custom_layout;

    return {
      ...baseLayout,
      ...customLayout,
    };
  }

  /**
   * Generate cache key from current state
   */
  private generateCacheKey(): string {
    const { profile, visibility, theme, customization, deviceMode } = this.state;
    return JSON.stringify({
      profileId: profile?.profile_id,
      visibilityId: visibility?.visibility_config_id,
      themeId: theme?.theme_id,
      customizationId: customization?.customization_id,
      deviceMode,
    });
  }

  /**
   * Cache preview data
   */
  private cachePreviewData(data: PreviewRenderData): void {
    const cacheKey = this.generateCacheKey();
    this.cache.set(cacheKey, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Notify all listeners with preview data
   */
  private notifyListeners(data: PreviewRenderData): void {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('Preview listener error:', error);
      }
    });
  }
}

// Export singleton instance
export const previewService = PreviewService.getInstance();

// Export the class for testing
export { PreviewService };
