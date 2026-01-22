/**
 * Gallery Design Studio Typography Pairings
 *
 * 6 professional font combinations for gallery covers:
 * - 2 System Font Pairings (zero external dependencies, instant rendering)
 * - 4 Google Fonts Pairings (premium, curated combinations)
 *
 * Aligns with backend FontPairingEnum in:
 * - services/gallery-service/src/schemas/gallery_design.py
 */

import { FontPairing, FontPairingId } from '../types/gallery-design';

/**
 * SANS - Clean System Fonts
 * No external dependencies - uses platform defaults
 * Best for: Modern, minimalist galleries
 */
const SANS_PAIRING: FontPairing = {
  id: 'sans',
  name: 'Sans',
  description: 'Clean and contemporary with system fonts',
  heading: {
    family:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    weights: [600, 700, 800],
    source: 'system',
    fallback: ['Helvetica', 'Arial', 'sans-serif'],
  },
  body: {
    family:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    weights: [400, 500, 600],
    source: 'system',
    fallback: ['Helvetica', 'Arial', 'sans-serif'],
  },
  typography: {
    headingTracking: '-0.02em',
    bodyTracking: '0em',
    headingLineHeight: 1.2,
    bodyLineHeight: 1.6,
  },
};

/**
 * SERIF - Elegant System Fonts
 * No external dependencies - uses platform defaults
 * Best for: Classic, sophisticated galleries
 */
const SERIF_PAIRING: FontPairing = {
  id: 'serif',
  name: 'Serif',
  description: 'Timeless elegance with classic serifs',
  heading: {
    family: 'Georgia, "Times New Roman", Times, serif',
    weights: [600, 700],
    source: 'system',
    fallback: ['Times New Roman', 'serif'],
  },
  body: {
    family: 'Georgia, "Times New Roman", Times, serif',
    weights: [400, 500, 600],
    source: 'system',
    fallback: ['Times New Roman', 'serif'],
  },
  typography: {
    headingTracking: '0em',
    bodyTracking: '0.01em',
    headingLineHeight: 1.3,
    bodyLineHeight: 1.7,
  },
};

/**
 * MODERN - Premium Google Fonts (Outfit + DM Sans)
 * Outfit: Geometric sans-serif with contemporary feel
 * DM Sans: Clean, friendly body text
 * Best for: Fashion, lifestyle, creative studios
 */
const MODERN_PAIRING: FontPairing = {
  id: 'modern',
  name: 'Modern',
  description: 'Contemporary and bold with Google Fonts',
  heading: {
    family: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    weights: [600, 700, 800],
    source: 'google',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&display=swap',
    fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
  },
  body: {
    family: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    weights: [400, 500, 600],
    source: 'google',
    googleFontUrl:
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
    fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
  },
  typography: {
    headingTracking: '-0.01em',
    bodyTracking: '0em',
    headingLineHeight: 1.2,
    bodyLineHeight: 1.6,
  },
};

/**
 * TIMELESS - Premium Google Fonts (Playfair Display + Source Serif Pro)
 * Playfair Display: High-contrast serif headlines
 * Source Serif Pro: Professional body serif
 * Best for: Fine art, luxury brands, editorial studios
 */
const TIMELESS_PAIRING: FontPairing = {
  id: 'timeless',
  name: 'Timeless',
  description: 'Sophisticated with heritage serif typography',
  heading: {
    family: '"Playfair Display", Georgia, "Times New Roman", serif',
    weights: [600, 700, 800],
    source: 'google',
    googleFontUrl:
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap',
    fallback: ['Georgia', 'Times New Roman', 'serif'],
  },
  body: {
    family: '"Source Serif Pro", Georgia, "Times New Roman", serif',
    weights: [400, 600],
    source: 'google',
    googleFontUrl:
      'https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600&display=swap',
    fallback: ['Georgia', 'Times New Roman', 'serif'],
  },
  typography: {
    headingTracking: '0.02em',
    bodyTracking: '0.01em',
    headingLineHeight: 1.25,
    bodyLineHeight: 1.7,
  },
};

/**
 * BOLD - Premium Google Fonts (Fraunces + IBM Plex Sans)
 * Fraunces: High-personality variable serif
 * IBM Plex Sans: Technical, modern sans-serif
 * Best for: Bold, experimental, tech-forward studios
 */
const BOLD_PAIRING: FontPairing = {
  id: 'bold',
  name: 'Bold',
  description: 'Daring and distinctive with personality fonts',
  heading: {
    family: 'Fraunces, Georgia, "Times New Roman", serif',
    weights: [600, 700, 800],
    source: 'google',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;800&display=swap',
    fallback: ['Georgia', 'serif'],
  },
  body: {
    family: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    weights: [400, 500, 600],
    source: 'google',
    googleFontUrl:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap',
    fallback: ['-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
  },
  typography: {
    headingTracking: '-0.01em',
    bodyTracking: '0em',
    headingLineHeight: 1.15,
    bodyLineHeight: 1.6,
  },
};

/**
 * SUBTLE - Premium Google Fonts (Inter + Lora)
 * Inter: Contemporary, highly readable
 * Lora: Warm, expressive serif
 * Best for: Lifestyle, editorial, humanistic studios
 */
const SUBTLE_PAIRING: FontPairing = {
  id: 'subtle',
  name: 'Subtle',
  description: 'Harmonious blend of warmth and clarity',
  heading: {
    family: 'Lora, Georgia, "Times New Roman", serif',
    weights: [600, 700],
    source: 'google',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Lora:wght@600;700&display=swap',
    fallback: ['Georgia', 'serif'],
  },
  body: {
    family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    weights: [400, 500, 600],
    source: 'google',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
    fallback: ['-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
  },
  typography: {
    headingTracking: '0em',
    bodyTracking: '0em',
    headingLineHeight: 1.3,
    bodyLineHeight: 1.6,
  },
};

/**
 * Complete registry of all font pairings
 */
export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  sans: SANS_PAIRING,
  serif: SERIF_PAIRING,
  modern: MODERN_PAIRING,
  timeless: TIMELESS_PAIRING,
  bold: BOLD_PAIRING,
  subtle: SUBTLE_PAIRING,
};

/**
 * Get a specific font pairing by ID
 */
export const getFontPairing = (id: FontPairingId): FontPairing => {
  const pairing = FONT_PAIRINGS[id];
  if (!pairing) {
    throw new Error(`Font pairing "${id}" not found`);
  }
  return pairing;
};

/**
 * Get all available font pairing IDs
 */
export const getAllFontPairingIds = (): FontPairingId[] => {
  return Object.keys(FONT_PAIRINGS) as FontPairingId[];
};

/**
 * Get all font pairings
 */
export const getAllFontPairings = (): FontPairing[] => {
  return Object.values(FONT_PAIRINGS);
};

/**
 * Get system font pairings only (no external dependencies)
 */
export const getSystemFontPairings = (): FontPairing[] => {
  return getAllFontPairings().filter((pairing) => pairing.heading.source === 'system');
};

/**
 * Get Google Fonts pairings only
 */
export const getGoogleFontPairings = (): FontPairing[] => {
  return getAllFontPairings().filter((pairing) => pairing.heading.source === 'google');
};

/**
 * Check if a font pairing ID is valid
 */
export const isValidFontPairingId = (id: unknown): id is FontPairingId => {
  return typeof id === 'string' && id in FONT_PAIRINGS;
};

/**
 * CSS declaration for injecting font variables
 * Usage: Call in useEffect when font pairing changes
 */
export const getFontCSSVariables = (pairing: FontPairing): Record<string, string> => {
  return {
    '--font-heading': pairing.heading.family,
    '--font-body': pairing.body.family,
    '--heading-letter-spacing': pairing.typography.headingTracking,
    '--body-letter-spacing': pairing.typography.bodyTracking,
    '--heading-line-height': String(pairing.typography.headingLineHeight),
    '--body-line-height': String(pairing.typography.bodyLineHeight),
  };
};
