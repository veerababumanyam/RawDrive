/**
 * FavoritesButton Component
 *
 * Button to toggle the favorites panel in gallery view.
 * Shows the count of favorited photos.
 *
 * Feature: 012-client-favorites
 */

import React from 'react';
import { Heart } from 'lucide-react';

export interface FavoritesButtonProps {
  /** Number of favorites */
  count: number;
  /** Whether the panel is currently open */
  isActive?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const FavoritesButton: React.FC<FavoritesButtonProps> = ({
  count,
  isActive = false,
  onClick,
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-3 py-2
        rounded-lg transition-all duration-200
        ${isActive
          ? 'bg-error/10 text-error'
          : 'bg-surface-hover text-text-secondary hover:bg-border hover:text-text-primary'
        }
        ${className}
      `}
      aria-label={`View favorites (${count} items)`}
      aria-pressed={isActive}
    >
      <Heart
        className={`w-5 h-5 transition-transform ${isActive ? 'fill-current scale-110' : ''}`}
      />
      {count > 0 && (
        <span className="text-sm font-medium">
          {count > 99 ? '99+' : count}
        </span>
      )}

      {/* Notification dot for new favorites */}
      {count > 0 && !isActive && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-error rounded-full animate-pulse" />
      )}
    </button>
  );
};

export default FavoritesButton;
