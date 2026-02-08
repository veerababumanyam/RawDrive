/**
 * GalleryPreview Component
 * Preview final gallery selection before applying
 */

import React, { useState, useMemo } from 'react';
import {
  Eye,
  Grid,
  LayoutGrid,
  Star,
  Download,
  FolderPlus,
  ArrowLeft,
  Check,
  Sparkles,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { AppInput } from '../../ui/AppInput';
import type { CullingPhoto, CullingStats } from '../../../services/cullingWorkflowService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryPreviewProps {
  /** Selected photos to preview */
  photos: CullingPhoto[];
  /** Statistics */
  stats: CullingStats | null;
  /** Callback to go back to culling view */
  onBack: () => void;
  /** Callback to create sub-gallery */
  onCreateSubGallery: (name: string) => Promise<string | undefined>;
  /** Callback to mark as favorites */
  onMarkAsFavorites: () => Promise<void>;
  /** Whether actions are loading */
  isLoading?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Preview Photo Card
// ---------------------------------------------------------------------------

interface PreviewPhotoCardProps {
  photo: CullingPhoto;
  onClick?: () => void;
}

const PreviewPhotoCard: React.FC<PreviewPhotoCardProps> = ({ photo, onClick }) => {
  const qualityColor = useMemo(() => {
    if (photo.overall_score >= 90) return 'bg-green-500';
    if (photo.overall_score >= 70) return 'bg-blue-500';
    if (photo.overall_score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  }, [photo.overall_score]);

  return (
    <div
      className="relative group rounded-lg overflow-hidden cursor-pointer bg-surface-secondary hover:shadow-lg transition-all"
      onClick={onClick}
    >
      <div className="aspect-square">
        <img
          src={photo.thumbnail_url || '/placeholder-image.jpg'}
          alt={photo.original_filename || 'Photo'}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Quality badge */}
        <div className="absolute top-2 right-2">
          <span
            className={`${qualityColor} px-2 py-1 rounded-md text-white text-xs font-semibold shadow-sm`}
          >
            {Math.round(photo.overall_score)}
          </span>
        </div>

        {/* Selected indicator */}
        <div className="absolute top-2 left-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <Check size={14} className="text-white" />
          </div>
        </div>

        {/* Hover overlay with details */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
          <div className="text-white text-xs space-y-1">
            <div className="flex justify-between">
              <span>Sharpness</span>
              <span className="font-medium">{Math.round(photo.sharpness_score)}</span>
            </div>
            <div className="flex justify-between">
              <span>Exposure</span>
              <span className="font-medium">{Math.round(photo.exposure_score)}</span>
            </div>
            <div className="flex justify-between">
              <span>Composition</span>
              <span className="font-medium">{Math.round(photo.composition_score)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stats Summary
// ---------------------------------------------------------------------------

interface StatsSummaryProps {
  stats: CullingStats;
}

const StatsSummary: React.FC<StatsSummaryProps> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <AppCard padding="sm" className="text-center">
      <div className="text-2xl font-bold text-green-500">{stats.selected_count}</div>
      <div className="text-xs text-text-secondary">Selected</div>
    </AppCard>
    <AppCard padding="sm" className="text-center">
      <div className="text-2xl font-bold text-red-500">{stats.rejected_count}</div>
      <div className="text-xs text-text-secondary">Rejected</div>
    </AppCard>
    <AppCard padding="sm" className="text-center">
      <div className="text-2xl font-bold text-text-primary">{stats.total_photos}</div>
      <div className="text-xs text-text-secondary">Total</div>
    </AppCard>
    <AppCard padding="sm" className="text-center">
      <div className="text-2xl font-bold text-primary">
        {stats.total_photos > 0
          ? Math.round((stats.selected_count / stats.total_photos) * 100)
          : 0}
        %
      </div>
      <div className="text-xs text-text-secondary">Cull Rate</div>
    </AppCard>
  </div>
);

// ---------------------------------------------------------------------------
// Quality Distribution
// ---------------------------------------------------------------------------

interface QualityDistributionProps {
  photos: CullingPhoto[];
}

const QualityDistribution: React.FC<QualityDistributionProps> = ({ photos }) => {
  const distribution = useMemo(() => {
    const counts = { excellent: 0, good: 0, fair: 0, poor: 0 };
    photos.forEach((p) => {
      counts[p.quality_tier as keyof typeof counts]++;
    });
    return counts;
  }, [photos]);

  const total = photos.length;

  return (
    <AppCard padding="md">
      <h4 className="text-sm font-medium text-text-primary mb-3">Quality Distribution</h4>
      <div className="space-y-2">
        <QualityBar label="Excellent" count={distribution.excellent} total={total} color="bg-green-500" />
        <QualityBar label="Good" count={distribution.good} total={total} color="bg-blue-500" />
        <QualityBar label="Fair" count={distribution.fair} total={total} color="bg-yellow-500" />
        <QualityBar label="Poor" count={distribution.poor} total={total} color="bg-red-500" />
      </div>
    </AppCard>
  );
};

interface QualityBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const QualityBar: React.FC<QualityBarProps> = ({ label, count, total, color }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-text-secondary">{label}</span>
      <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-xs text-text-tertiary text-right">{count}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const GalleryPreview: React.FC<GalleryPreviewProps> = ({
  photos,
  stats,
  onBack,
  onCreateSubGallery,
  onMarkAsFavorites,
  isLoading = false,
  className = '',
}) => {
  const [columns, setColumns] = useState(5);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [subGalleryName, setSubGalleryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSubGallery = async () => {
    if (!subGalleryName.trim()) return;

    setIsCreating(true);
    try {
      const subGalleryId = await onCreateSubGallery(subGalleryName.trim());
      if (subGalleryId) {
        setShowCreateDialog(false);
        setSubGalleryName('');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <AppButton
            variant="ghost"
            leftIcon={<ArrowLeft size={20} />}
            onClick={onBack}
          >
            Back to Culling
          </AppButton>
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <Eye size={24} />
              Preview Selection
            </h2>
            <p className="text-sm text-text-secondary">
              {photos.length} photos selected for final gallery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Column controls */}
          <div className="flex items-center gap-1 border border-border rounded-lg p-1">
            {[4, 5, 6, 8].map((cols) => (
              <button
                key={cols}
                onClick={() => setColumns(cols)}
                className={`
                  p-1 rounded transition-colors
                  ${columns === cols
                    ? 'bg-primary text-white'
                    : 'hover:bg-surface-secondary text-text-secondary'
                  }
                `}
                aria-label={`${cols} columns`}
              >
                {cols <= 5 ? <Grid size={16} /> : <LayoutGrid size={16} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && <StatsSummary stats={stats} />}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Photo Grid */}
        <div className="lg:col-span-3">
          {photos.length > 0 ? (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {photos.map((photo) => (
                <PreviewPhotoCard key={photo.asset_id} photo={photo} />
              ))}
            </div>
          ) : (
            <AppCard padding="lg" className="text-center">
              <div className="py-16">
                <Sparkles className="w-12 h-12 mx-auto text-text-tertiary mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No Photos Selected
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Go back to culling view and select your best shots.
                </p>
                <AppButton variant="primary" onClick={onBack}>
                  Start Culling
                </AppButton>
              </div>
            </AppCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quality Distribution */}
          {photos.length > 0 && <QualityDistribution photos={photos} />}

          {/* Actions */}
          <AppCard padding="md">
            <h4 className="text-sm font-medium text-text-primary mb-3">Apply Selection</h4>
            <div className="space-y-2">
              <AppButton
                variant="primary"
                className="w-full"
                leftIcon={<FolderPlus size={16} />}
                onClick={() => setShowCreateDialog(true)}
                disabled={isLoading || photos.length === 0}
              >
                Create Sub-Gallery
              </AppButton>

              <AppButton
                variant="outline"
                className="w-full"
                leftIcon={<Star size={16} />}
                onClick={onMarkAsFavorites}
                disabled={isLoading || photos.length === 0}
              >
                Mark as Favorites
              </AppButton>

              <AppButton
                variant="ghost"
                className="w-full"
                leftIcon={<Download size={16} />}
                disabled={true}
              >
                Export (Coming Soon)
              </AppButton>
            </div>
          </AppCard>

          {/* Tips */}
          <AppCard padding="md" className="bg-primary/5 border-primary/20">
            <h4 className="text-sm font-medium text-text-primary mb-2">Pro Tip</h4>
            <p className="text-xs text-text-secondary">
              Creating a sub-gallery preserves your curated selection while keeping
              the original photos in place. Perfect for client delivery!
            </p>
          </AppCard>
        </div>
      </div>

      {/* Create Sub-Gallery Dialog */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateDialog(false)}
        >
          <AppCard
            padding="lg"
            className="max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Create Sub-Gallery
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {photos.length} photos will be added
                  </p>
                </div>
              </div>

              <AppInput
                label="Sub-Gallery Name"
                placeholder="e.g., Client Selects, Final Delivery"
                value={subGalleryName}
                onChange={(e) => setSubGalleryName(e.target.value)}
                autoFocus
              />

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <AppButton
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setSubGalleryName('');
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={handleCreateSubGallery}
                  disabled={isCreating || !subGalleryName.trim()}
                  leftIcon={<FolderPlus size={16} />}
                >
                  Create
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>
      )}
    </div>
  );
};

export default GalleryPreview;
