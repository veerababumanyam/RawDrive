/**
 * Color Tools Utilities
 *
 * Provides color manipulation, extraction, harmony generation,
 * and WCAG contrast checking for the Profile Editor.
 *
 * Requirements: 5.2, 5.3, 5.5, 5.6, 5.10
 */

// =============================================================================
// Types
// =============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface ColorInfo {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  name?: string;
}

export interface ContrastResult {
  ratio: number;
  level: 'AAA' | 'AA' | 'A' | 'Fail';
  passesAA: boolean;
  passesAAA: boolean;
  passesAALarge: boolean;
  passesAAALarge: boolean;
}

export interface ColorHarmony {
  name: string;
  colors: string[];
  description: string;
}

export interface ExtractedColors {
  dominant: string;
  palette: string[];
  vibrant?: string;
  muted?: string;
  darkVibrant?: string;
  lightVibrant?: string;
}

// =============================================================================
// Color Conversion Functions
// =============================================================================

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Try 3-digit hex
    const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (!shortResult) return null;
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16),
    };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (c: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, c))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Convert hex to HSL
 */
export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb);
}

/**
 * Convert HSL to hex
 */
export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

// =============================================================================
// Color Manipulation Functions
// =============================================================================

/**
 * Lighten a color by percentage
 */
export function lighten(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  hsl.l = Math.min(100, hsl.l + amount);
  return hslToHex(hsl);
}

/**
 * Darken a color by percentage
 */
export function darken(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  hsl.l = Math.max(0, hsl.l - amount);
  return hslToHex(hsl);
}

/**
 * Saturate a color by percentage
 */
export function saturate(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  hsl.s = Math.min(100, hsl.s + amount);
  return hslToHex(hsl);
}

/**
 * Desaturate a color by percentage
 */
export function desaturate(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  hsl.s = Math.max(0, hsl.s - amount);
  return hslToHex(hsl);
}

/**
 * Adjust hue by degrees
 */
export function adjustHue(hex: string, degrees: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  hsl.h = (hsl.h + degrees + 360) % 360;
  return hslToHex(hsl);
}

/**
 * Mix two colors
 */
export function mix(hex1: string, hex2: string, weight = 50): string {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return hex1;

  const w = weight / 100;
  return rgbToHex({
    r: Math.round(rgb1.r * (1 - w) + rgb2.r * w),
    g: Math.round(rgb1.g * (1 - w) + rgb2.g * w),
    b: Math.round(rgb1.b * (1 - w) + rgb2.b * w),
  });
}

/**
 * Get the complement of a color
 */
export function complement(hex: string): string {
  return adjustHue(hex, 180);
}

/**
 * Invert a color
 */
export function invert(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex({
    r: 255 - rgb.r,
    g: 255 - rgb.g,
    b: 255 - rgb.b,
  });
}

// =============================================================================
// WCAG Contrast Functions
// =============================================================================

/**
 * Calculate relative luminance of a color
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function getContrastRatio(foreground: string, background: string): number {
  const lum1 = getLuminance(foreground);
  const lum2 = getLuminance(background);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check WCAG contrast requirements
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
export function checkContrast(foreground: string, background: string): ContrastResult {
  const ratio = getContrastRatio(foreground, background);

  return {
    ratio: Math.round(ratio * 100) / 100,
    level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'A' : 'Fail',
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
    passesAALarge: ratio >= 3,
    passesAAALarge: ratio >= 4.5,
  };
}

/**
 * Suggest a color that meets contrast requirements
 */
export function suggestAccessibleColor(
  baseColor: string,
  backgroundColor: string,
  targetRatio = 4.5
): string {
  const baseHsl = hexToHsl(baseColor);
  if (!baseHsl) return baseColor;

  const bgLuminance = getLuminance(backgroundColor);
  const needsDarker = bgLuminance > 0.5;

  // Try adjusting lightness until we meet the target ratio
  for (let i = 0; i <= 100; i++) {
    const testHsl = { ...baseHsl };
    testHsl.l = needsDarker ? Math.max(0, baseHsl.l - i) : Math.min(100, baseHsl.l + i);
    const testHex = hslToHex(testHsl);
    const ratio = getContrastRatio(testHex, backgroundColor);
    if (ratio >= targetRatio) {
      return testHex;
    }
  }

  // If we can't meet the target, return black or white
  return needsDarker ? '#000000' : '#FFFFFF';
}

// =============================================================================
// Color Harmony Functions
// =============================================================================

/**
 * Generate complementary colors
 */
export function getComplementary(hex: string): ColorHarmony {
  return {
    name: 'Complementary',
    colors: [hex, adjustHue(hex, 180)],
    description: 'Two colors opposite each other on the color wheel',
  };
}

/**
 * Generate analogous colors
 */
export function getAnalogous(hex: string, angle = 30): ColorHarmony {
  return {
    name: 'Analogous',
    colors: [adjustHue(hex, -angle), hex, adjustHue(hex, angle)],
    description: 'Colors next to each other on the color wheel',
  };
}

/**
 * Generate triadic colors
 */
export function getTriadic(hex: string): ColorHarmony {
  return {
    name: 'Triadic',
    colors: [hex, adjustHue(hex, 120), adjustHue(hex, 240)],
    description: 'Three colors equally spaced around the color wheel',
  };
}

/**
 * Generate split-complementary colors
 */
export function getSplitComplementary(hex: string, angle = 30): ColorHarmony {
  return {
    name: 'Split-Complementary',
    colors: [hex, adjustHue(hex, 180 - angle), adjustHue(hex, 180 + angle)],
    description: 'Base color plus two colors adjacent to its complement',
  };
}

/**
 * Generate tetradic (square) colors
 */
export function getTetradic(hex: string): ColorHarmony {
  return {
    name: 'Tetradic',
    colors: [hex, adjustHue(hex, 90), adjustHue(hex, 180), adjustHue(hex, 270)],
    description: 'Four colors evenly spaced around the color wheel',
  };
}

/**
 * Generate monochromatic palette
 */
export function getMonochromatic(hex: string, count = 5): ColorHarmony {
  const colors: string[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    const lightness = step * i;
    const hsl = hexToHsl(hex);
    if (hsl) {
      hsl.l = Math.round(lightness);
      colors.push(hslToHex(hsl));
    }
  }

  return {
    name: 'Monochromatic',
    colors,
    description: 'Different shades and tints of a single color',
  };
}

/**
 * Get all harmony options for a color
 */
export function getAllHarmonies(hex: string): ColorHarmony[] {
  return [
    getComplementary(hex),
    getAnalogous(hex),
    getTriadic(hex),
    getSplitComplementary(hex),
    getTetradic(hex),
    getMonochromatic(hex),
  ];
}

// =============================================================================
// Color Extraction Functions
// =============================================================================

/**
 * Extract dominant colors from an image using canvas
 */
export async function extractColorsFromImage(
  imageUrl: string,
  sampleSize = 10
): Promise<ExtractedColors> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Resize for performance
        const maxSize = 100;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Sample pixels
        const colorMap = new Map<string, number>();
        const step = Math.max(1, Math.floor(pixels.length / (4 * sampleSize * sampleSize)));

        for (let i = 0; i < pixels.length; i += step * 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          if (a < 128) continue; // Skip transparent pixels

          // Quantize to reduce noise
          const quantized = rgbToHex({
            r: Math.round(r / 16) * 16,
            g: Math.round(g / 16) * 16,
            b: Math.round(b / 16) * 16,
          });

          colorMap.set(quantized, (colorMap.get(quantized) || 0) + 1);
        }

        // Sort by frequency
        const sortedColors = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([color]) => color);

        // Find vibrant and muted colors
        let vibrant: string | undefined;
        let muted: string | undefined;
        let darkVibrant: string | undefined;
        let lightVibrant: string | undefined;

        for (const color of sortedColors.slice(0, 20)) {
          const hsl = hexToHsl(color);
          if (!hsl) continue;

          const isVibrant = hsl.s > 50;
          const isDark = hsl.l < 35;
          const isLight = hsl.l > 65;

          if (isVibrant && !vibrant) vibrant = color;
          if (!isVibrant && !muted) muted = color;
          if (isVibrant && isDark && !darkVibrant) darkVibrant = color;
          if (isVibrant && isLight && !lightVibrant) lightVibrant = color;
        }

        resolve({
          dominant: sortedColors[0] || '#000000',
          palette: sortedColors.slice(0, 6),
          vibrant,
          muted,
          darkVibrant,
          lightVibrant,
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };

    img.src = imageUrl;
  });
}

// =============================================================================
// Palette Generation Functions
// =============================================================================

/**
 * Generate a neutral color scale from a base color
 */
export function generateNeutralScale(baseColor: string, steps = 10): string[] {
  const hsl = hexToHsl(baseColor);
  if (!hsl) return [];

  const scale: string[] = [];
  const lightnessStep = 100 / (steps + 1);

  for (let i = 1; i <= steps; i++) {
    scale.push(hslToHex({ h: hsl.h, s: Math.max(5, hsl.s * 0.3), l: 100 - lightnessStep * i }));
  }

  return scale;
}

/**
 * Generate a palette from primary color
 */
export function generatePaletteFromPrimary(primaryHex: string): {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string[];
} {
  const primary = primaryHex;
  const secondary = desaturate(darken(primary, 10), 30);
  const accent = adjustHue(saturate(lighten(primary, 10), 20), 30);
  const neutral = generateNeutralScale(primary);

  return {
    primary,
    secondary,
    accent,
    neutral,
  };
}

// =============================================================================
// Export/Import Functions
// =============================================================================

/**
 * Export color palette as CSS variables
 */
export function exportPaletteAsCss(palette: {
  primary: string;
  secondary: string;
  accent: string;
  neutral?: string[];
}): string {
  let css = ':root {\n';
  css += `  --color-primary: ${palette.primary};\n`;
  css += `  --color-secondary: ${palette.secondary};\n`;
  css += `  --color-accent: ${palette.accent};\n`;

  if (palette.neutral) {
    palette.neutral.forEach((color, i) => {
      css += `  --color-neutral-${i * 100 || 50}: ${color};\n`;
    });
  }

  css += '}\n';
  return css;
}

/**
 * Export color palette as JSON
 */
export function exportPaletteAsJson(palette: {
  primary: string;
  secondary: string;
  accent: string;
  neutral?: string[];
}): string {
  return JSON.stringify(palette, null, 2);
}

/**
 * Import color palette from JSON
 */
export function importPaletteFromJson(json: string): {
  primary: string;
  secondary: string;
  accent: string;
  neutral?: string[];
} | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.primary || !parsed.secondary || !parsed.accent) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a string is a valid hex color
 */
export function isValidHex(hex: string): boolean {
  return /^#?([a-f\d]{3}|[a-f\d]{6})$/i.test(hex);
}

/**
 * Normalize hex color to 6-digit format with #
 */
export function normalizeHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb);
}

/**
 * Get color info (hex, rgb, hsl)
 */
export function getColorInfo(hex: string): ColorInfo | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  return {
    hex: normalizeHex(hex),
    rgb,
    hsl: rgbToHsl(rgb),
  };
}

/**
 * Check if a color is light or dark
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.5;
}

/**
 * Get readable text color for a background
 */
export function getReadableTextColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF';
}
