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
