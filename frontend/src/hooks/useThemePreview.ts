/**
 * useThemePreview Hook
 *
 * React hook for managing theme application in the live preview.
 * Handles theme switching, variant toggling, reset, and duplication.
 *
 * Requirements: 3.7, 3.8, 4.9, 4.10
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { themeService } from '@/services/themeService';
import { themeCustomizationService } from '@/services/themeCustomizationService';
import { previewService, type PreviewRenderData } from '@/services/previewService';
import { fontService } from '@/services/fontService';
import type {
  Theme,
  ThemeVariant,
  ThemeCustomization,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
} from '@/types/profileEditor';
import { getDefaultTheme } from '@/constants/themes';

// =============================================================================
// Types
// =============================================================================

export interface UseThemePreviewOptions {
  /** Initial theme ID */
  initialThemeId?: string;
  /** Initial variant (light/dark) */
  initialVariant?: 'light' | 'dark';
  /** Debounce delay for theme changes (ms) */
  debounceMs?: number;
  /** Auto-load fonts when theme changes */
  autoLoadFonts?: boolean;
}

export interface UseThemePreviewReturn {
  // Theme state
  currentTheme: Theme | null;
  currentVariant: ThemeVariant | null;
  currentCustomization: ThemeCustomization | null;
  isDarkMode: boolean;

  // Preview data
  previewData: PreviewRenderData | null;
  cssVariables: Record<string, string>;
  isLoading: boolean;

  // Theme actions
  applyTheme: (themeId: string) => Promise<void>;
  resetTheme: () => void;
  duplicateTheme: () => ThemeCustomization;

  // Variant actions
  setVariant: (variant: 'light' | 'dark') => void;
  toggleDarkMode: () => void;

  // Customization actions
  updateColors: (colors: Partial<ColorPalette>) => void;
  updateTypography: (typography: Partial<TypographyConfig>) => void;
  updateLayout: (layout: Partial<LayoutPreferences>) => void;
  resetCustomizations: () => void;
  hasCustomizations: boolean;

  // CSS generation
  generateStylesheet: () => string;
  applyToDocument: () => void;
  removeFromDocument: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useThemePreview(options: UseThemePreviewOptions = {}): UseThemePreviewReturn {
  const {
    initialThemeId,
    initialVariant = 'light',
    debounceMs = 100,
    autoLoadFonts = true,
  } = options;

  // State
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
  const [currentVariant, setCurrentVariant] = useState<ThemeVariant | null>(null);
  const [currentCustomization, setCurrentCustomization] = useState<ThemeCustomization | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRenderData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize with theme
  useEffect(() => {
    const initTheme = initialThemeId
      ? themeService.getTheme(initialThemeId)
      : getDefaultTheme();

    if (initTheme) {
      setCurrentTheme(initTheme);
      const variant = initTheme.variants?.find((v) => v.name.toLowerCase() === initialVariant);
      setCurrentVariant(variant || initTheme.variants?.[0] || null);
    }
  }, [initialThemeId, initialVariant]);

  // Subscribe to theme service changes
  useEffect(() => {
    const unsubTheme = themeService.subscribe((theme) => {
      setCurrentTheme(theme);
      setCurrentCustomization(themeService.getCurrentCustomization());
    });

    const unsubCustomization = themeCustomizationService.subscribe((customization) => {
      setCurrentCustomization(customization);
    });

    return () => {
      unsubTheme();
      unsubCustomization();
    };
  }, []);

  // Subscribe to preview service
  useEffect(() => {
    const unsubscribe = previewService.subscribe((data) => {
      setPreviewData(data);
    });

    return unsubscribe;
  }, []);

  // Load fonts when theme changes
  useEffect(() => {
    if (!autoLoadFonts || !currentTheme) return;

    const typography = currentTheme.default_typography;
    const fonts = [
      { family: typography.heading_font.family, weights: typography.heading_font.weights },
      { family: typography.body_font.family, weights: typography.body_font.weights },
    ];

    if (typography.accent_font) {
      fonts.push({
        family: typography.accent_font.family,
        weights: typography.accent_font.weights,
      });
    }

    // Load fonts asynchronously
    fontService.loadFonts(fonts).catch((error) => {
      console.error('Failed to load fonts:', error);
    });
  }, [currentTheme, autoLoadFonts]);

  // Update preview when theme or customization changes
  useEffect(() => {
    if (!currentTheme) return;

    // Debounce updates
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      previewService.updateTheme(currentTheme);
      if (currentCustomization) {
        previewService.updateCustomization(currentCustomization);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentTheme, currentCustomization, debounceMs]);

  // Computed values
  const isDarkMode = useMemo(() => {
    return currentVariant?.name.toLowerCase() === 'dark';
  }, [currentVariant]);

  const hasCustomizations = useMemo(() => {
    return themeCustomizationService.hasChanges();
  }, [currentCustomization]);

  const cssVariables = useMemo(() => {
    if (!currentTheme) return {};

    const baseColors = currentTheme.base_colors;
    const customColors = currentCustomization?.custom_colors;
    const variantColors = currentVariant?.colors;

    const vars: Record<string, string> = {
      // Base colors
      '--theme-primary': customColors?.primary || baseColors.primary,
      '--theme-secondary': customColors?.secondary || baseColors.secondary,
      '--theme-accent': customColors?.accent || baseColors.accent,

      // Variant-specific colors
      '--theme-background': variantColors?.background || '#FFFFFF',
      '--theme-surface': variantColors?.surface || '#FAFAFA',
      '--theme-text-primary': variantColors?.text_primary || '#1A1A1A',
      '--theme-text-secondary': variantColors?.text_secondary || '#6B7280',
    };

    // Glass effect colors
    if (variantColors?.glass) {
      vars['--theme-glass'] = variantColors.glass;
    }
    if (variantColors?.glass_border) {
      vars['--theme-glass-border'] = variantColors.glass_border;
    }

    // Typography
    const typography = themeCustomizationService.getEffectiveTypography();
    vars['--theme-font-heading'] = fontService.getFontFamilyValue(typography.heading_font.family);
    vars['--theme-font-body'] = fontService.getFontFamilyValue(typography.body_font.family);
    if (typography.accent_font) {
      vars['--theme-font-accent'] = fontService.getFontFamilyValue(typography.accent_font.family);
    }

    // Layout
    const layout = themeCustomizationService.getEffectiveLayout();
    vars['--theme-spacing'] =
      layout.spacing === 'compact' ? '0.75rem' :
      layout.spacing === 'spacious' ? '1.5rem' : '1rem';

    // Neutral scale
    const neutralScale = customColors?.neutral || baseColors.neutral;
    if (neutralScale) {
      neutralScale.forEach((color, i) => {
        vars[`--theme-neutral-${i * 100 || 50}`] = color;
      });
    }

    return vars;
  }, [currentTheme, currentVariant, currentCustomization]);

  // Theme actions
  const applyTheme = useCallback(async (themeId: string) => {
    setIsLoading(true);
    try {
      const result = themeService.applyTheme(themeId);
      if (result.success && result.theme) {
        setCurrentTheme(result.theme);
        // Reset to light variant
        const lightVariant = result.theme.variants?.find((v) => v.name.toLowerCase() === 'light');
        setCurrentVariant(lightVariant || result.theme.variants?.[0] || null);
        // Reset customizations
        themeCustomizationService.resetCustomization();
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetTheme = useCallback(() => {
    const defaultTheme = getDefaultTheme();
    themeService.applyTheme(defaultTheme.theme_id);
    themeCustomizationService.resetCustomization();
    const lightVariant = defaultTheme.variants?.find((v) => v.name.toLowerCase() === 'light');
    setCurrentVariant(lightVariant || defaultTheme.variants?.[0] || null);
  }, []);

  const duplicateTheme = useCallback((): ThemeCustomization => {
    if (!currentTheme) {
      throw new Error('No theme to duplicate');
    }

    // Create customization with all current theme values
    const customization = themeCustomizationService.updateCustomization({
      name: `${currentTheme.name} (Copy)`,
      custom_colors: { ...currentTheme.base_colors },
      custom_typography: { ...currentTheme.default_typography },
      custom_layout: { ...currentTheme.layout_config },
      is_preset: false,
    });

    return customization;
  }, [currentTheme]);

  // Variant actions
  const setVariant = useCallback((variantName: 'light' | 'dark') => {
    if (!currentTheme?.variants) return;

    const variant = currentTheme.variants.find(
      (v) => v.name.toLowerCase() === variantName.toLowerCase()
    );
    if (variant) {
      setCurrentVariant(variant);
    }
  }, [currentTheme]);

  const toggleDarkMode = useCallback(() => {
    setVariant(isDarkMode ? 'light' : 'dark');
  }, [isDarkMode, setVariant]);

  // Customization actions
  const updateColors = useCallback((colors: Partial<ColorPalette>) => {
    themeCustomizationService.updateColors(colors);
  }, []);

  const updateTypography = useCallback((typography: Partial<TypographyConfig>) => {
    themeCustomizationService.updateTypography(typography);
  }, []);

  const updateLayout = useCallback((layout: Partial<LayoutPreferences>) => {
    themeCustomizationService.updateLayout(layout);
  }, []);

  const resetCustomizations = useCallback(() => {
    themeCustomizationService.resetCustomization();
  }, []);

  // CSS generation
  const generateStylesheet = useCallback((): string => {
    const lines: string[] = ['/* Theme Styles - Generated by RawDrive Profile Editor */'];
    lines.push(':root {');

    for (const [key, value] of Object.entries(cssVariables)) {
      lines.push(`  ${key}: ${value};`);
    }

    lines.push('}');

    // Dark mode overrides if applicable
    if (currentTheme?.supports_dark_mode && currentTheme.variants) {
      const darkVariant = currentTheme.variants.find((v) => v.name.toLowerCase() === 'dark');
      if (darkVariant) {
        lines.push('');
        lines.push('[data-theme="dark"] {');
        lines.push(`  --theme-background: ${darkVariant.colors.background};`);
        lines.push(`  --theme-surface: ${darkVariant.colors.surface};`);
        lines.push(`  --theme-text-primary: ${darkVariant.colors.text_primary};`);
        lines.push(`  --theme-text-secondary: ${darkVariant.colors.text_secondary};`);
        if (darkVariant.colors.glass) {
          lines.push(`  --theme-glass: ${darkVariant.colors.glass};`);
        }
        if (darkVariant.colors.glass_border) {
          lines.push(`  --theme-glass-border: ${darkVariant.colors.glass_border};`);
        }
        lines.push('}');
      }
    }

    return lines.join('\n');
  }, [cssVariables, currentTheme]);

  const applyToDocument = useCallback(() => {
    // Remove existing style element
    if (styleElementRef.current) {
      styleElementRef.current.remove();
    }

    // Create and insert new style element
    const style = document.createElement('style');
    style.id = 'rawdrive-theme-styles';
    style.textContent = generateStylesheet();
    document.head.appendChild(style);
    styleElementRef.current = style;

    // Set theme attribute for variant
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [generateStylesheet, isDarkMode]);

  const removeFromDocument = useCallback(() => {
    if (styleElementRef.current) {
      styleElementRef.current.remove();
      styleElementRef.current = null;
    }
    document.documentElement.removeAttribute('data-theme');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    // Theme state
    currentTheme,
    currentVariant,
    currentCustomization,
    isDarkMode,

    // Preview data
    previewData,
    cssVariables,
    isLoading,

    // Theme actions
    applyTheme,
    resetTheme,
    duplicateTheme,

    // Variant actions
    setVariant,
    toggleDarkMode,

    // Customization actions
    updateColors,
    updateTypography,
    updateLayout,
    resetCustomizations,
    hasCustomizations,

    // CSS generation
    generateStylesheet,
    applyToDocument,
    removeFromDocument,
  };
}

export default useThemePreview;
