/**
 * FavoriteButton
 * Heart icon overlay for toggling photo favorites in public gallery.
 * Uses GalleryInteractionContext for optimistic state management.
 */
import React, { useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useGalleryInteraction } from '../../../../contexts/GalleryInteractionContext';

const SIZE_MAP = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export interface FavoriteButtonProps {
  assetId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  assetId,
  className = '',
  size = 'md',
}) => {
  const { favorites, toggleFavorite, isProofingEnabled } = useGalleryInteraction();

  const isFavorited = favorites.has(assetId);
  const iconSize = SIZE_MAP[size];

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      toggleFavorite(assetId);
    },
    [assetId, toggleFavorite],
  );

  if (!isProofingEnabled) return null;

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 active:scale-95 ${
        isFavorited
          ? 'text-red-500 drop-shadow-lg'
          : 'text-white/90 drop-shadow-md hover:text-red-400'
      } ${className}`}
      onClick={handleClick}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        size={iconSize}
        fill={isFavorited ? 'currentColor' : 'none'}
        strokeWidth={isFavorited ? 0 : 2}
      />
    </button>
  );
};
