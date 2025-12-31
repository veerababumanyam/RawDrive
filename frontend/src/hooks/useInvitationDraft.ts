/**
 * useInvitationDraft Hook
 *
 * Provides auto-save functionality for invitation wizard drafts.
 * Features:
 * - 30-second debounced auto-save
 * - Manual save with instant execution
 * - Save status tracking (idle, saving, saved, error)
 * - Draft restoration from URL param
 *
 * Feature: 016-save-the-date (Phase 10: Save Draft and Auto-Save)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import * as invitationService from '@/services/invitationService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseDraftOptions {
  /** Workspace ID */
  workspaceId: string | null;
  /** Auto-save interval in ms (default 30000 = 30s) */
  autoSaveInterval?: number;
  /** Enable auto-save (default true) */
  autoSaveEnabled?: boolean;
  /** Callback when draft is loaded */
  onDraftLoaded?: (data: Record<string, unknown>) => void;
  /** Callback when save succeeds */
  onSaveSuccess?: (draftId: string) => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
}

export interface UseDraftReturn {
  /** Current draft ID (null if no draft) */
  draftId: string | null;
  /** Save status for UI indicator */
  saveStatus: DraftSaveStatus;
  /** Last saved timestamp */
  lastSavedAt: Date | null;
  /** Whether a draft is being loaded */
  isLoadingDraft: boolean;
  /** Manual save function (immediate, no debounce) */
  saveDraft: (data: Record<string, unknown>) => Promise<string | null>;
  /** Trigger debounced auto-save */
  triggerAutoSave: (data: Record<string, unknown>) => void;
  /** Clear the current draft */
  clearDraft: () => Promise<void>;
  /** Format last saved time for display */
  getLastSavedText: () => string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AUTO_SAVE_INTERVAL = 30000; // 30 seconds

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useInvitationDraft({
  workspaceId,
  autoSaveInterval = DEFAULT_AUTO_SAVE_INTERVAL,
  autoSaveEnabled = true,
  onDraftLoaded,
  onSaveSuccess,
  onSaveError,
}: UseDraftOptions): UseDraftReturn {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [draftId, setDraftId] = useState<string | null>(
    searchParams.get('draft') || null
  );
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Refs for debounce timer and pending data
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<Record<string, unknown> | null>(null);

  // ---------------------------------------------------------------------------
  // Load existing draft from URL param
  // ---------------------------------------------------------------------------

  const draftIdFromUrl = searchParams.get('draft');

  const { isLoading: isLoadingDraft } = useQuery({
    queryKey: ['invitation-draft', workspaceId, draftIdFromUrl],
    queryFn: async () => {
      if (!workspaceId || !draftIdFromUrl) return null;
      return invitationService.getDraft(workspaceId, draftIdFromUrl);
    },
    enabled: !!workspaceId && !!draftIdFromUrl,
    staleTime: Infinity, // Only fetch once
    retry: false, // Don't retry if draft expired
  });

  // Handle draft load success
  useEffect(() => {
    const loadDraft = async () => {
      if (!workspaceId || !draftIdFromUrl) return;

      try {
        const draft = await invitationService.getDraft(workspaceId, draftIdFromUrl);
        if (draft && onDraftLoaded) {
          setDraftId(draft.draft_id);
          setLastSavedAt(new Date(draft.updated_at));
          onDraftLoaded(draft.data);
        }
      } catch {
        // Draft expired or not found - clear URL param
        searchParams.delete('draft');
        setSearchParams(searchParams, { replace: true });
        setDraftId(null);
      }
    };

    loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, draftIdFromUrl]);

  // ---------------------------------------------------------------------------
  // Save mutation
  // ---------------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return invitationService.saveDraft(workspaceId, data, draftId);
    },
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: (response) => {
      const newDraftId = response.draft_id;
      setDraftId(newDraftId);
      setSaveStatus('saved');
      setLastSavedAt(new Date());

      // Update URL with draft ID (for resume capability)
      if (!searchParams.has('draft') || searchParams.get('draft') !== newDraftId) {
        searchParams.set('draft', newDraftId);
        setSearchParams(searchParams, { replace: true });
      }

      // Invalidate drafts list
      queryClient.invalidateQueries({ queryKey: ['invitation-drafts', workspaceId] });

      onSaveSuccess?.(newDraftId);

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
      }, 3000);
    },
    onError: (error: Error) => {
      setSaveStatus('error');
      onSaveError?.(error);

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setSaveStatus((current) => (current === 'error' ? 'idle' : current));
      }, 5000);
    },
  });

  // ---------------------------------------------------------------------------
  // Manual save (immediate)
  // ---------------------------------------------------------------------------

  const saveDraft = useCallback(
    async (data: Record<string, unknown>): Promise<string | null> => {
      // Clear any pending auto-save
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      pendingDataRef.current = null;

      try {
        const result = await saveMutation.mutateAsync(data);
        return result.draft_id;
      } catch {
        return null;
      }
    },
    [saveMutation]
  );

  // ---------------------------------------------------------------------------
  // Auto-save with debounce
  // ---------------------------------------------------------------------------

  const triggerAutoSave = useCallback(
    (data: Record<string, unknown>) => {
      if (!autoSaveEnabled || !workspaceId) return;

      // Store pending data
      pendingDataRef.current = data;

      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new debounced timer
      autoSaveTimerRef.current = setTimeout(() => {
        if (pendingDataRef.current) {
          saveMutation.mutate(pendingDataRef.current);
          pendingDataRef.current = null;
        }
      }, autoSaveInterval);
    },
    [autoSaveEnabled, workspaceId, autoSaveInterval, saveMutation]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Clear draft
  // ---------------------------------------------------------------------------

  const clearDraft = useCallback(async () => {
    // Clear pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    pendingDataRef.current = null;

    // Delete from server if exists
    if (workspaceId && draftId) {
      try {
        await invitationService.deleteDraft(workspaceId, draftId);
        queryClient.invalidateQueries({ queryKey: ['invitation-drafts', workspaceId] });
      } catch {
        // Ignore errors - draft may have already expired
      }
    }

    // Clear local state
    setDraftId(null);
    setSaveStatus('idle');
    setLastSavedAt(null);

    // Remove from URL
    searchParams.delete('draft');
    setSearchParams(searchParams, { replace: true });
  }, [workspaceId, draftId, queryClient, searchParams, setSearchParams]);

  // ---------------------------------------------------------------------------
  // Format last saved time
  // ---------------------------------------------------------------------------

  const getLastSavedText = useCallback((): string => {
    if (!lastSavedAt) return '';

    const now = new Date();
    const diffMs = now.getTime() - lastSavedAt.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);

    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;

    return lastSavedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [lastSavedAt]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    draftId,
    saveStatus,
    lastSavedAt,
    isLoadingDraft,
    saveDraft,
    triggerAutoSave,
    clearDraft,
    getLastSavedText,
  };
}

export default useInvitationDraft;
