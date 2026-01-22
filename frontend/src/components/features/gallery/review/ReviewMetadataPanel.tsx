/**
 * ReviewMetadataPanel Component
 * Right sidebar panel showing detailed metadata for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T027
 *
 * Displays:
 * - Rating controls
 * - Flag controls
 * - Color label controls
 * - File metadata (dimensions, size, date)
 * - EXIF data summary
 * - XMP sync status
 */

import React from 'react';
import {
  Camera,
  Calendar,
  Image as ImageIcon,
  HardDrive,
  Clock,
  Aperture,
  Timer,
  Sun,
  Focus,
  RefreshCw,
} from 'lucide-react';
import type {
  FilteredAsset,
  AssetRating,
  AssetFlag,
  ColorLabel,
} from '../../../../types/reviewMode';
import { RatingStars } from './RatingStars';
import { FlagIndicator } from './FlagIndicator';
import { ColorLabelIndicator } from './ColorLabelIndicator';
import { HistogramDisplay, type HistogramData } from './HistogramDisplay';

export interface ReviewMetadataPanelProps {
  /** Current asset */
  asset: FilteredAsset | null;
  /** Callback when rating changes */
  onRatingChange?: (rating: AssetRating) => void;
  /** Callback when flag changes */
  onFlagChange?: (flag: AssetFlag) => void;
  /** Callback when color label changes */
  onColorLabelChange?: (label: ColorLabel) => void;
  /** Histogram data for current asset */
  histogramData?: HistogramData | null;
  /** Whether histogram is loading */
  isHistogramLoading?: boolean;
  /** Whether currently syncing */
  isSyncing?: boolean;
  /** Last sync timestamp */
  lastSyncAt?: string | null;
  /** Show keyboard shortcuts */
  showShortcuts?: boolean;
  /** Whether the panel is collapsed */
  collapsed?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format exposure time for display
 */
function formatExposure(exposure: string | number | undefined | null): string {
  if (!exposure) return '—';
  if (typeof exposure === 'number') {
    if (exposure >= 1) return `${exposure}s`;
    return `1/${Math.round(1 / exposure)}s`;
  }
  return String(exposure);
}

/**
 * Section component for metadata groups
 */
const MetadataSection: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = '' }) => (
  <div className={`border-b border-border pb-3 mb-3 ${className}`}>
    <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
      {title}
    </h3>
    {children}
  </div>
);

/**
 * Metadata row component
 */
const MetadataRow: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
  className?: string;
}> = ({ icon, label, value, className = '' }) => (
  <div className={`flex items-center justify-between py-1 ${className}`}>
    <div className="flex items-center gap-1.5 text-text-tertiary">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <span className="text-sm text-text-primary font-medium">{value}</span>
  </div>
);

/**
 * ReviewMetadataPanel - Detailed metadata sidebar for Review Mode
 */
export const ReviewMetadataPanel: React.FC<ReviewMetadataPanelProps> = ({
  asset,
  onRatingChange,
  onFlagChange,
  onColorLabelChange,
  histogramData,
  isHistogramLoading = false,
  isSyncing = false,
  lastSyncAt,
  showShortcuts = false,
  collapsed = false,
  className = '',
}) => {
  if (collapsed) {
    return null;
  }

  if (!asset) {
    return (
      <div
        className={`
          w-64 bg-surface border-l border-border
          flex items-center justify-center
          ${className}
        `}
      >
        <p className="text-text-tertiary text-sm">No photo selected</p>
      </div>
    );
  }

  // Extract EXIF data if available
  const exif = asset.exif_data || {};

  return (
    <div
      className={`
        w-72 bg-surface border-l border-border
        flex flex-col overflow-hidden
        ${className}
      `}
    >
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary truncate" title={asset.filename}>
          {asset.filename}
        </h2>
        {asset.file_type && (
          <p className="text-xs text-text-tertiary mt-0.5">{asset.file_type.toUpperCase()}</p>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Histogram Section */}
        <MetadataSection title="Histogram">
          <HistogramDisplay
            data={histogramData ?? null}
            mode="luminance"
            height={70}
            showClipping={true}
            isLoading={isHistogramLoading}
          />
        </MetadataSection>

        {/* Rating Section */}
        <MetadataSection title="Rating">
          <RatingStars
            rating={asset.rating}
            onChange={onRatingChange}
            size="md"
            showShortcuts={showShortcuts}
          />
          {showShortcuts && (
            <p className="text-[10px] text-text-tertiary mt-1">Press 0-5 to set rating</p>
          )}
        </MetadataSection>

        {/* Flag Section */}
        <MetadataSection title="Flag">
          <FlagIndicator
            flag={asset.flag}
            onChange={onFlagChange}
            size="md"
            showAllOptions
            showShortcuts={showShortcuts}
          />
          {showShortcuts && (
            <p className="text-[10px] text-text-tertiary mt-1">P = Pick, U = Unflag, X = Reject</p>
          )}
        </MetadataSection>

        {/* Color Label Section */}
        <MetadataSection title="Color Label">
          <ColorLabelIndicator
            colorLabel={asset.color_label}
            onChange={onColorLabelChange}
            size="md"
            showShortcuts={showShortcuts}
          />
          {showShortcuts && (
            <p className="text-[10px] text-text-tertiary mt-1">Press 6-9 for color labels</p>
          )}
        </MetadataSection>

        {/* File Info Section */}
        <MetadataSection title="File Info">
          <MetadataRow
            icon={<ImageIcon size={14} />}
            label="Dimensions"
            value={
              asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'
            }
          />
          <MetadataRow
            icon={<HardDrive size={14} />}
            label="File Size"
            value={formatFileSize(asset.file_size)}
          />
          <MetadataRow
            icon={<Calendar size={14} />}
            label="Created"
            value={formatDate(asset.captured_at || asset.created_at)}
          />
        </MetadataSection>

        {/* Camera Info Section */}
        {(exif.camera_make || exif.camera_model || exif.lens) && (
          <MetadataSection title="Camera">
            {(exif.camera_make || exif.camera_model) && (
              <MetadataRow
                icon={<Camera size={14} />}
                label="Camera"
                value={[exif.camera_make, exif.camera_model].filter(Boolean).join(' ')}
              />
            )}
            {exif.lens && (
              <MetadataRow
                icon={<Focus size={14} />}
                label="Lens"
                value={exif.lens}
              />
            )}
          </MetadataSection>
        )}

        {/* Exposure Info Section */}
        {(exif.aperture || exif.shutter_speed || exif.iso || exif.focal_length) && (
          <MetadataSection title="Exposure">
            {exif.aperture && (
              <MetadataRow
                icon={<Aperture size={14} />}
                label="Aperture"
                value={`ƒ/${exif.aperture}`}
              />
            )}
            {exif.shutter_speed && (
              <MetadataRow
                icon={<Timer size={14} />}
                label="Shutter"
                value={formatExposure(exif.shutter_speed)}
              />
            )}
            {exif.iso && (
              <MetadataRow
                icon={<Sun size={14} />}
                label="ISO"
                value={String(exif.iso)}
              />
            )}
            {exif.focal_length && (
              <MetadataRow
                icon={<Focus size={14} />}
                label="Focal Length"
                value={`${exif.focal_length}mm`}
              />
            )}
          </MetadataSection>
        )}

        {/* Sync Status Section */}
        <MetadataSection title="XMP Sync" className="border-b-0 mb-0 pb-0">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span className="text-sm">Status</span>
            </div>
            <span
              className={`
                text-sm font-medium
                ${isSyncing ? 'text-primary' : 'text-green-600'}
              `}
            >
              {isSyncing ? 'Syncing...' : 'Synced'}
            </span>
          </div>
          {lastSyncAt && (
            <MetadataRow
              icon={<Clock size={14} />}
              label="Last Sync"
              value={formatDate(lastSyncAt)}
            />
          )}
        </MetadataSection>
      </div>

      {/* Footer with keyboard shortcut hint */}
      <div className="p-2 border-t border-border bg-surface-hover/50">
        <p className="text-[10px] text-text-tertiary text-center">
          Press <kbd className="px-1 py-0.5 bg-surface rounded text-text-primary">?</kbd> for
          keyboard shortcuts
        </p>
      </div>
    </div>
  );
};

export default ReviewMetadataPanel;
