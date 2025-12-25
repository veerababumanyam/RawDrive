/**
 * GalleryStats Component
 * Displays gallery statistics matching screenshot layout
 * Icon badge with count and label - horizontal compact design
 * Mobile-first responsive design
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
    <div className={`gallery-stats flex items-center gap-4 sm:gap-6 ${className}`}>
      {/* Total Items - Icon badge style matching screenshot */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Image size={18} className="text-primary" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xl font-bold text-text-primary">
            {totalItems}
          </span>
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
            Total Items
          </span>
        </div>
      </div>

      {/* Favorites - Pink heart icon badge style */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-pink-500/10 flex items-center justify-center flex-shrink-0">
          <Heart size={18} className="text-pink-500 fill-pink-500" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xl font-bold text-text-primary">
            {favoritesCount}
          </span>
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
            Favorite
          </span>
        </div>
      </div>
    </div>
  );
};
