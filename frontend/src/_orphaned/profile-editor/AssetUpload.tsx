/**
 * Asset Upload Component
 *
 * Multi-variant asset upload with drag-and-drop, validation,
 * preview, and version history display.
 *
 * Requirements: 7.1, 7.4, 7.6, 7.10
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  Image as ImageIcon,
  AlertTriangle,
  Check,
  Trash2,
  RefreshCw,
  History,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  Download,
  Copy,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import {
  brandAssetService,
  type AssetValidationResult,
  type VersionHistoryEntry,
} from '@/services/brandAssetService';
import type { BrandAsset, AssetType, AssetVariant } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface AssetUploadProps {
  /** Workspace ID for asset storage */
  workspaceId: string;
  /** Type of asset being uploaded */
  assetType: AssetType;
  /** Called when assets are updated */
  onAssetsChange?: (assets: BrandAsset[]) => void;
  /** Optional class name */
  className?: string;
}

interface UploadState {
  file: File;
  variant: AssetVariant;
  validation: AssetValidationResult;
  dimensionWarnings: string[];
  preview: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const VARIANT_OPTIONS: Array<{
  value: AssetVariant;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    value: 'full',
    label: 'Full Logo',
    icon: <Maximize2 className="w-4 h-4" />,
    description: 'Standard full-size logo',
  },
  {
    value: 'icon',
    label: 'Icon',
    icon: <Minimize2 className="w-4 h-4" />,
    description: 'Small icon version',
  },
  {
    value: 'light',
    label: 'Light Background',
    icon: <Sun className="w-4 h-4" />,
    description: 'For use on light backgrounds',
  },
  {
    value: 'dark',
    label: 'Dark Background',
    icon: <Moon className="w-4 h-4" />,
    description: 'For use on dark backgrounds',
  },
];

// =============================================================================
// Component
// =============================================================================

export const AssetUpload: React.FC<AssetUploadProps> = ({
  workspaceId,
  assetType,
  onAssetsChange,
  className = '',
}) => {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize service and load assets
  useEffect(() => {
    brandAssetService.initialize(workspaceId);
    loadAssets();
  }, [workspaceId, assetType]);

  const loadAssets = async () => {
    setIsLoading(true);
    try {
      const data = await brandAssetService.getAssetsByType(assetType);
      setAssets(data);
      onAssetsChange?.(data);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadVersionHistory = async () => {
    try {
      const history = await brandAssetService.getVersionHistory(assetType);
      setVersionHistory(history);
    } catch (error) {
      console.error('Failed to load version history:', error);
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback(
    async (files: FileList | null, variant: AssetVariant = 'full') => {
      if (!files || files.length === 0) return;

      const file = files[0];
      const validation = brandAssetService.validateAssetFile(file);

      // Create preview URL
      const preview = URL.createObjectURL(file);

      // Check dimensions
      const dimCheck = await brandAssetService.validateAssetDimensions(file, variant);

      setUploadState({
        file,
        variant,
        validation: {
          ...validation,
          dimensions: dimCheck.valid ? { width: dimCheck.width, height: dimCheck.height } : undefined,
        },
        dimensionWarnings: dimCheck.warnings,
        preview,
        status: 'pending',
        progress: 0,
      });
    },
    []
  );

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  // Handle upload
  const handleUpload = async () => {
    if (!uploadState || !uploadState.validation.valid) return;

    setUploadState((prev) => (prev ? { ...prev, status: 'uploading', progress: 0 } : null));

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadState((prev) => {
          if (!prev || prev.progress >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return { ...prev, progress: prev.progress + 10 };
        });
      }, 100);

      const response = await brandAssetService.uploadAsset(
        uploadState.file,
        assetType,
        uploadState.variant,
        { generateWebP: true, generateAvif: true }
      );

      clearInterval(progressInterval);

      if (response.data?.asset) {
        setUploadState((prev) => (prev ? { ...prev, status: 'success', progress: 100 } : null));
        const updatedAssets = [...assets, response.data.asset];
        setAssets(updatedAssets);
        onAssetsChange?.(updatedAssets);

        // Clear upload state after success
        setTimeout(() => {
          if (uploadState?.preview) {
            URL.revokeObjectURL(uploadState.preview);
          }
          setUploadState(null);
        }, 1500);
      } else if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      setUploadState((prev) =>
        prev
          ? {
              ...prev,
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed',
            }
          : null
      );
    }
  };

  // Handle delete
  const handleDelete = async (assetId: string) => {
    setDeletingAssetId(assetId);
    try {
      await brandAssetService.deleteAsset(assetId);
      const updatedAssets = assets.filter((a) => a.asset_id !== assetId);
      setAssets(updatedAssets);
      onAssetsChange?.(updatedAssets);
    } catch (error) {
      console.error('Failed to delete asset:', error);
    } finally {
      setDeletingAssetId(null);
    }
  };

  // Handle restore version
  const handleRestoreVersion = async (assetId: string) => {
    try {
      await brandAssetService.restoreVersion(assetId);
      await loadAssets();
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to restore version:', error);
    }
  };

  // Cancel upload
  const handleCancelUpload = useCallback(() => {
    if (uploadState?.preview) {
      URL.revokeObjectURL(uploadState.preview);
    }
    setUploadState(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadState]);

  // Copy asset URL
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  // Toggle version history
  const handleToggleHistory = () => {
    if (!showHistory) {
      loadVersionHistory();
    }
    setShowHistory(!showHistory);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with history toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary capitalize">
          {assetType} Assets
        </h3>
        <button
          type="button"
          onClick={handleToggleHistory}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <History className="w-3 h-3" />
          Version History
        </button>
      </div>

      {/* Upload Area */}
      {!uploadState && (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={`Upload ${assetType} file`}
          />

          <Upload className="w-8 h-8 mx-auto text-text-tertiary mb-2" />
          <p className="text-sm font-medium text-text-primary">
            Drag and drop an image here
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            or click to browse • PNG, JPG, WebP, SVG • Max 10MB
          </p>
        </div>
      )}

      {/* Upload Configuration */}
      {uploadState && uploadState.status === 'pending' && (
        <div className="p-4 border border-border rounded-lg space-y-4">
          {/* Preview */}
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 bg-surface-hover rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={uploadState.preview}
                alt="Upload preview"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-primary truncate">{uploadState.file.name}</p>
              <p className="text-xs text-text-tertiary">
                {(uploadState.file.size / 1024).toFixed(1)} KB
                {uploadState.validation.dimensions && (
                  <span>
                    {' '}• {uploadState.validation.dimensions.width}x
                    {uploadState.validation.dimensions.height}px
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="mt-2 text-xs text-text-tertiary hover:text-error"
              >
                <X className="w-3 h-3 inline mr-1" />
                Remove
              </button>
            </div>
          </div>

          {/* Validation warnings */}
          {(uploadState.validation.warnings.length > 0 ||
            uploadState.dimensionWarnings.length > 0) && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm text-warning">
                  {[...uploadState.validation.warnings, ...uploadState.dimensionWarnings].map(
                    (warning, i) => (
                      <p key={i}>{warning}</p>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {!uploadState.validation.valid && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
                <div className="text-sm text-error">
                  {uploadState.validation.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Variant selection */}
          {uploadState.validation.valid && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Asset Variant
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {VARIANT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setUploadState((prev) =>
                          prev ? { ...prev, variant: option.value } : null
                        )
                      }
                      className={`
                        flex items-center gap-2 p-3 rounded-lg border text-left transition-colors
                        ${
                          uploadState.variant === option.value
                            ? 'border-accent bg-accent/5'
                            : 'border-border hover:border-accent/50'
                        }
                      `}
                    >
                      <span className="text-text-tertiary">{option.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{option.label}</p>
                        <p className="text-xs text-text-tertiary truncate">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload button */}
              <div className="flex gap-2">
                <AppButton variant="primary" className="flex-1" onClick={handleUpload}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {uploadState.variant} variant
                </AppButton>
                <AppButton variant="outline" onClick={handleCancelUpload}>
                  Cancel
                </AppButton>
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploadState && uploadState.status === 'uploading' && (
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="w-5 h-5 text-accent animate-spin" />
            <span className="text-sm font-medium text-text-primary">Uploading and optimizing...</span>
          </div>
          <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-2 text-right">{uploadState.progress}%</p>
        </div>
      )}

      {/* Upload Success */}
      {uploadState && uploadState.status === 'success' && (
        <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-success" />
            <span className="text-sm font-medium text-success">Asset uploaded successfully!</span>
          </div>
        </div>
      )}

      {/* Upload Error */}
      {uploadState && uploadState.status === 'error' && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-error" />
              <span className="text-sm font-medium text-error">
                {uploadState.error || 'Upload failed'}
              </span>
            </div>
            <AppButton variant="outline" size="sm" onClick={handleCancelUpload}>
              Try Again
            </AppButton>
          </div>
        </div>
      )}

      {/* Assets Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="aspect-square bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {assets.map((asset) => (
            <div
              key={asset.asset_id}
              className="relative group border border-border rounded-lg overflow-hidden hover:border-accent/50 transition-colors"
            >
              <div className="aspect-square bg-surface-hover flex items-center justify-center p-4">
                <img
                  src={asset.optimized_formats.webp || asset.object_key}
                  alt={`${asset.asset_type} - ${asset.variant}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Current badge */}
              {asset.is_current && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-accent text-white text-xs font-medium rounded">
                  Current
                </span>
              )}

              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                <p className="text-white text-xs font-medium capitalize">{asset.variant}</p>
                <p className="text-white/70 text-xs">
                  {asset.width}x{asset.height}
                </p>
              </div>

              {/* Actions overlay */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(asset.optimized_formats.webp || asset.object_key)}
                  className="p-1.5 bg-white/90 rounded shadow hover:bg-white"
                  title="Copy URL"
                >
                  <Copy className="w-3 h-3 text-text-primary" />
                </button>
                <a
                  href={asset.object_key}
                  download
                  className="p-1.5 bg-white/90 rounded shadow hover:bg-white"
                  title="Download"
                >
                  <Download className="w-3 h-3 text-text-primary" />
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(asset.asset_id)}
                  disabled={deletingAssetId === asset.asset_id}
                  className="p-1.5 bg-white/90 rounded shadow hover:bg-error/10 disabled:opacity-50"
                  title="Delete"
                >
                  {deletingAssetId === asset.asset_id ? (
                    <RefreshCw className="w-3 h-3 text-text-tertiary animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 text-error" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-text-tertiary">
          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No {assetType} assets uploaded yet</p>
        </div>
      )}

      {/* Version History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-medium text-text-primary">Version History</h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-surface-hover rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-96">
              {versionHistory.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-4">No version history</p>
              ) : (
                <div className="space-y-2">
                  {versionHistory.map((entry) => (
                    <div
                      key={entry.asset_id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          Version {entry.version}
                          {entry.is_current && (
                            <span className="ml-2 px-1.5 py-0.5 bg-accent/10 text-accent text-xs rounded">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {!entry.is_current && (
                        <AppButton
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreVersion(entry.asset_id)}
                        >
                          Restore
                        </AppButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetUpload;
