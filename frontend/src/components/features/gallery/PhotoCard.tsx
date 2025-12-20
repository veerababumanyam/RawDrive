/**
 * PhotoCard Component
 * Individual photo card for gallery display with signed URL support
 * Property 12: Photo Aspect Ratio Preservation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Lock, Play, Check, CheckSquare, MoreVertical, Download, Trash2, Image } from 'lucide-react';

import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface PhotoCardProps {
  asset: GalleryAssetItem;
  index: number;
  isSelected?: boolean;
  selectable?: boolean;
  /** Whether this photo is the current cover */
  isCover?: boolean;
  onSelect?: (assetId: string) => void;
  onClick?: (asset: GalleryAssetItem, index: number) => void;
  onFavorite?: (assetId: string, favorite: boolean) => void;
  onSelection?: (assetId: string, selected: boolean) => void;
  onDownload?: (assetId: string) => void;
  onDelete?: (assetId: string) => void;
  /** Callback to set this photo as the gallery/sub-gallery cover */
  onSetCover?: (assetId: string) => void;
  showActions?: boolean;
  className?: string;
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
  showActions = true,
  className = '',
}) => {
  const { workspace } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
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
    asset.asset.width && asset.asset.height
      ? `${asset.asset.width} / ${asset.asset.height}`
      : '4 / 3';

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (selectable && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation();
      onSelect?.(asset.asset_id);
    } else {
      onClick?.(asset, index);
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
          onClick?.(asset, index);
        }
      }}
      aria-selected={isSelected}
      aria-label={`Photo ${index + 1}: ${asset.asset.filename || 'Untitled'}`}
    >
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
            <div className="text-red-500 text-xs font-medium">Upload Failed</div>
          ) : urlLoading ? (
            <div className="w-12 h-12 border-2 border-border border-t-primary rounded-full animate-spin" />
          ) : (
            <div className="text-text-tertiary text-sm">
              {urlError ? 'Failed to load' : 'No image'}
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        {/* Cover Badge */}
        {isCover && (
          <div
            className="p-1 rounded-full bg-primary/90 backdrop-blur-sm"
            aria-label="Cover Photo"
            title="Gallery Cover"
          >
            <Image size={14} className="text-white" />
          </div>
        )}

        {/* Favorite Badge */}
        {asset.is_favorited && (
          <div
            className="p-1 rounded-full bg-black/50 backdrop-blur-sm"
            aria-label="Favorited"
          >
            <Heart size={14} className="text-red-500 fill-red-500" />
          </div>
        )}

        {/* Private Badge */}
        {asset.is_private && (
          <div
            className="p-1 rounded-full bg-black/50 backdrop-blur-sm"
            aria-label="Private"
          >
            <Lock size={14} className="text-text-inverse" />
          </div>
        )}

        {/* Video Badge */}
        {asset.asset.type === 'video' && (
          <div
            className="px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm flex items-center gap-1"
            aria-label="Video"
          >
            <Play size={12} className="text-text-inverse fill-text-inverse" />
            {asset.asset.duration_ms && (
              <span className="text-xs text-text-inverse">
                {Math.floor(asset.asset.duration_ms / 1000)}s
              </span>
            )}
          </div>
        )}
      </div>

      {/* Security Overlay - Prevents direct interaction with image */}
      <div
        className="absolute inset-0 z-20"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        draggable={false}
      />

      {/* Hover Overlay with Actions */}
      {showActions && isHovered && (
        <div
          className="
            absolute inset-0 z-30
            bg-gradient-to-t from-black/70 via-black/20 to-transparent
            flex flex-col justify-end p-3
            transition-opacity duration-200
            pointer-events-none
          "
        >
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Favorite Toggle */}
            <button
              className="
                p-1.5 rounded-full touch-target
                bg-white/20 hover:bg-white/30
                text-white
                transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
              "
              onClick={handleFavorite}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart
                size={16}
                className={asset.is_favorited ? 'fill-red-500 text-red-500' : ''}
              />
            </button>

            {/* Selection Toggle */}
            {showActions && onSelection && (
              <button
                className="
                  p-1.5 rounded-full touch-target
                  bg-white/20 hover:bg-white/30
                  text-white
                  transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                "
                onClick={handleSelectionToggle}
                onContextMenu={(e) => e.stopPropagation()}
                aria-label={asset.is_selected ? 'Deselect photo' : 'Select photo as pick'}
              >
                <CheckSquare
                  size={16}
                  className={asset.is_selected ? 'fill-primary text-primary' : ''}
                />
              </button>
            )}

            {/* Set as Cover */}
            {onSetCover && !isCover && (
              <button
                className="
                  p-1.5 rounded-full touch-target
                  bg-white/20 hover:bg-primary/70
                  text-white
                  transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                "
                onClick={handleSetCover}
                onContextMenu={(e) => e.stopPropagation()}
                aria-label="Set as gallery cover"
                title="Set as Cover"
              >
                <Image size={16} />
              </button>
            )}

            {/* Download */}
            {onDownload && (
              <button
                className="
                  p-1.5 rounded-full touch-target
                  bg-white/20 hover:bg-white/30
                  text-white
                  transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                "
                onClick={handleDownload}
                onContextMenu={(e) => e.stopPropagation()}
                aria-label="Download"
              >
                <Download size={16} />
              </button>
            )}

            {/* Delete */}
            {onDelete && (
              <button
                className="
                  p-1.5 rounded-full touch-target
                  bg-white/20 hover:bg-white/30
                  text-white hover:text-red-400
                  transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                "
                onClick={handleDelete}
                onContextMenu={(e) => e.stopPropagation()}
                aria-label="Delete photo"
              >
                <Trash2 size={16} />
              </button>
            )}

            {/* More Options */}
            <button
              className="
                p-1.5 rounded-full touch-target
                bg-white/20 hover:bg-white/30
                text-white
                transition-colors
                ml-auto
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
              "
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="More options"
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Selection Checkbox (outside overlay for easy access) */}
      {selectable && (
        <div
          className={`
            absolute top-2 left-2 z-30
            transition-opacity duration-150
            ${isSelected || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
          onClick={handleSelect}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <div
            className={`
              w-6 h-6 rounded-full
              flex items-center justify-center
              transition-all duration-150 touch-target
              ${isSelected
                ? 'bg-primary text-white'
                : 'bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm'
              }
            `}
            role="checkbox"
            aria-checked={isSelected}
            aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
          >
            {isSelected && <Check size={14} strokeWidth={3} />}
          </div>
        </div>
      )}
    </div>
  );
};

export const PhotoCard = React.memo(PhotoCardComponent);

