/**
 * Web Fonts Constants
 *
 * Curated list of web fonts for the Profile Editor typography system.
 * Includes font metadata, pairings, and loading configuration.
 *
 * Requirements: 6.1, 6.6, 6.12, 6.13
 */

import type { WebFont, FontPairing } from '@/types/profileEditor';

// =============================================================================
// Curated Web Fonts (20+ fonts)
// =============================================================================

export const WEB_FONTS: WebFont[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Sans-Serif Fonts
  // ─────────────────────────────────────────────────────────────────────────
  {
    family: 'Inter',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  },
  {
    family: 'Poppins',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap',
  },
  {
    family: 'Plus Jakarta Sans',
    category: 'sans-serif',
    weights: [400, 500, 600, 700, 800],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&display=swap',
  },
  {
    family: 'DM Sans',
    category: 'sans-serif',
    weights: [400, 500, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
  },
  {
    family: 'Space Grotesk',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap',
  },
  {
    family: 'Outfit',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap',
  },
  {
    family: 'Source Sans 3',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap',
  },
  {
    family: 'Manrope',
    category: 'sans-serif',
    weights: [400, 500, 600, 700, 800],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&display=swap',
  },
  {
    family: 'Nunito',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&display=swap',
  },
  {
    family: 'Raleway',
    category: 'sans-serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;600&display=swap',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Serif Fonts
  // ─────────────────────────────────────────────────────────────────────────
  {
    family: 'Playfair Display',
    category: 'serif',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&display=swap',
  },
  {
    family: 'Lora',
    category: 'serif',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600&display=swap',
  },
  {
    family: 'Cormorant Garamond',
    category: 'serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&display=swap',
  },
  {
    family: 'Crimson Pro',
    category: 'serif',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&display=swap',
  },
  {
    family: 'Libre Baskerville',
    category: 'serif',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
  },
  {
    family: 'Instrument Serif',
    category: 'serif',
    weights: [400],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap',
  },
  {
    family: 'EB Garamond',
    category: 'serif',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600&display=swap',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Display Fonts
  // ─────────────────────────────────────────────────────────────────────────
  {
    family: 'Fraunces',
    category: 'display',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&display=swap',
  },
  {
    family: 'Syne',
    category: 'display',
    weights: [400, 500, 600, 700, 800],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600&display=swap',
  },
  {
    family: 'Bebas Neue',
    category: 'display',
    weights: [400],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Handwriting Fonts
  // ─────────────────────────────────────────────────────────────────────────
  {
    family: 'Dancing Script',
    category: 'handwriting',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600&display=swap',
  },
  {
    family: 'Caveat',
    category: 'handwriting',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&display=swap',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Monospace Fonts
  // ─────────────────────────────────────────────────────────────────────────
  {
    family: 'JetBrains Mono',
    category: 'monospace',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal', 'italic'],
    preview_url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap',
  },
  {
    family: 'Fira Code',
    category: 'monospace',
    weights: [300, 400, 500, 600, 700],
    styles: ['normal'],
    preview_url: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap',
  },
];

// =============================================================================
// Font Pairings
// =============================================================================

export const FONT_PAIRINGS: FontPairing[] = [
  // Classic Combinations
  {
    heading_font: 'Playfair Display',
    body_font: 'Lora',
    reason: 'Elegant serif pairing perfect for luxury and wedding photography',
    compatibility_score: 95,
  },
  {
    heading_font: 'Playfair Display',
    body_font: 'Source Sans 3',
    reason: 'Classic serif heading with clean sans-serif body for readability',
    compatibility_score: 90,
  },
  {
    heading_font: 'Cormorant Garamond',
    body_font: 'Crimson Pro',
    reason: 'Refined editorial look with excellent readability',
    compatibility_score: 92,
  },

  // Modern Combinations
  {
    heading_font: 'Plus Jakarta Sans',
    body_font: 'Inter',
    reason: 'Contemporary tech-forward design with excellent legibility',
    compatibility_score: 94,
  },
  {
    heading_font: 'Space Grotesk',
    body_font: 'DM Sans',
    reason: 'Geometric modernity with approachable warmth',
    compatibility_score: 91,
  },
  {
    heading_font: 'Poppins',
    body_font: 'Poppins',
    reason: 'Versatile geometric sans-serif for cohesive modern look',
    compatibility_score: 88,
  },
  {
    heading_font: 'Manrope',
    body_font: 'Inter',
    reason: 'Professional and approachable SaaS-style combination',
    compatibility_score: 93,
  },

  // Creative Combinations
  {
    heading_font: 'Fraunces',
    body_font: 'DM Sans',
    reason: 'Distinctive display serif with clean body for creative portfolios',
    compatibility_score: 89,
  },
  {
    heading_font: 'Syne',
    body_font: 'Space Grotesk',
    reason: 'Bold artistic expression for avant-garde profiles',
    compatibility_score: 87,
  },
  {
    heading_font: 'Bebas Neue',
    body_font: 'Source Sans 3',
    reason: 'High-impact condensed headlines with readable body',
    compatibility_score: 86,
  },

  // Elegant Combinations
  {
    heading_font: 'EB Garamond',
    body_font: 'Libre Baskerville',
    reason: 'Timeless classical elegance for fine art photography',
    compatibility_score: 94,
  },
  {
    heading_font: 'Instrument Serif',
    body_font: 'Source Sans 3',
    reason: 'Refined editorial heading with versatile body font',
    compatibility_score: 90,
  },

  // Minimal Combinations
  {
    heading_font: 'Inter',
    body_font: 'Inter',
    reason: 'Clean, consistent minimal aesthetic',
    compatibility_score: 92,
  },
  {
    heading_font: 'Outfit',
    body_font: 'Nunito',
    reason: 'Friendly geometric sans-serif pairing',
    compatibility_score: 88,
  },
  {
    heading_font: 'Raleway',
    body_font: 'Nunito',
    reason: 'Elegant sans-serif combination with good personality',
    compatibility_score: 87,
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all web fonts
 */
export function getAllWebFonts(): WebFont[] {
  return WEB_FONTS;
}

/**
 * Get font by family name
 */
export function getFontByFamily(family: string): WebFont | undefined {
  return WEB_FONTS.find((f) => f.family === family);
}

/**
 * Get fonts by category
 */
export function getFontsByCategory(category: WebFont['category']): WebFont[] {
  return WEB_FONTS.filter((f) => f.category === category);
}

/**
 * Get all font pairings
 */
export function getAllFontPairings(): FontPairing[] {
  return FONT_PAIRINGS;
}

/**
 * Get pairings for a specific heading font
 */
export function getPairingsForHeadingFont(headingFont: string): FontPairing[] {
  return FONT_PAIRINGS.filter((p) => p.heading_font === headingFont);
}

/**
 * Get pairings for a specific body font
 */
export function getPairingsForBodyFont(bodyFont: string): FontPairing[] {
  return FONT_PAIRINGS.filter((p) => p.body_font === bodyFont);
}

/**
 * Get recommended pairings (sorted by compatibility score)
 */
export function getRecommendedPairings(limit = 5): FontPairing[] {
  return [...FONT_PAIRINGS]
    .sort((a, b) => b.compatibility_score - a.compatibility_score)
    .slice(0, limit);
}

/**
 * Search fonts by name
 */
export function searchFonts(query: string): WebFont[] {
  const lowerQuery = query.toLowerCase();
  return WEB_FONTS.filter((f) => f.family.toLowerCase().includes(lowerQuery));
}

/**
 * Build Google Fonts URL for a set of fonts
 */
export function buildGoogleFontsUrl(fonts: { family: string; weights: number[] }[]): string {
  const params = fonts
    .map((f) => {
      const weightsStr = f.weights.join(';');
      return `family=${encodeURIComponent(f.family)}:wght@${weightsStr}`;
    })
    .join('&');

  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * Get fallback fonts for a category
 */
export function getFallbackFonts(category: WebFont['category']): string[] {
  switch (category) {
    case 'serif':
      return ['Georgia', 'Times New Roman', 'serif'];
    case 'sans-serif':
      return ['system-ui', '-apple-system', 'sans-serif'];
    case 'display':
      return ['system-ui', 'sans-serif'];
    case 'handwriting':
      return ['cursive'];
    case 'monospace':
      return ['Consolas', 'Monaco', 'monospace'];
    default:
      return ['system-ui', 'sans-serif'];
  }
}

/**
 * Font categories with display names
 */
export const FONT_CATEGORIES: Record<WebFont['category'], { label: string; description: string }> = {
  'sans-serif': {
    label: 'Sans Serif',
    description: 'Clean, modern fonts without decorative strokes',
  },
  serif: {
    label: 'Serif',
    description: 'Classic fonts with decorative strokes for elegance',
  },
  display: {
    label: 'Display',
    description: 'Bold, expressive fonts for headlines and titles',
  },
  handwriting: {
    label: 'Handwriting',
    description: 'Casual, script-like fonts for personal touch',
  },
  monospace: {
    label: 'Monospace',
    description: 'Fixed-width fonts for technical content',
  },
};
