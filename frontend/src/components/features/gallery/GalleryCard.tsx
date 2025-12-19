/**
 * GalleryCard Component
 * Individual gallery card for list display
 * Property 1: Gallery List Data Completeness
 */

import React, { useState, useEffect } from 'react';
import { Edit, Share2, Image, Clock, Check, Trash2 } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { GalleryStatusBadge } from './GalleryStatusBadge';
import { galleryService } from '../../../services/galleryService';
import { useAuth } from '../../../contexts/AuthContext';
import type { GalleryListItem } from '../../../types/gallery';

export interface GalleryCardProps {
  gallery: GalleryListItem;
  onClick: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  /** Whether selection mode is enabled */
  selectable?: boolean;
  /** Whether this gallery is selected */
  isSelected?: boolean;
  /** Callback when selection changes */
  onSelect?: (galleryId: string) => void;
}

export const GalleryCard: React.FC<GalleryCardProps> = ({
  gallery,
  onClick,
  onEdit,
  onShare,
  onDelete,
  selectable = true,
  isSelected = false,
  onSelect,
}) => {
  const { workspace } = useAuth();
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(gallery.cover_image_url || null);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Fetch signed URL for cover image if we have cover_asset_id
  useEffect(() => {
    if (gallery.cover_asset_id && workspace?.workspace_id && !coverImageUrl && !imageError) {
      galleryService
        .getSignedUrl(workspace.workspace_id, gallery.cover_asset_id, 'thumbnail')
        .then((url) => {
          setCoverImageUrl(url);
        })
        .catch((error) => {
          console.error('Failed to fetch cover image URL:', error);
          setImageError(true);
        });
    } else if (gallery.cover_image_url && !coverImageUrl) {
      // Fallback to legacy cover_image_url if available
      setCoverImageUrl(gallery.cover_image_url);
    }
  }, [gallery.cover_asset_id, gallery.cover_image_url, workspace?.workspace_id, coverImageUrl, imageError]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(gallery.gallery_id);
  };

  return (
    <AppCard
      hoverable
      clickable
      onClick={onClick}
      className={`group overflow-hidden ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      radius="xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Cover Image */}
      <div className="relative aspect-[4/3] bg-surface-hover overflow-hidden">
        {/* Selection Checkbox */}
        {selectable && (
          <div
            className={`
              absolute top-2 left-2 z-30
              transition-opacity duration-150
              ${isSelected || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
            onClick={handleSelect}
          >
            <div
              className={`
                w-6 h-6 rounded-full
                flex items-center justify-center
                transition-all duration-150
                ${isSelected
                  ? 'bg-primary text-white'
                  : 'bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm'
                }
              `}
              role="checkbox"
              aria-checked={isSelected}
              aria-label={isSelected ? 'Deselect gallery' : 'Select gallery'}
            >
              {isSelected && <Check size={14} strokeWidth={3} />}
            </div>
          </div>
        )}

        {coverImageUrl && !imageError ? (
          <img
            src={coverImageUrl}
            alt={gallery.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-hover to-surface">
            <Image size={48} className="text-text-tertiary" />
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Status badge and actions */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <GalleryStatusBadge status={gallery.status} />
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={handleEdit}
                className="p-1.5 rounded-full bg-white/90 hover:bg-white text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/20"
                aria-label="Edit gallery"
              >
                <Edit size={14} />
              </button>
            )}
            {onShare && (
              <button
                onClick={handleShare}
                className="p-1.5 rounded-full bg-white/90 hover:bg-white text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/20"
                aria-label="Share gallery"
              >
                <Share2 size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-full bg-white/90 hover:bg-error/90 text-text-primary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/20"
                aria-label="Delete gallery"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-text-primary truncate" title={gallery.title}>
          {gallery.title}
        </h3>
        {gallery.client_name && (
          <p className="text-sm text-text-tertiary truncate mt-0.5" title={gallery.client_name}>
            {gallery.client_name}
          </p>
        )}
        <div className="flex items-center justify-between mt-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <Image size={12} />
            {gallery.photo_count}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(gallery.created_at)}
          </span>
        </div>
      </div>
    </AppCard>
  );
};

