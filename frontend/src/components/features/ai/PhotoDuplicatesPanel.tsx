/**
 * PhotoDuplicatesPanel Component
 * Feature: Phase 2 - AI Duplicate Detection
 *
 * AI-powered photo duplicate detection using perceptual hashing
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Copy,
  Trash2,
  Check,
  X,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Eye,
  FileImage,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import {
  useDuplicateDetection,
  type DuplicatePhotoGroup,
  type DuplicatePhotoMember,
  type DetectPhotoDuplicatesRequest,
} from '@/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoDuplicatesPanelProps {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID to scan (optional, scans all if not provided) */
  galleryId?: string;
  /** Gallery name for display */
  galleryName?: string;
  /** Total photos in gallery/workspace */
  totalPhotos: number;
  /** Callback when detection completes */
  onDetectionComplete?: (groups: DuplicatePhotoGroup[]) => void;
  /** Callback when a duplicate group is confirmed/dismissed */
  onGroupAction?: (groupId: string, action: 'confirmed' | 'dismissed') => void;
  /** Optional custom class name */
  className?: string;
}

interface ExtendedDuplicateGroup extends DuplicatePhotoGroup {
  primaryPhoto?: DuplicatePhotoMember;
  duplicates?: DuplicatePhotoMember[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PhotoDuplicatesPanel: React.FC<PhotoDuplicatesPanelProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  onDetectionComplete,
  onGroupAction,
  className = '',
}) => {
  // Detection settings
  const [similarityThreshold, setSimilarityThreshold] = useState(0.85);
  const [minGroupSize, setMinGroupSize] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Duplicate detection hook
  const {
    detectPhotoDuplicates,
    photoDuplicatesData,
    isDetectingPhotos,
    photoDuplicatesError,
    confirmGroup,
    dismissGroup,
    isConfirming,
    isDismissing,
  } = useDuplicateDetection(workspaceId);

  // Process duplicate groups for display
  const duplicateGroups = useMemo<ExtendedDuplicateGroup[]>(() => {
    if (!photoDuplicatesData?.duplicate_groups) return [];

    return photoDuplicatesData.duplicate_groups.map((group) => {
      const primaryPhoto = group.members.find((m) => m.is_primary);
      const duplicates = group.members.filter((m) => !m.is_primary);

      return {
        ...group,
        primaryPhoto,
        duplicates,
      };
    });
  }, [photoDuplicatesData]);

  // Run duplicate detection
  const handleDetect = useCallback(async () => {
    setError(null);

    try {
      const request: DetectPhotoDuplicatesRequest = {
        gallery_id: galleryId,
        similarity_threshold: similarityThreshold,
        min_group_size: minGroupSize,
      };

      detectPhotoDuplicates(request, {
        onSuccess: (data) => {
          onDetectionComplete?.(data.duplicate_groups);
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Duplicate detection failed';
          setError(message);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Duplicate detection failed';
      setError(message);
    }
  }, [
    workspaceId,
    galleryId,
    similarityThreshold,
    minGroupSize,
    detectPhotoDuplicates,
    onDetectionComplete,
  ]);

  // Toggle group expansion
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Confirm duplicate group
  const handleConfirm = useCallback(
    (groupId: string) => {
      confirmGroup(
        { groupId },
        {
          onSuccess: () => {
            onGroupAction?.(groupId, 'confirmed');
          },
        }
      );
    },
    [confirmGroup, onGroupAction]
  );

  // Dismiss duplicate group
  const handleDismiss = useCallback(
    (groupId: string) => {
      dismissGroup(
        { groupId },
        {
          onSuccess: () => {
            onGroupAction?.(groupId, 'dismissed');
          },
        }
      );
    },
    [dismissGroup, onGroupAction]
  );

  // Stats
  const stats = photoDuplicatesData
    ? {
        totalGroups: photoDuplicatesData.total_groups,
        totalScanned: photoDuplicatesData.total_photos_scanned,
        photosWithDuplicates: photoDuplicatesData.photos_with_duplicates,
        creditsUsed: photoDuplicatesData.credits_used,
        creditsRemaining: photoDuplicatesData.credits_remaining,
      }
    : null;

  return (
    <AIErrorBoundary featureName="Photo Duplicate Detection">
      <div className={`bg-surface rounded-card border border-border p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Photo Duplicates</h3>
              <p className="text-sm text-text-secondary">
                AI-powered duplicate detection using perceptual hashing
              </p>
            </div>
          </div>
          {!isDetectingPhotos && !photoDuplicatesData && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
              aria-label="Toggle settings"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              />
            </AppButton>
          )}
        </div>

        {/* Settings */}
        {showSettings && !isDetectingPhotos && !photoDuplicatesData && (
          <div className="space-y-4 mb-6 pb-6 border-b border-border">
            {/* Similarity threshold slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Similarity Threshold
                </label>
                <span className="text-sm text-text-secondary">
                  {Math.round(similarityThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={similarityThreshold * 100}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value) / 100)}
                className="ai-range-input"
                aria-label="Similarity threshold"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Higher values require more similarity (stricter matching)
              </p>
            </div>

            {/* Minimum group size */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Minimum Group Size
              </label>
              <select
                value={minGroupSize}
                onChange={(e) => setMinGroupSize(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
              >
                <option value={2}>2 photos (show all duplicates)</option>
                <option value={3}>3 photos (groups of 3+)</option>
                <option value={4}>4 photos (groups of 4+)</option>
                <option value={5}>5 photos (groups of 5+)</option>
              </select>
              <p className="text-xs text-text-tertiary mt-1">
                Only show groups with at least this many photos
              </p>
            </div>
          </div>
        )}

        {/* Gallery info */}
        {!isDetectingPhotos && !photoDuplicatesData && (
          <div className="flex items-center gap-2 text-sm text-text-secondary bg-background rounded-lg px-4 py-2 mb-6">
            <ImageIcon className="w-4 h-4" />
            <span>
              {totalPhotos} photos
              {galleryName && (
                <>
                  {' '}
                  in <strong>{galleryName}</strong>
                </>
              )}
            </span>
          </div>
        )}

        {/* Loading state */}
        {isDetectingPhotos && (
          <div className="mb-6">
            <AISpinner featureType="duplicate-detection" />
            <p className="text-sm text-text-secondary text-center mt-4">
              Analyzing photos for visual similarities...
            </p>
          </div>
        )}

        {/* Error state */}
        {(error || photoDuplicatesError) && (
          <div
            className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg text-error"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Detection failed</p>
                <p className="text-sm mt-1 opacity-80">
                  {error || photoDuplicatesError?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {photoDuplicatesData && stats && (
          <div className="mb-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">{stats.totalGroups}</div>
                <div className="text-xs text-text-secondary mt-1">Duplicate Groups</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">
                  {stats.photosWithDuplicates}
                </div>
                <div className="text-xs text-text-secondary mt-1">Photos with Duplicates</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">{stats.totalScanned}</div>
                <div className="text-xs text-text-secondary mt-1">Photos Scanned</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-primary">{stats.creditsUsed}</div>
                <div className="text-xs text-text-secondary mt-1">AI Credits Used</div>
              </div>
            </div>

            {/* No duplicates found */}
            {duplicateGroups.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 text-success mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-2">
                  No Duplicates Found
                </h4>
                <p className="text-sm text-text-secondary">
                  All your photos are unique! No duplicate images were detected.
                </p>
              </div>
            )}

            {/* Duplicate groups */}
            {duplicateGroups.length > 0 && (
              <div className="space-y-4">
                {duplicateGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.group_id || '');
                  const groupId = group.group_id || '';

                  return (
                    <div
                      key={groupId}
                      className="bg-background rounded-lg border border-border overflow-hidden"
                    >
                      {/* Group header */}
                      <button
                        onClick={() => toggleGroup(groupId)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-3">
                          <FileImage className="w-5 h-5 text-text-secondary" />
                          <div className="text-left">
                            <div className="text-sm font-medium text-text-primary">
                              {group.members.length} similar photos
                            </div>
                            <div className="text-xs text-text-secondary">
                              {Math.round(group.similarity_score * 100)}% similarity •{' '}
                              {group.detection_method}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              group.status === 'confirmed'
                                ? 'bg-success/10 text-success'
                                : group.status === 'dismissed'
                                ? 'bg-text-tertiary/10 text-text-tertiary'
                                : 'bg-warning/10 text-warning'
                            }`}
                          >
                            {group.status || 'pending'}
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-text-secondary transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {/* Group content */}
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          {/* Primary photo */}
                          {group.primaryPhoto && (
                            <div className="mb-4">
                              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                                Primary Photo
                              </div>
                              <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-primary/20">
                                {group.primaryPhoto.thumbnail_url ? (
                                  <img
                                    src={group.primaryPhoto.thumbnail_url}
                                    alt="Primary photo"
                                    className="w-20 h-20 object-cover rounded"
                                  />
                                ) : (
                                  <div className="w-20 h-20 bg-surface-hover rounded flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-text-tertiary" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-text-primary truncate">
                                    {group.primaryPhoto.file_name}
                                  </div>
                                  <div className="text-xs text-text-secondary">
                                    {(group.primaryPhoto.file_size / 1024 / 1024).toFixed(2)} MB
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Duplicate photos */}
                          {group.duplicates && group.duplicates.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                                Duplicates ({group.duplicates.length})
                              </div>
                              <div className="space-y-2">
                                {group.duplicates.map((photo) => (
                                  <div
                                    key={photo.asset_id}
                                    className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border"
                                  >
                                    {photo.thumbnail_url ? (
                                      <img
                                        src={photo.thumbnail_url}
                                        alt={photo.file_name}
                                        className="w-16 h-16 object-cover rounded"
                                      />
                                    ) : (
                                      <div className="w-16 h-16 bg-surface-hover rounded flex items-center justify-center">
                                        <ImageIcon className="w-6 h-6 text-text-tertiary" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-text-primary truncate">
                                        {photo.file_name}
                                      </div>
                                      <div className="text-xs text-text-secondary">
                                        {(photo.file_size / 1024 / 1024).toFixed(2)} MB
                                        {photo.similarity_to_primary && (
                                          <>
                                            {' '}
                                            •{' '}
                                            {Math.round(photo.similarity_to_primary * 100)}%
                                            similar
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {group.status === 'pending' && (
                            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                              <AppButton
                                variant="primary"
                                size="sm"
                                leftIcon={<Check className="w-4 h-4" />}
                                onClick={() => handleConfirm(groupId)}
                                isLoading={isConfirming}
                                disabled={isConfirming || isDismissing}
                              >
                                Confirm Duplicates
                              </AppButton>
                              <AppButton
                                variant="outline"
                                size="sm"
                                leftIcon={<X className="w-4 h-4" />}
                                onClick={() => handleDismiss(groupId)}
                                isLoading={isDismissing}
                                disabled={isConfirming || isDismissing}
                              >
                                Not Duplicates
                              </AppButton>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Re-run button */}
            <div className="mt-6">
              <AppButton
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleDetect}
              >
                Re-scan with different settings
              </AppButton>
            </div>
          </div>
        )}

        {/* Detect button */}
        {!photoDuplicatesData && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Eye className="w-4 h-4" />}
            onClick={handleDetect}
            isLoading={isDetectingPhotos}
            loadingText="Detecting duplicates..."
            disabled={isDetectingPhotos}
          >
            Detect Duplicates
          </AppButton>
        )}

        {/* Credits info */}
        {stats && (
          <div className="mt-4 text-xs text-text-tertiary text-center">
            {stats.creditsRemaining} AI credits remaining
          </div>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default PhotoDuplicatesPanel;
