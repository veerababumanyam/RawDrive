
import React from 'react';
import {
  Heart,
  Lock,
  CheckSquare,
  Download,
  Trash2,
  Maximize2,
  Share2,
  Edit3,
  Image,
} from 'lucide-react';
import { GalleryAssetItem } from '../../../types/gallery';

export interface HoverOverlayProps {
  asset: GalleryAssetItem;
  index: number;
  isHovered: boolean;
  isSelected?: boolean;
  isCover?: boolean;
  selectable?: boolean;
  showActions?: boolean;
  
  // Callbacks
  onSelect?: (e: React.MouseEvent) => void;
  onSelectionToggle?: (e: React.MouseEvent) => void;
  onFavorite?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onSetCover?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
}

export const HoverOverlay: React.FC<HoverOverlayProps> = ({
  asset,
  isHovered,
  isSelected = false,
  isCover = false,
  selectable = false,
  showActions = true,
  onSelect,
  onSelectionToggle,
  onFavorite,
  onClick,
  onDownload,
  onDelete,
  onSetCover,
  onEdit,
}) => {
  if (!showActions) return null;

  return (
    <>
      {/* Top-Right Controls - Favorite & Select (Always visible when active, hover for others) */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
        {/* Favorite Button */}
        {onFavorite && (
          <button
            className={`
              photo-card-top-btn btn-favorite
              ${asset.is_favorited ? 'active always-visible' : ''}
              ${!asset.is_favorited && !isHovered ? 'opacity-0' : 'opacity-100'}
              transition-opacity duration-200
            `}
            onClick={onFavorite}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            title={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            tabIndex={isHovered || asset.is_favorited ? 0 : -1}
          >
            <span className="photo-card-tooltip">{asset.is_favorited ? 'Unfavorite' : 'Favorite'}</span>
            <Heart size={20} className={asset.is_favorited ? "fill-current" : ""} />
          </button>
        )}

        {/* Selection Toggle Button */}
        {(selectable || onSelectionToggle) && (
          <button
            className={`
              photo-card-top-btn btn-select
              ${isSelected || asset.is_selected ? 'active always-visible' : ''}
              ${!(isSelected || asset.is_selected) && !isHovered ? 'opacity-0' : 'opacity-100'}
              transition-opacity duration-200
            `}
            onClick={selectable && onSelect ? onSelect : onSelectionToggle}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={isSelected || asset.is_selected ? 'Deselect photo' : 'Select photo'}
            title={isSelected || asset.is_selected ? 'Deselect photo' : 'Select photo'}
            tabIndex={isHovered || isSelected || asset.is_selected ? 0 : -1}
          >
            <span className="photo-card-tooltip">{isSelected || asset.is_selected ? 'Deselect' : 'Select'}</span>
            <CheckSquare size={20} />
          </button>
        )}
      </div>

      {/* Bottom Action Bar - Floating Glassmorphism Container */}
      {isHovered && (
        <div className="photo-card-action-bar" onClick={(e) => e.stopPropagation()}>
          {/* View / Fullscreen Button - Primary Blue */}
          <button
            className="photo-card-action-btn btn-view"
            onClick={onClick}
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
              onClick={onDownload}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Download Photo"
              title="Download Photo"
            >
              <span className="photo-card-tooltip">Download</span>
              <Download size={20} />
            </button>
          )}

          {/* Share Button (Placeholder logic in UI for now) */}
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
              onClick={onSetCover}
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
              onClick={onEdit ? onEdit : (e) => e.stopPropagation()}
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
              onClick={onDelete}
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
    </>
  );
};
