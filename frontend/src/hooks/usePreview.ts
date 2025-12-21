/**
 * usePreview Hook
 *
 * React hook for managing live preview state and updates.
 * Integrates with PreviewService for debounced updates and caching.
 *
 * Requirements: 2.4, 2.5, 2.6, 2.9
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  previewService,
  PreviewRenderData,
  PreviewState,
} from '@/services/previewService';
import type {
  EnhancedCompanyProfile,
  ProfileVisibilityConfig,
  ThemeCustomization,
  Theme,
  DeviceMode,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface UsePreviewOptions {
  /** Initial device mode */
  initialDeviceMode?: DeviceMode;
  /** Whether to auto-subscribe to updates */
  autoSubscribe?: boolean;
}

export interface UsePreviewReturn {
  /** Current preview render data */
  previewData: PreviewRenderData | null;
  /** Current device mode */
  deviceMode: DeviceMode;
  /** Whether preview is updating */
  isUpdating: boolean;
  /** Last update timestamp */
  lastUpdate: number;
  /** Set device mode */
  setDeviceMode: (mode: DeviceMode) => void;
  /** Update profile data */
  updateProfile: (profile: EnhancedCompanyProfile) => void;
  /** Update visibility configuration */
  updateVisibility: (visibility: ProfileVisibilityConfig) => void;
  /** Update theme */
  updateTheme: (theme: Theme) => void;
  /** Update theme customization */
  updateCustomization: (customization: ThemeCustomization) => void;
  /** Force immediate refresh */
  refresh: () => void;
  /** Clear preview cache */
  clearCache: () => void;
  /** Get current preview state */
  getState: () => PreviewState;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePreview(options: UsePreviewOptions = {}): UsePreviewReturn {
  const { initialDeviceMode = 'desktop', autoSubscribe = true } = options;

  // State
  const [previewData, setPreviewData] = useState<PreviewRenderData | null>(null);
  const [deviceMode, setDeviceModeState] = useState<DeviceMode>(initialDeviceMode);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);

  // Refs for tracking updates
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Subscribe to preview service updates
  useEffect(() => {
    if (!autoSubscribe) return;

    const unsubscribe = previewService.subscribe((data) => {
      setPreviewData(data);
      setIsUpdating(false);
      setLastUpdate(Date.now());
      lastUpdateRef.current = Date.now();
    });

    // Get initial cached preview if available
    const cached = previewService.getCachedPreview();
    if (cached) {
      setPreviewData(cached);
    }

    return () => {
      unsubscribe();
    };
  }, [autoSubscribe]);

  // Set device mode
  const setDeviceMode = useCallback((mode: DeviceMode) => {
    setDeviceModeState(mode);
    setIsUpdating(true);
    previewService.setDeviceMode(mode);
  }, []);

  // Update profile
  const updateProfile = useCallback((profile: EnhancedCompanyProfile) => {
    setIsUpdating(true);

    // Clear any pending timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Mark as updating (will be cleared by subscription callback)
    updateTimeoutRef.current = setTimeout(() => {
      // Fallback in case subscription doesn't fire
      setIsUpdating(false);
    }, 1000);

    previewService.updateProfile(profile);
  }, []);

  // Update visibility
  const updateVisibility = useCallback((visibility: ProfileVisibilityConfig) => {
    setIsUpdating(true);
    previewService.updateVisibility(visibility);
  }, []);

  // Update theme
  const updateTheme = useCallback((theme: Theme) => {
    setIsUpdating(true);
    previewService.updateTheme(theme);
  }, []);

  // Update customization
  const updateCustomization = useCallback((customization: ThemeCustomization) => {
    setIsUpdating(true);
    previewService.updateCustomization(customization);
  }, []);

  // Force immediate refresh
  const refresh = useCallback(() => {
    setIsUpdating(true);
    const data = previewService.refreshPreview();
    setPreviewData(data);
    setIsUpdating(false);
    setLastUpdate(Date.now());
  }, []);

  // Clear cache
  const clearCache = useCallback(() => {
    previewService.clearCache();
  }, []);

  // Get current state
  const getState = useCallback(() => {
    return previewService.getState();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return {
    previewData,
    deviceMode,
    isUpdating,
    lastUpdate,
    setDeviceMode,
    updateProfile,
    updateVisibility,
    updateTheme,
    updateCustomization,
    refresh,
    clearCache,
    getState,
  };
}

export default usePreview;
