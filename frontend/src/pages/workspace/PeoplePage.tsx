import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Grid,
  List,
  Edit,
  Trash2,
  Loader2,
  UserCircle,
  Users2,
  ImageIcon,
  RefreshCw,
  Merge,
  Check,
  CheckSquare,
  X,
  Sparkles,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import { faceApiService, FaceApiError, FaceGroup, MergeSuggestion } from '../../services/faceApiService';
import { FaceGroupMergeModal } from '../../components/features/gallery/FaceGroupMergeModal';
import { FaceErrorBoundary } from '../../components/features/face/FaceErrorBoundary';

/* =============================================================================
   PeoplePage Component

   Displays all detected people (face groups) in the workspace with thumbnails.
   Clicking a person navigates to a filtered view showing all their photos.

   UX Pattern: Inline selection like gallery photos
   - Checkbox appears on hover (top-left corner)
   - Selected items stay highlighted
   - Action bar appears at bottom when items are selected
   - Actions: Merge, Rename (single), Delete
   ============================================================================= */

type ViewMode = 'grid' | 'list';

const PeoplePage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['common']);

  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [groups, setGroups] = useState<FaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Inline selection state (like gallery photos)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // AI merge suggestions
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  // Edit state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<FaceGroup | null>(null);
  const [groupsToDelete, setGroupsToDelete] = useState<FaceGroup[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch face groups
  const fetchGroups = useCallback(async (showRefreshSpinner = false) => {
    if (!workspace?.workspace_id) {
      setLoading(false);
      setFetchError(null);
      return;
    }

    setFetchError(null);
    if (showRefreshSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await faceApiService.getFaceGroups(workspace.workspace_id, {
        minFaces: 1,
        limit: 100,
      });
      setGroups(result.groups);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch people:', err);
      const status = err instanceof FaceApiError ? err.status : undefined;
      const hint = status === 403
        ? ' Check workspace access or biometric consent.'
        : status === 422
          ? ' Backend validation failed.'
          : '';
      const message = `Failed to load people (${status ?? 'error'}).${hint} Please try again.`;
      setFetchError(message);
      addToast({ message, variant: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.workspace_id, addToast]);

  // Fetch AI merge suggestions
  const fetchSuggestions = useCallback(async () => {
    if (!workspace?.workspace_id) return;
    setLoadingSuggestions(true);
    try {
      const result = await faceApiService.getMergeSuggestions(workspace.workspace_id, {
        threshold: 0.75,
        limit: 20,
      });
      setMergeSuggestions(result.suggestions);
    } catch (err) {
      console.error('Failed to fetch merge suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [workspace?.workspace_id]);

  // Run fetch once per workspace (avoid duplicate run when addToast identity changes)
  useEffect(() => {
    if (!workspace?.workspace_id) return;
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when workspace changes
  }, [workspace?.workspace_id]);

  // Fetch suggestions when groups are loaded
  useEffect(() => {
    if (groups.length > 1) {
      fetchSuggestions();
    }
  }, [groups.length, fetchSuggestions]);

  // Selection helpers
  const toggleSelection = useCallback((groupId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredGroups.map(g => g.id)));
  }, []);

  const selectSuggestionPair = useCallback((suggestion: MergeSuggestion) => {
    setSelectedIds(new Set([suggestion.group1.id, suggestion.group2.id]));
  }, []);

  // Get selected groups as array
  const selectedGroups = useMemo(() =>
    groups.filter(g => selectedIds.has(g.id)),
    [groups, selectedIds]
  );

  // Handle merge confirmation
  const handleMergeConfirm = useCallback(async (
    targetGroupId: string,
    representativeFaceId?: string,
    name?: string
  ) => {
    if (!workspace?.workspace_id || selectedIds.size < 2) return null;

    const sourceGroupIds = Array.from(selectedIds).filter(id => id !== targetGroupId);
    if (sourceGroupIds.length === 0) {
      addToast({ message: 'Please select at least one group to merge', variant: 'error' });
      return null;
    }

    setIsMerging(true);
    try {
      const result = await faceApiService.multiMergeFaceGroups(
        workspace.workspace_id,
        sourceGroupIds,
        targetGroupId,
        { representativeFaceId, name }
      );
      addToast({ message: `Successfully merged ${result.faces_merged} photos into one person`, variant: 'success' });
      setShowMergeModal(false);
      setSelectedIds(new Set());
      fetchGroups();
      fetchSuggestions();
      return result;
    } catch (err) {
      console.error('Failed to merge face groups:', err);
      addToast({ message: 'Failed to merge people. Please try again.', variant: 'error' });
      return null;
    } finally {
      setIsMerging(false);
    }
  }, [workspace?.workspace_id, selectedIds, addToast, fetchGroups, fetchSuggestions]);

  // Filter groups by search - uses person_name (canonical) or legacy name field
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter((group, index) => {
      const name = group.person_name || group.name || `Person ${index + 1}`;
      return name.toLowerCase().includes(query);
    });
  }, [groups, searchQuery]);

  // Handlers
  const handlePersonClick = (groupId: string) => {
    // Navigate to galleries page with person filter
    navigate(`/workspace/galleries?person=${groupId}`);
  };

  const handleRename = async (groupId: string) => {
    if (!workspace?.workspace_id || !newName.trim()) return;

    try {
      await faceApiService.namePerson(
        workspace.workspace_id,
        groupId,
        newName.trim()
      );
      addToast({ message: 'Person named successfully', variant: 'success' });
      setEditingName(null);
      setNewName('');
      clearSelection();
      fetchGroups();
    } catch (err) {
      console.error('Failed to name person:', err);
      addToast({ message: 'Failed to name person', variant: 'error' });
    }
  };

  // Single delete (from card menu or action bar with 1 selected)
  const handleDeleteClick = (group: FaceGroup) => {
    setGroupToDelete(group);
    setGroupsToDelete([]);
    setDeleteDialogOpen(true);
  };

  // Bulk delete from action bar
  const handleBulkDeleteClick = () => {
    const toDelete = groups.filter(g => selectedIds.has(g.id));
    setGroupsToDelete(toDelete);
    setGroupToDelete(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!workspace?.workspace_id) return;

    const idsToDelete = groupToDelete
      ? [groupToDelete.id]
      : groupsToDelete.map(g => g.id);

    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      // Delete each group
      await Promise.all(
        idsToDelete.map(id => faceApiService.deleteFaceGroup(workspace.workspace_id!, id))
      );
      const count = idsToDelete.length;
      addToast({
        message: count === 1 ? 'Person deleted successfully' : `${count} people deleted successfully`,
        variant: 'success'
      });
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      setGroupsToDelete([]);
      clearSelection();
      fetchGroups();
    } catch (err) {
      addToast({ message: 'Failed to delete. Please try again.', variant: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Grid ref for keyboard navigation
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard handler for Escape to clear selection and arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMergeModal) return; // Let modal handle its own Escape
        if (selectedIds.size > 0) {
          clearSelection();
          return;
        }
      }

      // Arrow key navigation within grid
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const grid = gridRef.current;
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-face-card]'));
        const activeEl = document.activeElement as HTMLElement;
        const currentIndex = cards.indexOf(activeEl);

        if (currentIndex === -1) return;

        e.preventDefault();
        const style = window.getComputedStyle(grid);
        const columns = style.gridTemplateColumns.split(' ').length;

        let nextIndex = currentIndex;
        if (e.key === 'ArrowRight') nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        if (e.key === 'ArrowLeft') nextIndex = Math.max(currentIndex - 1, 0);
        if (e.key === 'ArrowDown') nextIndex = Math.min(currentIndex + columns, cards.length - 1);
        if (e.key === 'ArrowUp') nextIndex = Math.max(currentIndex - columns, 0);

        cards[nextIndex]?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds.size, clearSelection, showMergeModal]);

  return (
    <div className="min-h-full bg-background pb-24">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Users2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">
                  {t('nav.people', 'People')}
                </h1>
                <p className="text-sm text-text-secondary">
                  {`${total} ${total === 1 ? 'person' : 'people'} detected in your photos`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh button */}
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => fetchGroups(true)}
                disabled={refreshing}
                title="Refresh people detection list"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </AppButton>

              {/* View toggle */}
              <div className="flex items-center gap-1 p-1 bg-surface-hover rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'grid'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                    }`}
                  title="Grid view"
                >
                  <Grid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'list'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                    }`}
                  title="List view"
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <FaceErrorBoundary context="PeoplePage">
      <div className="p-6">
        {/* AI Merge Suggestions Strip - Always visible when suggestions exist */}
        {showSuggestions && mergeSuggestions.length > 0 && (
          <div className="mb-4 p-3 bg-gradient-to-r from-accent/5 to-primary/5 rounded-xl border border-accent/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  AI Merge Suggestions
                </span>
                <span className="text-xs text-text-tertiary">
                  Same person detected - click to select
                </span>
              </div>
              <button
                onClick={() => setShowSuggestions(false)}
                className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary"
                title="Hide suggestions"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {mergeSuggestions.slice(0, 10).map((suggestion) => (
                <SuggestionChip
                  key={`${suggestion.group1.id}-${suggestion.group2.id}`}
                  suggestion={suggestion}
                  onClick={() => selectSuggestionPair(suggestion)}
                />
              ))}
            </div>
          </div>
        )}

        {loadingSuggestions && groups.length > 1 && (
          <div className="mb-4 p-3 bg-surface-hover/50 rounded-xl border border-border/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent animate-pulse" />
              <span className="text-sm text-text-secondary">Finding similar people...</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
            <p>Loading people...</p>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
            <div className="w-24 h-24 rounded-full bg-error/10 flex items-center justify-center mb-6">
              <UserCircle className="w-12 h-12 text-error opacity-70" />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">Could not load people</h3>
            <p className="text-center max-w-md text-text-secondary mb-4">{fetchError}</p>
            <AppButton variant="primary" onClick={() => fetchGroups()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </AppButton>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
            <div className="w-24 h-24 rounded-full bg-surface-hover flex items-center justify-center mb-6">
              <UserCircle className="w-12 h-12 opacity-50" />
            </div>
            {searchQuery ? (
              <>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No people match your search
                </h3>
                <p className="text-center max-w-md">
                  Try adjusting your search terms or clear the search to see all detected people.
                </p>
                <AppButton
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </AppButton>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No people detected yet
                </h3>
                <p className="text-center max-w-md text-text-secondary">
                  Our AI automatically identifies and groups faces from your photos in real-time.
                  Upload photos with faces to your galleries, or open a gallery and use &quot;Group Detected Faces&quot; to cluster any detected faces.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <AppButton
                    variant="primary"
                    onClick={() => navigate('/workspace/galleries')}
                  >
                    Go to Galleries
                  </AppButton>
                  <AppButton
                    variant="outline"
                    onClick={() => fetchGroups(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                    Refresh
                  </AppButton>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => window.open('https://docs.rawdrive.com/features/face-detection', '_blank')}
                  >
                    Learn more about face detection & privacy
                  </button>
                </div>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div
            ref={gridRef}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4"
            role="grid"
            aria-label="Face groups"
          >
            {filteredGroups.map((group, index) => (
              <PersonCard
                key={group.id}
                group={group}
                index={index}
                isEditing={editingName === group.id}
                editName={newName}
                onEditNameChange={setNewName}
                onStartEdit={(id, currentName) => {
                  setEditingName(id);
                  setNewName(currentName);
                }}
                onSaveEdit={() => handleRename(group.id)}
                onCancelEdit={() => {
                  setEditingName(null);
                  setNewName('');
                }}
                onClick={() => handlePersonClick(group.id)}
                onDelete={() => handleDeleteClick(group)}
                isSelected={selectedIds.has(group.id)}
                onToggleSelection={() => toggleSelection(group.id)}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            {filteredGroups.map((group, index) => (
              <PersonListItem
                key={group.id}
                group={group}
                index={index}
                isEditing={editingName === group.id}
                editName={newName}
                onEditNameChange={setNewName}
                onStartEdit={(id, currentName) => {
                  setEditingName(id);
                  setNewName(currentName);
                }}
                onSaveEdit={() => handleRename(group.id)}
                onCancelEdit={() => {
                  setEditingName(null);
                  setNewName('');
                }}
                onClick={() => handlePersonClick(group.id)}
                onDelete={() => handleDeleteClick(group)}
                isSelected={selectedIds.has(group.id)}
                onToggleSelection={() => toggleSelection(group.id)}
              />
            ))}
          </motion.div>
        )}
      </div>
      </FaceErrorBoundary>

      {/* Selection Action Bar - Fixed at bottom when items are selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
          >
            <div className="max-w-4xl mx-auto px-4 pb-6">
              <div className="pointer-events-auto bg-surface/95 backdrop-blur-md border border-border shadow-xl rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  {/* Selection info */}
                  <div className="flex items-center gap-3" role="alert" aria-live="polite">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                      <CheckSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">
                        {selectedIds.size} {selectedIds.size === 1 ? 'person' : 'people'} selected
                      </p>
                      <p className="text-xs text-text-secondary">
                        Press Escape to clear
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Rename - only for single selection */}
                    {selectedIds.size === 1 && (
                      <AppButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const group = selectedGroups[0];
                          if (group) {
                            const name = group.person_name || group.name || '';
                            setEditingName(group.id);
                            setNewName(name);
                          }
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1.5" />
                        Rename
                      </AppButton>
                    )}

                    {/* Merge - only for 2+ selections */}
                    {selectedIds.size >= 2 && (
                      <AppButton
                        variant="outline"
                        size="sm"
                        onClick={() => setShowMergeModal(true)}
                        className="border-accent text-accent hover:bg-accent/10"
                      >
                        <Merge className="w-4 h-4 mr-1.5" />
                        Merge {selectedIds.size}
                      </AppButton>
                    )}

                    {/* Delete */}
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={handleBulkDeleteClick}
                      className="text-error hover:bg-error/10"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Delete
                    </AppButton>

                    {/* Clear */}
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Clear
                    </AppButton>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merge Modal */}
      <FaceGroupMergeModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        selectedGroups={selectedGroups}
        workspaceId={workspace?.workspace_id || ''}
        onConfirm={handleMergeConfirm}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setGroupToDelete(null);
          setGroupsToDelete([]);
        }}
        onConfirm={handleDeleteConfirm}
        deleteType="soft"
        entityType="gallery"
        entityName={
          groupToDelete
            ? (groupToDelete.person_name || groupToDelete.name || 'this person')
            : `${groupsToDelete.length} people`
        }
        isLoading={isDeleting}
      />
    </div>
  );
};

/* =============================================================================
   SuggestionChip Component - AI merge suggestion
   ============================================================================= */

interface SuggestionChipProps {
  suggestion: MergeSuggestion;
  onClick: () => void;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({ suggestion, onClick }) => {
  const { group1, group2, similarity } = suggestion;
  const similarityPercent = Math.round(similarity * 100);

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover border border-border/50 hover:border-primary/50 rounded-lg transition-all group"
      title={`Click to select for merging (${similarityPercent}% similar)`}
    >
      {/* Person 1 thumbnail */}
      <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-border/30">
        {group1.representative_thumbnail_url ? (
          <img
            src={group1.representative_thumbnail_url}
            alt={group1.person_name || group1.name || 'Person'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-4 h-4 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Plus icon */}
      <span className="text-text-tertiary">+</span>

      {/* Person 2 thumbnail */}
      <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-border/30">
        {group2.representative_thumbnail_url ? (
          <img
            src={group2.representative_thumbnail_url}
            alt={group2.person_name || group2.name || 'Person'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-4 h-4 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Similarity badge */}
      <span className="text-xs font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">
        {similarityPercent}%
      </span>
    </button>
  );
};

/* =============================================================================
   PersonCard Component - Grid View with inline selection
   ============================================================================= */

interface PersonCardProps {
  group: FaceGroup;
  index: number;
  isEditing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onStartEdit: (id: string, currentName: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onClick: () => void;
  onDelete: () => void;
  isSelected: boolean;
  onToggleSelection: () => void;
}

const PersonCard: React.FC<PersonCardProps> = ({
  group,
  index,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onClick,
  onDelete,
  isSelected,
  onToggleSelection,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayName = group.person_name || group.name || `Person ${index + 1}`;
  const thumbnailUrl = group.representative_thumbnail_url;
  const isNamed = !!(group.person_name || group.name);

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicking on the card (not checkbox), navigate to person photos
    onClick();
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelection();
  };

  return (
    <motion.div
      variants={staggerItem}
      data-face-card
      tabIndex={0}
      aria-label={`${displayName}, ${group.face_count} ${group.face_count === 1 ? 'photo' : 'photos'}${isSelected ? ', selected' : ''}`}
      className={`group relative flex flex-col items-center p-4 rounded-2xl border cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${isSelected
          ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
          : 'bg-surface hover:bg-surface-hover border-border/50 hover:border-primary/30 hover:shadow-lg'
        }`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelection();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Selection checkbox - top left, appears on hover or when selected */}
      <div
        className={`absolute top-2 left-2 z-10 transition-opacity duration-200 ${isSelected || isHovered ? 'opacity-100' : 'opacity-0'
          }`}
      >
        <button
          onClick={handleCheckboxClick}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-sm ${isSelected
              ? 'bg-primary text-white'
              : 'bg-surface/90 backdrop-blur-sm border border-border hover:border-primary hover:bg-surface'
            }`}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-label={`Select ${displayName}`}
        >
          {isSelected ? <Check className="w-4 h-4" /> : <CheckSquare className="w-4 h-4 text-text-secondary" />}
        </button>
      </div>

      {/* Thumbnail */}
      <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 mb-3 ring-2 transition-all ${isSelected
          ? 'ring-primary'
          : 'ring-border/30 group-hover:ring-primary/30'
        }`}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-12 h-12 md:w-14 md:h-14 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Name */}
      {isEditing ? (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="w-full px-3 py-1.5 text-sm text-center bg-surface border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
          <div className="flex justify-center gap-2 mt-2">
            <button
              onClick={onSaveEdit}
              className="text-xs text-primary hover:underline"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs text-text-tertiary hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <span
          className={`text-sm truncate max-w-full px-2 text-center ${isNamed
              ? 'font-medium text-text-primary'
              : 'text-text-tertiary italic'
            }`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit(group.id, isNamed ? displayName : '');
          }}
          title={isNamed ? displayName : 'Double-click to name this person'}
        >
          {displayName}
        </span>
      )}

      {/* Photo count */}
      <span className="text-xs text-text-tertiary mt-1 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />
        {group.face_count} {group.face_count === 1 ? 'photo' : 'photos'}
      </span>
    </motion.div>
  );
};

/* =============================================================================
   PersonListItem Component - List View with inline selection
   ============================================================================= */

interface PersonListItemProps {
  group: FaceGroup;
  index: number;
  isEditing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onStartEdit: (id: string, currentName: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onClick: () => void;
  onDelete: () => void;
  isSelected: boolean;
  onToggleSelection: () => void;
}

const PersonListItem: React.FC<PersonListItemProps> = ({
  group,
  index,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onClick,
  onDelete,
  isSelected,
  onToggleSelection,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayName = group.person_name || group.name || `Person ${index + 1}`;
  const thumbnailUrl = group.representative_thumbnail_url;
  const isNamed = !!(group.person_name || group.name);

  const handleRowClick = () => {
    onClick();
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelection();
  };

  return (
    <motion.div
      variants={staggerItem}
      className={`group flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${isSelected
          ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
          : 'bg-surface hover:bg-surface-hover border-border/50 hover:border-primary/30'
        }`}
      onClick={handleRowClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Selection checkbox - always visible in list view */}
      <div
        className={`flex-shrink-0 transition-opacity duration-200 ${isSelected || isHovered ? 'opacity-100' : 'opacity-40'
          }`}
      >
        <button
          onClick={handleCheckboxClick}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isSelected
              ? 'bg-primary text-white'
              : 'bg-surface border border-border hover:border-primary'
            }`}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <Check className="w-4 h-4" /> : <CheckSquare className="w-4 h-4 text-text-secondary" />}
        </button>
      </div>

      {/* Thumbnail */}
      <div className={`flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-2 transition-all ${isSelected
          ? 'ring-primary'
          : 'ring-border/30 group-hover:ring-primary/30'
        }`}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              className="w-full max-w-xs px-3 py-1.5 text-sm bg-surface border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={onSaveEdit}
                className="text-xs text-primary hover:underline"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="text-xs text-text-tertiary hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3
              className={`truncate ${isNamed
                  ? 'font-medium text-text-primary'
                  : 'text-text-tertiary italic'
                }`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartEdit(group.id, isNamed ? displayName : '');
              }}
              title={isNamed ? displayName : 'Double-click to name this person'}
            >
              {displayName}
            </h3>
            <p className="text-sm text-text-tertiary flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {group.face_count} {group.face_count === 1 ? 'photo' : 'photos'}
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default PeoplePage;
