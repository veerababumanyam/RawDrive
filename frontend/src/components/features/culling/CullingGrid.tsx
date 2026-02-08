/**
 * CullingGrid Component
 * Displays photos in a grid with quality score overlays for bulk culling workflow
 */

import React, { useCallback, useMemo } from 'react';
import { Check, X, Star, AlertTriangle, Users } from 'lucide-react';
import type { CullingPhoto } from '../../../services/cullingWorkflowService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CullingGridProps {
  /** Photos to display */
  photos: CullingPhoto[];
  /** Selected photo IDs */
  selectedIds: Set<string>;
  /** Callback when photo selection toggles */
  onToggleSelection: (assetId: string) => void;
  /** Callback when photo is clicked for preview */
  onPhotoClick?: (photo: CullingPhoto, index: number) => void;
  /** Number of columns */
  columns?: number;
  /** Whether grid is loading */
  isLoading?: boolean;
  /** Show selection overlay */
  showSelection?: boolean;
  /** Show quality overlay */
  showQualityOverlay?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Quality Score Badge Component
// ---------------------------------------------------------------------------

interface QualityBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

const QualityBadge: React.FC<QualityBadgeProps> = ({ score, size = 'md' }) => {
  const color = useMemo(() => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  }, [score]);

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span
      className={`
        ${color} ${sizeClasses}
        font-semibold text-white rounded-md
        shadow-sm
      `}
    >
      {Math.round(score)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Photo Card Component
// ---------------------------------------------------------------------------

interface CullingPhotoCardProps {
  photo: CullingPhoto;
  isSelected: boolean;
  onToggleSelection: () => void;
  onPhotoClick?: () => void;
  showSelection: boolean;
  showQualityOverlay: boolean;
}

const CullingPhotoCard: React.FC<CullingPhotoCardProps> = ({
  photo,
  isSelected,
  onToggleSelection,
  onPhotoClick,
  showSelection,
  showQualityOverlay,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        onToggleSelection();
      } else if (onPhotoClick) {
        onPhotoClick();
      }
    },
    [onToggleSelection, onPhotoClick]
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelection();
    },
    [onToggleSelection]
  );

  // Status styling
  const statusClasses = useMemo(() => {
    if (photo.is_selected) return 'ring-2 ring-green-500 ring-offset-2';
    if (photo.is_rejected) return 'ring-2 ring-red-500 ring-offset-2 opacity-50';
    if (isSelected) return 'ring-2 ring-primary ring-offset-2';
    return '';
  }, [photo.is_selected, photo.is_rejected, isSelected]);

  const qualityTierColors: Record<string, string> = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    fair: 'bg-yellow-500',
    poor: 'bg-red-500',
  };

  return (
    <div
      className={`
        relative group rounded-lg overflow-hidden cursor-pointer
        bg-surface-secondary transition-all duration-200
        hover:shadow-lg hover:scale-[1.02]
        ${statusClasses}
      `}
      onClick={handleClick}
    >
      {/* Image */}
      <div className="aspect-square relative">
        <img
          src={photo.thumbnail_url || '/placeholder-image.jpg'}
          alt={photo.original_filename || 'Photo'}
          className={`
            w-full h-full object-cover
            ${photo.is_rejected ? 'grayscale' : ''}
          `}
          loading="lazy"
        />

        {/* Selection checkbox */}
        {showSelection && (
          <button
            onClick={handleCheckboxClick}
            className={`
              absolute top-2 left-2 w-6 h-6 rounded-md
              flex items-center justify-center
              transition-all duration-150
              ${isSelected
                ? 'bg-primary text-white'
                : 'bg-black/50 text-white hover:bg-black/70'
              }
            `}
            aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
          >
            {isSelected && <Check size={16} />}
          </button>
        )}

        {/* Quality overlay */}
        {showQualityOverlay && (
          <>
            {/* Quality score badge - top right */}
            <div className="absolute top-2 right-2">
              <QualityBadge score={photo.overall_score} />
            </div>

            {/* Quality tier indicator - bottom left */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1">
              <span
                className={`
                  w-2 h-2 rounded-full
                  ${qualityTierColors[photo.quality_tier] || 'bg-gray-500'}
                `}
              />
              <span className="text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
                {photo.quality_tier}
              </span>
            </div>

            {/* Face count indicator */}
            {photo.face_count > 0 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded">
                <Users size={12} className="text-white" />
                <span className="text-xs text-white">{photo.face_count}</span>
              </div>
            )}

            {/* Blur warning */}
            {photo.blur_detected && !photo.is_intentional_blur && (
              <div className="absolute top-2 left-10 bg-yellow-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs text-white">Blur</span>
              </div>
            )}
          </>
        )}

        {/* Status badges */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-between">
            {/* Selection/Rejection status */}
            <div className="flex items-center gap-1">
              {photo.is_selected && (
                <span className="flex items-center gap-1 bg-green-500 px-2 py-0.5 rounded text-xs text-white">
                  <Star size={12} /> Selected
                </span>
              )}
              {photo.is_rejected && (
                <span className="flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded text-xs text-white">
                  <X size={12} /> Rejected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Detailed scores on hover */}
        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-2 p-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-white mb-1">
              {Math.round(photo.overall_score)}
            </div>
            <div className="text-xs text-gray-300 uppercase tracking-wider">
              Overall Score
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full mt-2">
            <ScoreItem label="Sharp" value={photo.sharpness_score} />
            <ScoreItem label="Exp" value={photo.exposure_score} />
            <ScoreItem label="Comp" value={photo.composition_score} />
          </div>
          {photo.blur_detected && (
            <div className="mt-2 text-xs text-center">
              <span
                className={`
                  px-2 py-0.5 rounded
                  ${photo.is_intentional_blur
                    ? 'bg-blue-500/50 text-blue-200'
                    : 'bg-yellow-500/50 text-yellow-200'
                  }
                `}
              >
                {photo.is_intentional_blur
                  ? 'Artistic Bokeh'
                  : `${photo.blur_type || 'Blur'} Detected`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Score item for hover overlay
const ScoreItem: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const color = useMemo(() => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-blue-400';
    if (value >= 40) return 'text-yellow-400';
    return 'text-red-400';
  }, [value]);

  return (
    <div className="text-center">
      <div className={`text-sm font-semibold ${color}`}>{Math.round(value)}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

const CullingGridSkeleton: React.FC<{ columns: number }> = ({ columns }) => (
  <div
    className="grid gap-4"
    style={{
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    }}
  >
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="aspect-square rounded-lg bg-surface-secondary animate-pulse" />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CullingGrid: React.FC<CullingGridProps> = ({
  photos,
  selectedIds,
  onToggleSelection,
  onPhotoClick,
  columns = 4,
  isLoading = false,
  showSelection = true,
  showQualityOverlay = true,
  className = '',
}) => {
  if (isLoading && photos.length === 0) {
    return <CullingGridSkeleton columns={columns} />;
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-text-tertiary" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">No photos found</h3>
        <p className="text-sm text-text-secondary">
          Try adjusting your filters or upload some photos first.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-4 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {photos.map((photo, index) => (
        <CullingPhotoCard
          key={photo.asset_id}
          photo={photo}
          isSelected={selectedIds.has(photo.asset_id)}
          onToggleSelection={() => onToggleSelection(photo.asset_id)}
          onPhotoClick={onPhotoClick ? () => onPhotoClick(photo, index) : undefined}
          showSelection={showSelection}
          showQualityOverlay={showQualityOverlay}
        />
      ))}
    </div>
  );
};

export default CullingGrid;
