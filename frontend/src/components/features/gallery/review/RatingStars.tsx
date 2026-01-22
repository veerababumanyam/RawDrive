/**
 * RatingStars Component
 * 5-star rating display and input for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T023
 *
 * Supports:
 * - 0-5 star ratings (0 = unrated)
 * - Click and hover interactions
 * - Keyboard shortcuts (0-5)
 * - Multiple sizes (sm, md, lg)
 */

import React, { useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import type { AssetRating } from '../../../../types/reviewMode';

export interface RatingStarsProps {
  /** Current rating (0-5, null = unrated) */
  rating: AssetRating | null;
  /** Callback when rating changes */
  onChange?: (rating: AssetRating) => void;
  /** Whether the rating can be changed */
  readOnly?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show keyboard shortcut hints */
  showShortcuts?: boolean;
  /** Custom className */
  className?: string;
}

// Size configurations
const SIZE_CONFIG = {
  sm: {
    iconSize: 14,
    gap: 'gap-0.5',
    container: 'px-1.5 py-0.5',
  },
  md: {
    iconSize: 18,
    gap: 'gap-1',
    container: 'px-2 py-1',
  },
  lg: {
    iconSize: 24,
    gap: 'gap-1.5',
    container: 'px-3 py-1.5',
  },
};

/**
 * RatingStars - 5-star rating component
 */
export const RatingStars: React.FC<RatingStarsProps> = ({
  rating,
  onChange,
  readOnly = false,
  size = 'md',
  showShortcuts = false,
  className = '',
}) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const config = SIZE_CONFIG[size];
  const displayRating = hoverRating !== null ? hoverRating : (rating || 0);

  const handleClick = useCallback((starIndex: number) => {
    if (readOnly || !onChange) return;
    // Click on same rating removes it
    const newRating = (rating === starIndex ? 0 : starIndex) as AssetRating;
    onChange(newRating);
  }, [rating, onChange, readOnly]);

  const handleMouseEnter = useCallback((starIndex: number) => {
    if (readOnly) return;
    setHoverRating(starIndex);
  }, [readOnly]);

  const handleMouseLeave = useCallback(() => {
    setHoverRating(null);
  }, []);

  return (
    <div
      className={`
        inline-flex items-center ${config.gap} ${config.container}
        rounded-md
        ${readOnly ? '' : 'hover:bg-surface-hover/50'}
        ${className}
      `}
      onMouseLeave={handleMouseLeave}
      role="group"
      aria-label={`Rating: ${rating || 0} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const isActive = starIndex <= displayRating;
        const isHovered = hoverRating !== null && starIndex <= hoverRating;

        return (
          <button
            key={starIndex}
            type="button"
            onClick={() => handleClick(starIndex)}
            onMouseEnter={() => handleMouseEnter(starIndex)}
            disabled={readOnly}
            className={`
              relative
              transition-all duration-150 ease-out
              ${readOnly ? 'cursor-default' : 'cursor-pointer'}
              ${!readOnly && 'hover:scale-110'}
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded
            `}
            aria-label={`${starIndex} star${starIndex > 1 ? 's' : ''}`}
            aria-pressed={starIndex <= (rating || 0)}
          >
            <Star
              size={config.iconSize}
              className={`
                transition-colors duration-150
                ${isActive
                  ? 'text-yellow-400 fill-yellow-400'
                  : isHovered
                    ? 'text-yellow-400/50 fill-yellow-400/30'
                    : 'text-text-tertiary/50'
                }
              `}
            />

            {/* Keyboard shortcut hint */}
            {showShortcuts && !readOnly && (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                {starIndex}
              </span>
            )}
          </button>
        );
      })}

      {/* Unrated indicator / clear button */}
      {!readOnly && rating !== null && rating > 0 && (
        <button
          type="button"
          onClick={() => onChange?.(0)}
          className="ml-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Clear rating"
        >
          {showShortcuts && <span className="text-[10px]">(0)</span>}
        </button>
      )}
    </div>
  );
};

/**
 * Compact rating display (non-interactive)
 */
export const RatingDisplay: React.FC<{
  rating: AssetRating | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ rating, size = 'sm', className = '' }) => {
  if (rating === null || rating === 0) {
    return (
      <span className={`text-text-tertiary text-sm ${className}`}>
        —
      </span>
    );
  }

  const config = SIZE_CONFIG[size];

  return (
    <div className={`inline-flex items-center ${config.gap} ${className}`}>
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <Star
          key={starIndex}
          size={config.iconSize}
          className={`
            ${starIndex <= rating
              ? 'text-yellow-400 fill-yellow-400'
              : 'text-text-tertiary/30'
            }
          `}
        />
      ))}
    </div>
  );
};

/**
 * Single star with number (compact display)
 */
export const RatingBadge: React.FC<{
  rating: AssetRating | null;
  className?: string;
}> = ({ rating, className = '' }) => {
  if (rating === null || rating === 0) return null;

  return (
    <div
      className={`
        inline-flex items-center gap-0.5
        px-1.5 py-0.5
        rounded-full
        bg-yellow-500/20
        text-yellow-600
        text-xs font-medium
        ${className}
      `}
    >
      <Star size={12} className="fill-current" />
      <span>{rating}</span>
    </div>
  );
};

export default RatingStars;
