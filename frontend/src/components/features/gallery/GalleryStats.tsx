/**
 * GalleryStats Component
 * Displays gallery statistics in a clean, professional layout
 * Total Items and Favorites with stacked number/label design
 * Supports sub-gallery-specific stats via filteredStats prop
 */

import React from 'react';
import { Image, Heart } from 'lucide-react';
import type { GalleryDetailData } from '../../../types/gallery';

export interface FilteredStats {
  totalItems: number;
  favoritesCount: number;
  selectionsCount?: number;
}

export interface GalleryStatsProps {
  gallery: GalleryDetailData;
  /** Optional: Override gallery-wide stats with filtered stats (e.g., for sub-gallery view) */
  filteredStats?: FilteredStats;
  className?: string;
}

export const GalleryStats: React.FC<GalleryStatsProps> = ({ gallery, filteredStats, className = '' }) => {
  // Use filtered stats if provided, otherwise fall back to gallery-wide stats
  const totalItems = filteredStats?.totalItems ?? gallery.stats?.total_items ?? 0;
  const favoritesCount = filteredStats?.favoritesCount ?? gallery.stats?.favorites_count ?? 0;

  return (
    <div className={`gallery-stats flex items-center gap-6 sm:gap-8 ${className}`}>
      {/* Total Items */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Image size={20} className="text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-text-primary leading-none">
            {totalItems}
          </span>
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide mt-0.5">
            Total Items
          </span>
        </div>
      </div>

      {/* Favorites */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
          <Heart size={20} className="text-pink-500 fill-pink-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-text-primary leading-none">
            {favoritesCount}
          </span>
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide mt-0.5">
            Favorites
          </span>
        </div>
      </div>
    </div>
  );
};
