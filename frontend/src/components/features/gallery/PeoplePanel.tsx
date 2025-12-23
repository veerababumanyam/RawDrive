/**
 * PeoplePanel Component
 * Displays detected faces grouped by person for a gallery
 * Allows filtering photos by person and managing face groups
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Users, Search, ChevronRight, Loader2, UserCircle, RefreshCw } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../ui/Toast';
import { faceApiService, FaceGroup, FaceGroupWithFaces } from '../../../services/faceApiService';

interface PeoplePanelProps {
    galleryId: string;
    isOpen: boolean;
    onClose: () => void;
    onFilterByPerson?: (groupId: string | null) => void;
}

export const PeoplePanel: React.FC<PeoplePanelProps> = ({
    galleryId: _galleryId, // Reserved for future gallery-specific filtering
    isOpen,
    onClose,
    onFilterByPerson,
}) => {
    const { workspace } = useAuth();
    const { addToast } = useToast();

    const [groups, setGroups] = useState<FaceGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [_selectedGroup, setSelectedGroup] = useState<FaceGroupWithFaces | null>(null);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [newName, setNewName] = useState('');

    // Fetch face groups
    const fetchGroups = useCallback(async () => {
        if (!workspace?.workspace_id) return;

        setLoading(true);
        try {
            const result = await faceApiService.getFaceGroups(workspace.workspace_id, {
                minFaces: 1,
                limit: 100,
            });
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
    }, [workspace?.workspace_id, addToast]);

    // Fetch on open
    useEffect(() => {
        if (isOpen) {
            fetchGroups();
        }
    }, [isOpen, fetchGroups]);

    // Fetch group details when selected
    useEffect(() => {
        if (!selectedGroupId || !workspace?.workspace_id) {
            setSelectedGroup(null);
            return;
        }

        const fetchGroupDetails = async () => {
            try {
                const group = await faceApiService.getFaceGroup(workspace.workspace_id, selectedGroupId);
                setSelectedGroup(group);
            } catch (error) {
                console.error('Failed to fetch group details:', error);
            }
        };

        fetchGroupDetails();
    }, [selectedGroupId, workspace?.workspace_id]);

    // Handle rename
    const handleRename = async (groupId: string) => {
        if (!workspace?.workspace_id || !newName.trim()) return;

        try {
            await faceApiService.updateFaceGroup(workspace.workspace_id, groupId, {
                name: newName.trim(),
            });
            addToast({ message: 'Person renamed', variant: 'success' });
            setEditingName(null);
            setNewName('');
            fetchGroups();
        } catch (error) {
            addToast({ message: 'Failed to rename', variant: 'error' });
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
                            <AppButton
                                variant="ghost"
                                size="sm"
                                onClick={fetchGroups}
                                disabled={loading}
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </AppButton>
                            <AppButton variant="ghost" size="sm" onClick={onClose}>
                                <X className="w-5 h-5" />
                            </AppButton>
                        </div>
                    </div>

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
                                    onSelect={() => setSelectedGroupId(group.id)}
                                    onFilter={() => handleFilterByPerson(group.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Clear Filter Button */}
                {onFilterByPerson && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface/95 backdrop-blur-sm border-t border-border">
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
                    </div>
                )}
            </div>
        </div>
    );
};

// PersonCard subcomponent
interface PersonCardProps {
    group: FaceGroup;
    index: number;
    isEditing: boolean;
    editName: string;
    onEditNameChange: (name: string) => void;
    onStartEdit: (id: string, currentName: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onSelect: () => void;
    onFilter: () => void;
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
    onSelect,
    onFilter,
}) => {
    const displayName = group.name || `Person ${index + 1}`;
    const thumbnailUrl = group.representative_thumbnail_url;

    return (
        <div
            className="group relative flex flex-col items-center p-3 bg-surface-hover hover:bg-surface-active rounded-xl border border-border/50 hover:border-primary/30 cursor-pointer transition-all duration-200"
            onClick={onFilter}
        >
            {/* Thumbnail */}
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 mb-2">
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
                        className="w-full px-2 py-1 text-xs text-center bg-surface border border-primary rounded focus:outline-none"
                        autoFocus
                    />
                </div>
            ) : (
                <span
                    className="text-xs font-medium text-text-primary truncate max-w-full px-1"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        onStartEdit(group.id, displayName);
                    }}
                    title={displayName}
                >
                    {displayName}
                </span>
            )}

            {/* Face count */}
            <span className="text-xs text-text-tertiary">
                {group.face_count} {group.face_count === 1 ? 'photo' : 'photos'}
            </span>

            {/* Hover actions */}
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                    className="p-1 rounded bg-surface/80 hover:bg-surface text-text-secondary hover:text-text-primary"
                    title="View details"
                >
                    <ChevronRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export default PeoplePanel;
