/**
 * Theme provider for mobile app
 * Manages light/dark mode with system preference detection
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useColorScheme, ColorSchemeName } from 'react-native';
import { getThemePreference, setThemePreference } from '../services/secureStorage';
import { COLORS } from '../constants';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeColors {
  primary: string;
  primaryForeground: string;
  background: string;
  backgroundSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderLight: string;
}

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colors: ThemeColors;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getColors(theme: ResolvedTheme): ThemeColors {
  if (theme === 'dark') {
    return {
      primary: COLORS.primary,
      primaryForeground: COLORS.primaryForeground,
      background: COLORS.dark.background,
      backgroundSecondary: COLORS.dark.backgroundSecondary,
      textPrimary: COLORS.dark.textPrimary,
      textSecondary: COLORS.dark.textSecondary,
      textMuted: COLORS.textMuted,
      accent: COLORS.accent,
      accentLight: COLORS.accentLight,
      success: COLORS.success,
      warning: COLORS.warning,
      error: COLORS.error,
      info: COLORS.info,
      border: COLORS.dark.border,
      borderLight: COLORS.borderLight,
    };
  }

  return {
    primary: COLORS.primary,
    primaryForeground: COLORS.primaryForeground,
    background: COLORS.background,
    backgroundSecondary: COLORS.backgroundSecondary,
    textPrimary: COLORS.textPrimary,
    textSecondary: COLORS.textSecondary,
    textMuted: COLORS.textMuted,
    accent: COLORS.accent,
    accentLight: COLORS.accentLight,
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    info: COLORS.info,
    border: COLORS.border,
    borderLight: COLORS.borderLight,
  };
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Load stored preference
  useEffect(() => {
    async function loadTheme() {
      const stored = await getThemePreference();
      setThemeModeState(stored);
      setIsLoading(false);
    }
    loadTheme();
  }, []);

  // Resolve the actual theme
  const resolvedTheme: ResolvedTheme =
    themeMode === 'system'
      ? (systemColorScheme as ResolvedTheme) || 'light'
      : themeMode;

  const isDark = resolvedTheme === 'dark';
  const colors = getColors(resolvedTheme);

  // Set theme mode
  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await setThemePreference(mode);
  }, []);

  // Don't render until we've loaded the preference
  if (isLoading) {
    return null;
  }

  const value: ThemeContextValue = {
    themeMode,
    resolvedTheme,
    colors,
    isDark,
    setThemeMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
