/**
 * FaceGroupDetailPanel Component
 * Shows all faces in a group with ability to set primary face
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    UserCircle,
    Loader2,
    Star,
    Check,
    Image,
    ChevronLeft,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { faceApiService, FaceGroup, FaceInGroup } from '../../../services/faceApiService';

interface FaceGroupDetailPanelProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    workspaceId: string;
    onPrimaryFaceChange?: () => void;
}

export const FaceGroupDetailPanel: React.FC<FaceGroupDetailPanelProps> = ({
    isOpen,
    onClose,
    groupId,
    workspaceId,
    onPrimaryFaceChange,
}) => {
    const { addToast } = useToast();

    const [group, setGroup] = useState<FaceGroup | null>(null);
    const [faces, setFaces] = useState<FaceInGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [representativeFaceId, setRepresentativeFaceId] = useState<string | null>(null);
    const [settingPrimary, setSettingPrimary] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [offset, setOffset] = useState(0);

    const LIMIT = 30;

    // Fetch group details
    const fetchGroup = useCallback(async () => {
        try {
            const groupData = await faceApiService.getFaceGroup(workspaceId, groupId);
            setGroup(groupData);
        } catch (error) {
            console.error('Failed to fetch group:', error);
        }
    }, [workspaceId, groupId]);

    // Fetch faces in group
    const fetchFaces = useCallback(async (reset = false) => {
        const currentOffset = reset ? 0 : offset;

        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const result = await faceApiService.getFacesInGroup(
                workspaceId,
                groupId,
                { limit: LIMIT, offset: currentOffset }
            );

            if (reset) {
                setFaces(result.faces);
                setOffset(LIMIT);
            } else {
                setFaces((prev) => [...prev, ...result.faces]);
                setOffset((prev) => prev + LIMIT);
            }

            setHasMore(result.faces.length === LIMIT);
            setRepresentativeFaceId(result.representative_face_id || null);
        } catch (error) {
            console.error('Failed to fetch faces:', error);
            addToast({ message: 'Failed to load faces', variant: 'error' });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [workspaceId, groupId, offset, addToast]);

    // Initial fetch
    useEffect(() => {
        if (isOpen && groupId) {
            fetchGroup();
            fetchFaces(true);
        }
    }, [isOpen, groupId, fetchGroup]);

    // We need a separate effect for initial fetch to avoid dependency issues
    useEffect(() => {
        if (isOpen && groupId) {
            fetchFaces(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, groupId, workspaceId]);

    // Handle setting primary face
    const handleSetPrimary = async (faceId: string) => {
        if (faceId === representativeFaceId) return;

        setSettingPrimary(true);
        try {
            await faceApiService.setRepresentativeFace(
                workspaceId,
                groupId,
                faceId,
                true // recalculate centroid
            );

            setRepresentativeFaceId(faceId);
            addToast({ message: 'Primary photo updated', variant: 'success' });
            onPrimaryFaceChange?.();
        } catch (error) {
            console.error('Failed to set primary face:', error);
            addToast({ message: 'Failed to update primary photo', variant: 'error' });
        } finally {
            setSettingPrimary(false);
        }
    };

    // Get display name for group
    const displayName = group?.person_name || group?.name || 'Unknown Person';

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[55] flex items-start justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative h-full w-full max-w-md bg-surface border-l border-border shadow-2xl animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border p-4">
                    <div className="flex items-center gap-3">
                        <AppButton
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="flex-shrink-0"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </AppButton>

                        {/* Group info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex-shrink-0">
                                {group?.representative_thumbnail_url ? (
                                    <img
                                        src={group.representative_thumbnail_url}
                                        alt={displayName}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <UserCircle className="w-8 h-8 text-text-tertiary" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold truncate">
                                    {displayName}
                                </h2>
                                <p className="text-sm text-text-secondary">
                                    {group?.face_count || faces.length} photos
                                </p>
                            </div>
                        </div>

                        <AppButton variant="ghost" size="sm" onClick={onClose}>
                            <X className="w-5 h-5" />
                        </AppButton>
                    </div>
                </div>

                {/* Instructions */}
                <div className="p-4 border-b border-border bg-accent/5">
                    <div className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                            <p className="font-medium text-accent">
                                Select primary photo
                            </p>
                            <p className="text-text-secondary mt-0.5">
                                The primary photo is used as the thumbnail and improves
                                face matching accuracy.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div
                    className="p-4 overflow-y-auto"
                    style={{ maxHeight: 'calc(100vh - 180px)' }}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <p className="text-text-secondary">Loading photos...</p>
                        </div>
                    ) : faces.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                            <Image className="w-16 h-16 mb-4 opacity-50" />
                            <p className="text-center">No photos in this group</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                {faces.map((face) => {
                                    const isPrimary = face.id === representativeFaceId;

                                    return (
                                        <button
                                            key={face.id}
                                            onClick={() => handleSetPrimary(face.id)}
                                            disabled={settingPrimary}
                                            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                                isPrimary
                                                    ? 'border-accent ring-2 ring-accent/30'
                                                    : 'border-transparent hover:border-primary/50'
                                            } ${settingPrimary ? 'opacity-50' : ''}`}
                                        >
                                            {face.thumbnail_url ? (
                                                <img
                                                    src={face.thumbnail_url}
                                                    alt="Face"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                                                    <UserCircle className="w-8 h-8 text-text-tertiary" />
                                                </div>
                                            )}

                                            {/* Primary indicator */}
                                            {isPrimary && (
                                                <div className="absolute top-1 right-1">
                                                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-lg">
                                                        <Star className="w-4 h-4 text-white fill-white" />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Hover overlay */}
                                            {!isPrimary && (
                                                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="flex flex-col items-center text-white">
                                                        <Check className="w-6 h-6 mb-1" />
                                                        <span className="text-xs">
                                                            Set as primary
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Confidence badge */}
                                            {face.confidence && (
                                                <div className="absolute bottom-1 left-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-black/60 rounded-full text-white">
                                                        {Math.round(face.confidence * 100)}%
                                                    </span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Load more */}
                            {hasMore && (
                                <div className="mt-4 text-center">
                                    <AppButton
                                        variant="outline"
                                        onClick={() => fetchFaces(false)}
                                        disabled={loadingMore}
                                    >
                                        {loadingMore ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Loading...
                                            </>
                                        ) : (
                                            'Load more photos'
                                        )}
                                    </AppButton>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FaceGroupDetailPanel;
