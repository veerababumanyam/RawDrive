import { useState, useEffect, useCallback } from 'react';

/**
 * useGradientTheme Hook
 *
 * Manages vibrant iOS 18-inspired gradient mesh themes
 * Features:
 * - 8 pre-built vibrant themes (4 light + 4 dark)
 * - LocalStorage persistence
 * - Dynamic CSS variable updates
 * - Custom theme support
 * - Full dark/light mode integration
 * - WCAG AA compliance with glass panels for content
 */

export interface GradientTheme {
  id: string;
  name: string;
  description: string;
  /** Light mode color stops (5 colors) */
  lightGradient: string[];
  /** Dark mode color stops (5 colors) */
  darkGradient: string[];
  /** CSS utility class name for light mode */
  lightClass: string;
  /** CSS utility class name for dark mode */
  darkClass: string;
  /** Category: 'light' or 'dark' primary theme */
  category: 'light' | 'dark';
  /** Preview gradient for UI display */
  preview: string;
}

/** Pre-built iOS 18-inspired gradient themes */
export const GRADIENT_THEMES: GradientTheme[] = [
  {
    id: 'radiant-sunset',
    name: 'Radiant Sunset',
    description: 'Vibrant coral to sunny yellow (iOS 18 default)',
    lightGradient: ['#FF6B6B', '#FF8E53', '#C77DFF', '#4ECDC4', '#FFE66D'],
    darkGradient: ['#6A4C93', '#A64AC9', '#2E5EAA', '#17BEBB', '#1B4965'],
    lightClass: 'mesh-gradient-light',
    darkClass: 'mesh-gradient-dark',
    category: 'light',
    preview: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 25%, #C77DFF 50%, #4ECDC4 75%, #FFE66D 100%)',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Cyan to indigo waves',
    lightGradient: ['#22D3EE', '#14B8A6', '#3B82F6', '#6366F1', '#8B5CF6'],
    darkGradient: ['#155E75', '#0D9488', '#1E40AF', '#4338CA', '#5B21B6'],
    lightClass: 'mesh-gradient-ocean',
    darkClass: 'mesh-gradient-cosmic',
    category: 'light',
    preview: 'linear-gradient(135deg, #22D3EE 0%, #14B8A6 25%, #3B82F6 50%, #6366F1 75%, #8B5CF6 100%)',
  },
  {
    id: 'forest-dawn',
    name: 'Forest Dawn',
    description: 'Lime to emerald nature',
    lightGradient: ['#84CC16', '#10B981', '#14B8A6', '#06B6D4', '#6EE7B7'],
    darkGradient: ['#365314', '#065F46', '#134E4A', '#164E63', '#022C22'],
    lightClass: 'mesh-gradient-forest',
    darkClass: 'mesh-gradient-emerald',
    category: 'light',
    preview: 'linear-gradient(135deg, #84CC16 0%, #10B981 25%, #14B8A6 50%, #06B6D4 75%, #6EE7B7 100%)',
  },
  {
    id: 'lavender-dreams',
    name: 'Lavender Dreams',
    description: 'Pink to violet softness',
    lightGradient: ['#F9A8D4', '#C084FC', '#A78BFA', '#818CF8', '#E9D5FF'],
    darkGradient: ['#831843', '#6B21A8', '#5B21B6', '#4338CA', '#3B0764'],
    lightClass: 'mesh-gradient-lavender',
    darkClass: 'mesh-gradient-dark',
    category: 'light',
    preview: 'linear-gradient(135deg, #F9A8D4 0%, #C084FC 25%, #A78BFA 50%, #818CF8 75%, #E9D5FF 100%)',
  },
  {
    id: 'midnight-aurora',
    name: 'Midnight Aurora',
    description: 'Deep purple to teal glow',
    lightGradient: ['#C4B5FD', '#D8B4FE', '#A5B4FC', '#93C5FD', '#BAE6FD'],
    darkGradient: ['#6A4C93', '#A64AC9', '#2E5EAA', '#17BEBB', '#1B4965'],
    lightClass: 'mesh-gradient-light',
    darkClass: 'mesh-gradient-dark',
    category: 'dark',
    preview: 'linear-gradient(135deg, #6A4C93 0%, #A64AC9 25%, #2E5EAA 50%, #17BEBB 75%, #1B4965 100%)',
  },
  {
    id: 'cosmic-night',
    name: 'Cosmic Night',
    description: 'Navy to deep pink cosmos',
    lightGradient: ['#60A5FA', '#818CF8', '#A78BFA', '#C084FC', '#F0ABFC'],
    darkGradient: ['#1E3A8A', '#3B82F6', '#8B5CF6', '#DB2777', '#1E293B'],
    lightClass: 'mesh-gradient-ocean',
    darkClass: 'mesh-gradient-cosmic',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 25%, #8B5CF6 50%, #DB2777 75%, #1E293B 100%)',
  },
  {
    id: 'emerald-twilight',
    name: 'Emerald Twilight',
    description: 'Dark teal to jade depths',
    lightGradient: ['#6EE7B7', '#5EEAD4', '#34D399', '#10B981', '#A7F3D0'],
    darkGradient: ['#115E59', '#059669', '#047857', '#10B981', '#064E3B'],
    lightClass: 'mesh-gradient-forest',
    darkClass: 'mesh-gradient-emerald',
    category: 'dark',
    preview: 'linear-gradient(135deg, #115E59 0%, #059669 25%, #047857 50%, #10B981 75%, #064E3B 100%)',
  },
  {
    id: 'amber-glow',
    name: 'Amber Glow',
    description: 'Dark orange to burgundy warmth',
    lightGradient: ['#FED7AA', '#FDBA74', '#FCA5A5', '#FCA5A5', '#FECACA'],
    darkGradient: ['#C2410C', '#F59E0B', '#FB7185', '#BE123C', '#7C2D12'],
    lightClass: 'mesh-gradient-light',
    darkClass: 'mesh-gradient-amber',
    category: 'dark',
    preview: 'linear-gradient(135deg, #C2410C 0%, #F59E0B 25%, #FB7185 50%, #BE123C 75%, #7C2D12 100%)',
  },
];

const STORAGE_KEY = 'rawdrive-gradient-theme';

export const useGradientTheme = () => {
  const [currentThemeId, setCurrentThemeId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'radiant-sunset';
    }
    return 'radiant-sunset';
  });

  const currentTheme = GRADIENT_THEMES.find((t) => t.id === currentThemeId) || GRADIENT_THEMES[0];

  /** Apply theme by updating CSS custom properties */
  const applyTheme = useCallback((theme: GradientTheme) => {
    const root = document.documentElement;

    // Update light mode CSS variables
    theme.lightGradient.forEach((color, index) => {
      root.style.setProperty(`--gradient-stop-${index + 1}`, color);
    });

    // Update dark mode CSS variables
    theme.darkGradient.forEach((color, index) => {
      root.style.setProperty(`--gradient-dark-stop-${index + 1}`, color);
    });
  }, []);

  /** Set theme and persist to localStorage */
  const setTheme = useCallback(
    (themeId: string) => {
      const theme = GRADIENT_THEMES.find((t) => t.id === themeId);
      if (theme) {
        setCurrentThemeId(themeId);
        localStorage.setItem(STORAGE_KEY, themeId);
        applyTheme(theme);
      }
    },
    [applyTheme]
  );

  /** Set custom theme with user-defined colors */
  const setCustomTheme = useCallback(
    (lightColors: string[], darkColors: string[]) => {
      const root = document.documentElement;

      lightColors.forEach((color, index) => {
        root.style.setProperty(`--gradient-stop-${index + 1}`, color);
      });

      darkColors.forEach((color, index) => {
        root.style.setProperty(`--gradient-dark-stop-${index + 1}`, color);
      });

      // Store custom theme
      const customTheme = {
        id: 'custom',
        lightColors,
        darkColors,
      };
      localStorage.setItem(STORAGE_KEY, 'custom');
      localStorage.setItem(`${STORAGE_KEY}-custom`, JSON.stringify(customTheme));
      setCurrentThemeId('custom');
    },
    []
  );

  /** Initialize theme on mount */
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

  /** Export theme as JSON */
  const exportTheme = useCallback(() => {
    if (currentThemeId === 'custom') {
      const customData = localStorage.getItem(`${STORAGE_KEY}-custom`);
      return customData ? JSON.parse(customData) : null;
    }
    return {
      id: currentTheme.id,
      name: currentTheme.name,
      lightColors: currentTheme.lightGradient,
      darkColors: currentTheme.darkGradient,
    };
  }, [currentThemeId, currentTheme]);

  /** Import theme from JSON */
  const importTheme = useCallback(
    (themeData: { lightColors: string[]; darkColors: string[] }) => {
      if (themeData.lightColors && themeData.darkColors) {
        setCustomTheme(themeData.lightColors, themeData.darkColors);
        return true;
      }
      return false;
    },
    [setCustomTheme]
  );

  return {
    currentTheme,
    currentThemeId,
    themes: GRADIENT_THEMES,
    setTheme,
    setCustomTheme,
    exportTheme,
    importTheme,
  };
};
