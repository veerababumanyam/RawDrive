/**
 * UnifiedThemeEngine
 *
 * Single source of truth for profile theme resolution and CSS custom property generation.
 * Replaces legacy ProfileThemeEngine.ts, themeTransformer.ts, and themeService.ts.
 *
 * Responsibilities:
 * - Resolve legacy theme IDs to PREBUILT equivalents
 * - Generate CSS custom property tokens from any theme
 * - Apply/remove theme tokens on DOM elements
 */

import { getThemeById, getDefaultTheme } from '@/constants/themes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  '--theme-bg': string;
  '--theme-surface': string;
  '--theme-text': string;
  '--theme-text-secondary': string;
  '--theme-accent': string;
  '--theme-primary': string;
  '--theme-border': string;
  '--theme-font-heading': string;
  '--theme-font-body': string;
  '--theme-radius': string;
  '--theme-shadow': string;
  '--theme-gradient': string;
}

// All CSS variable keys used by the theme engine
const THEME_CSS_KEYS: (keyof ThemeTokens)[] = [
  '--theme-bg',
  '--theme-surface',
  '--theme-text',
  '--theme-text-secondary',
  '--theme-accent',
  '--theme-primary',
  '--theme-border',
  '--theme-font-heading',
  '--theme-font-body',
  '--theme-radius',
  '--theme-shadow',
  '--theme-gradient',
];

// ---------------------------------------------------------------------------
// Legacy theme ID mapping
// ---------------------------------------------------------------------------

/**
 * Maps old legacy theme IDs to the closest matching PREBUILT theme ID.
 *
 * minimal  -> theme-clean-slate  (clean, white-space focused)
 * dark     -> theme-midnight-noir (deep dark with blue undertones)
 * pastel   -> theme-lavender-haze (soft purple, dreamy)
 * bold     -> theme-vivid-impact  (vibrant, energetic)
 * cinematic -> theme-golden-hour  (warm, cinematic tones with serif typography)
 */
export const LEGACY_TO_PREBUILT_MAP: Record<string, string> = {
  minimal: 'theme-clean-slate',
  dark: 'theme-midnight-noir',
  pastel: 'theme-lavender-haze',
  bold: 'theme-vivid-impact',
  cinematic: 'theme-golden-hour',
};

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a raw theme ID (possibly legacy or falsy) to a valid PREBUILT theme ID.
 */
export function resolveThemeId(rawId: string | undefined | null): string {
  if (!rawId) {
    return 'theme-clean-slate';
  }

  if (rawId in LEGACY_TO_PREBUILT_MAP) {
    return LEGACY_TO_PREBUILT_MAP[rawId];
  }

  return rawId;
}

/**
 * Build a font-family CSS value with fallback stack.
 */
function buildFontStack(font: { family: string; fallback?: string[] }): string {
  const fallbacks = font.fallback?.length ? font.fallback.join(', ') : 'system-ui, sans-serif';
  return `'${font.family}', ${fallbacks}`;
}

/**
 * Resolve a theme ID + dark-mode preference into a complete set of CSS custom property tokens.
 */
export function resolveThemeTokens(themeId: string, prefersDark: boolean): ThemeTokens {
  const resolvedId = resolveThemeId(themeId);
  const theme = getThemeById(resolvedId) ?? getDefaultTheme();

  // Pick variant based on dark-mode preference
  const darkVariant = theme.variants?.find((v) => v.name === 'Dark');
  const lightVariant = theme.variants?.find((v) => v.name === 'Light');
  const variant = prefersDark ? (darkVariant ?? lightVariant) : (lightVariant ?? darkVariant);
  const colors = variant?.colors ?? {
    background: '#FFFFFF',
    surface: '#FAFAFA',
    text_primary: '#1A1A1A',
    text_secondary: '#6B7280',
  };

  // Build gradient string from first gradient definition, or fall back to accent->primary
  const gradientDef = theme.base_colors.gradients?.[0];
  const gradient = gradientDef
    ? `linear-gradient(${gradientDef.direction ?? '135deg'}, ${gradientDef.stops.join(', ')})`
    : `linear-gradient(135deg, ${theme.base_colors.accent}, ${theme.base_colors.primary})`;

  // Border color: use glass_border if available (for dark variants), else derive from neutral palette
  const borderColor =
    (colors as Record<string, string>).glass_border ??
    theme.base_colors.neutral?.[4] ??
    '#E5E5E5';

  // Radius based on layout config spacing
  const radiusMap: Record<string, string> = {
    compact: '0.5rem',
    normal: '0.75rem',
    spacious: '1rem',
  };
  const radius = radiusMap[theme.layout_config.spacing] ?? '0.75rem';

  // Shadow based on hero style
  const shadowMap: Record<string, string> = {
    card: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
    'full-bleed': '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
  };
  const shadow = shadowMap[theme.layout_config.hero_style] ?? shadowMap.card;

  return {
    '--theme-bg': colors.background,
    '--theme-surface': colors.surface,
    '--theme-text': colors.text_primary,
    '--theme-text-secondary': colors.text_secondary,
    '--theme-accent': theme.base_colors.accent,
    '--theme-primary': theme.base_colors.primary,
    '--theme-border': borderColor,
    '--theme-font-heading': buildFontStack(theme.default_typography.heading_font),
    '--theme-font-body': buildFontStack(theme.default_typography.body_font),
    '--theme-radius': radius,
    '--theme-shadow': shadow,
    '--theme-gradient': gradient,
  };
}

// ---------------------------------------------------------------------------
// DOM application
// ---------------------------------------------------------------------------

/**
 * Apply theme tokens as CSS custom properties on a DOM element.
 * Defaults to document.documentElement if no element is provided.
 */
export function applyThemeToRoot(tokens: ThemeTokens, element?: HTMLElement): void {
  const el = element ?? document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Remove all theme CSS custom properties from a DOM element.
 * Call on unmount to prevent styles leaking into other pages.
 */
export function removeThemeFromRoot(element?: HTMLElement): void {
  const el = element ?? document.documentElement;
  for (const key of THEME_CSS_KEYS) {
    el.style.removeProperty(key);
  }
}
