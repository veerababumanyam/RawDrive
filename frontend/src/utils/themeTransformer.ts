/**
 * Theme Transformer Utility
 *
 * Transforms backend theme data into ProfileCard-compatible props.
 * Ensures consistent theme application between editor preview and public profile.
 *
 * This is the single source of truth for theme data transformation.
 */

import type { ThemeColors, ThemeTypography, ThemeLayout } from '@/components/features/profile/ProfileCard';

// =============================================================================
// Types - Backend Response Format
// =============================================================================

/**
 * Font configuration as returned by the backend
 */
interface BackendFontConfig {
  family: string;
  source?: 'web' | 'system';
  fallback?: string[];
  weights?: number[];
}

/**
 * Typography config as returned by the backend
 */
interface BackendTypographyConfig {
  heading_font?: BackendFontConfig;
  body_font?: BackendFontConfig;
  accent_font?: BackendFontConfig;
}

/**
 * Gradient configuration from backend
 */
interface GradientConfig {
  name?: string;
  type: 'linear' | 'radial';
  direction?: string;
  stops: string[];
}

/**
 * Base colors as returned by the backend
 */
interface BackendBaseColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
  neutral?: string[];
  gradients?: GradientConfig[];
}

/**
 * Layout config as returned by the backend
 */
interface BackendLayoutConfig {
  spacing?: 'compact' | 'normal' | 'spacious';
  hero_style?: 'card' | 'full-bleed';
  section_layout?: 'single-column' | 'two-column';
}

/**
 * Theme data as returned by the public profile API
 */
export interface BackendThemeData {
  theme_id: string;
  name?: string;
  category?: string;
  base_colors?: BackendBaseColors;
  variants?: Array<{
    variant_id: string;
    name: string;
    colors: Record<string, string>;
  }>;
  typography?: BackendTypographyConfig;
  layout?: BackendLayoutConfig;
}

// =============================================================================
// Types - Frontend Format (from constants/themes.ts)
// =============================================================================

import type { Theme, ThemeCustomization, ColorPalette, LayoutPreferences } from '@/types/profileEditor';

/**
 * Input for theme transformation - can be from API or from editor state
 */
export interface ThemeTransformInput {
  /**
   * Theme data from backend API response (PublicProfileView)
   */
  apiTheme?: BackendThemeData | null;

  /**
   * Theme from frontend constants (Editor/Preview)
   */
  editorTheme?: Theme | null;

  /**
   * Custom overrides from user customization
   */
  customization?: Partial<ThemeCustomization> | null;
}

/**
 * Output format compatible with ProfileCard props
 */
export interface ThemeTransformOutput {
  themeColors?: ThemeColors;
  themeTypography?: ThemeTypography;
  themeLayout?: ThemeLayout;
  backgroundGradient?: string;
  backgroundColor?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build font-family CSS string from font config
 */
function buildFontFamily(fontConfig: BackendFontConfig | undefined): string | undefined {
  if (!fontConfig?.family) return undefined;

  const fallbacks = fontConfig.fallback?.length
    ? fontConfig.fallback.join(', ')
    : 'system-ui, sans-serif';

  return `"${fontConfig.family}", ${fallbacks}`;
}

/**
 * Generate CSS gradient from gradient config
 */
function buildGradientCss(gradient: GradientConfig): string {
  const stops = gradient.stops.join(', ');

  if (gradient.type === 'radial') {
    return `radial-gradient(circle, ${stops})`;
  }

  const direction = gradient.direction || '135deg';
  return `linear-gradient(${direction}, ${stops})`;
}

/**
 * Validate hex color to prevent CSS injection
 */
function isValidColor(color: string | undefined): boolean {
  if (!color) return false;
  // Allow hex colors, rgb/rgba, hsl/hsla
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
  const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/;
  const hslPattern = /^hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*(,\s*[\d.]+)?\s*\)$/;
  return hexPattern.test(color) || rgbPattern.test(color) || hslPattern.test(color);
}

/**
 * Safely get a color value, returning default if invalid
 */
function safeColor(color: string | undefined, defaultColor: string): string {
  return isValidColor(color) ? color! : defaultColor;
}

// =============================================================================
// Main Transformer Function
// =============================================================================

/**
 * Transform theme data from any source into ProfileCard-compatible props.
 *
 * This function handles both:
 * 1. API response format (from backend public profile endpoint)
 * 2. Editor format (from frontend constants/themes.ts)
 *
 * And merges any customizations on top.
 */
export function transformThemeForProfileCard(input: ThemeTransformInput): ThemeTransformOutput {
  const { apiTheme, editorTheme, customization } = input;

  // No theme data - return empty
  if (!apiTheme && !editorTheme) {
    return {};
  }

  const result: ThemeTransformOutput = {};

  // ==========================================================================
  // Transform Colors
  // ==========================================================================

  // Get base colors from either source
  let baseColors: Partial<BackendBaseColors> = {};

  if (apiTheme?.base_colors) {
    baseColors = apiTheme.base_colors;
  } else if (editorTheme?.base_colors) {
    baseColors = editorTheme.base_colors;
  }

  // Apply customization overrides
  const customColors = customization?.custom_colors as Partial<ColorPalette> | undefined;

  result.themeColors = {
    primary: safeColor(customColors?.primary || baseColors.primary, '#2563EB'),
    secondary: safeColor(customColors?.secondary || baseColors.secondary, '#64748B'),
    accent: safeColor(customColors?.accent || baseColors.accent, '#06B6D4'),
  };

  // Extract background color
  if (baseColors.background && isValidColor(baseColors.background)) {
    result.backgroundColor = baseColors.background;
  }

  // Extract first gradient for background
  const gradients = customColors?.gradients || baseColors.gradients;
  if (gradients && gradients.length > 0) {
    result.backgroundGradient = buildGradientCss(gradients[0]);
  }

  // ==========================================================================
  // Transform Typography
  // ==========================================================================

  // Get typography from either source - cast to common interface
  let headingFontConfig: BackendFontConfig | undefined;
  let bodyFontConfig: BackendFontConfig | undefined;

  if (apiTheme?.typography) {
    headingFontConfig = apiTheme.typography.heading_font;
    bodyFontConfig = apiTheme.typography.body_font;
  } else if (editorTheme?.default_typography) {
    // Cast editor typography to BackendFontConfig (compatible subset)
    const editorTypo = editorTheme.default_typography;
    headingFontConfig = editorTypo.heading_font as unknown as BackendFontConfig;
    bodyFontConfig = editorTypo.body_font as unknown as BackendFontConfig;
  }

  // Apply customization overrides if present
  const customTypography = customization?.custom_typography;
  if (customTypography?.heading_font) {
    headingFontConfig = customTypography.heading_font as unknown as BackendFontConfig;
  }
  if (customTypography?.body_font) {
    bodyFontConfig = customTypography.body_font as unknown as BackendFontConfig;
  }

  if (headingFontConfig || bodyFontConfig) {
    result.themeTypography = {
      headingFont: buildFontFamily(headingFontConfig),
      bodyFont: buildFontFamily(bodyFontConfig),
    };
  }

  // ==========================================================================
  // Transform Layout
  // ==========================================================================

  let baseLayout: BackendLayoutConfig | undefined;

  if (apiTheme?.layout) {
    baseLayout = apiTheme.layout;
  } else if (editorTheme?.layout_config) {
    baseLayout = editorTheme.layout_config;
  }

  const customLayout = customization?.custom_layout as Partial<LayoutPreferences> | undefined;

  if (baseLayout || customLayout) {
    result.themeLayout = {
      spacing: customLayout?.spacing || baseLayout?.spacing,
      heroStyle: customLayout?.hero_style || baseLayout?.hero_style,
      sectionLayout: customLayout?.section_layout || baseLayout?.section_layout,
    };
  }

  return result;
}

// =============================================================================
// Font Extraction Helper
// =============================================================================

/**
 * Extract font families that need to be loaded from theme data.
 * Returns array of font family names (without fallbacks).
 */
export function extractFontsToLoad(input: ThemeTransformInput): string[] {
  const { apiTheme, editorTheme, customization } = input;

  const fonts: string[] = [];

  // Get base typography from API or editor
  let headingFamily: string | undefined;
  let bodyFamily: string | undefined;
  let accentFamily: string | undefined;

  if (apiTheme?.typography) {
    headingFamily = apiTheme.typography.heading_font?.family;
    bodyFamily = apiTheme.typography.body_font?.family;
    accentFamily = apiTheme.typography.accent_font?.family;
  } else if (editorTheme?.default_typography) {
    headingFamily = editorTheme.default_typography.heading_font?.family;
    bodyFamily = editorTheme.default_typography.body_font?.family;
    accentFamily = editorTheme.default_typography.accent_font?.family;
  }

  // Apply custom typography overrides
  if (customization?.custom_typography) {
    const ct = customization.custom_typography;
    if (ct.heading_font?.family) headingFamily = ct.heading_font.family;
    if (ct.body_font?.family) bodyFamily = ct.body_font.family;
    if (ct.accent_font?.family) accentFamily = ct.accent_font.family;
  }

  // Extract heading font
  if (headingFamily) {
    fonts.push(headingFamily);
  }

  // Extract body font
  if (bodyFamily) {
    fonts.push(bodyFamily);
  }

  // Extract accent font if present
  const accentFont = accentFamily;
  if (accentFont) {
    fonts.push(accentFont);
  }

  // Return unique fonts
  return [...new Set(fonts)];
}

// =============================================================================
// Map URL Generator
// =============================================================================

export interface AddressWithCoordinates {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Generate Google Maps URL for an address.
 * Prioritizes coordinates over text address when available.
 */
export function generateMapUrl(address: AddressWithCoordinates | null | undefined): string | null {
  if (!address) return null;

  // Priority 1: Use coordinates if available and valid
  if (
    address.latitude !== undefined &&
    address.longitude !== undefined &&
    address.latitude >= -90 &&
    address.latitude <= 90 &&
    address.longitude >= -180 &&
    address.longitude <= 180
  ) {
    return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
  }

  // Priority 2: Use text address
  const addressParts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean);

  if (addressParts.length === 0) return null;

  const fullAddress = addressParts.join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
}

/**
 * Validate coordinate values.
 * Returns validation result with errors if any.
 */
export function validateCoordinates(
  latitude: number | undefined,
  longitude: number | undefined
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (latitude !== undefined) {
    if (latitude < -90 || latitude > 90) {
      errors.push('Latitude must be between -90 and 90');
    }
  }

  if (longitude !== undefined) {
    if (longitude < -180 || longitude > 180) {
      errors.push('Longitude must be between -180 and 180');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
