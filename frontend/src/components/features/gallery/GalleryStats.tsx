/**
 * GalleryStats Component
 * Displays gallery statistics (total items, favorites count)
 * Property 7: Statistics Accuracy
 */

import React from 'react';
import { Image, Heart } from 'lucide-react';
import type { GalleryDetailData } from '../../../types/gallery';

export interface GalleryStatsProps {
  gallery: GalleryDetailData;
}

export const GalleryStats: React.FC<GalleryStatsProps> = ({ gallery }) => {
  const totalItems = gallery.stats?.total_items || 0;
  const favoritesCount = gallery.stats?.favorites_count || 0;

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <Image size={18} className="text-text-tertiary" />
        <span className="text-sm font-medium text-text-secondary">TOTAL ITEMS</span>
        <span className="text-sm font-semibold text-text-primary">{totalItems}</span>
      </div>
      <div className="flex items-center gap-2">
        <Heart size={18} className="text-text-tertiary" />
        <span className="text-sm font-medium text-text-secondary">FAVORITES</span>
        <span className="text-sm font-semibold text-text-primary">{favoritesCount}</span>
      </div>
    </div>
  );
};

