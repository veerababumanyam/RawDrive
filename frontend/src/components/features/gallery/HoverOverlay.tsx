
import React, { useState, useCallback } from 'react';
import {
  Heart,
  Lock,
  CheckSquare,
  Check,
  Download,
  Trash2,
  Eye,
  Share2,
  Edit3,
  Image,
  Bookmark,
} from 'lucide-react';
import { GalleryAssetItem } from '../../../types/gallery';

/**
 * HoverOverlay Component
 * 
 * Provides interactive overlay controls for photo cards with enhanced glassmorphism styling.
 * Uses centralized CSS classes from index.css for consistency across:
 * - Library page
 * - Gallery pages
 * - Recycle bin
 * - Invitation photo uploads
 * 
 * CSS Classes (defined in index.css):
 * - .photo-card-top-btn: Base glass button styling
 * - .btn-favorite: Favorite button with heart icon
 * - .btn-customer-select: Customer selection/pick button (green when active)
 * - .btn-management-select: Management selection for bulk operations (blue when active)
 * - .photo-card-action-bar: Bottom floating action bar
 * - .photo-card-action-btn: Individual action buttons
 */
export interface HoverOverlayProps {
  asset: GalleryAssetItem;
  index: number;
  isHovered: boolean;
  /** Management selection state (local UI for CRUD bulk operations) */
  isManagementSelected?: boolean;
  isCover?: boolean;
  /** Enable management selection mode (for CRUD operations) */
  managementSelectable?: boolean;
  /** Show customer selection toggle (for delivery workflow) */
  showCustomerSelection?: boolean;
  showActions?: boolean;

  // Callbacks
  /** Management selection callback (for CRUD bulk operations) */
  onManagementSelect?: (e: React.MouseEvent) => void;
  /** Customer selection callback (persisted for delivery workflow) */
  onCustomerSelectionToggle?: (e: React.MouseEvent) => void;
  onFavorite?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void;
  onShare?: (e: React.MouseEvent) => void;
  onLock?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onSetCover?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
}

export const HoverOverlay: React.FC<HoverOverlayProps> = ({
  asset,
  isHovered,
  isManagementSelected = false,
  isCover = false,
  managementSelectable = false,
  showCustomerSelection = true,
  showActions = true,
  onManagementSelect,
  onCustomerSelectionToggle,
  onFavorite,
  onClick,
  onDownload,
  onShare,
  onLock,
  onDelete,
  onSetCover,
  onEdit,
}) => {
  // Track focus state for keyboard accessibility (WCAG 2.1.1)
  const [hasFocusWithin, setHasFocusWithin] = useState(false);

  // Show controls on hover OR keyboard focus (WCAG 2.1.1, 2.4.7)
  const isVisible = isHovered || hasFocusWithin;

  const handleFocusIn = useCallback(() => setHasFocusWithin(true), []);
  const handleFocusOut = useCallback((e: React.FocusEvent) => {
    // Only hide if focus moves outside the overlay container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHasFocusWithin(false);
    }
  }, []);

  if (!showActions) return null;

  return (
    <div
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
      className="contents"
    >
      {/* Top-Left: Management Selection Checkbox (for CRUD bulk operations) */}
      {managementSelectable && onManagementSelect && (
        <div className="absolute top-3 left-3 z-30">
          <button
            className={`
              photo-card-top-btn btn-management-select touch-target
              ${isManagementSelected ? 'active always-visible' : ''}
              ${!isManagementSelected && !isVisible ? 'opacity-0' : 'opacity-100'}
              transition-all duration-200
            `}
            onClick={onManagementSelect}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={isManagementSelected ? 'Deselect for action' : 'Select for action'}
            aria-pressed={isManagementSelected}
            title={isManagementSelected ? 'Deselect' : 'Select for bulk action'}
            tabIndex={0}
          >
            <span className="photo-card-tooltip">{isManagementSelected ? 'Deselect' : 'Select'}</span>
            {isManagementSelected ? <Check size={20} /> : <CheckSquare size={20} />}
          </button>
        </div>
      )}

      {/* Top-Right Controls - Favorite & Customer Selection */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
        {/* Favorite Button - Enhanced with glow effect when active */}
        {onFavorite && (
          <button
            className={`
              photo-card-top-btn btn-favorite touch-target
              ${asset.is_favorited ? 'active always-visible' : ''}
              ${!asset.is_favorited && !isVisible ? 'opacity-0' : 'opacity-100'}
              transition-opacity duration-200
            `}
            onClick={onFavorite}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={asset.is_favorited}
            title={asset.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            tabIndex={0}
          >
            <span className="photo-card-tooltip">{asset.is_favorited ? 'Unfavorite' : 'Favorite'}</span>
            <Heart size={20} className={asset.is_favorited ? "fill-current" : ""} />
          </button>
        )}

        {/* Customer Selection Toggle (for delivery workflow - persisted)
            Enhanced with green glow for clear visibility */}
        {showCustomerSelection && onCustomerSelectionToggle && (
          <button
            className={`
              photo-card-top-btn btn-customer-select touch-target
              ${asset.is_selected ? 'active always-visible' : ''}
              ${!asset.is_selected && !isVisible ? 'opacity-0' : 'opacity-100'}
              transition-all duration-200
            `}
            onClick={onCustomerSelectionToggle}
            onContextMenu={(e) => e.stopPropagation()}
            aria-label={asset.is_selected ? 'Remove from client picks' : 'Add to client picks'}
            aria-pressed={asset.is_selected}
            title={asset.is_selected ? 'Remove from client picks' : 'Mark as client pick'}
            tabIndex={0}
          >
            <span className="photo-card-tooltip">{asset.is_selected ? 'Remove Pick' : 'Client Pick'}</span>
            <Bookmark size={20} className={asset.is_selected ? "fill-current" : ""} />
          </button>
        )}
      </div>

      {/* Bottom Action Bar - Floating Glassmorphism Container */}
      {isVisible && (
        <div className="photo-card-action-bar" onClick={(e) => e.stopPropagation()} role="toolbar" aria-label="Photo actions">
          {/* View / Fullscreen Button - Primary Blue */}
          {onClick && (
            <button
              className="photo-card-action-btn btn-view touch-target"
              onClick={onClick}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="View Full Screen"
              title="View Full Screen"
            >
              <span className="photo-card-tooltip">View</span>
              <Eye size={20} className="relative z-10" />
            </button>
          )}

          {/* Download Button */}
          {onDownload && (
            <button
              className="photo-card-action-btn touch-target"
              onClick={onDownload}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Download Photo"
              title="Download Photo"
            >
              <span className="photo-card-tooltip">Download</span>
              <Download size={20} />
            </button>
          )}

          {/* Share Button */}
          {onShare && (
            <button
              className="photo-card-action-btn touch-target"
              onClick={onShare}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Share Photo"
              title="Share Photo"
            >
              <span className="photo-card-tooltip">Share</span>
              <Share2 size={20} />
            </button>
          )}

          {/* Lock / Private Button */}
          {onLock && (
            <button
              className={`photo-card-action-btn btn-lock touch-target ${asset.is_private ? 'active' : ''}`}
              onClick={onLock}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label={asset.is_private ? 'Unlock Photo' : 'Lock Photo'}
              aria-pressed={asset.is_private}
              title={asset.is_private ? 'Unlock Photo' : 'Lock Photo'}
            >
              <span className="photo-card-tooltip">{asset.is_private ? 'Unlock' : 'Lock'}</span>
              <Lock size={20} />
            </button>
          )}

          {/* Set as Cover / Edit Button */}
          {onSetCover && !isCover ? (
            <button
              className="photo-card-action-btn touch-target"
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
              className="photo-card-action-btn touch-target"
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
              className="photo-card-action-btn btn-delete touch-target"
              onClick={onDelete}
              onContextMenu={(e) => e.stopPropagation()}
              aria-label="Delete Photo"
              title="Delete Photo"
            >
              <span className="photo-card-tooltip">Delete</span>
              <Trash2 size={20} className="relative z-10" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
