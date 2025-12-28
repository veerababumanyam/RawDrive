/**
 * FaceGroupMergeModal Component
 * Confirmation dialog for merging multiple face groups
 * Allows selecting target group and primary face
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    Merge,
    UserCircle,
    Check,
    Loader2,
    AlertCircle,
    Star,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { faceApiService, FaceGroup, FaceInGroup } from '../../../services/faceApiService';

interface FaceGroupMergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedGroups: FaceGroup[];
    workspaceId: string;
    onConfirm: (
        targetGroupId: string,
        representativeFaceId?: string,
        name?: string
    ) => void;
}

export const FaceGroupMergeModal: React.FC<FaceGroupMergeModalProps> = ({
    isOpen,
    onClose,
    selectedGroups,
    workspaceId,
    onConfirm,
}) => {
    const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
    const [selectedPrimaryFaceId, setSelectedPrimaryFaceId] = useState<string | null>(null);
    const [mergedName, setMergedName] = useState('');
    const [faces, setFaces] = useState<FaceInGroup[]>([]);
    const [loadingFaces, setLoadingFaces] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Auto-select target group: prefer named group, then largest
    useEffect(() => {
        if (selectedGroups.length > 0) {
            // First, try to find a named group
            const namedGroup = selectedGroups.find(
                (g) => g.person_name || g.name
            );
            if (namedGroup) {
                setTargetGroupId(namedGroup.id);
                setMergedName(namedGroup.person_name || namedGroup.name || '');
            } else {
                // Otherwise, pick the largest group
                const largest = selectedGroups.reduce((a, b) =>
                    a.face_count > b.face_count ? a : b
                );
                setTargetGroupId(largest.id);
                setMergedName('');
            }
        }
    }, [selectedGroups]);

    // Fetch all faces from selected groups for primary face selection
    // Uses parallel API calls for better performance
    const fetchAllFaces = useCallback(async () => {
        if (selectedGroups.length === 0) return;

        setLoadingFaces(true);
        try {
            // Fetch faces from all groups in parallel
            const facePromises = selectedGroups.map(async (group) => {
                const result = await faceApiService.getFacesInGroup(
                    workspaceId,
                    group.id,
                    { limit: 20 }
                );
                // Tag faces with their source group for display
                return result.faces.map((face) => ({
                    ...face,
                    sourceGroupId: group.id,
                }));
            });

            const faceResults = await Promise.all(facePromises);
            const allFaces = faceResults.flat() as (FaceInGroup & { sourceGroupId: string })[];
            setFaces(allFaces);

            // Auto-select the first face from target group as primary
            const targetFace = allFaces.find(
                (f) => f.sourceGroupId === targetGroupId
            );
            if (targetFace) {
                setSelectedPrimaryFaceId(targetFace.id);
            } else if (allFaces.length > 0) {
                setSelectedPrimaryFaceId(allFaces[0].id);
            }
        } catch (error) {
            console.error('Failed to fetch faces:', error);
        } finally {
            setLoadingFaces(false);
        }
    }, [selectedGroups, workspaceId, targetGroupId]);

    useEffect(() => {
        if (isOpen && selectedGroups.length > 0) {
            fetchAllFaces();
        }
    }, [isOpen, selectedGroups, fetchAllFaces]);

    // Handle submit
    const handleSubmit = async () => {
        if (!targetGroupId) return;

        setIsSubmitting(true);
        try {
            await onConfirm(
                targetGroupId,
                selectedPrimaryFaceId || undefined,
                mergedName.trim() || undefined
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate total face count
    const totalFaceCount = selectedGroups.reduce(
        (sum, g) => sum + g.face_count,
        0
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-surface border-b border-border">
                    <div className="flex items-center gap-2">
                        <Merge className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold">Merge People</h2>
                    </div>
                    <AppButton variant="ghost" size="sm" onClick={onClose} aria-label="Close merge dialog">
                        <X className="w-5 h-5" />
                    </AppButton>
                </div>

                {/* Content */}
                <div className="p-4 space-y-5 overflow-y-auto max-h-[60vh]">
                    {/* Summary */}
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                                <p className="font-medium text-text-primary">
                                    Merging {selectedGroups.length} people into one
                                </p>
                                <p className="text-text-secondary mt-1">
                                    {totalFaceCount} photos will be grouped together. This
                                    action cannot be undone easily.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Groups Being Merged */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Groups to merge
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {selectedGroups.map((group, idx) => {
                                const displayName =
                                    group.person_name ||
                                    group.name ||
                                    `Person ${idx + 1}`;
                                const isTarget = group.id === targetGroupId;

                                return (
                                    <button
                                        key={group.id}
                                        onClick={() => {
                                            setTargetGroupId(group.id);
                                            if (group.person_name || group.name) {
                                                setMergedName(
                                                    group.person_name ||
                                                        group.name ||
                                                        ''
                                                );
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                                            isTarget
                                                ? 'bg-primary/10 border-primary text-primary'
                                                : 'bg-surface-hover border-border hover:border-primary/50'
                                        }`}
                                    >
                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
                                            {group.representative_thumbnail_url ? (
                                                <img
                                                    src={group.representative_thumbnail_url}
                                                    alt={displayName}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <UserCircle className="w-5 h-5 text-text-tertiary" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium truncate max-w-[100px]">
                                                {displayName}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {group.face_count} photos
                                            </p>
                                        </div>
                                        {isTarget && (
                                            <Check className="w-4 h-4 text-primary ml-1" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-text-tertiary mt-2">
                            Click to select the primary group (others will merge into it)
                        </p>
                    </div>

                    {/* Merged Name */}
                    <div>
                        <label
                            htmlFor="merged-name"
                            className="block text-sm font-medium text-text-primary mb-2"
                        >
                            Name for merged person
                        </label>
                        <input
                            id="merged-name"
                            type="text"
                            value={mergedName}
                            onChange={(e) => setMergedName(e.target.value)}
                            placeholder="Enter a name (optional)"
                            className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>

                    {/* Primary Face Selection */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            <Star className="w-4 h-4 inline mr-1 text-accent" />
                            Select primary photo
                        </label>
                        <p className="text-xs text-text-secondary mb-3">
                            This photo will be used as the thumbnail for this person
                        </p>

                        {loadingFaces ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                <span className="ml-2 text-sm text-text-secondary">
                                    Loading photos...
                                </span>
                            </div>
                        ) : faces.length === 0 ? (
                            <div className="text-center py-8 text-text-secondary text-sm">
                                No photos found
                            </div>
                        ) : (
                            <div className="grid grid-cols-5 gap-2 max-h-[200px] overflow-y-auto p-1">
                                {faces.map((face) => (
                                    <button
                                        key={face.id}
                                        onClick={() =>
                                            setSelectedPrimaryFaceId(face.id)
                                        }
                                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                            selectedPrimaryFaceId === face.id
                                                ? 'border-primary ring-2 ring-primary/30'
                                                : 'border-transparent hover:border-primary/50'
                                        }`}
                                    >
                                        {face.thumbnail_url ? (
                                            <img
                                                src={face.thumbnail_url}
                                                alt="Face"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                                                <UserCircle className="w-6 h-6 text-text-tertiary" />
                                            </div>
                                        )}
                                        {selectedPrimaryFaceId === face.id && (
                                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                                    <Star className="w-4 h-4 text-white fill-white" />
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 flex gap-3 p-4 bg-surface border-t border-border">
                    <AppButton
                        variant="outline"
                        className="flex-1"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="primary"
                        className="flex-1"
                        onClick={handleSubmit}
                        disabled={!targetGroupId || isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Merging...
                            </>
                        ) : (
                            <>
                                <Merge className="w-4 h-4 mr-2" />
                                Merge {selectedGroups.length} People
                            </>
                        )}
                    </AppButton>
                </div>
            </div>
        </div>
    );
};

export default FaceGroupMergeModal;
