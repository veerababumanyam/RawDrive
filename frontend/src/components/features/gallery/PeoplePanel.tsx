/**
 * PeoplePanel Component
 * Displays detected faces grouped by person for a gallery
 * Shows only people who appear in this specific gallery (gallery-scoped)
 * Allows filtering photos by person and managing face groups
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { X, Users, Search, ChevronRight, Loader2, UserCircle, RefreshCw, CheckCircle2, Merge, Sparkles } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../ui/Toast';
import { faceApiService, FaceGroupWithGalleryStats, MergeSuggestion } from '../../../services/faceApiService';
import { FaceGroupMergeModal } from './FaceGroupMergeModal';
import { FaceGroupDetailPanel } from './FaceGroupDetailPanel';

// Configuration constants
const FACE_GROUPS_LIMIT = 100;
const MERGE_SUGGESTIONS_LIMIT = 20;
const MERGE_SUGGESTIONS_DISPLAY_LIMIT = 5;
const SIMILARITY_THRESHOLD = 0.75;
const MIN_GROUPS_FOR_MERGE = 2;

interface PeoplePanelProps {
    galleryId: string;
    isOpen: boolean;
    onClose: () => void;
    onFilterByPerson?: (groupId: string | null) => void;
}

export const PeoplePanel: React.FC<PeoplePanelProps> = ({
    galleryId,
    isOpen,
    onClose,
    onFilterByPerson,
}) => {
    const { workspace } = useAuth();
    const { addToast } = useToast();

    // Use gallery-scoped face groups with gallery-specific stats
    const [groups, setGroups] = useState<FaceGroupWithGalleryStats[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanStatus, setScanStatus] = useState<{
        scanning: boolean;
        message?: string;
        pending?: number;
    }>({ scanning: false });
    const [searchQuery, setSearchQuery] = useState('');
    const [editingName, setEditingName] = useState<string | null>(null);
    const [newName, setNewName] = useState('');

    // Selection mode state for merge functionality
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showDetailPanel, setShowDetailPanel] = useState(false);
    const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
    const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // Fetch face groups for THIS GALLERY (gallery-scoped, not workspace-wide)
    const fetchGroups = useCallback(async () => {
        if (!workspace?.workspace_id || !galleryId) return;

        setLoading(true);
        try {
            // Use gallery-scoped API to only show people in this gallery
            const result = await faceApiService.getGalleryFaceGroups(
                workspace.workspace_id,
                galleryId,
                {
                    limit: FACE_GROUPS_LIMIT,
                }
            );
            setGroups(result.groups);
        } catch (error) {
            console.error('Failed to fetch face groups:', error);
            addToast({
                message: 'Failed to load people. Please try again.',
                variant: 'error'
            });
        } finally {
            setLoading(false);
        }
    }, [workspace?.workspace_id, galleryId, addToast]);

    // Auto-scan gallery for new unscanned faces (smart incremental scan)
    const autoScanGallery = useCallback(async () => {
        if (!workspace?.workspace_id || !galleryId) return;

        setScanStatus({ scanning: true, message: 'Checking for new photos...' });
        try {
            const result = await faceApiService.scanGalleryFaces(workspace.workspace_id, galleryId);
            
            // Update status based on response
            if (result.jobs_queued > 0) {
                setScanStatus({ 
                    scanning: true, 
                    message: result.message,
                    pending: result.jobs_queued + (result.pending || 0)
                });
                // Poll for completion if jobs were queued
                pollForCompletion();
            } else if (result.pending && result.pending > 0) {
                setScanStatus({ 
                    scanning: true, 
                    message: `Processing ${result.pending} photo${result.pending !== 1 ? 's' : ''}...`,
                    pending: result.pending
                });
                pollForCompletion();
            } else {
                // All photos already scanned
                setScanStatus({ scanning: false });
            }
        } catch (error) {
            console.error('Failed to auto-scan gallery:', error);
            setScanStatus({ scanning: false });
            // Don't show error toast for auto-scan - it's background operation
        }
    }, [workspace?.workspace_id, galleryId]);

    // Poll for scan completion and refresh groups
    const pollForCompletion = useCallback(() => {
        let pollCount = 0;
        const maxPolls = 60; // 5 minutes max (5 sec intervals)
        
        const pollInterval = setInterval(async () => {
            pollCount++;
            
            if (!workspace?.workspace_id || pollCount > maxPolls) {
                clearInterval(pollInterval);
                setScanStatus({ scanning: false });
                return;
            }
            
            try {
                // Check scan status
                const result = await faceApiService.scanGalleryFaces(workspace.workspace_id, galleryId);
                
                if (result.jobs_queued === 0 && (result.pending || 0) === 0) {
                    // Scanning complete - refresh groups
                    clearInterval(pollInterval);
                    setScanStatus({ scanning: false });
                    fetchGroups();
                } else {
                    setScanStatus({
                        scanning: true,
                        message: `Processing ${result.pending || 0} photo${(result.pending || 0) !== 1 ? 's' : ''}...`,
                        pending: result.pending || 0
                    });
                }
            } catch (error) {
                // Ignore polling errors
            }
        }, 5000); // Poll every 5 seconds
        
        // Cleanup on unmount
        return () => clearInterval(pollInterval);
    }, [workspace?.workspace_id, galleryId, fetchGroups]);

    // Fetch on open and auto-trigger scan for new photos
    useEffect(() => {
        if (isOpen) {
            fetchGroups();
            // Auto-scan for new unscanned photos (smart - only scans new ones)
            autoScanGallery();
        }
    }, [isOpen, fetchGroups, autoScanGallery]);

    // Fetch merge suggestions when entering selection mode
    const fetchMergeSuggestions = useCallback(async () => {
        if (!workspace?.workspace_id) return;

        setLoadingSuggestions(true);
        try {
            const result = await faceApiService.getMergeSuggestions(workspace.workspace_id, {
                threshold: SIMILARITY_THRESHOLD,
                limit: MERGE_SUGGESTIONS_LIMIT,
            });
            setMergeSuggestions(result.suggestions);
        } catch (error) {
            console.error('Failed to fetch merge suggestions:', error);
            // Show toast for failed suggestions (was silent before)
            addToast({
                message: 'Could not load merge suggestions',
                variant: 'warning',
            });
        } finally {
            setLoadingSuggestions(false);
        }
    }, [workspace?.workspace_id, addToast]);

    // Toggle selection mode
    const toggleSelectionMode = useCallback(() => {
        if (!selectionMode) {
            // Entering selection mode - fetch suggestions
            fetchMergeSuggestions();
        } else {
            // Exiting selection mode - clear selections
            setSelectedGroupIds(new Set());
            setMergeSuggestions([]);
        }
        setSelectionMode(!selectionMode);
    }, [selectionMode, fetchMergeSuggestions]);

    // Toggle selection for a group
    const toggleGroupSelection = useCallback((groupId: string) => {
        setSelectedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    // Select all groups from a suggestion pair
    const selectSuggestionPair = useCallback((suggestion: MergeSuggestion) => {
        setSelectedGroupIds((prev) => {
            const next = new Set(prev);
            next.add(suggestion.group1.id);
            next.add(suggestion.group2.id);
            return next;
        });
    }, []);

    // Handle merge confirmation
    const handleMergeConfirm = async (
        targetGroupId: string,
        representativeFaceId?: string,
        name?: string
    ) => {
        if (!workspace?.workspace_id) return;

        const sourceGroupIds = Array.from(selectedGroupIds).filter(
            (id) => id !== targetGroupId
        );

        if (sourceGroupIds.length === 0) {
            addToast({ message: 'Select at least 2 groups to merge', variant: 'error' });
            return;
        }

        try {
            await faceApiService.multiMergeFaceGroups(
                workspace.workspace_id,
                sourceGroupIds,
                targetGroupId,
                { representativeFaceId, name }
            );

            addToast({
                message: `Successfully merged ${sourceGroupIds.length + 1} groups`,
                variant: 'success',
            });

            // Reset state and refresh
            setShowMergeModal(false);
            setSelectedGroupIds(new Set());
            setSelectionMode(false);
            fetchGroups();
        } catch (error) {
            console.error('Failed to merge groups:', error);
            addToast({ message: 'Failed to merge groups', variant: 'error' });
        }
    };

    // Open detail panel for a group
    const openDetailPanel = useCallback((groupId: string) => {
        setDetailGroupId(groupId);
        setShowDetailPanel(true);
    }, []);

    // Handle primary face change from detail panel
    const handlePrimaryFaceChange = useCallback(() => {
        fetchGroups();
    }, [fetchGroups]);

    // Handle rename - uses new person naming API
    const handleRename = async (groupId: string) => {
        if (!workspace?.workspace_id || !newName.trim()) return;

        try {
            // Use the new person naming API which creates/updates person entity
            await faceApiService.namePerson(
                workspace.workspace_id,
                groupId,
                newName.trim()
            );
            addToast({ message: 'Person named successfully', variant: 'success' });
            setEditingName(null);
            setNewName('');
            fetchGroups();
        } catch (error) {
            console.error('Failed to name person:', error);
            addToast({ message: 'Failed to name person', variant: 'error' });
        }
    };

    // Handle filter by person
    const handleFilterByPerson = (groupId: string) => {
        onFilterByPerson?.(groupId);
        onClose();
    };

    // Filter groups by search
    const filteredGroups = groups.filter((group) => {
        if (!searchQuery) return true;
        const name = group.name || `Person ${groups.indexOf(group) + 1}`;
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative h-full w-full max-w-md bg-surface border-l border-border shadow-2xl animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border p-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold">People</h2>
                            {groups.length > 0 && (
                                <span className="text-sm text-text-secondary">
                                    ({groups.length})
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Selection Mode Toggle */}
                            {groups.length >= MIN_GROUPS_FOR_MERGE && (
                                <AppButton
                                    variant={selectionMode ? 'primary' : 'outline'}
                                    size="sm"
                                    onClick={toggleSelectionMode}
                                    title={selectionMode ? 'Exit merge mode' : 'Merge people'}
                                >
                                    <Merge className="w-4 h-4" />
                                    <span className="ml-1 hidden sm:inline">
                                        {selectionMode ? 'Cancel' : 'Merge'}
                                    </span>
                                </AppButton>
                            )}
                            <AppButton
                                variant="ghost"
                                size="sm"
                                onClick={fetchGroups}
                                disabled={loading}
                                aria-label="Refresh people list"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </AppButton>
                            <AppButton variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
                                <X className="w-5 h-5" />
                            </AppButton>
                        </div>
                    </div>

                    {/* Selection Mode Banner */}
                    {selectionMode && (
                        <div className="mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                            <p className="text-xs text-primary">
                                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                Select 2 or more people to merge.
                                {selectedGroupIds.size > 0 && (
                                    <span className="font-medium ml-1">
                                        {selectedGroupIds.size} selected
                                    </span>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Merge Suggestions */}
                    {selectionMode && mergeSuggestions.length > 0 && (
                        <div className="mb-3">
                            <div className="flex items-center gap-1 mb-2">
                                <Sparkles className="w-3 h-3 text-accent" />
                                <span className="text-xs font-medium text-accent">AI Suggestions</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {mergeSuggestions.slice(0, MERGE_SUGGESTIONS_DISPLAY_LIMIT).map((suggestion) => (
                                    <button
                                        key={`${suggestion.group1.id}-${suggestion.group2.id}`}
                                        onClick={() => selectSuggestionPair(suggestion)}
                                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-full text-xs transition-colors"
                                    >
                                        <span className="truncate max-w-[60px]">
                                            {suggestion.group1.name || `Person`}
                                        </span>
                                        <span className="text-text-tertiary">+</span>
                                        <span className="truncate max-w-[60px]">
                                            {suggestion.group2.name || `Person`}
                                        </span>
                                        <span className="text-text-tertiary">
                                            ({Math.round(suggestion.similarity * 100)}%)
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {loadingSuggestions && (
                        <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Finding similar people...</span>
                        </div>
                    )}

                    {/* Scan Status Indicator */}
                    {scanStatus.scanning && (
                        <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>{scanStatus.message || 'Scanning for faces...'}</span>
                            </div>
                        </div>
                    )}

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search people..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-surface-hover border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
                    {loading && groups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p>Loading people...</p>
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                            <UserCircle className="w-16 h-16 mb-4 opacity-50" />
                            <p className="text-center mb-2">No people detected yet</p>
                            <p className="text-sm text-center opacity-75">
                                Face detection runs automatically when photos are uploaded
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
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
                                    onFilter={() => handleFilterByPerson(group.id)}
                                    selectionMode={selectionMode}
                                    isSelected={selectedGroupIds.has(group.id)}
                                    onToggleSelection={() => toggleGroupSelection(group.id)}
                                    onOpenDetail={() => openDetailPanel(group.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface/95 backdrop-blur-sm border-t border-border">
                    {selectionMode && selectedGroupIds.size >= 2 ? (
                        // Merge action bar
                        <div className="flex gap-2">
                            <AppButton
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                    setSelectedGroupIds(new Set());
                                }}
                            >
                                Clear ({selectedGroupIds.size})
                            </AppButton>
                            <AppButton
                                variant="primary"
                                className="flex-1"
                                onClick={() => setShowMergeModal(true)}
                            >
                                <Merge className="w-4 h-4 mr-1" />
                                Merge {selectedGroupIds.size} People
                            </AppButton>
                        </div>
                    ) : onFilterByPerson ? (
                        // Clear filter button
                        <AppButton
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                onFilterByPerson(null);
                                onClose();
                            }}
                        >
                            Show All Photos
                        </AppButton>
                    ) : null}
                </div>
            </div>

            {/* Merge Modal */}
            {showMergeModal && workspace?.workspace_id && (
                <FaceGroupMergeModal
                    isOpen={showMergeModal}
                    onClose={() => setShowMergeModal(false)}
                    selectedGroups={groups.filter((g) => selectedGroupIds.has(g.id))}
                    workspaceId={workspace.workspace_id}
                    onConfirm={handleMergeConfirm}
                />
            )}

            {/* Detail Panel */}
            {showDetailPanel && detailGroupId && workspace?.workspace_id && (
                <FaceGroupDetailPanel
                    isOpen={showDetailPanel}
                    onClose={() => {
                        setShowDetailPanel(false);
                        setDetailGroupId(null);
                    }}
                    groupId={detailGroupId}
                    workspaceId={workspace.workspace_id}
                    onPrimaryFaceChange={handlePrimaryFaceChange}
                />
            )}
        </div>
    );
};

// PersonCard subcomponent
interface PersonCardProps {
    group: FaceGroupWithGalleryStats;
    index: number;
    isEditing: boolean;
    editName: string;
    onEditNameChange: (name: string) => void;
    onStartEdit: (id: string, currentName: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onFilter: () => void;
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelection: () => void;
    onOpenDetail: () => void;
}

const PersonCard: React.FC<PersonCardProps> = memo(({
    group,
    index,
    isEditing,
    editName,
    onEditNameChange,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onFilter,
    selectionMode,
    isSelected,
    onToggleSelection,
    onOpenDetail,
}) => {
    // Prefer person_name (from people table) over legacy name field
    const displayName = group.person_name || group.name || `Person ${index + 1}`;
    const thumbnailUrl = group.representative_thumbnail_url;
    const isNamed = !!(group.person_name || group.name);

    // Handle card click based on mode
    const handleCardClick = () => {
        if (selectionMode) {
            onToggleSelection();
        } else {
            onFilter();
        }
    };

    return (
        <div
            className={`group relative flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                isSelected
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
                    : 'bg-surface-hover hover:bg-surface-active border-border/50 hover:border-primary/30'
            }`}
            onClick={handleCardClick}
            role={selectionMode ? 'checkbox' : 'button'}
            aria-checked={selectionMode ? isSelected : undefined}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick();
                }
            }}
        >
            {/* Selection Checkbox (in selection mode) */}
            {selectionMode && (
                <div
                    className={`absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                            ? 'bg-primary text-white'
                            : 'bg-surface border-2 border-border'
                    }`}
                >
                    {isSelected && <CheckCircle2 className="w-4 h-4" />}
                </div>
            )}

            {/* Thumbnail */}
            <div className={`w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 mb-2 ${
                isSelected ? 'ring-2 ring-primary' : ''
            }`}>
                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <UserCircle className="w-10 h-10 text-text-tertiary" />
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
                        placeholder="Enter name..."
                        className="w-full px-2 py-1 text-xs text-center bg-surface border border-primary rounded focus:outline-none"
                        autoFocus
                    />
                    <div className="flex justify-center gap-2 mt-2">
                        <button
                            onClick={onSaveEdit}
                            className="text-xs text-primary hover:underline font-medium"
                            aria-label="Save name"
                        >
                            Save
                        </button>
                        <button
                            onClick={onCancelEdit}
                            className="text-xs text-text-tertiary hover:underline"
                            aria-label="Cancel editing"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <span
                    className={`text-xs truncate max-w-full px-1 ${
                        isNamed
                            ? 'font-medium text-text-primary'
                            : 'text-text-tertiary italic'
                    }`}
                    onDoubleClick={(e) => {
                        if (!selectionMode) {
                            e.stopPropagation();
                            onStartEdit(group.id, isNamed ? displayName : '');
                        }
                    }}
                    title={isNamed ? displayName : 'Double-click to name this person'}
                >
                    {displayName}
                </span>
            )}

            {/* Face count - show gallery-specific count */}
            <span className="text-xs text-text-tertiary">
                {group.gallery_photo_count ?? group.face_count} {(group.gallery_photo_count ?? group.face_count) === 1 ? 'photo' : 'photos'}
            </span>

            {/* Hover actions (when not in selection mode) */}
            {!selectionMode && (
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetail();
                        }}
                        className="p-1 rounded bg-surface/80 hover:bg-surface text-text-secondary hover:text-text-primary"
                        title="View all faces"
                        aria-label={`View details for ${displayName}`}
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
});

// Display name for React DevTools
PersonCard.displayName = 'PersonCard';

export default PeoplePanel;
