/**
 * useDesignDraft - Gallery Design Studio Draft State Management
 *
 * Provides comprehensive draft management with:
 * - localStorage persistence with auto-save (3s debounce)
 * - Undo/redo history (max 20 states)
 * - Publish flow with backend synchronization
 * - Save and publish status tracking
 *
 * Usage:
 * ```tsx
 * const { config, updateConfig, publish, canUndo, undo } = useDesignDraft({
 *   galleryId,
 *   workspaceId,
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_GALLERY_DESIGN_CONFIG, GalleryDesignConfig } from '../types/gallery-design';
import { API_BASE } from '@rawdrive/shared-constants';
import galleryDesignService from '../services/galleryDesignService';

export type DesignDraftStatus = 'idle' | 'saving' | 'saved' | 'error';
export type PublishStatus = 'idle' | 'publishing' | 'published' | 'error';

export interface UseDesignDraftOptions {
  galleryId: string;
  workspaceId: string;
  autoSaveInterval?: number; // milliseconds, default 3000
  maxHistorySize?: number; // default 20
}

export interface UseDesignDraftReturn {
  // Configuration
  config: GalleryDesignConfig;

  // Draft status
  isDirty: boolean;
  saveStatus: DesignDraftStatus;
  publishStatus: PublishStatus;
  lastSavedAt: Date | null;
  error?: string;

  // Modification methods
  updateConfig: (updates: Partial<GalleryDesignConfig> | ((prev: GalleryDesignConfig) => GalleryDesignConfig)) => void;
  revert: () => void;

  // History methods
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Publish method
  publish: () => Promise<void>;
  publishError?: string;

  // Template methods
  applyTemplate: (templateId: string, preserveCoverAsset?: boolean) => Promise<void>;
  applyTemplateStatus: 'idle' | 'loading' | 'applied' | 'error';
  applyTemplateError?: string;
}

/**
 * Main hook for managing gallery design drafts
 */
export const useDesignDraft = (options: UseDesignDraftOptions): UseDesignDraftReturn => {
  const {
    galleryId,
    workspaceId,
    autoSaveInterval = 3000,
    maxHistorySize = 20,
  } = options;

  const storageKey = `gallery-design-draft-${galleryId}`;
  const lastPublishedKey = `gallery-design-published-${galleryId}`;

  // Current configuration state
  const [config, setConfig] = useState<GalleryDesignConfig>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(`Failed to parse stored design draft for ${galleryId}:`, e);
    }
    return structuredClone(DEFAULT_GALLERY_DESIGN_CONFIG);
  });

  // History for undo/redo
  const [history, setHistory] = useState<GalleryDesignConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Status tracking
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<DesignDraftStatus>('idle');
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string>();
  const [publishError, setPublishError] = useState<string>();
  const [applyTemplateStatus, setApplyTemplateStatus] = useState<'idle' | 'loading' | 'applied' | 'error'>('idle');
  const [applyTemplateError, setApplyTemplateError] = useState<string>();

  // Track if this is the initial load (don't add to history on first mount)
  const isInitialRef = useRef(true);

  // Debounce timer for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Add a state to history
   */
  const addToHistory = useCallback(
    (newConfig: GalleryDesignConfig) => {
      setHistory((prev) => {
        // Remove any redo states if user made new changes
        const truncated = prev.slice(0, historyIndex + 1);
        // Add new state
        const updated = [...truncated, newConfig];
        // Maintain max size
        if (updated.length > maxHistorySize) {
          return updated.slice(updated.length - maxHistorySize);
        }
        return updated;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, maxHistorySize - 1));
    },
    [historyIndex, maxHistorySize]
  );

  /**
   * Update configuration (with history tracking)
   */
  const updateConfig = useCallback(
    (
      updates:
        | Partial<GalleryDesignConfig>
        | ((prev: GalleryDesignConfig) => GalleryDesignConfig)
    ) => {
      setConfig((prev) => {
        const newConfig = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };

        // Add to history if not initial load
        if (!isInitialRef.current) {
          addToHistory(newConfig);
        } else {
          isInitialRef.current = false;
        }

        return newConfig;
      });

      // Mark as dirty
      setIsDirty(true);
      setError(undefined);

      // Schedule auto-save
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        try {
          localStorage.setItem(storageKey, JSON.stringify(config));
          setLastSavedAt(new Date());
          setSaveStatus('saved');
          // Reset to idle after brief delay
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to save draft';
          setError(message);
          setSaveStatus('error');
        }
      }, autoSaveInterval);
    },
    [config, storageKey, autoSaveInterval, addToHistory]
  );

  /**
   * Manual save to localStorage
   */
  const manualSave = useCallback(() => {
    setSaveStatus('saving');
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setError(undefined);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save draft';
      setError(message);
      setSaveStatus('error');
    }
  }, [config, storageKey]);

  /**
   * Revert to last published version
   */
  const revert = useCallback(() => {
    try {
      const lastPublished = localStorage.getItem(lastPublishedKey);
      if (lastPublished) {
        const config = JSON.parse(lastPublished);
        setConfig(config);
        setIsDirty(false);
        setHistory([]);
        setHistoryIndex(-1);
        localStorage.removeItem(storageKey);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to revert';
      setError(message);
    }
  }, [storageKey, lastPublishedKey]);

  /**
   * Undo last change
   */
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setConfig(history[newIndex]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  /**
   * Redo last undone change
   */
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setConfig(history[newIndex]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  /**
   * Publish design to backend
   */
  const publish = useCallback(async () => {
    setPublishStatus('publishing');
    setPublishError(undefined);

    try {
      // Save to localStorage first (final draft)
      localStorage.setItem(storageKey, JSON.stringify(config));

      // PATCH to backend
      const response = await fetch(
        `${API_BASE}/api/v1/galleries/${galleryId}/design`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({
            design_config: config,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      // Save as published version
      localStorage.setItem(lastPublishedKey, JSON.stringify(config));

      // Clear draft
      localStorage.removeItem(storageKey);
      setIsDirty(false);
      setHistory([]);
      setHistoryIndex(-1);

      setPublishStatus('published');
      // Reset to idle after brief delay
      setTimeout(() => setPublishStatus('idle'), 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to publish design';
      setPublishError(message);
      setPublishStatus('error');
      console.error('Design publish error:', e);
    }
  }, [config, galleryId, storageKey, lastPublishedKey]);

  /**
   * Apply a template to the current design
   * Merges template configuration with current config, optionally preserving cover asset
   */
  const applyTemplate = useCallback(
    async (templateId: string, preserveCoverAsset: boolean = true) => {
      setApplyTemplateStatus('loading');
      setApplyTemplateError(undefined);

      try {
        // Get merged configuration from service
        const mergedConfig = await galleryDesignService.applyTemplate(
          templateId,
          config,
          preserveCoverAsset
        );

        // Apply merged config to local state
        updateConfig(mergedConfig);

        setApplyTemplateStatus('applied');
        // Reset to idle after brief delay
        setTimeout(() => setApplyTemplateStatus('idle'), 2000);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to apply template';
        setApplyTemplateError(message);
        setApplyTemplateStatus('error');
        console.error('Apply template error:', e);
      }
    },
    [config, updateConfig]
  );

  /**
   * Cleanup debounce timer on unmount
   */
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  /**
   * Save to localStorage when config changes (after debounce)
   * This is separate from the auto-save in updateConfig to ensure
   * the latest config is persisted
   */
  useEffect(() => {
    if (isDirty) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        manualSave();
      }, autoSaveInterval);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [config, isDirty, autoSaveInterval, manualSave]);

  return {
    config,
    isDirty,
    saveStatus,
    publishStatus,
    lastSavedAt,
    error,
    updateConfig,
    revert,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    publish,
    publishError,
    applyTemplate,
    applyTemplateStatus,
    applyTemplateError,
  };
};

/**
 * Hook to sync design with gallery service on publish
 *
 * After publishing, you may want to refresh the gallery display
 * or invalidate cached data
 */
export const useDesignPublishEffect = (
  publishStatus: PublishStatus,
  onPublishSuccess?: () => void
) => {
  useEffect(() => {
    if (publishStatus === 'published') {
      onPublishSuccess?.();
    }
  }, [publishStatus, onPublishSuccess]);
};
