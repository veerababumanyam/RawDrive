/**
 * useRTL Hook - RTL locale detection and direction management
 *
 * Detects if the current locale requires right-to-left layout
 * and provides utilities for RTL-aware component development.
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US5 - RTL Layout for Urdu
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Languages that use right-to-left text direction
 */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'he', // Hebrew
  'fa', // Persian/Farsi
  'ur', // Urdu
  'ps', // Pashto
  'sd', // Sindhi
  'yi', // Yiddish
  'ku', // Kurdish (when written in Arabic script)
  'ug', // Uyghur
  'dv', // Divehi (Maldivian)
]);

/**
 * Text direction type
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * RTL hook return type
 */
export interface UseRTLResult {
  /** Whether current locale is RTL */
  isRTL: boolean;
  /** Current text direction ('ltr' or 'rtl') */
  direction: TextDirection;
  /** Current language code */
  language: string;
  /** Check if a specific language is RTL */
  isRTLLanguage: (lang: string) => boolean;
  /** Get appropriate CSS value for start/end positioning */
  getInlineStart: () => 'left' | 'right';
  /** Get appropriate CSS value for start/end positioning */
  getInlineEnd: () => 'left' | 'right';
  /** Get transform for icons that should flip in RTL */
  getFlipTransform: () => string;
}

/**
 * Hook for detecting and managing RTL layout direction
 *
 * @example
 * ```tsx
 * function GalleryNav() {
 *   const { isRTL, direction, getFlipTransform } = useRTL();
 *
 *   return (
 *     <nav dir={direction}>
 *       <button style={{ transform: getFlipTransform() }}>
 *         <ChevronLeftIcon />
 *       </button>
 *     </nav>
 *   );
 * }
 * ```
 */
export function useRTL(): UseRTLResult {
  const { i18n } = useTranslation();

  // Get current language, handling both 'ur' and 'ur-PK' formats
  const language = useMemo(() => {
    const lang = i18n.language || 'en';
    return lang.split('-')[0].toLowerCase();
  }, [i18n.language]);

  // Check if current language is RTL
  const isRTL = useMemo(() => RTL_LANGUAGES.has(language), [language]);

  // Direction value for dir attribute
  const direction: TextDirection = isRTL ? 'rtl' : 'ltr';

  // Update document direction when language changes
  useEffect(() => {
    const htmlElement = document.documentElement;

    // Set dir attribute on <html> element
    htmlElement.setAttribute('dir', direction);
    htmlElement.setAttribute('lang', language);

    // Also update CSS custom property for any components that need it
    htmlElement.style.setProperty('--text-direction', direction);

    return () => {
      // Cleanup not needed as we always want a direction set
    };
  }, [direction, language]);

  // Check if a specific language is RTL
  const isRTLLanguage = useCallback((lang: string): boolean => {
    const langCode = lang.split('-')[0].toLowerCase();
    return RTL_LANGUAGES.has(langCode);
  }, []);

  // Get inline-start position (left in LTR, right in RTL)
  const getInlineStart = useCallback((): 'left' | 'right' => {
    return isRTL ? 'right' : 'left';
  }, [isRTL]);

  // Get inline-end position (right in LTR, left in RTL)
  const getInlineEnd = useCallback((): 'left' | 'right' => {
    return isRTL ? 'left' : 'right';
  }, [isRTL]);

  // Get transform for icons that should flip in RTL (e.g., arrows)
  const getFlipTransform = useCallback((): string => {
    return isRTL ? 'scaleX(-1)' : 'none';
  }, [isRTL]);

  return {
    isRTL,
    direction,
    language,
    isRTLLanguage,
    getInlineStart,
    getInlineEnd,
    getFlipTransform,
  };
}

/**
 * Utility function to check if a language code is RTL
 * Can be used outside of React components
 */
export function isRTLLanguage(lang: string): boolean {
  const langCode = lang.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(langCode);
}

/**
 * Get text direction for a language code
 * Can be used outside of React components
 */
export function getTextDirection(lang: string): TextDirection {
  return isRTLLanguage(lang) ? 'rtl' : 'ltr';
}

export default useRTL;
