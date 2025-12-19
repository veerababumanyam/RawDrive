/**
 * LightboxMetadata Component
 * Displays photo metadata in the lightbox
 * Property 18: Lightbox Metadata Display
 */

import React from 'react';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface LightboxMetadataProps {
  asset: GalleryAssetItem;
  exifVisible?: boolean;
}

export const LightboxMetadata: React.FC<LightboxMetadataProps> = ({ asset, exifVisible = false }) => {
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <div>
        <dt className="text-white/60 text-xs mb-1">Filename</dt>
        <dd className="font-mono text-xs break-all text-white">{asset.asset.filename || 'Unknown'}</dd>
      </div>

      {asset.asset.width && asset.asset.height && (
        <div>
          <dt className="text-white/60 text-xs mb-1">Dimensions</dt>
          <dd className="text-white text-sm">
            {asset.asset.width} × {asset.asset.height} pixels
          </dd>
        </div>
      )}

      {asset.asset.file_size && (
        <div>
          <dt className="text-white/60 text-xs mb-1">File Size</dt>
          <dd className="text-white text-sm">{formatFileSize(asset.asset.file_size)}</dd>
        </div>
      )}

      {asset.asset.mime_type && (
        <div>
          <dt className="text-white/60 text-xs mb-1">Type</dt>
          <dd className="text-white text-sm">{asset.asset.mime_type}</dd>
        </div>
      )}

      {asset.asset.created_at && (
        <div>
          <dt className="text-white/60 text-xs mb-1">Uploaded</dt>
          <dd className="text-white text-sm">{formatDate(asset.asset.created_at)}</dd>
        </div>
      )}

      {exifVisible && asset.asset.exif && Object.keys(asset.asset.exif).length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/20">
          <h4 className="font-semibold text-white mb-2 text-sm">EXIF Data</h4>
          <dl className="space-y-1.5">
            {Object.entries(asset.asset.exif).map(([key, value]) => (
              <div key={key}>
                <dt className="text-white/60 text-xs capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className="font-mono text-xs text-white">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};

