/**
 * usePeopleMerge Hook
 *
 * Encapsulates all face group merge functionality for the People page.
 * Manages selection state, AI suggestions, and merge operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  faceApiService,
  FaceGroup,
  MergeSuggestion,
  MergeResult,
} from '../services/faceApiService';
import { createUndoMergeToast } from '../components/features/face/UndoMergeToast';

/** Pre-merge state captured for undo */
export interface PreMergeState {
  sourceGroupIds: string[];
  sourceGroupNames: string[];
  targetGroupId: string;
  targetGroupName: string;
  /** Face IDs per source group for split-based undo */
  sourceFaceIdsByGroup: Record<string, string[]>;
  timestamp: number;
}

interface UsePeopleMergeOptions {
  workspaceId: string | undefined;
  groups: FaceGroup[];
  onMergeComplete: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  /** Called to show an undo toast -- passes toast data compatible with addToast */
  onShowUndoToast?: (toastData: ReturnType<typeof createUndoMergeToast>) => void;
}

interface UsePeopleMergeReturn {
  // Selection mode
  selectionMode: boolean;
  toggleSelectionMode: () => void;
  exitSelectionMode: () => void;

  // Selected groups
  selectedGroupIds: Set<string>;
  toggleGroupSelection: (groupId: string) => void;
  clearSelection: () => void;
  selectSuggestionPair: (suggestion: MergeSuggestion) => void;

  // Get selected groups as array (for modal)
  selectedGroups: FaceGroup[];

  // AI suggestions
  mergeSuggestions: MergeSuggestion[];
  loadingSuggestions: boolean;
  fetchSuggestions: () => Promise<void>;

  // Merge modal
  showMergeModal: boolean;
  openMergeModal: () => void;
  closeMergeModal: () => void;

  // Merge action
  handleMergeConfirm: (
    targetGroupId: string,
    representativeFaceId?: string,
    name?: string
  ) => Promise<MergeResult | null>;
  isMerging: boolean;

  // Undo merge
  preMergeState: PreMergeState | null;
  undoMerge: () => Promise<void>;
  canUndo: boolean;
}

export function usePeopleMerge({
  workspaceId,
  groups,
  onMergeComplete,
  onError,
  onSuccess,
  onShowUndoToast,
}: UsePeopleMergeOptions): UsePeopleMergeReturn {
  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Suggestions state
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Modal state
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Merge operation state
  const [isMerging, setIsMerging] = useState(false);

  // Undo merge state
  const [preMergeState, setPreMergeState] = useState<PreMergeState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch merge suggestions when entering selection mode
  const fetchSuggestions = useCallback(async () => {
    if (!workspaceId) return;

    setLoadingSuggestions(true);
    try {
      const result = await faceApiService.getMergeSuggestions(workspaceId, {
        threshold: 0.75,
        limit: 20,
      });
      setMergeSuggestions(result.suggestions);
    } catch (err) {
      console.error('Failed to fetch merge suggestions:', err);
      // Don't show error toast - suggestions are optional enhancement
    } finally {
      setLoadingSuggestions(false);
    }
  }, [workspaceId]);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (!prev) {
        // Entering selection mode - fetch suggestions
        fetchSuggestions();
      } else {
        // Exiting selection mode - clear selection
        setSelectedGroupIds(new Set());
        setMergeSuggestions([]);
      }
      return !prev;
    });
  }, [fetchSuggestions]);

  // Exit selection mode
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedGroupIds(new Set());
    setMergeSuggestions([]);
  }, []);

  // Toggle individual group selection
  const toggleGroupSelection = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedGroupIds(new Set());
  }, []);

  // Select both groups from a suggestion pair
  const selectSuggestionPair = useCallback((suggestion: MergeSuggestion) => {
    setSelectedGroupIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(suggestion.group1.id);
      newSet.add(suggestion.group2.id);
      return newSet;
    });
  }, []);

  // Get selected groups as FaceGroup array (for merge modal)
  const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.id));

  // Open merge modal
  const openMergeModal = useCallback(() => {
    if (selectedGroupIds.size >= 2) {
      setShowMergeModal(true);
    }
  }, [selectedGroupIds.size]);

  // Close merge modal
  const closeMergeModal = useCallback(() => {
    setShowMergeModal(false);
  }, []);

  // Handle merge confirmation from modal
  const handleMergeConfirm = useCallback(
    async (
      targetGroupId: string,
      representativeFaceId?: string,
      name?: string
    ): Promise<MergeResult | null> => {
      if (!workspaceId || selectedGroupIds.size < 2) return null;

      // Get source IDs (all selected except target)
      const sourceGroupIds = Array.from(selectedGroupIds).filter(
        (id) => id !== targetGroupId
      );

      if (sourceGroupIds.length === 0) {
        onError('Please select at least one group to merge');
        return null;
      }

      setIsMerging(true);
      try {
        // Capture pre-merge state for undo
        const sourceGroups = groups.filter((g) => sourceGroupIds.includes(g.id));
        const targetGroup = groups.find((g) => g.id === targetGroupId);

        // Fetch face IDs from each source group for undo (best-effort)
        const sourceFaceIdsByGroup: Record<string, string[]> = {};
        try {
          await Promise.all(
            sourceGroupIds.map(async (gid) => {
              if (workspaceId) {
                const facesResult = await faceApiService.getFacesInGroup(workspaceId, gid, { limit: 200 });
                sourceFaceIdsByGroup[gid] = facesResult.faces.map((f) => f.id);
              }
            })
          );
        } catch {
          // Non-critical -- undo won't work but merge still proceeds
          console.warn('Could not capture pre-merge face IDs for undo');
        }

        const result = await faceApiService.multiMergeFaceGroups(
          workspaceId,
          sourceGroupIds,
          targetGroupId,
          { representativeFaceId, name }
        );

        // Store pre-merge state for undo
        const capturedState: PreMergeState = {
          sourceGroupIds,
          sourceGroupNames: sourceGroups.map(
            (g) => g.person_name || g.name || 'Unnamed'
          ),
          targetGroupId,
          targetGroupName:
            targetGroup?.person_name || targetGroup?.name || 'group',
          sourceFaceIdsByGroup,
          timestamp: Date.now(),
        };
        setPreMergeState(capturedState);

        // Clear any previous undo timer
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        // Auto-clear undo state after 10 seconds
        undoTimerRef.current = setTimeout(() => {
          setPreMergeState(null);
        }, 10000);

        onSuccess(
          `Successfully merged ${result.faces_merged} photos into one person`
        );

        // Show undo toast if callback is provided
        if (onShowUndoToast) {
          onShowUndoToast(
            createUndoMergeToast({
              mergedGroupNames: capturedState.sourceGroupNames,
              targetGroupName: capturedState.targetGroupName,
              onUndo: () => {
                // Will be handled by undoMerge
                undoMergeInternal(capturedState);
              },
            })
          );
        }

        // Close modal and reset state
        setShowMergeModal(false);
        setSelectedGroupIds(new Set());
        setSelectionMode(false);
        setMergeSuggestions([]);

        // Trigger refresh
        onMergeComplete();

        return result;
      } catch (err) {
        console.error('Failed to merge face groups:', err);
        onError('Failed to merge people. Please try again.');
        return null;
      } finally {
        setIsMerging(false);
      }
    },
    [workspaceId, selectedGroupIds, groups, onMergeComplete, onError, onSuccess, onShowUndoToast]
  );

  // Undo merge: split source faces back from target group
  const undoMergeInternal = useCallback(
    async (state: PreMergeState) => {
      if (!workspaceId) return;

      try {
        // For each source group, split its faces back out
        for (const [, faceIds] of Object.entries(state.sourceFaceIdsByGroup)) {
          if (faceIds.length > 0) {
            await faceApiService.splitFaceGroup(
              workspaceId,
              state.targetGroupId,
              faceIds
            );
          }
        }
        onSuccess('Merge undone successfully');
        setPreMergeState(null);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        onMergeComplete();
      } catch (err) {
        console.error('Failed to undo merge:', err);
        onError('Failed to undo merge. The groups may need manual adjustment.');
      }
    },
    [workspaceId, onSuccess, onError, onMergeComplete]
  );

  const undoMerge = useCallback(async () => {
    if (preMergeState) {
      await undoMergeInternal(preMergeState);
    }
  }, [preMergeState, undoMergeInternal]);

  const canUndo = preMergeState !== null;

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Keyboard handler for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectionMode && !showMergeModal) {
        exitSelectionMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode, showMergeModal, exitSelectionMode]);

  return {
    // Selection mode
    selectionMode,
    toggleSelectionMode,
    exitSelectionMode,

    // Selected groups
    selectedGroupIds,
    toggleGroupSelection,
    clearSelection,
    selectSuggestionPair,
    selectedGroups,

    // AI suggestions
    mergeSuggestions,
    loadingSuggestions,
    fetchSuggestions,

    // Merge modal
    showMergeModal,
    openMergeModal,
    closeMergeModal,

    // Merge action
    handleMergeConfirm,
    isMerging,

    // Undo merge
    preMergeState,
    undoMerge,
    canUndo,
  };
}

export default usePeopleMerge;
