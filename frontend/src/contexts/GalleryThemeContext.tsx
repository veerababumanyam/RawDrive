import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { GalleryDetailData } from '../types/gallery';
import type { GalleryTheme, GalleryThemeTokens } from '../types/gallery-design';
import { getTheme } from '../constants/galleryThemes';
import { gradientToCss, isValidGradientConfig } from '../utils/gradientUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryThemeContextValue {
  /** The gallery data driving theming */
  gallery: GalleryDetailData | null;
  /** Resolved gallery theme (from galleryThemes registry) */
  theme: GalleryTheme | null;
  /** CSS custom property map (gallery overrides > theme defaults > platform defaults) */
  effectiveColors: Record<string, string>;
  /** Whether dark mode is active */
  isDarkMode: boolean;
  /** Toggle dark mode on/off */
  toggleDarkMode: () => void;
  /** Active primary color (gallery > company > default) */
  activeColor: string;
  /** Active font family */
  fontFamily: string;
  /** Hero gradient CSS string */
  heroGradientStyle: string;
  /** Company profile from gallery data */
  companyProfile: GalleryDetailData['company_profile'] | null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GalleryThemeContext = createContext<GalleryThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface GalleryThemeProviderProps {
  gallery: GalleryDetailData;
  children: React.ReactNode;
}

/**
 * Provides gallery-specific theming via CSS custom properties and a context
 * value for child components. Resolves theme from the gallery's `theme` field,
 * merges primary_color / gradient_config overrides, and manages dark mode.
 */
export const GalleryThemeProvider: React.FC<GalleryThemeProviderProps> = ({
  gallery,
  children,
}) => {
  // Resolve dark mode: default from gallery theme_mode or system preference
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if ((gallery.theme as string) === 'midnight') return true;
    return prefersDark;
  });

  const toggleDarkMode = useCallback(() => setIsDarkMode((prev) => !prev), []);

  // Resolve the curated theme from the registry
  const resolvedTheme = useMemo(() => {
    // Map ThemeMode values to ThemeId where possible; fallback to 'brand'
    const themeMode = gallery.theme;
    if (!themeMode) return getTheme('brand');

    // ThemeMode on GalleryDetailData can be 'light' | 'dark' | 'system' or
    // a ThemeId string from the design-studio flow. Try to look up directly.
    try {
      return getTheme(themeMode as any);
    } catch {
      return getTheme('brand');
    }
  }, [gallery.theme]);

  // Compute the active token set (light or dark)
  const tokens: GalleryThemeTokens = useMemo(
    () => (isDarkMode ? resolvedTheme.dark : resolvedTheme.light),
    [isDarkMode, resolvedTheme],
  );

  // Active primary color: gallery override > company brand > theme accent
  const activeColor = useMemo(
    () =>
      gallery.primary_color ||
      gallery.company_profile?.brand_color ||
      tokens.accentPrimary,
    [gallery.primary_color, gallery.company_profile?.brand_color, tokens.accentPrimary],
  );

  const fontFamily = gallery.font_family || 'inherit';

  // Build the CSS custom property map
  const effectiveColors = useMemo<Record<string, string>>(() => {
    return {
      '--bg-primary': tokens.bgPrimary,
      '--bg-secondary': tokens.bgSecondary,
      '--bg-tertiary': tokens.bgTertiary,
      '--text-primary': tokens.textPrimary,
      '--text-secondary': tokens.textSecondary,
      '--text-tertiary': tokens.textTertiary,
      '--accent-primary': activeColor,
      '--accent-secondary': tokens.accentSecondary,
      '--border-default': tokens.borderDefault,
      '--border-hover': tokens.borderHover,
      '--primary-color': activeColor,
      '--gallery-font-family': fontFamily,
    };
  }, [tokens, activeColor, fontFamily]);

  // Hero gradient style
  const heroGradientStyle = useMemo(() => {
    if (gallery.gradient_config && isValidGradientConfig(gallery.gradient_config)) {
      return gradientToCss(gallery.gradient_config);
    }
    const color = gallery.company_profile?.brand_color || gallery.primary_color;
    return color
      ? `linear-gradient(135deg, ${color} 0%, #000000 100%)`
      : 'linear-gradient(135deg, #1f2937 0%, #000000 100%)';
  }, [gallery.gradient_config, gallery.primary_color, gallery.company_profile?.brand_color]);

  const value = useMemo<GalleryThemeContextValue>(
    () => ({
      gallery,
      theme: resolvedTheme,
      effectiveColors,
      isDarkMode,
      toggleDarkMode,
      activeColor,
      fontFamily,
      heroGradientStyle,
      companyProfile: gallery.company_profile ?? null,
    }),
    [
      gallery,
      resolvedTheme,
      effectiveColors,
      isDarkMode,
      toggleDarkMode,
      activeColor,
      fontFamily,
      heroGradientStyle,
    ],
  );

  return (
    <GalleryThemeContext.Provider value={value}>
      <div
        className={`min-h-screen flex flex-col ${isDarkMode ? 'dark bg-gray-950' : 'bg-white'}`}
        style={{
          ...effectiveColors,
          fontFamily: fontFamily !== 'inherit' ? `'${fontFamily}', sans-serif` : undefined,
        } as React.CSSProperties}
      >
        {children}
      </div>
    </GalleryThemeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Consume gallery theme context. Must be used within a GalleryThemeProvider.
 */
export const useGalleryTheme = (): GalleryThemeContextValue => {
  const ctx = useContext(GalleryThemeContext);
  if (!ctx) {
    throw new Error('useGalleryTheme must be used within a GalleryThemeProvider');
  }
  return ctx;
};
