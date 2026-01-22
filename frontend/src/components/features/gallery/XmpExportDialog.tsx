/**
 * XmpExportDialog Component
 * Modal dialog for exporting XMP sidecar files from a gallery
 * Feature: 029-pro-review-xmp-sync
 * Task: T042
 */

import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Filter, CheckCircle, AlertCircle, Loader2, Info } from 'lucide-react';
import { useXmpSync } from '../../../hooks/useXmpSync';
import type { XmpExportRequest } from '../../../services/xmpSyncService';

export interface XmpExportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Gallery name for display */
  galleryName?: string;
  /** Optional pre-selected asset IDs */
  selectedAssetIds?: string[];
  /** Optional sub-gallery ID filter */
  subGalleryId?: string;
}

export const XmpExportDialog: React.FC<XmpExportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  galleryId,
  galleryName = 'Gallery',
  selectedAssetIds,
  subGalleryId,
}) => {
  // Export options state
  const [includePicksOnly, setIncludePicksOnly] = useState(false);
  const [includeRatedOnly, setIncludeRatedOnly] = useState(false);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [includeRawdriveMetadata, setIncludeRawdriveMetadata] = useState(true);
  const [exportSelectedOnly, setExportSelectedOnly] = useState(false);

  // XMP sync hook
  const {
    status,
    isLoadingStatus,
    exportPreview,
    isExporting,
    exportProgress,
    exportError,
    previewExport,
    downloadExport,
    clearExportError,
    formatFileSize,
    formatDate,
  } = useXmpSync({
    workspaceId,
    galleryId,
    autoFetchStatus: isOpen,
  });

  // Build export request
  const buildExportRequest = (): XmpExportRequest => {
    const request: XmpExportRequest = {
      include_rawdrive_metadata: includeRawdriveMetadata,
    };

    if (exportSelectedOnly && selectedAssetIds?.length) {
      request.asset_ids = selectedAssetIds;
    }

    if (subGalleryId) {
      request.sub_gallery_id = subGalleryId;
    }

    if (includePicksOnly) {
      request.include_picks_only = true;
    }

    if (includeRatedOnly) {
      request.include_rated_only = true;
    }

    if (minRating !== undefined && minRating > 0) {
      request.min_rating = minRating;
    }

    return request;
  };

  // Fetch preview when options change
  useEffect(() => {
    if (isOpen) {
      const request = buildExportRequest();
      previewExport(request).catch(() => {
        // Error is handled by the hook
      });
    }
  }, [
    isOpen,
    includePicksOnly,
    includeRatedOnly,
    minRating,
    exportSelectedOnly,
    selectedAssetIds?.length,
    subGalleryId,
  ]);

  // Handle export
  const handleExport = async () => {
    clearExportError();
    const request = buildExportRequest();
    try {
      await downloadExport(request, `${galleryName.replace(/[^a-z0-9]/gi, '_')}_xmp_export.zip`);
      // Close dialog on success after a short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      // Error is handled by the hook
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-lg bg-surface rounded-xl shadow-2xl border border-border overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xmp-export-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-secondary">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText size={20} className="text-primary" />
            </div>
            <div>
              <h2 id="xmp-export-title" className="text-lg font-semibold text-text-primary">
                Export XMP Files
              </h2>
              <p className="text-sm text-text-secondary">{galleryName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={20} className="text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Status Summary */}
          {status && (
            <div className="p-4 bg-surface-secondary rounded-lg border border-border/50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-tertiary">Total Assets:</span>
                  <span className="ml-2 font-medium text-text-primary">{status.total_assets}</span>
                </div>
                <div>
                  <span className="text-text-tertiary">With Metadata:</span>
                  <span className="ml-2 font-medium text-text-primary">{status.assets_with_xmp}</span>
                </div>
                <div>
                  <span className="text-text-tertiary">Last Export:</span>
                  <span className="ml-2 font-medium text-text-primary">
                    {formatDate(status.last_export_at)}
                  </span>
                </div>
                <div>
                  <span className="text-text-tertiary">Pending Changes:</span>
                  <span className="ml-2 font-medium text-text-primary">{status.pending_changes}</span>
                </div>
              </div>
            </div>
          )}

          {/* Filter Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Filter size={16} />
              <span>Filter Options</span>
            </div>

            {/* Selected assets option */}
            {selectedAssetIds && selectedAssetIds.length > 0 && (
              <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                <input
                  type="checkbox"
                  checked={exportSelectedOnly}
                  onChange={(e) => setExportSelectedOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-text-primary">
                    Export selected only
                  </span>
                  <span className="ml-2 text-xs text-text-tertiary">
                    ({selectedAssetIds.length} selected)
                  </span>
                </div>
              </label>
            )}

            {/* Picks only */}
            <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={includePicksOnly}
                onChange={(e) => setIncludePicksOnly(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text-primary">Picks only</span>
                <p className="text-xs text-text-tertiary">Only export assets flagged as picks</p>
              </div>
            </label>

            {/* Rated only */}
            <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={includeRatedOnly}
                onChange={(e) => setIncludeRatedOnly(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text-primary">Rated assets only</span>
                <p className="text-xs text-text-tertiary">Only export assets with 1+ stars</p>
              </div>
            </label>

            {/* Minimum rating */}
            <div className="p-3 bg-surface-secondary rounded-lg">
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-text-primary">Minimum rating</span>
                  <p className="text-xs text-text-tertiary">Only export assets at or above this rating</p>
                </div>
                <select
                  value={minRating ?? ''}
                  onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : undefined)}
                  className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Any</option>
                  <option value="1">1+ star</option>
                  <option value="2">2+ stars</option>
                  <option value="3">3+ stars</option>
                  <option value="4">4+ stars</option>
                  <option value="5">5 stars</option>
                </select>
              </label>
            </div>

            {/* Include RawDrive metadata */}
            <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={includeRawdriveMetadata}
                onChange={(e) => setIncludeRawdriveMetadata(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text-primary">Include RawDrive metadata</span>
                <p className="text-xs text-text-tertiary">
                  Add asset IDs for re-import matching
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          {exportPreview && (
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Info size={16} className="text-primary" />
                <span className="text-sm font-medium text-primary">Export Preview</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-text-tertiary">Files to export:</span>
                  <span className="ml-2 font-medium text-text-primary">
                    {exportPreview.total_assets}
                  </span>
                </div>
                <div>
                  <span className="text-text-tertiary">Estimated size:</span>
                  <span className="ml-2 font-medium text-text-primary">
                    {formatFileSize(exportPreview.estimated_size_bytes)}
                  </span>
                </div>
              </div>
              {exportPreview.sample_files.length > 0 && (
                <div className="mt-2 pt-2 border-t border-primary/10">
                  <span className="text-xs text-text-tertiary">Sample files:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {exportPreview.sample_files.slice(0, 5).map((file) => (
                      <span
                        key={file}
                        className="px-2 py-0.5 text-xs bg-surface rounded border border-border/50 text-text-secondary truncate max-w-[150px]"
                        title={file}
                      >
                        {file}
                      </span>
                    ))}
                    {exportPreview.sample_files.length > 5 && (
                      <span className="px-2 py-0.5 text-xs text-text-tertiary">
                        +{exportPreview.sample_files.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Generating XMP files...</span>
                <span className="font-medium text-primary">{Math.round(exportProgress)}%</span>
              </div>
              <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success message */}
          {exportProgress === 100 && !isExporting && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-600 dark:text-green-400">
              <CheckCircle size={18} />
              <span className="text-sm font-medium">Export complete! Download started.</span>
            </div>
          )}

          {/* Error message */}
          {exportError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-sm font-medium">Export failed</span>
                <p className="text-xs mt-0.5">{exportError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-secondary">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || isLoadingStatus || !exportPreview?.total_assets}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Export XMP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default XmpExportDialog;
