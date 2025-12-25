/**
 * PhotoCard Component
 * Individual photo card for gallery display with signed URL support
 * Property 12: Photo Aspect Ratio Preservation
 *
 * Modern 2025 Glassmorphism Design:
 * - Top-right: Favorite and Select buttons (glass circles)
 * - Bottom: Floating action bar with View, Download, Share, Lock, Edit, Delete
 * - Smooth hover transitions and micro-interactions
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Play,
  Image,
} from 'lucide-react';

import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import type { GalleryAssetItem } from '../../../types/gallery';
import { HoverOverlay } from './HoverOverlay';
import { InlineEditForm } from './InlineEditForm';

export interface PhotoCardProps {
  asset: GalleryAssetItem;
  index: number;
  isSelected?: boolean;
  selectable?: boolean;
  /** Whether this photo is the current cover */
  isCover?: boolean;
  onSelect?: (assetId: string) => void;
  onClick?: (asset: GalleryAssetItem, index: number, e: React.MouseEvent) => void;
  onFavorite?: (assetId: string, favorite: boolean) => void;
  onSelection?: (assetId: string, selected: boolean) => void;
  onDownload?: (assetId: string) => void;
  onDelete?: (assetId: string) => void;
  /** Callback to set this photo as the gallery/sub-gallery cover */
  onSetCover?: (assetId: string) => void;
  onUpdateAsset?: (assetId: string, data: { title: string; description: string; is_private: boolean }) => void;
  showActions?: boolean;
  className?: string;
  /** Aspect ratio mode: 'square' forces 1:1, 'auto' uses image dimensions */
  aspectRatio?: 'square' | 'auto';
}

export const PhotoCardComponent: React.FC<PhotoCardProps> = ({
  asset,
  index,
  isSelected = false,
  selectable = false,
  isCover = false,
  onSelect,
  onClick,
  onFavorite,
  onSelection,
  onDownload,
  onDelete,
  onSetCover,
  onUpdateAsset,
  showActions = true,
  className = '',
  aspectRatio: aspectRatioMode = 'auto',
}) => {
  const { workspace } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Variant fallback logic for loading images
  const [activeVariant, setActiveVariant] = useState<'thumbnail' | 'original'>('thumbnail');

  // Reset variant when asset changes
  useEffect(() => {
    setActiveVariant('thumbnail');
    setImageError(false);
  }, [asset.asset_id]);

  // Fetch signed URL for image
  const {
    url: thumbnailUrl,
    loading: urlLoading,
    error: urlError,
    refresh: refreshUrl,
  } = useSignedUrl({
    assetId: asset.asset_id,
    variant: activeVariant,
    enabled: !!workspace?.workspace_id && asset.asset.status === 'available',
  });

  // Handle load errors by trying fallback
  useEffect(() => {
    if (urlError && !urlLoading) {
      if (activeVariant === 'thumbnail') {
        // Try original if thumbnail fails
        setActiveVariant('original');
      } else {
        // Both failed, try refresh after a delay
        const timer = setTimeout(() => {
          refreshUrl();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [urlError, urlLoading, activeVariant, refreshUrl]);

  // Calculate aspect ratio from asset dimensions
  const aspectRatio =
    aspectRatioMode === 'square'
      ? '1 / 1'
      : asset.asset.width && asset.asset.height
      ? `${asset.asset.width} / ${asset.asset.height}`
      : '4 / 3';

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (selectable && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation();
      onSelect?.(asset.asset_id);
    } else {
      onClick?.(asset, index, e);
    }
  }, [selectable, onSelect, onClick, asset, index]);

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite?.(asset.asset_id, !asset.is_favorited);
  }, [onFavorite, asset.asset_id, asset.is_favorited]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload?.(asset.asset_id);
  }, [onDownload, asset.asset_id]);

  const handleSelect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(asset.asset_id);
  }, [onSelect, asset.asset_id]);

  const handleSelectionToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelection?.(asset.asset_id, !asset.is_selected);
  }, [onSelection, asset.asset_id, asset.is_selected]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(asset.asset_id);
  }, [onDelete, asset.asset_id]);

  const handleSetCover = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetCover?.(asset.asset_id);
  }, [onSetCover, asset.asset_id]);


  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    // Hide hover overlay while editing? Overlay hides itself if we aren't hovering, but edit form is on top.
  }, []);

  const handleSaveEdit = (data: { title: string; description: string; is_private: boolean }) => {
    onUpdateAsset?.(asset.asset_id, data);
    setIsEditing(false);
  };

  // Use signed URL if available, fallback to cached thumbnail_url
  const displayUrl = thumbnailUrl || asset.asset.thumbnail_url || undefined;

  return (
    <div
      className={`
        group relative
        rounded-card overflow-hidden
        cursor-pointer
        bg-surface-hover
        transition-all duration-200 ease-out
        ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
        hover:shadow-card-hover
        select-none
        ${className}
      `}
      style={{ aspectRatio }}
      role="gridcell"
      tabIndex={0}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // For keyboard, we don't have a click event easily, but we can pass synthetic one if needed
          // Or just pass undefined as 3rd arg if allow. But type says MouseEvent.
          // Let's coerce or just mock it.
          // Actually, let's keep it robust.
          const syntheticEvent = { stopPropagation: () => {}, preventDefault: () => {}, ctrlKey: false, metaKey: false } as unknown as React.MouseEvent;
          onClick?.(asset, index, syntheticEvent);
        }
      }}
      aria-selected={isSelected}
      aria-label={`Photo ${index + 1}: ${asset.asset.filename || 'Untitled'}`}
    >
      {isEditing && (
        <InlineEditForm
          initialTitle={asset.title || asset.asset.filename || ''}
          initialDescription={asset.description || ''}
          initialIsPrivate={asset.is_private}
          onSave={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
        />
      )}

      {/* Thumbnail Image */}
      {displayUrl && !imageError ? (
        <img
          ref={imgRef}
          src={displayUrl}
          alt={asset.asset.filename || `Photo ${index + 1}`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            setImageError(true);
            // Try refreshing URL on error
            if (!urlLoading) {
              refreshUrl();
            }
          }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-surface-hover p-4 text-center">
          {asset.asset.status === 'processing' ? (
            <>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-text-secondary text-xs font-medium">Processing...</div>
            </>
          ) : asset.asset.status === 'failed' ? (
            <div className="text-error text-xs font-medium">Upload Failed</div>
          ) : urlLoading ? (
            // Skeleton Loader
            <div className="w-full h-full absolute inset-0 bg-surface-hover animate-pulse flex items-center justify-center">
               <div className="w-8 h-8 opacity-20 text-text-tertiary">
                 <Image size={32} />
               </div>
            </div>
          ) : (
            <div className="text-text-tertiary text-sm">
              {urlError ? 'Failed to load' : 'No image'}
            </div>
          )}
        </div>
      )}

      {/* Status Badges - Top Left (Cover, Private, Video) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        {/* Cover Badge */}
        {isCover && (
          <div
            className="px-2 py-1 rounded-full bg-primary/90 backdrop-blur-sm flex items-center gap-1"
            aria-label="Cover Photo"
            title="Gallery Cover"
          >
            <Image size={12} className="text-white" />
            <span className="text-[10px] font-semibold text-white uppercase tracking-wide">Cover</span>
          </div>
        )}

        {/* Private Badge */}
        {asset.is_private && (
          <div
            className="p-1.5 rounded-full bg-warning/90 backdrop-blur-sm"
            aria-label="Private"
            title="Private Photo"
          >
            <Lock size={14} className="text-white" />
          </div>
        )}

        {/* Video Badge */}
        {asset.asset.type === 'video' && (
          <div
            className="px-2 py-1 rounded-full bg-neutral-900/60 backdrop-blur-sm flex items-center gap-1"
            aria-label="Video"
          >
            <Play size={12} className="text-white fill-white" />
            {asset.asset.duration_ms && (
              <span className="text-xs font-medium text-white">
                {Math.floor(asset.asset.duration_ms / 1000)}s
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover Overlay Component - Handles all actions */}
      <HoverOverlay
        asset={asset}
        index={index}
        isHovered={isHovered}
        isSelected={isSelected}
        isCover={isCover}
        selectable={selectable}
        showActions={showActions}
        onSelect={handleSelect}
        onSelectionToggle={handleSelectionToggle}
        onFavorite={handleFavorite}
        onClick={(e) => {
           e.stopPropagation();
           onClick?.(asset, index, e);
        }}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onSetCover={handleSetCover}
        onEdit={handleEdit}
      />

    </div>
  );
};

export const PhotoCard = React.memo(PhotoCardComponent);

