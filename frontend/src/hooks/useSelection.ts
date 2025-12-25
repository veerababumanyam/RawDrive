import { useState, useCallback, useMemo } from 'react';
import { GalleryAssetItem } from '../types/gallery';
import { SelectionState, SelectionActions } from '../types/canvas';

export function useSelection(assets: GalleryAssetItem[]): [SelectionState, SelectionActions] {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multi' | 'range'>('single');

  const isSelected = useCallback((assetId: string) => {
    return selectedIds.has(assetId);
  }, [selectedIds]);

  const select = useCallback((assetId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(assetId);
      return next;
    });
    setLastSelectedId(assetId);
    setSelectionMode('single');
  }, []);

  const deselect = useCallback((assetId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    // We don't update lastSelectedId on deselect typically, or we might clear it if it was the one deselected
    // But keeping it allows shift-click to work from the last "interacted" item potentially.
    // For now, let's leave it.
  }, []);

  const toggle = useCallback((assetId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
    setLastSelectedId(assetId);
  }, []);

  const selectRange = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId) return;
    
    // Find indices
    const fromIndex = assets.findIndex(a => a.asset_id === fromId);
    const toIndex = assets.findIndex(a => a.asset_id === toId);
    
    if (fromIndex === -1 || toIndex === -1) return;
    
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    
    const rangeIds = assets.slice(start, end + 1).map(a => a.asset_id);
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      rangeIds.forEach(id => next.add(id));
      return next;
    });
    setLastSelectedId(toId);
    setSelectionMode('range');
  }, [assets]);

  const selectAll = useCallback(() => {
    const allIds = assets.map(a => a.asset_id);
    setSelectedIds(new Set(allIds));
    setSelectionMode('multi');
  }, [assets]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode('single');
    setLastSelectedId(null);
  }, []);

  const state: SelectionState = useMemo(() => ({
    selectedIds,
    lastSelectedId,
    selectionMode
  }), [selectedIds, lastSelectedId, selectionMode]);

  /* New unified selection handler */
  const handleSelection = useCallback((assetId: string, event: React.MouseEvent | React.KeyboardEvent) => {
    // Check modifiers
    const isMultiClick = event.metaKey || event.ctrlKey;
    const isRangeClick = event.shiftKey;

    if (isMultiClick) {
      // Toggle logic
      toggle(assetId);
      // NOTE: We do NOT update lastSelectedId on toggle usually, or we do?
      // Standard: Cmd+Click updates "active" focus but toggle selection.
      // Let's update it to allow Shift+Click subsequent anchor.
      setLastSelectedId(assetId);
      setSelectionMode('multi');
    } else if (isRangeClick) {
      // Range logic
      if (lastSelectedId) {
        selectRange(lastSelectedId, assetId);
      } else {
        // Fallback to single select if no anchor
        select(assetId);
      }
    } else {
      // Single select logic
      // Note: This replaces the entire selection
      setSelectedIds(new Set([assetId]));
      setLastSelectedId(assetId);
      setSelectionMode('single');
    }
  }, [toggle, selectRange, select, lastSelectedId]);

  const actions: SelectionActions = useMemo(() => ({
    select,
    deselect,
    toggle,
    selectRange,
    selectAll,
    deselectAll,
    isSelected,
    handleSelection
  }), [select, deselect, toggle, selectRange, selectAll, deselectAll, isSelected, handleSelection]);

  return [state, actions];
}
