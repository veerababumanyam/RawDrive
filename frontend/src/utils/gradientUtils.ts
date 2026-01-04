/**
 * Gradient Utility Functions
 * CSS generation and contrast checking for gallery gradient branding.
 */

import type { GradientConfiguration, ContrastCheckResult, ColorStop } from '../types/gradient';

/**
 * Convert GradientConfiguration to CSS gradient string.
 *
 * @param config - The gradient configuration object
 * @returns CSS linear-gradient string ready for use in styles
 *
 * @example
 * const css = gradientToCss(gallery.gradient_config);
 * // Returns: "linear-gradient(135deg, #FF6B6B 0%, #FFA502 100%)"
 */
export function gradientToCss(config: GradientConfiguration): string {
  if (!config || !config.colors || config.colors.length < 2) {
    return 'none';
  }

  const colorStops = config.colors
    .sort((a: ColorStop, b: ColorStop) => a.position - b.position)
    .map((stop: ColorStop) => `${stop.color} ${stop.position}%`)
    .join(', ');

  return `linear-gradient(${config.direction}deg, ${colorStops})`;
}

/**
 * Parse a hex color to RGB components.
 *
 * @param hex - Hex color string (#RGB or #RRGGBB)
 * @returns Object with r, g, b values (0-255)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Handle 3-digit hex
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;

  const num = parseInt(fullHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculate relative luminance of a color per WCAG 2.1.
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * @param hex - Hex color string
 * @returns Relative luminance (0-1)
 */
function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1.
 * Formula: (L1 + 0.05) / (L2 + 0.05)
 *
 * @param color1 - First hex color
 * @param color2 - Second hex color
 * @returns Contrast ratio (1-21)
 */
export function calculateContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a gradient meets WCAG contrast requirements for text.
 *
 * Checks contrast at each color stop against the text color.
 * WCAG AA requires:
 * - 4.5:1 for normal text
 * - 3:1 for large text (18pt+ or 14pt+ bold)
 *
 * @param config - The gradient configuration
 * @param textColor - Text color to check against (default: white)
 * @returns ContrastCheckResult with pass/fail and minimum ratio
 *
 * @example
 * const result = checkGradientContrast(gradient);
 * if (!result.passes) {
 *   showWarning(`Low contrast: ${result.minRatio.toFixed(1)}:1`);
 * }
 */
export function checkGradientContrast(
  config: GradientConfiguration,
  textColor: string = '#FFFFFF'
): ContrastCheckResult {
  if (!config || !config.colors || config.colors.length === 0) {
    return { passes: true, minRatio: 21 };
  }

  // Calculate contrast at each color stop
  const ratios = config.colors.map((stop: ColorStop) =>
    calculateContrastRatio(stop.color, textColor)
  );

  const minRatio = Math.min(...ratios);
  const passes = minRatio >= 4.5; // WCAG AA for normal text

  let recommendation: string | undefined;
  if (!passes) {
    if (minRatio >= 3) {
      recommendation = 'Works for large text only (18pt+)';
    } else if (minRatio >= 2) {
      recommendation = 'Consider adding a text shadow or overlay';
    } else {
      recommendation = 'Text will be very hard to read';
    }
  }

  return {
    passes,
    minRatio,
    recommendation,
  };
}

/**
 * Generate a darker shade of a color for text shadow.
 *
 * @param hex - Hex color string
 * @param factor - Darkening factor (0-1, default 0.3)
 * @returns Darker hex color
 */
export function darkenColor(hex: string, factor: number = 0.3): string {
  const { r, g, b } = hexToRgb(hex);

  const darken = (c: number) => Math.round(c * (1 - factor));

  const dr = darken(r).toString(16).padStart(2, '0');
  const dg = darken(g).toString(16).padStart(2, '0');
  const db = darken(b).toString(16).padStart(2, '0');

  return `#${dr}${dg}${db}`.toUpperCase();
}

/**
 * Check if a gradient has a valid structure.
 *
 * @param config - Object to validate
 * @returns True if the config is a valid GradientConfiguration
 */
export function isValidGradientConfig(
  config: unknown
): config is GradientConfiguration {
  if (!config || typeof config !== 'object') return false;

  const g = config as GradientConfiguration;

  return (
    g.type === 'linear' &&
    typeof g.direction === 'number' &&
    g.direction >= 0 &&
    g.direction < 360 &&
    Array.isArray(g.colors) &&
    g.colors.length >= 2 &&
    g.colors.length <= 5 &&
    g.colors.every(
      (stop: ColorStop) =>
        typeof stop.color === 'string' &&
        /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(stop.color) &&
        typeof stop.position === 'number' &&
        stop.position >= 0 &&
        stop.position <= 100
    )
  );
}

/**
 * Create a default gradient configuration from a single color.
 *
 * @param color - Hex color string
 * @param direction - Gradient direction in degrees (default 135)
 * @returns GradientConfiguration with solid color
 */
export function createSolidGradient(
  color: string,
  direction: number = 135
): GradientConfiguration {
  return {
    type: 'linear',
    preset_id: null,
    direction,
    colors: [
      { color, position: 0 },
      { color, position: 100 },
    ],
  };
}
