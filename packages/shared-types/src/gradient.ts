/**
 * A single color stop in a gradient
 */
export interface ColorStop {
  /** Hex color value (e.g., '#FF5733') */
  color: string;
  /** Position from 0 to 100 */
  position: number;
}

/**
 * Gradient type - currently only linear supported
 */
export const GradientType = {
  LINEAR: 'linear',
} as const;
export type GradientType = typeof GradientType[keyof typeof GradientType];

/**
 * Configuration for gradient styling
 */
export interface GradientConfiguration {
  /** Type of gradient */
  type: GradientType;
  /** Reference to preset or null for custom */
  preset_id: string | null;
  /** Direction in degrees (0-360) */
  direction: number;
  /** Color stops defining the gradient */
  colors: ColorStop[];
}
