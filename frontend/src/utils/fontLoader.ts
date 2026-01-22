/**
 * Font Loading Utility
 *
 * Dynamically loads Google Fonts and custom fonts for invitations.
 * Manages font loading state and prevents duplicate loads.
 *
 * Feature: 019-invitation-indian-languages (Font Enhancement)
 */

import { INDIAN_LANGUAGE_FONTS, type FontOption } from '@/config/indianFonts';

// Track loaded fonts to prevent duplicate loading
const loadedFonts = new Set<string>();

/**
 * Load a Google Font by adding a link element to the document head.
 */
export function loadGoogleFont(fontName: string, url: string): void {
  const fontKey = `google:${fontName}`;

  if (loadedFonts.has(fontKey)) {
    return;
  }

  // Check if already exists in DOM
  const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
  if (existingLink) {
    loadedFonts.add(fontKey);
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute('data-font', fontName);
  document.head.appendChild(link);

  loadedFonts.add(fontKey);
}

/**
 * Load a custom font by creating a @font-face rule.
 */
export function loadCustomFont(
  fontId: string,
  fontFamily: string,
  fontUrl: string,
  format?: string
): void {
  const fontKey = `custom:${fontId}`;

  if (loadedFonts.has(fontKey)) {
    return;
  }

  // Check if style already exists
  const existingStyle = document.querySelector(`style[data-custom-font="${fontId}"]`);
  if (existingStyle) {
    loadedFonts.add(fontKey);
    return;
  }

  // Determine format from URL or use provided format
  let fontFormat = format;
  if (!fontFormat) {
    if (fontUrl.includes('.woff2')) fontFormat = 'woff2';
    else if (fontUrl.includes('.woff')) fontFormat = 'woff';
    else if (fontUrl.includes('.ttf')) fontFormat = 'truetype';
    else if (fontUrl.includes('.otf')) fontFormat = 'opentype';
    else fontFormat = 'woff2'; // default
  }

  const style = document.createElement('style');
  style.setAttribute('data-custom-font', fontId);
  style.textContent = `
    @font-face {
      font-family: 'CustomFont-${fontId}';
      src: url('${fontUrl}') format('${fontFormat}');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.appendChild(style);

  loadedFonts.add(fontKey);
}

/**
 * Find a Google Font option by its family name.
 */
export function findGoogleFontByFamily(family: string): FontOption | null {
  // Clean up the family name for comparison
  const cleanFamily = family.replace(/'/g, '').split(',')[0].trim();

  for (const lang of INDIAN_LANGUAGE_FONTS) {
    for (const font of lang.fonts) {
      const fontCleanFamily = font.family.replace(/'/g, '').split(',')[0].trim();
      if (fontCleanFamily === cleanFamily || font.name === cleanFamily) {
        return font;
      }
    }
  }

  return null;
}

/**
 * Load fonts for an invitation based on its customization.
 *
 * @param headingFont - The font family for headings
 * @param bodyFont - The font family for body text
 * @param customFonts - Optional array of custom font data
 */
export function loadInvitationFonts(
  headingFont?: string,
  bodyFont?: string,
  customFonts?: Array<{ font_id: string; family: string; url: string; format?: string }>
): void {
  // Load heading font
  if (headingFont) {
    // Check if it's a custom font reference
    const customHeading = customFonts?.find(f =>
      f.family.includes(`CustomFont-${f.font_id}`) &&
      headingFont.includes(f.font_id)
    );

    if (customHeading) {
      loadCustomFont(customHeading.font_id, customHeading.family, customHeading.url, customHeading.format);
    } else {
      // Try to find as Google Font
      const googleFont = findGoogleFontByFamily(headingFont);
      if (googleFont) {
        loadGoogleFont(googleFont.name, googleFont.googleFontsUrl);
      } else {
        // Try common fonts
        loadCommonFont(headingFont);
      }
    }
  }

  // Load body font
  if (bodyFont) {
    const customBody = customFonts?.find(f =>
      f.family.includes(`CustomFont-${f.font_id}`) &&
      bodyFont.includes(f.font_id)
    );

    if (customBody) {
      loadCustomFont(customBody.font_id, customBody.family, customBody.url, customBody.format);
    } else {
      const googleFont = findGoogleFontByFamily(bodyFont);
      if (googleFont) {
        loadGoogleFont(googleFont.name, googleFont.googleFontsUrl);
      } else {
        loadCommonFont(bodyFont);
      }
    }
  }
}

/**
 * Load common Google Fonts that might be used.
 */
function loadCommonFont(fontFamily: string): void {
  const cleanName = fontFamily.replace(/'/g, '').split(',')[0].trim();

  const commonFonts: Record<string, string> = {
    'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
    'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'Roboto': 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
    'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
    'Lato': 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
    'Montserrat': 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
    'Poppins': 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
    'Raleway': 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap',
    'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
    'Great Vibes': 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
    'Dancing Script': 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap',
    'Cinzel': 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap',
    'Tangerine': 'https://fonts.googleapis.com/css2?family=Tangerine:wght@400;700&display=swap',
    'Alex Brush': 'https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap',
  };

  const url = commonFonts[cleanName];
  if (url) {
    loadGoogleFont(cleanName, url);
  }
}

/**
 * Get the language-specific default fonts.
 */
export function getDefaultFontsForLanguage(langCode: string): { heading: string; body: string } {
  const langConfig = INDIAN_LANGUAGE_FONTS.find(l => l.code === langCode);

  if (langConfig && langConfig.fonts.length > 0) {
    // Get first display/traditional font for heading
    const headingFont = langConfig.fonts.find(f => f.category === 'display' || f.category === 'traditional')
      || langConfig.fonts[0];

    // Get first body font for body text
    const bodyFont = langConfig.fonts.find(f => f.category === 'body') || langConfig.fonts[0];

    return {
      heading: headingFont.family,
      body: bodyFont.family,
    };
  }

  // English/default fonts
  return {
    heading: "'Playfair Display', serif",
    body: "'Inter', sans-serif",
  };
}

/**
 * Preload fonts for a language to improve perceived performance.
 */
export function preloadLanguageFonts(langCode: string): void {
  const langConfig = INDIAN_LANGUAGE_FONTS.find(l => l.code === langCode);

  if (langConfig) {
    // Load at least the primary body and display fonts
    const bodyFont = langConfig.fonts.find(f => f.category === 'body');
    const displayFont = langConfig.fonts.find(f => f.category === 'display');

    if (bodyFont) {
      loadGoogleFont(bodyFont.name, bodyFont.googleFontsUrl);
    }
    if (displayFont) {
      loadGoogleFont(displayFont.name, displayFont.googleFontsUrl);
    }
  }
}

// ============================================================================
// Gallery Design Studio Font Loading (for cover photo typography)
// ============================================================================

import type { FontPairingId } from '../types/gallery-design';

const galleryFontsLoaded = new Set<string>();

/**
 * Add preconnect links for Google Fonts CDN
 * Initiates DNS/TLS connection early for better performance
 */
export function addGoogleFontsPreconnect(): void {
  if (galleryFontsLoaded.has('preconnect-added')) return;

  const link1 = document.createElement('link');
  link1.rel = 'preconnect';
  link1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(link1);

  const link2 = document.createElement('link');
  link2.rel = 'preconnect';
  link2.href = 'https://fonts.gstatic.com';
  link2.crossOrigin = 'anonymous';
  document.head.appendChild(link2);

  galleryFontsLoaded.add('preconnect-added');
}

/**
 * Load a gallery design font pairing
 *
 * @param pairingId - Font pairing identifier (from fontPairings.ts)
 * @returns Promise that resolves when fonts are loaded
 */
export async function loadGalleryFontPairing(pairingId: FontPairingId): Promise<void> {
  try {
    const { FONT_PAIRINGS } = await import('../constants/fontPairings');
    const pairing = FONT_PAIRINGS[pairingId];

    if (!pairing) {
      console.warn(`Font pairing "${pairingId}" not found`);
      return;
    }

    // System fonts load instantly
    if (pairing.heading.source === 'system' && pairing.body.source === 'system') {
      applyGalleryFontVariables(pairing);
      return;
    }

    // For Google Fonts
    addGoogleFontsPreconnect();

    const urls = new Set<string>();
    if (pairing.heading.source === 'google' && pairing.heading.googleFontUrl) {
      urls.add(pairing.heading.googleFontUrl);
    }
    if (pairing.body.source === 'google' && pairing.body.googleFontUrl) {
      urls.add(pairing.body.googleFontUrl);
    }

    if (urls.size === 0) {
      applyGalleryFontVariables(pairing);
      return;
    }

    // Load all URLs
    await Promise.all(Array.from(urls).map((url) => loadGoogleFontStylesheet(url)));
    galleryFontsLoaded.add(pairingId);
    applyGalleryFontVariables(pairing);
  } catch (e) {
    console.error(`Failed to load gallery font pairing "${pairingId}":`, e);
  }
}

/**
 * Load a Google Fonts stylesheet with font-display: swap
 */
async function loadGoogleFontStylesheet(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';

    // Ensure font-display: swap is set
    let finalUrl = url;
    if (!finalUrl.includes('display=')) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl += `${separator}display=swap`;
    }

    link.href = finalUrl;

    const timeout = setTimeout(() => {
      reject(new Error('Font loading timeout'));
    }, 10000);

    link.onload = () => {
      clearTimeout(timeout);
      resolve();
    };

    link.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load font stylesheet'));
    };

    document.head.appendChild(link);
  });
}

/**
 * Apply gallery font CSS variables
 */
export function applyGalleryFontVariables(pairing: any, element: HTMLElement = document.documentElement): void {
  element.style.setProperty('--font-heading', pairing.heading.family);
  element.style.setProperty('--font-body', pairing.body.family);
  element.style.setProperty('--heading-letter-spacing', pairing.typography.headingTracking);
  element.style.setProperty('--body-letter-spacing', pairing.typography.bodyTracking);
  element.style.setProperty('--heading-line-height', String(pairing.typography.headingLineHeight));
  element.style.setProperty('--body-line-height', String(pairing.typography.bodyLineHeight));
  element.setAttribute('data-font-pairing', pairing.id);
}

/**
 * Initialize gallery fonts with default pairing
 */
export async function initializeGalleryFonts(defaultPairingId: FontPairingId = 'modern'): Promise<void> {
  addGoogleFontsPreconnect();
  try {
    await loadGalleryFontPairing(defaultPairingId);
  } catch (e) {
    console.error(`Failed to initialize gallery fonts:`, e);
  }
}
