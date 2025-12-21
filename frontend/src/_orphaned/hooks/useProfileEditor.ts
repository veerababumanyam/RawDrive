/**
 * useProfileEditor Hook
 *
 * Comprehensive state management for the Public Profile Editor including:
 * - Profile, visibility, theme, and customization state
 * - Auto-save with debouncing (500ms for fields, instant for toggles)
 * - Undo/Redo history (max 50 actions)
 * - Device mode switching
 * - Dirty state tracking
 * - Error handling and loading states
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { profileEditorService } from '@/services/profileEditorService';
import { useDebounce } from './useDebounce';
import type {
  Theme,
  ThemeCustomization,
  ProfileVisibilityConfig,
  EnhancedCompanyProfile,
  DeviceMode,
  EditorAction,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
  ProfileVersion,
  FieldVisibility,
  SocialVisibility,
} from '@/types/profileEditor';

// =============================================================================
// Constants
// =============================================================================

const AUTO_SAVE_DELAY = 500; // ms
const MAX_HISTORY_SIZE = 50;
const SNAPSHOT_LABEL_PREFIX = 'Auto-save before';

// =============================================================================
// Types
// =============================================================================

interface UseProfileEditorOptions {
  workspaceId: string;
  autoFetch?: boolean;
  autoSave?: boolean;
}

interface UseProfileEditorReturn {
  // Data
  profile: EnhancedCompanyProfile | null;
  visibility: ProfileVisibilityConfig | null;
  theme: Theme | null;
  customization: ThemeCustomization | null;
  themes: Theme[];

  // State
  deviceMode: DeviceMode;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: Error | null;
  lastSavedAt: Date | null;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Profile Actions
  updateProfile: (updates: Partial<EnhancedCompanyProfile>) => void;
  saveProfile: () => Promise<void>;
  publishProfile: (options?: { createSnapshot?: boolean; snapshotLabel?: string }) => Promise<void>;
  unpublishProfile: () => Promise<void>;

  // Visibility Actions
  updateFieldVisibility: (field: string, visible: boolean) => void;
  updateSocialVisibility: (platform: string, visible: boolean) => void;
  updateVisibility: (updates: { field_visibility?: FieldVisibility; social_visibility?: SocialVisibility }) => void;
  applyVisibilityPreset: (presetKey: string) => Promise<void>;
  showAllFields: () => Promise<void>;
  hideAllFields: () => Promise<void>;

  // Theme Actions
  setTheme: (themeId: string) => Promise<void>;
  fetchThemes: () => Promise<void>;

  // Customization Actions
  updateColors: (colors: Partial<ColorPalette>) => void;
  updateTypography: (typography: Partial<TypographyConfig>) => void;
  updateLayout: (layout: Partial<LayoutPreferences>) => void;
  resetCustomization: () => Promise<void>;

  // Device Mode
  setDeviceMode: (mode: DeviceMode) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Version Actions
  createSnapshot: (label?: string) => Promise<ProfileVersion>;
  getVersions: () => Promise<ProfileVersion[]>;
  restoreVersion: (versionId: string) => Promise<void>;

  // Utility
  refresh: () => Promise<void>;
  discardChanges: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useProfileEditor({
  workspaceId,
  autoFetch = true,
  autoSave = true,
}: UseProfileEditorOptions): UseProfileEditorReturn {
  // =========================================================================
  // Core State
  // =========================================================================

  const [profile, setProfile] = useState<EnhancedCompanyProfile | null>(null);
  const [visibility, setVisibility] = useState<ProfileVisibilityConfig | null>(null);
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [customization, setCustomization] = useState<ThemeCustomization | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);

  // =========================================================================
  // UI State
  // =========================================================================

  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // =========================================================================
  // Pending Changes (for debounced auto-save)
  // =========================================================================

  const [pendingProfileUpdates, setPendingProfileUpdates] = useState<Partial<EnhancedCompanyProfile> | null>(null);
  const [pendingVisibilityUpdates, setPendingVisibilityUpdates] = useState<{
    field_visibility?: FieldVisibility;
    social_visibility?: SocialVisibility;
  } | null>(null);
  const [pendingColorUpdates, setPendingColorUpdates] = useState<Partial<ColorPalette> | null>(null);
  const [pendingTypographyUpdates, setPendingTypographyUpdates] = useState<Partial<TypographyConfig> | null>(null);
  const [pendingLayoutUpdates, setPendingLayoutUpdates] = useState<Partial<LayoutPreferences> | null>(null);

  // =========================================================================
  // Debounced Values
  // =========================================================================

  const debouncedProfileUpdates = useDebounce(pendingProfileUpdates, AUTO_SAVE_DELAY);
  const debouncedVisibilityUpdates = useDebounce(pendingVisibilityUpdates, AUTO_SAVE_DELAY);
  const debouncedColorUpdates = useDebounce(pendingColorUpdates, AUTO_SAVE_DELAY);
  const debouncedTypographyUpdates = useDebounce(pendingTypographyUpdates, AUTO_SAVE_DELAY);
  const debouncedLayoutUpdates = useDebounce(pendingLayoutUpdates, AUTO_SAVE_DELAY);

  // =========================================================================
  // History (Undo/Redo)
  // =========================================================================

  const [history, setHistory] = useState<EditorAction[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  // =========================================================================
  // Original State (for discard)
  // =========================================================================

  const originalStateRef = useRef<{
    profile: EnhancedCompanyProfile | null;
    visibility: ProfileVisibilityConfig | null;
    theme: Theme | null;
    customization: ThemeCustomization | null;
  } | null>(null);

  // =========================================================================
  // History Management
  // =========================================================================

  const pushToHistory = useCallback((action: Omit<EditorAction, 'id' | 'timestamp'>) => {
    if (isUndoRedoRef.current) return;

    const newAction: EditorAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    setHistory((prev) => {
      // Remove any redo history
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new action
      newHistory.push(newAction);
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }
      return newHistory;
    });

    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    isUndoRedoRef.current = true;
    const action = history[historyIndex];

    // Restore previous state based on action type
    switch (action.type) {
      case 'profile':
        setProfile((prev) => (prev ? { ...prev, ...(action.before as Partial<EnhancedCompanyProfile>) } : prev));
        setPendingProfileUpdates(action.before as Partial<EnhancedCompanyProfile>);
        break;
      case 'visibility':
        setVisibility((prev) => (prev ? { ...prev, ...(action.before as Partial<ProfileVisibilityConfig>) } : prev));
        setPendingVisibilityUpdates(action.before as { field_visibility?: FieldVisibility; social_visibility?: SocialVisibility });
        break;
      case 'colors':
        setCustomization((prev) => (prev ? { ...prev, custom_colors: action.before as Partial<ColorPalette> } : prev));
        setPendingColorUpdates(action.before as Partial<ColorPalette>);
        break;
      case 'typography':
        setCustomization((prev) => (prev ? { ...prev, custom_typography: action.before as Partial<TypographyConfig> } : prev));
        setPendingTypographyUpdates(action.before as Partial<TypographyConfig>);
        break;
      case 'layout':
        setCustomization((prev) => (prev ? { ...prev, custom_layout: action.before as Partial<LayoutPreferences> } : prev));
        setPendingLayoutUpdates(action.before as Partial<LayoutPreferences>);
        break;
    }

    setHistoryIndex((prev) => prev - 1);
    setIsDirty(true);

    // Allow new history entries after a tick
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [canUndo, history, historyIndex]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    isUndoRedoRef.current = true;
    const action = history[historyIndex + 1];

    // Apply next state based on action type
    switch (action.type) {
      case 'profile':
        setProfile((prev) => (prev ? { ...prev, ...(action.after as Partial<EnhancedCompanyProfile>) } : prev));
        setPendingProfileUpdates(action.after as Partial<EnhancedCompanyProfile>);
        break;
      case 'visibility':
        setVisibility((prev) => (prev ? { ...prev, ...(action.after as Partial<ProfileVisibilityConfig>) } : prev));
        setPendingVisibilityUpdates(action.after as { field_visibility?: FieldVisibility; social_visibility?: SocialVisibility });
        break;
      case 'colors':
        setCustomization((prev) => (prev ? { ...prev, custom_colors: action.after as Partial<ColorPalette> } : prev));
        setPendingColorUpdates(action.after as Partial<ColorPalette>);
        break;
      case 'typography':
        setCustomization((prev) => (prev ? { ...prev, custom_typography: action.after as Partial<TypographyConfig> } : prev));
        setPendingTypographyUpdates(action.after as Partial<TypographyConfig>);
        break;
      case 'layout':
        setCustomization((prev) => (prev ? { ...prev, custom_layout: action.after as Partial<LayoutPreferences> } : prev));
        setPendingLayoutUpdates(action.after as Partial<LayoutPreferences>);
        break;
    }

    setHistoryIndex((prev) => prev + 1);
    setIsDirty(true);

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [canRedo, history, historyIndex]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // =========================================================================
  // Data Fetching
  // =========================================================================

  const fetchAllData = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [profileData, visibilityData, themesData, customizationData] = await Promise.all([
        profileEditorService.getProfile(workspaceId),
        profileEditorService.getVisibility(workspaceId).catch(() => null),
        profileEditorService.getThemes(),
        profileEditorService.getCustomization(workspaceId),
      ]);

      setProfile(profileData);
      setVisibility(visibilityData);
      setThemes(themesData);
      setCustomization(customizationData);

      // Load theme if profile has one
      if (profileData.theme_id && themesData.length > 0) {
        const appliedTheme = themesData.find((t) => t.theme_id === profileData.theme_id);
        if (appliedTheme) {
          setThemeState(appliedTheme);
        }
      }

      // Store original state for discard
      originalStateRef.current = {
        profile: profileData,
        visibility: visibilityData,
        theme: themesData.find((t) => t.theme_id === profileData.theme_id) || null,
        customization: customizationData,
      };

      setIsDirty(false);
      clearHistory();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch profile data'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, clearHistory]);

  const fetchThemes = useCallback(async () => {
    try {
      const themesData = await profileEditorService.getThemes();
      setThemes(themesData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch themes'));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (autoFetch && workspaceId) {
      fetchAllData();
    }
  }, [autoFetch, workspaceId, fetchAllData]);

  // =========================================================================
  // Auto-Save Effects
  // =========================================================================

  // Auto-save profile updates
  useEffect(() => {
    if (!autoSave || !workspaceId || !debouncedProfileUpdates) return;

    const saveProfileUpdates = async () => {
      setIsSaving(true);
      try {
        const updated = await profileEditorService.updateProfile(workspaceId, debouncedProfileUpdates);
        setProfile(updated);
        setLastSavedAt(new Date());
        setPendingProfileUpdates(null);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to save profile'));
      } finally {
        setIsSaving(false);
      }
    };

    saveProfileUpdates();
  }, [autoSave, workspaceId, debouncedProfileUpdates]);

  // Auto-save visibility updates
  useEffect(() => {
    if (!autoSave || !workspaceId || !debouncedVisibilityUpdates) return;

    const saveVisibilityUpdates = async () => {
      setIsSaving(true);
      try {
        const updated = await profileEditorService.updateVisibility(workspaceId, debouncedVisibilityUpdates);
        setVisibility(updated);
        setLastSavedAt(new Date());
        setPendingVisibilityUpdates(null);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to save visibility'));
      } finally {
        setIsSaving(false);
      }
    };

    saveVisibilityUpdates();
  }, [autoSave, workspaceId, debouncedVisibilityUpdates]);

  // Auto-save color updates
  useEffect(() => {
    if (!autoSave || !workspaceId || !debouncedColorUpdates) return;

    const saveColorUpdates = async () => {
      setIsSaving(true);
      try {
        const updated = await profileEditorService.updateColors(workspaceId, debouncedColorUpdates);
        setCustomization(updated);
        setLastSavedAt(new Date());
        setPendingColorUpdates(null);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to save colors'));
      } finally {
        setIsSaving(false);
      }
    };

    saveColorUpdates();
  }, [autoSave, workspaceId, debouncedColorUpdates]);

  // Auto-save typography updates
  useEffect(() => {
    if (!autoSave || !workspaceId || !debouncedTypographyUpdates) return;

    const saveTypographyUpdates = async () => {
      setIsSaving(true);
      try {
        const updated = await profileEditorService.updateTypography(workspaceId, debouncedTypographyUpdates);
        setCustomization(updated);
        setLastSavedAt(new Date());
        setPendingTypographyUpdates(null);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to save typography'));
      } finally {
        setIsSaving(false);
      }
    };

    saveTypographyUpdates();
  }, [autoSave, workspaceId, debouncedTypographyUpdates]);

  // Auto-save layout updates
  useEffect(() => {
    if (!autoSave || !workspaceId || !debouncedLayoutUpdates) return;

    const saveLayoutUpdates = async () => {
      setIsSaving(true);
      try {
        const updated = await profileEditorService.updateLayout(workspaceId, debouncedLayoutUpdates);
        setCustomization(updated);
        setLastSavedAt(new Date());
        setPendingLayoutUpdates(null);
        setIsDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to save layout'));
      } finally {
        setIsSaving(false);
      }
    };

    saveLayoutUpdates();
  }, [autoSave, workspaceId, debouncedLayoutUpdates]);

  // =========================================================================
  // Profile Actions
  // =========================================================================

  const updateProfile = useCallback((updates: Partial<EnhancedCompanyProfile>) => {
    // Push to history
    pushToHistory({
      type: 'profile',
      before: profile ? { ...profile } : {},
      after: updates,
    });

    // Optimistically update local state
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));

    // Queue for auto-save
    setPendingProfileUpdates((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, [profile, pushToHistory]);

  const saveProfile = useCallback(async () => {
    if (!workspaceId || !pendingProfileUpdates) return;

    setIsSaving(true);
    try {
      const updated = await profileEditorService.updateProfile(workspaceId, pendingProfileUpdates);
      setProfile(updated);
      setLastSavedAt(new Date());
      setPendingProfileUpdates(null);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to save profile'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, pendingProfileUpdates]);

  const publishProfile = useCallback(async (options?: { createSnapshot?: boolean; snapshotLabel?: string }) => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      const result = await profileEditorService.publishProfile(workspaceId, options);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              is_published: true,
              published_at: result.published_at,
            }
          : prev
      );
      setLastSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to publish profile'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId]);

  const unpublishProfile = useCallback(async () => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      await profileEditorService.unpublishProfile(workspaceId);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              is_published: false,
              published_at: undefined,
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to unpublish profile'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId]);

  // =========================================================================
  // Visibility Actions
  // =========================================================================

  const updateFieldVisibility = useCallback((field: string, visible: boolean) => {
    const updates = {
      field_visibility: { [field]: visible },
    };

    // Push to history
    pushToHistory({
      type: 'visibility',
      before: visibility ? { field_visibility: { ...visibility.field_visibility } } : {},
      after: updates,
    });

    // Optimistically update
    setVisibility((prev) =>
      prev
        ? {
            ...prev,
            field_visibility: { ...prev.field_visibility, [field]: visible },
          }
        : prev
    );

    // Queue for auto-save
    setPendingVisibilityUpdates((prev) => ({
      ...prev,
      field_visibility: { ...prev?.field_visibility, [field]: visible },
    }));
    setIsDirty(true);
  }, [visibility, pushToHistory]);

  const updateSocialVisibility = useCallback((platform: string, visible: boolean) => {
    const updates = {
      social_visibility: { [platform]: visible },
    };

    // Push to history
    pushToHistory({
      type: 'visibility',
      before: visibility ? { social_visibility: { ...visibility.social_visibility } } : {},
      after: updates,
    });

    // Optimistically update
    setVisibility((prev) =>
      prev
        ? {
            ...prev,
            social_visibility: { ...prev.social_visibility, [platform]: visible },
          }
        : prev
    );

    // Queue for auto-save
    setPendingVisibilityUpdates((prev) => ({
      ...prev,
      social_visibility: { ...prev?.social_visibility, [platform]: visible },
    }));
    setIsDirty(true);
  }, [visibility, pushToHistory]);

  const updateVisibility = useCallback((updates: { field_visibility?: FieldVisibility; social_visibility?: SocialVisibility }) => {
    // Push to history
    pushToHistory({
      type: 'visibility',
      before: visibility
        ? {
            field_visibility: { ...visibility.field_visibility },
            social_visibility: { ...visibility.social_visibility },
          }
        : {},
      after: updates,
    });

    // Optimistically update
    setVisibility((prev) =>
      prev
        ? {
            ...prev,
            ...(updates.field_visibility && {
              field_visibility: { ...prev.field_visibility, ...updates.field_visibility },
            }),
            ...(updates.social_visibility && {
              social_visibility: { ...prev.social_visibility, ...updates.social_visibility },
            }),
          }
        : prev
    );

    // Queue for auto-save
    setPendingVisibilityUpdates((prev) => ({
      ...prev,
      ...updates,
    }));
    setIsDirty(true);
  }, [visibility, pushToHistory]);

  const applyVisibilityPreset = useCallback(async (presetKey: string) => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      const updated = await profileEditorService.applyVisibilityPreset(workspaceId, presetKey);
      setVisibility(updated);
      setLastSavedAt(new Date());
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to apply visibility preset'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId]);

  const showAllFields = useCallback(async () => {
    await applyVisibilityPreset('full');
  }, [applyVisibilityPreset]);

  const hideAllFields = useCallback(async () => {
    await applyVisibilityPreset('minimal');
  }, [applyVisibilityPreset]);

  // =========================================================================
  // Theme Actions
  // =========================================================================

  const setTheme = useCallback(async (themeId: string) => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      const result = await profileEditorService.applyTheme(workspaceId, themeId);
      setProfile(result.data);

      // Find and set the theme
      const appliedTheme = themes.find((t) => t.theme_id === themeId);
      if (appliedTheme) {
        setThemeState(appliedTheme);
      }

      // Reset customization when theme changes
      setCustomization(null);
      setLastSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to apply theme'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, themes]);

  // =========================================================================
  // Customization Actions
  // =========================================================================

  const updateColors = useCallback((colors: Partial<ColorPalette>) => {
    // Push to history
    pushToHistory({
      type: 'colors',
      before: customization?.custom_colors || {},
      after: colors,
    });

    // Optimistically update
    setCustomization((prev) =>
      prev
        ? { ...prev, custom_colors: { ...prev.custom_colors, ...colors } }
        : null
    );

    // Queue for auto-save
    setPendingColorUpdates((prev) => ({ ...prev, ...colors }));
    setIsDirty(true);
  }, [customization, pushToHistory]);

  const updateTypography = useCallback((typography: Partial<TypographyConfig>) => {
    // Push to history
    pushToHistory({
      type: 'typography',
      before: customization?.custom_typography || {},
      after: typography,
    });

    // Optimistically update
    setCustomization((prev) =>
      prev
        ? { ...prev, custom_typography: { ...prev.custom_typography, ...typography } }
        : null
    );

    // Queue for auto-save
    setPendingTypographyUpdates((prev) => ({ ...prev, ...typography }));
    setIsDirty(true);
  }, [customization, pushToHistory]);

  const updateLayout = useCallback((layout: Partial<LayoutPreferences>) => {
    // Push to history
    pushToHistory({
      type: 'layout',
      before: customization?.custom_layout || {},
      after: layout,
    });

    // Optimistically update
    setCustomization((prev) =>
      prev
        ? { ...prev, custom_layout: { ...prev.custom_layout, ...layout } }
        : null
    );

    // Queue for auto-save
    setPendingLayoutUpdates((prev) => ({ ...prev, ...layout }));
    setIsDirty(true);
  }, [customization, pushToHistory]);

  const resetCustomization = useCallback(async () => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      await profileEditorService.resetCustomization(workspaceId);
      setCustomization(null);
      setLastSavedAt(new Date());
      clearHistory();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reset customization'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, clearHistory]);

  // =========================================================================
  // Version Actions
  // =========================================================================

  const createSnapshot = useCallback(async (label?: string) => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    setIsSaving(true);
    try {
      const version = await profileEditorService.createSnapshot(workspaceId, label);
      return version;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create snapshot'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId]);

  const getVersions = useCallback(async () => {
    if (!workspaceId) return [];

    try {
      return await profileEditorService.getVersions(workspaceId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch versions'));
      return [];
    }
  }, [workspaceId]);

  const restoreVersion = useCallback(async (versionId: string) => {
    if (!workspaceId) return;

    setIsSaving(true);
    try {
      // Create snapshot before restoring
      await createSnapshot(`${SNAPSHOT_LABEL_PREFIX} restore`);

      const result = await profileEditorService.restoreVersion(workspaceId, versionId);
      setProfile(result.data);
      setLastSavedAt(new Date());

      // Refresh all data
      await fetchAllData();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to restore version'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, createSnapshot, fetchAllData]);

  // =========================================================================
  // Utility Actions
  // =========================================================================

  const refresh = useCallback(async () => {
    await fetchAllData();
  }, [fetchAllData]);

  const discardChanges = useCallback(() => {
    if (!originalStateRef.current) return;

    setProfile(originalStateRef.current.profile);
    setVisibility(originalStateRef.current.visibility);
    setThemeState(originalStateRef.current.theme);
    setCustomization(originalStateRef.current.customization);

    // Clear pending updates
    setPendingProfileUpdates(null);
    setPendingVisibilityUpdates(null);
    setPendingColorUpdates(null);
    setPendingTypographyUpdates(null);
    setPendingLayoutUpdates(null);

    setIsDirty(false);
    clearHistory();
  }, [clearHistory]);

  // =========================================================================
  // Return
  // =========================================================================

  return {
    // Data
    profile,
    visibility,
    theme,
    customization,
    themes,

    // State
    deviceMode,
    isDirty,
    isSaving,
    isLoading,
    error,
    lastSavedAt,

    // History
    canUndo,
    canRedo,

    // Profile Actions
    updateProfile,
    saveProfile,
    publishProfile,
    unpublishProfile,

    // Visibility Actions
    updateFieldVisibility,
    updateSocialVisibility,
    updateVisibility,
    applyVisibilityPreset,
    showAllFields,
    hideAllFields,

    // Theme Actions
    setTheme,
    fetchThemes,

    // Customization Actions
    updateColors,
    updateTypography,
    updateLayout,
    resetCustomization,

    // Device Mode
    setDeviceMode,

    // History Actions
    undo,
    redo,
    clearHistory,

    // Version Actions
    createSnapshot,
    getVersions,
    restoreVersion,

    // Utility
    refresh,
    discardChanges,
  };
}

// Export types for consumers
export type { UseProfileEditorOptions, UseProfileEditorReturn };
