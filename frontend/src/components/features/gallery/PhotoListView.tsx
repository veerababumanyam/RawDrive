/**
 * PhotoListView Component
 * Table view for gallery assets with sorting and selection
 * Property 25: List View Columns
 */

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, Heart, CheckSquare, Download, Image as ImageIcon, Video, Trash2 } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Checkbox } from '../../ui/FormControls';
import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface PhotoListViewProps {
  assets: GalleryAssetItem[];
  selectedAssetIds: Set<string>;
  onAssetSelect: (assetId: string) => void;
  onAssetClick?: (asset: GalleryAssetItem, index: number) => void;
  onAssetFavorite?: (assetId: string, favorite: boolean) => void;
  onAssetDownload?: (assetId: string) => void;
  onAssetDelete?: (assetId: string) => void; // refreshed
  isLoading?: boolean;
  className?: string;
  /** Whether private photos have been unlocked with PIN */
  isPrivateUnlocked?: boolean;
}

type SortField = 'filename' | 'created_at' | 'dimensions' | 'favorites_count';
type SortDirection = 'asc' | 'desc';

export const PhotoListView: React.FC<PhotoListViewProps> = ({
  assets,
  selectedAssetIds,
  onAssetSelect,
  onAssetClick,
  onAssetFavorite,
  onAssetDownload,
  onAssetDelete,
  isLoading = false,
  className = '',
  isPrivateUnlocked = false,
}) => {
  const { workspace } = useAuth();
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');


  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort assets
  const sortedAssets = useMemo(() => {
    const sorted = [...assets];
    sorted.sort((a, b) => {
      let aValue: string | number | undefined;
      let bValue: string | number | undefined;

      switch (sortField) {
        case 'filename':
          aValue = a.asset.filename || '';
          bValue = b.asset.filename || '';
          break;
        case 'created_at':
          aValue = a.asset.created_at ? new Date(a.asset.created_at).getTime() : 0;
          bValue = b.asset.created_at ? new Date(b.asset.created_at).getTime() : 0;
          break;
        case 'dimensions':
          aValue = (a.asset.width || 0) * (a.asset.height || 0);
          bValue = (b.asset.width || 0) * (b.asset.height || 0);
          break;
        case 'favorites_count':
          aValue = a.favorites_count || 0;
          bValue = b.favorites_count || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [assets, sortField, sortDirection]);

  // Loading state
  if (isLoading && assets.length === 0) {
    return (
      <AppCard padding="md" className={className}>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-text-secondary">Loading photos...</p>
          </div>
        </div>
      </AppCard>
    );
  }

  // Empty state
  if (!isLoading && assets.length === 0) {
    return (
      <AppCard padding="md" className={className}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageIcon size={48} className="text-text-tertiary mb-4" />
          <p className="text-text-secondary font-medium mb-1">No photos</p>
          <p className="text-text-tertiary text-sm">Upload photos to get started</p>
        </div>
      </AppCard>
    );
  }

  return (
    <AppCard padding="none" className={className}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-hover border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={selectedAssetIds.size === assets.length && assets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      assets.forEach((asset) => onAssetSelect(asset.asset_id));
                    } else {
                      assets.forEach((asset) => onAssetSelect(asset.asset_id));
                    }
                  }}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Thumbnail
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('filename')}
                  className="flex items-center gap-1 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                >
                  Filename
                  <ArrowUpDown size={14} className={sortField === 'filename' ? 'text-primary' : 'text-text-tertiary'} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('dimensions')}
                  className="flex items-center gap-1 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                >
                  Dimensions
                  <ArrowUpDown size={14} className={sortField === 'dimensions' ? 'text-primary' : 'text-text-tertiary'} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('created_at')}
                  className="flex items-center gap-1 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                >
                  Date
                  <ArrowUpDown size={14} className={sortField === 'created_at' ? 'text-primary' : 'text-text-tertiary'} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('favorites_count')}
                  className="flex items-center gap-1 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
                >
                  Favorites
                  <ArrowUpDown size={14} className={sortField === 'favorites_count' ? 'text-primary' : 'text-text-tertiary'} />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Selections
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedAssets.map((asset, index) => (
              <PhotoListRow
                key={asset.asset_id}
                asset={asset}
                index={index}
                isSelected={selectedAssetIds.has(asset.asset_id)}
                onSelect={() => onAssetSelect(asset.asset_id)}
                onClick={() => onAssetClick?.(asset, index)}
                onFavorite={onAssetFavorite}
                onDownload={onAssetDownload}
                onDelete={onAssetDelete}
                workspaceId={workspace?.workspace_id || ''}
                isPrivateUnlocked={isPrivateUnlocked}
              />
            ))}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
};

interface PhotoListRowProps {
  asset: GalleryAssetItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onFavorite?: (assetId: string, favorite: boolean) => void;
  onDownload?: (assetId: string) => void;
  onDelete?: (assetId: string) => void;
  workspaceId: string;
  /** Whether private photos have been unlocked with PIN */
  isPrivateUnlocked: boolean;
}

const PhotoListRow: React.FC<PhotoListRowProps> = ({
  asset,
  index,
  isSelected,
  onSelect,
  onClick,
  onFavorite,
  onDownload,
  onDelete,
  workspaceId,
  isPrivateUnlocked,
}) => {
  const [imageError, setImageError] = React.useState(false);

  // Fetch signed URL for thumbnail
  const {
    url: thumbnailUrl,
    loading: urlLoading,
  } = useSignedUrl({
    assetId: asset.asset_id,
    variant: 'thumbnail',
    enabled: !!workspaceId && !!asset.asset_id,
  });

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const isVideo = asset.asset.type === 'video';
  const isFavorite = asset.is_favorited || false;
  const isSelectedAsset = asset.is_selected || false;
  const isLocked = asset.is_private && !isPrivateUnlocked;

  return (
    <tr
      className={`
        hover:bg-surface-hover transition-colors cursor-pointer
        ${isSelected ? 'bg-primary/5' : ''}
      `}
      onClick={onClick}
    >
      {/* Checkbox */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={`Select ${asset.asset.filename || `photo ${index + 1}`}`}
        />
      </td>

      {/* Thumbnail */}
      <td className="px-4 py-3">
        <div className="w-16 h-16 rounded overflow-hidden bg-surface-hover flex items-center justify-center">
          {urlLoading ? (
            <div className="w-full h-full bg-surface-hover animate-pulse" />
          ) : imageError || !thumbnailUrl ? (
            <div className="w-full h-full flex items-center justify-center text-text-tertiary">
              {isVideo ? <Video size={20} /> : <ImageIcon size={20} />}
            </div>
          ) : (
            <img
              src={thumbnailUrl}
              alt={asset.asset.filename || `Photo ${index + 1}`}
              className={`w-full h-full object-cover transition-all duration-300 ${
                isLocked ? 'blur-[40px] scale-110' : ''
              }`}
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </td>

      {/* Filename */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate max-w-[200px]">
            {asset.asset.filename || 'Untitled'}
          </span>
          {asset.is_private && (
            <span className="text-xs px-1.5 py-0.5 bg-warning/10 text-warning rounded">Private</span>
          )}
        </div>
      </td>

      {/* Dimensions */}
      <td className="px-4 py-3 text-sm text-text-secondary">
        {asset.asset.width && asset.asset.height ? (
          <span>
            {asset.asset.width} × {asset.asset.height}
          </span>
        ) : (
          <span>—</span>
        )}
      </td>

      {/* Date */}
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatDate(asset.asset.created_at)}
      </td>

      {/* Favorites */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite?.(asset.asset_id, !isFavorite);
            }}
            className={`
              p-1 rounded transition-colors
              ${isFavorite ? 'text-error' : 'text-text-tertiary hover:text-error'}
            `}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          {asset.favorites_count > 0 && (
            <span className="text-sm text-text-secondary">{asset.favorites_count}</span>
          )}
        </div>
      </td>

      {/* Selections */}
      <td className="px-4 py-3">
        {isSelectedAsset && (
          <CheckSquare size={16} className="text-primary" fill="currentColor" />
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          {onDownload && (
            <button
              onClick={() => onDownload(asset.asset_id)}
              className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
              aria-label="Download"
            >
              <Download size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(asset.asset_id)}
              className="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-surface-hover transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

