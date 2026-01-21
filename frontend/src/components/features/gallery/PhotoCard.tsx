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
  Key,
  Play,
  Image,
} from 'lucide-react';

import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import { useLongPress } from '../../../hooks/useLongPress';
import type { GalleryAssetItem } from '../../../types/gallery';
import { HoverOverlay } from './HoverOverlay';
import { InlineEditForm } from './InlineEditForm';
import { PhotoContextMenu, createPhotoContextActions } from './PhotoContextMenu';

// Track loaded images for instant display (no placeholder needed)
const loadedImageCache = new Set<string>();

export interface PhotoCardProps {
  asset: GalleryAssetItem;
  index: number;
  /** Management selection state (local UI for CRUD bulk operations) */
  isManagementSelected?: boolean;
  /** Enable management selection mode for CRUD operations */
  managementSelectable?: boolean;
  /** Show customer selection toggle for delivery workflow */
  showCustomerSelection?: boolean;
  /** Whether this photo is the current cover */
  isCover?: boolean;
  /** Management selection callback (for CRUD bulk operations) */
  onManagementSelect?: (assetId: string) => void;
  onClick?: (asset: GalleryAssetItem, index: number, e: React.MouseEvent) => void;
  onFavorite?: (assetId: string, favorite: boolean) => void;
  /** Customer selection callback (persisted for delivery workflow) */
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  onDownload?: (assetId: string) => void;
  onShare?: (assetId: string) => void;
  onLock?: (assetId: string, isPrivate: boolean) => void;
  onDelete?: (assetId: string) => void;
  /** Callback to set this photo as the gallery/sub-gallery cover */
  onSetCover?: (assetId: string) => void;
  onUpdateAsset?: (assetId: string, data: { title: string; description: string; is_private: boolean }) => void;
  showActions?: boolean;
  className?: string;
  /** Aspect ratio mode: 'square' forces 1:1, 'auto' uses image dimensions */
  aspectRatio?: 'square' | 'auto';
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;
  /** Whether the access code has been verified for this photo */
  isAccessCodeVerified?: boolean;
  /** Callback to trigger access code verification modal */
  onVerifyAccessCode?: () => void;
}

export const PhotoCardComponent: React.FC<PhotoCardProps> = ({
  asset,
  index,
  isManagementSelected = false,
  managementSelectable = false,
  showCustomerSelection = true,
  isCover = false,
  onManagementSelect,
  onClick,
  onFavorite,
  onCustomerSelectionToggle,
  onDownload,
  onShare,
  onLock,
  onDelete,
  onSetCover,
  onUpdateAsset,
  showActions = true,
  className = '',
  aspectRatio: aspectRatioMode = 'auto',
  isPrivateUnlocked,
  onUnlockPrivate,
  isAccessCodeVerified,
  onVerifyAccessCode,
}) => {
  const isPrivateLocked = asset.is_private && !isPrivateUnlocked;
  const isAccessCodeLocked = asset.has_access_code && !isAccessCodeVerified;
  const isLocked = isPrivateLocked || isAccessCodeLocked;
  const { workspace } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [useOriginalFallback, setUseOriginalFallback] = useState(false);
  // Track if full image has loaded for blur-up transition
  const [imageLoaded, setImageLoaded] = useState(() =>
    loadedImageCache.has(asset.asset_id)
  );
  const imgRef = useRef<HTMLImageElement>(null);

  // Context menu state for long-press
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Long-press handler for touch devices
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (isLocked) return;

    // Get position from touch or mouse event
    let x: number, y: number;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      x = touch.clientX;
      y = touch.clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }

    setContextMenuPosition({ x, y });
    setContextMenuOpen(true);
  }, [isLocked]);

  const longPressProps = useLongPress({
    onLongPress: handleLongPress,
    delay: 500,
    threshold: 10,
    disabled: isLocked || isEditing,
  });

  // Context menu actions
  const contextMenuActions = createPhotoContextActions({
    isFavorited: asset.is_favorited,
    isSelected: asset.is_selected,
    isPrivate: asset.is_private,
    onView: onClick ? () => onClick(asset, index, {} as React.MouseEvent) : undefined,
    onFavorite: onFavorite ? () => onFavorite(asset.asset_id, !asset.is_favorited) : undefined,
    onSelect: onCustomerSelectionToggle ? () => onCustomerSelectionToggle(asset.asset_id, !asset.is_selected) : undefined,
    onDownload: onDownload ? () => onDownload(asset.asset_id) : undefined,
    onShare: onShare ? () => onShare(asset.asset_id) : undefined,
    onLock: onLock ? () => onLock(asset.asset_id, !asset.is_private) : undefined,
    onDelete: onDelete ? () => onDelete(asset.asset_id) : undefined,
  });

  // Get LQIP (Low Quality Image Placeholder) from asset if available
  const lqip = asset.asset.lqip;

  // Reset image error state when asset changes
  useEffect(() => {
    setImageError(false);
    setUseOriginalFallback(false);
    // Check if this image was already loaded
    setImageLoaded(loadedImageCache.has(asset.asset_id));
  }, [asset.asset_id]);

  // Fetch signed URL for thumbnail - simplified without variant switching
  // SignedUrlContext handles batching, and we rely on thumbnail variant only
  const enabledCondition = !!workspace?.workspace_id && asset.asset.status === 'available';

  const {
    url: thumbnailUrl,
    loading: urlLoading,
    error: urlError,
    refresh: refreshUrl,
  } = useSignedUrl({
    assetId: asset.asset_id,
    variant: 'thumbnail',
    enabled: enabledCondition && !useOriginalFallback,
  });

  // Fetch original URL as fallback when thumbnail fails
  const {
    url: originalUrl,
    loading: originalUrlLoading,
  } = useSignedUrl({
    assetId: asset.asset_id,
    variant: 'original',
    enabled: enabledCondition && useOriginalFallback,
  });

  // Calculate aspect ratio from asset dimensions
  const aspectRatio =
    aspectRatioMode === 'square'
      ? '1 / 1'
      : asset.asset.width && asset.asset.height
        ? `${asset.asset.width} / ${asset.asset.height}`
        : '4 / 3';

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLocked) {
      e.stopPropagation();
      if (isAccessCodeLocked) {
        onVerifyAccessCode?.();
      } else {
        onUnlockPrivate?.();
      }
      return;
    }
    if (managementSelectable && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation();
      onManagementSelect?.(asset.asset_id);
    } else {
      onClick?.(asset, index, e);
    }
  }, [managementSelectable, onManagementSelect, onClick, asset, index, isLocked, isAccessCodeLocked, onUnlockPrivate, onVerifyAccessCode]);

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite?.(asset.asset_id, !asset.is_favorited);
  }, [onFavorite, asset.asset_id, asset.is_favorited]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload?.(asset.asset_id);
  }, [onDownload, asset.asset_id]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.(asset.asset_id);
  }, [onShare, asset.asset_id]);

  const handleLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onLock?.(asset.asset_id, !asset.is_private);
  }, [onLock, asset.asset_id, asset.is_private]);

  const handleManagementSelect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onManagementSelect?.(asset.asset_id);
  }, [onManagementSelect, asset.asset_id]);

  const handleCustomerSelectionToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomerSelectionToggle?.(asset.asset_id, !asset.is_selected);
  }, [onCustomerSelectionToggle, asset.asset_id, asset.is_selected]);

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

  // Use signed URL if available, fallback to cached thumbnail_url, then original as last resort
  const displayUrl = useOriginalFallback
    ? (originalUrl || asset.asset.original_url || undefined)
    : (thumbnailUrl || asset.asset.thumbnail_url || undefined);

  // Build dynamic class names for selection/favorite states
  const selectionClasses = [
    isManagementSelected ? 'photo-card-selected' : '',
    asset.is_favorited ? 'photo-card-favorited' : '',
    asset.is_selected ? 'photo-card-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`
        group relative
        rounded-card overflow-hidden
        cursor-pointer
        bg-surface-hover
        photo-card-glass
        ${isManagementSelected ? 'ring-3 ring-primary ring-offset-2 shadow-lg shadow-primary/20' : ''}
        ${asset.is_selected ? 'ring-3 ring-success ring-offset-2 shadow-lg shadow-success/20' : ''}
        select-none
        ${selectionClasses}
        ${className}
      `}
      style={{ aspectRatio }}
      role="gridcell"
      tabIndex={0}
      {...longPressProps}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={(e) => {
        setIsHovered(false);
        longPressProps.onMouseLeave?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const syntheticEvent = { stopPropagation: () => { }, preventDefault: () => { }, ctrlKey: false, metaKey: false } as unknown as React.MouseEvent;
          onClick?.(asset, index, syntheticEvent);
        }
      }}
      aria-selected={isManagementSelected || asset.is_selected}
      aria-label={`Photo ${index + 1}: ${asset.asset.filename || 'Untitled'}${asset.is_favorited ? ' (Favorited)' : ''}${asset.is_selected ? ' (Selected)' : ''}`}
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

      {/* Thumbnail Image with LQIP blur-up effect */}
      {displayUrl && !imageError ? (
        <div className="relative w-full h-full">
          {/* LQIP Placeholder - shows immediately as blurred background */}
          {lqip && !imageLoaded && (
            <img
              src={lqip}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-lg scale-110"
            />
          )}
          {/* Full thumbnail image - fades in over LQIP */}
          <img
            ref={imgRef}
            src={displayUrl}
            alt={asset.asset.filename || `Photo ${index + 1}`}
            className={`w-full h-full object-cover transition-all duration-300 ${isLocked ? 'blur-[40px] scale-110' : 'group-hover:scale-105'
              } ${!imageLoaded && lqip ? 'opacity-0' : 'opacity-100'}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => {
              setImageLoaded(true);
              // Cache that this image has loaded
              loadedImageCache.add(asset.asset_id);
            }}
            onError={() => {
              // If thumbnail fails and we haven't tried original yet, fallback to original
              if (!useOriginalFallback && !originalUrlLoading) {
                setUseOriginalFallback(true);
              } else {
                setImageError(true);
                // Try refreshing URL on error
                if (!urlLoading && !useOriginalFallback) {
                  refreshUrl();
                }
              }
            }}
          />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-surface-hover p-4 text-center">
          {asset.asset.status === 'processing' ? (
            <>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-text-secondary text-xs font-medium">Processing...</div>
            </>
          ) : asset.asset.status === 'failed' ? (
            <div className="text-error text-xs font-medium">Upload Failed</div>
          ) : urlLoading && !lqip ? (
            // Skeleton Loader (only if no LQIP available)
            <div className="w-full h-full absolute inset-0 bg-surface-hover animate-pulse flex items-center justify-center">
              <div className="w-8 h-8 opacity-20 text-text-tertiary">
                <Image size={32} />
              </div>
            </div>
          ) : lqip && urlLoading ? (
            // LQIP Placeholder while URL is loading
            <img
              src={lqip}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-lg scale-110"
            />
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

      {/* Locked Overlay */}
      {isLocked && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white cursor-pointer group/lock"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isAccessCodeLocked) {
              if (onVerifyAccessCode) {
                onVerifyAccessCode();
              } else {
                console.warn('[PhotoCard] onVerifyAccessCode is undefined!');
              }
            } else if (onUnlockPrivate) {
              onUnlockPrivate();
            } else {
              console.warn('[PhotoCard] onUnlockPrivate is undefined!');
            }
          }}
        >
          {/* Background gradient for better visibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-black/20" />

          {/* Content */}
          <div className="relative flex flex-col items-center gap-2">
            <div className={`p-4 rounded-full backdrop-blur-md shadow-lg
                            group-hover/lock:scale-110 transition-all duration-200
                            animate-pulse group-hover/lock:animate-none
                            ${isAccessCodeLocked ? 'bg-primary/50 group-hover/lock:bg-primary/80' : 'bg-black/50 group-hover/lock:bg-primary/80'}`}>
              {isAccessCodeLocked ? (
                <Key size={24} className="text-white" />
              ) : (
                <Lock size={24} className="text-white" />
              )}
            </div>
            <span className="text-sm font-medium drop-shadow-md tracking-wide uppercase opacity-90">
              {isAccessCodeLocked ? 'Protected' : 'Private'}
            </span>
            <span className="text-xs text-white/70 group-hover/lock:text-white transition-colors mt-1">
              {isAccessCodeLocked ? 'Enter code to view' : 'Tap to unlock'}
            </span>
          </div>
        </div>
      )}

      {/* Hover Overlay Component - Handles all actions */}
      {!isLocked && (
        <HoverOverlay
          asset={asset}
          index={index}
          isHovered={isHovered}
          isManagementSelected={isManagementSelected}
          isCover={isCover}
          managementSelectable={managementSelectable}
          showCustomerSelection={showCustomerSelection}
          showActions={showActions}
          onManagementSelect={handleManagementSelect}
          onCustomerSelectionToggle={handleCustomerSelectionToggle}
          onFavorite={handleFavorite}
          onClick={onClick ? (e) => {
            e.stopPropagation();
            onClick(asset, index, e);
          } : undefined}
          onDownload={handleDownload}
          onShare={handleShare}
          onLock={handleLock}
          onDelete={handleDelete}
          onSetCover={handleSetCover}
          onEdit={handleEdit}
        />
      )}

      {/* Long-press Context Menu for Touch Devices */}
      <PhotoContextMenu
        isOpen={contextMenuOpen}
        position={contextMenuPosition}
        onClose={() => setContextMenuOpen(false)}
        actions={contextMenuActions}
        title={asset.asset.filename || 'Photo'}
      />
    </div>
  );
};

export const PhotoCard = React.memo(PhotoCardComponent);
