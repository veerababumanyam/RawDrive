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
  Heart,
  Lock,
  Play,
  CheckSquare,
  Download,
  Trash2,
  Image,
  Maximize2,
  Share2,
  Edit3,
} from 'lucide-react';

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
            <div className="text-error text-xs font-medium">Upload Failed</div>
          ) : urlLoading ? (
            <div className="w-12 h-12 border-2 border-border border-t-primary rounded-full animate-spin" />
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

      {/* Top-Right Controls - Favorite & Select (Always visible when active, hover for others) */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
        {/* Favorite Button - Always visible when favorited, otherwise on hover */}
        {showActions && onFavorite && (
          <button
            className={`
              photo-card-top-btn btn-favorite
              ${asset.is_favorited ? 'active always-visible' : ''}
              ${!asset.is_favorited && !isHovered ? 'opacity-0' : 'opacity-100'}
              transition-opacity duration-200
            `}
            onClick={handleFavorite}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            title={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span className="photo-card-tooltip">{asset.is_favorited ? 'Unfavorite' : 'Favorite'}</span>
            <Heart size={20} />
          </button>
        )}

        {/* Selection Toggle Button - Always visible when selected, otherwise on hover */}
        {showActions && (selectable || onSelection) && (
          <button
            className={`
              photo-card-top-btn btn-select
              ${isSelected || asset.is_selected ? 'active always-visible' : ''}
              ${!(isSelected || asset.is_selected) && !isHovered ? 'opacity-0' : 'opacity-100'}
              transition-opacity duration-200
            `}
            onClick={selectable ? handleSelect : handleSelectionToggle}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={isSelected || asset.is_selected ? 'Deselect photo' : 'Select photo'}
            title={isSelected || asset.is_selected ? 'Deselect photo' : 'Select photo'}
          >
            <span className="photo-card-tooltip">{isSelected || asset.is_selected ? 'Deselect' : 'Select'}</span>
            <CheckSquare size={20} />
          </button>
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

      {/* Bottom Action Bar - Floating Glassmorphism Container */}
      {showActions && isHovered && (
        <div className="photo-card-action-bar" onClick={(e) => e.stopPropagation()}>
          {/* View / Fullscreen Button - Primary Blue */}
          <button
            className="photo-card-action-btn btn-view"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(asset, index);
            }}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label="View Full Screen"
            title="View Full Screen"
          >
            <span className="photo-card-tooltip">View</span>
            <Maximize2 size={20} />
          </button>

          {/* Download Button */}
          {onDownload && (
            <button
              className="photo-card-action-btn"
              onClick={handleDownload}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Download Photo"
              title="Download Photo"
            >
              <span className="photo-card-tooltip">Download</span>
              <Download size={20} />
            </button>
          )}

          {/* Share Button */}
          <button
            className="photo-card-action-btn"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label="Share Photo"
            title="Share Photo"
          >
            <span className="photo-card-tooltip">Share</span>
            <Share2 size={20} />
          </button>

          {/* Lock / Private Button */}
          <button
            className={`photo-card-action-btn btn-lock ${asset.is_private ? 'active' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={asset.is_private ? 'Unlock Photo' : 'Lock Photo'}
            title={asset.is_private ? 'Unlock Photo' : 'Lock Photo'}
          >
            <span className="photo-card-tooltip">{asset.is_private ? 'Unlock' : 'Lock'}</span>
            <Lock size={20} />
          </button>

          {/* Set as Cover / Edit Button */}
          {onSetCover && !isCover ? (
            <button
              className="photo-card-action-btn"
              onClick={handleSetCover}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Set as Cover"
              title="Set as Cover"
            >
              <span className="photo-card-tooltip">Set Cover</span>
              <Image size={20} />
            </button>
          ) : (
            <button
              className="photo-card-action-btn"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Edit Info"
              title="Edit Info"
            >
              <span className="photo-card-tooltip">Edit</span>
              <Edit3 size={20} />
            </button>
          )}

          {/* Delete Button */}
          {onDelete && (
            <button
              className="photo-card-action-btn btn-delete"
              onClick={handleDelete}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Delete Photo"
              title="Delete Photo"
            >
              <span className="photo-card-tooltip">Delete</span>
              <Trash2 size={20} />
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export const PhotoCard = React.memo(PhotoCardComponent);

