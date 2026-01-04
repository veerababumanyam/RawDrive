/**
 * usePeopleMerge Hook
 *
 * Encapsulates all face group merge functionality for the People page.
 * Manages selection state, AI suggestions, and merge operations.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  faceApiService,
  FaceGroup,
  MergeSuggestion,
  MergeResult,
} from '../services/faceApiService';

interface UsePeopleMergeOptions {
  workspaceId: string | undefined;
  groups: FaceGroup[];
  onMergeComplete: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
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
}

export function usePeopleMerge({
  workspaceId,
  groups,
  onMergeComplete,
  onError,
  onSuccess,
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
        const result = await faceApiService.multiMergeFaceGroups(
          workspaceId,
          sourceGroupIds,
          targetGroupId,
          { representativeFaceId, name }
        );

        onSuccess(
          `Successfully merged ${result.faces_merged} photos into one person`
        );

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
    [workspaceId, selectedGroupIds, onMergeComplete, onError, onSuccess]
  );

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
  };
}

export default usePeopleMerge;
