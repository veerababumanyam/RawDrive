/**
 * ClientActivityBadge Component
 * Displays aggregated client activity counts (favorites and picks) on photo thumbnails.
 * Shows heart icon for favorites and checkmark for picks.
 *
 * Feature: 015-client-selection-sync
 *
 * Design:
 * - Glassmorphism style matching FaceIndicatorBadge
 * - Shows counts only when > 0
 * - Positioned in top-right corner of thumbnails
 * - Compact layout: [❤️ 3] [✓ 2]
 */

import React from 'react';
import { Heart, CheckCircle2 } from 'lucide-react';

export interface ClientActivityBadgeProps {
  /** Number of unique clients who favorited this asset */
  favoritesCount: number;
  /** Number of unique clients who picked/selected this asset */
  picksCount: number;
  /** Optional click handler for future popover expansion */
  onClick?: () => void;
  /** Size variant - default is 'sm' */
  size?: 'sm' | 'md';
  /** Custom class name */
  className?: string;
}

export const ClientActivityBadge: React.FC<ClientActivityBadgeProps> = ({
  favoritesCount,
  picksCount,
  onClick,
  size = 'sm',
  className = '',
}) => {
  // Don't render if no activity
  if (favoritesCount <= 0 && picksCount <= 0) {
    return null;
  }

  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  const isClickable = !!onClick;

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
    >
      {/* Favorites badge */}
      {favoritesCount > 0 && (
        <div
          className={`
            flex items-center gap-0.5
            ${padding}
            rounded-full
            bg-black/60 backdrop-blur-sm
            shadow-sm
            transition-all duration-200
            ${isClickable ? 'hover:bg-black/70 cursor-pointer' : ''}
          `}
          aria-label={`${favoritesCount} ${favoritesCount === 1 ? 'client favorite' : 'client favorites'}`}
          title={`${favoritesCount} ${favoritesCount === 1 ? 'client favorited' : 'clients favorited'}`}
        >
          <Heart
            size={iconSize}
            className="text-rose-400 fill-rose-400"
          />
          <span className={`${textSize} font-semibold text-white tabular-nums`}>
            {favoritesCount}
          </span>
        </div>
      )}

      {/* Picks badge */}
      {picksCount > 0 && (
        <div
          className={`
            flex items-center gap-0.5
            ${padding}
            rounded-full
            bg-black/60 backdrop-blur-sm
            shadow-sm
            transition-all duration-200
            ${isClickable ? 'hover:bg-black/70 cursor-pointer' : ''}
          `}
          aria-label={`${picksCount} ${picksCount === 1 ? 'client pick' : 'client picks'}`}
          title={`${picksCount} ${picksCount === 1 ? 'client picked' : 'clients picked'}`}
        >
          <CheckCircle2
            size={iconSize}
            className="text-emerald-400"
          />
          <span className={`${textSize} font-semibold text-white tabular-nums`}>
            {picksCount}
          </span>
        </div>
      )}
    </div>
  );
};

export default ClientActivityBadge;
