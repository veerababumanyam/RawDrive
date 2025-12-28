/**
 * Gradient Types
 * Type definitions for gallery gradient branding feature.
 */

/**
 * Color stop within a gradient
 */
export interface ColorStop {
  /** Hex color code (#RRGGBB or #RGB) */
  color: string;
  /** Position as percentage (0-100) */
  position: number;
}

/**
 * Complete gradient configuration
 */
export interface GradientConfiguration {
  /** Gradient type (linear only for v1) */
  type: 'linear';
  /** Reference to predefined preset, null for custom */
  preset_id: string | null;
  /** Direction in degrees (0 = to top, 90 = to right, 180 = to bottom, 270 = to left) */
  direction: number;
  /** Array of color stops (2-5 stops) */
  colors: ColorStop[];
}

/**
 * Gradient preset categories
 */
export type GradientCategory = 'warm' | 'cool' | 'professional' | 'vibrant';

/**
 * Predefined gradient preset (static data)
 */
export interface GradientPreset {
  /** Unique preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Category for organization */
  category: GradientCategory;
  /** Full gradient configuration */
  config: GradientConfiguration;
}

/**
 * Contrast check result
 */
export interface ContrastCheckResult {
  /** Whether contrast meets WCAG AA requirements */
  passes: boolean;
  /** Minimum contrast ratio found */
  minRatio: number;
  /** Recommendations if contrast is poor */
  recommendation?: string;
}
