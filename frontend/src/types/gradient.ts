/**
 * Gradient Types
 * Type definitions for gallery gradient branding feature.
 */

import {
  ColorStop as SharedColorStop,
  GradientConfiguration as SharedGradientConfiguration,
  GradientType as SharedGradientType,
} from '@rawdrive/shared-types';
import type {
  ColorStop as ColorStopType,
  GradientConfiguration as GradientConfigurationType,
  GradientType as GradientTypeType,
} from '@rawdrive/shared-types';

/**
 * @deprecated Prefer importing directly from @rawdrive/shared-types.
 * These exports alias the shared package for backward compatibility.
 */
export type ColorStop = ColorStopType;
export type GradientConfiguration = GradientConfigurationType;
export const GradientType = SharedGradientType;
export type GradientType = GradientTypeType;

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
