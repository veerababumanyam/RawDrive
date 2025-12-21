/**
 * useThemeEditor Hook
 *
 * React hook for managing theme selection and customization in the Profile Editor.
 * Provides reactive state management for theme changes and customizations.
 *
 * Requirements: 3.1, 3.4, 3.7, 4.1
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { themeService } from '@/services/themeService';
import type {
  Theme,
  ThemeCategory,
  ThemeFilters,
  ThemeCustomization,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface UseThemeEditorOptions {
  /** Workspace ID for persistence */
  workspaceId?: string;
  /** Profile ID for persistence */
  profileId?: string;
  /** Initial theme ID to load */
  initialThemeId?: string;
  /** Auto-save changes to backend */
  autoSave?: boolean;
  /** Debounce delay for auto-save (ms) */
  autoSaveDelay?: number;
}

export interface UseThemeEditorReturn {
  // Current state
  currentTheme: Theme | null;
  currentCustomization: ThemeCustomization | null;
  hasCustomizations: boolean;

  // Theme listing
  themes: Theme[];
  popularThemes: Theme[];
  premiumThemes: Theme[];
  recommendedThemes: Theme[];
  categories: Record<ThemeCategory, number>;

  // Computed values
  effectiveColors: ColorPalette;
  effectiveTypography: TypographyConfig;
  effectiveLayout: LayoutPreferences;
  cssVariables: Record<string, string>;

  // Filtering
  filters: ThemeFilters;
  setFilters: (filters: ThemeFilters) => void;
  filteredThemes: Theme[];
  searchThemes: (query: string) => Theme[];

  // Theme selection
  selectTheme: (themeId: string) => boolean;
  resetToDefault: () => void;

  // Customization
  updateColors: (colors: Partial<ColorPalette>) => void;
  updateTypography: (typography: Partial<TypographyConfig>) => void;
  updateLayout: (layout: Partial<LayoutPreferences>) => void;
  resetCustomizations: () => void;

  // Persistence
  saveTheme: () => Promise<void>;
  loadTheme: () => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;

  // Utilities
  getThemeById: (themeId: string) => Theme | undefined;
  getCategoryInfo: (category: ThemeCategory) => { label: string; description: string; icon: string };
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useThemeEditor(options: UseThemeEditorOptions = {}): UseThemeEditorReturn {
  const {
    workspaceId,
    profileId,
    initialThemeId,
    autoSave = false,
    autoSaveDelay = 2000,
  } = options;

  // State
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(
    initialThemeId ? themeService.getTheme(initialThemeId) || null : themeService.getCurrentTheme()
  );
  const [currentCustomization, setCurrentCustomization] = useState<ThemeCustomization | null>(
    themeService.getCurrentCustomization()
  );
  const [filters, setFilters] = useState<ThemeFilters>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to theme service changes
  useEffect(() => {
    const unsubscribe = themeService.subscribe((theme) => {
      setCurrentTheme(theme);
      setCurrentCustomization(themeService.getCurrentCustomization());
    });

    return unsubscribe;
  }, []);

  // Load initial theme from backend if IDs provided
  useEffect(() => {
    if (workspaceId && profileId && !initialThemeId) {
      loadTheme();
    }
  }, [workspaceId, profileId]);

  // Auto-save effect
  useEffect(() => {
    if (!autoSave || !workspaceId || !profileId || !currentTheme) {
      return;
    }

    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      saveTheme();
    }, autoSaveDelay);

    setAutoSaveTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [currentTheme, currentCustomization, autoSave, autoSaveDelay]);

  // Computed values
  const themes = useMemo(() => themeService.listThemes().themes, []);
  const popularThemes = useMemo(() => themeService.getPopularThemes(), []);
  const premiumThemes = useMemo(() => themeService.getPremiumThemes(), []);
  const recommendedThemes = useMemo(() => themeService.getRecommendedThemes(), []);
  const categories = useMemo(() => themeService.listThemes().categories, []);

  const filteredThemes = useMemo(() => {
    return themeService.listThemes(filters).themes;
  }, [filters]);

  const hasCustomizations = useMemo(() => {
    return themeService.hasCustomizations();
  }, [currentCustomization]);

  const effectiveColors = useMemo(() => {
    return themeService.getEffectiveColors();
  }, [currentTheme, currentCustomization]);

  const effectiveTypography = useMemo(() => {
    return themeService.getEffectiveTypography();
  }, [currentTheme, currentCustomization]);

  const effectiveLayout = useMemo(() => {
    return themeService.getEffectiveLayout();
  }, [currentTheme, currentCustomization]);

  const cssVariables = useMemo(() => {
    return themeService.generateCssVariables();
  }, [currentTheme, currentCustomization]);

  // Theme selection
  const selectTheme = useCallback((themeId: string): boolean => {
    const result = themeService.applyTheme(themeId);
    return result.success;
  }, []);

  const resetToDefault = useCallback(() => {
    themeService.resetToDefault();
  }, []);

  // Customization methods
  const updateColors = useCallback((colors: Partial<ColorPalette>) => {
    themeService.updateColors(colors);
  }, []);

  const updateTypography = useCallback((typography: Partial<TypographyConfig>) => {
    themeService.updateTypography(typography);
  }, []);

  const updateLayout = useCallback((layout: Partial<LayoutPreferences>) => {
    themeService.updateLayout(layout);
  }, []);

  const resetCustomizations = useCallback(() => {
    themeService.resetCustomizations();
  }, []);

  // Persistence methods
  const saveTheme = useCallback(async () => {
    if (!workspaceId || !profileId || !currentTheme) {
      return;
    }

    setIsSaving(true);
    try {
      await themeService.saveThemeSelection(
        workspaceId,
        profileId,
        currentTheme.theme_id,
        currentCustomization || undefined
      );
    } catch (error) {
      console.error('Failed to save theme:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, profileId, currentTheme, currentCustomization]);

  const loadTheme = useCallback(async () => {
    if (!workspaceId || !profileId) {
      return;
    }

    setIsLoading(true);
    try {
      await themeService.loadThemeSelection(workspaceId, profileId);
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, profileId]);

  // Utility methods
  const searchThemesMethod = useCallback((query: string) => {
    return themeService.searchThemes(query);
  }, []);

  const getThemeById = useCallback((themeId: string) => {
    return themeService.getTheme(themeId);
  }, []);

  const getCategoryInfo = useCallback((category: ThemeCategory) => {
    return themeService.getCategoryInfo(category);
  }, []);

  return {
    // Current state
    currentTheme,
    currentCustomization,
    hasCustomizations,

    // Theme listing
    themes,
    popularThemes,
    premiumThemes,
    recommendedThemes,
    categories,

    // Computed values
    effectiveColors,
    effectiveTypography,
    effectiveLayout,
    cssVariables,

    // Filtering
    filters,
    setFilters,
    filteredThemes,
    searchThemes: searchThemesMethod,

    // Theme selection
    selectTheme,
    resetToDefault,

    // Customization
    updateColors,
    updateTypography,
    updateLayout,
    resetCustomizations,

    // Persistence
    saveTheme,
    loadTheme,
    isSaving,
    isLoading,

    // Utilities
    getThemeById,
    getCategoryInfo,
  };
}

export default useThemeEditor;
