/**
 * GalleryStats Component
 * Displays gallery statistics matching screenshot layout
 * Icon badge with count and label - horizontal compact design
 * Mobile-first responsive design
 */

import React from 'react';
import { Image, Heart, Sparkles } from 'lucide-react';
import type { GalleryDetailData } from '../../../types/gallery';
import { useGalleryTaggingHealth } from '../../../hooks/useGalleryTaggingHealth';
import { useAuth } from '../../../contexts/AuthContext';

export interface FilteredStats {
  totalItems: number;
  favoritesCount: number;
  selectionsCount?: number;
}

export interface GalleryStatsProps {
  gallery: GalleryDetailData;
  /** Optional: Override gallery-wide stats with filtered stats (e.g., for sub-gallery view) */
  filteredStats?: FilteredStats;
  /** Show AI tagging health badge */
  showHealth?: boolean;
  className?: string;
}

export const GalleryStats: React.FC<GalleryStatsProps> = ({
  gallery,
  filteredStats,
  showHealth = true,
  className = '',
}) => {
  const { workspace } = useAuth();

  // Use filtered stats if provided, otherwise fall back to gallery-wide stats
  const totalItems = filteredStats?.totalItems ?? gallery.stats?.total_items ?? 0;
  const favoritesCount = filteredStats?.favoritesCount ?? gallery.stats?.favorites_count ?? 0;

  // Fetch tagging health (with auto-refresh every 60s)
  const { health, loading: healthLoading } = useGalleryTaggingHealth({
    workspaceId: workspace?.workspace_id || '',
    galleryId: gallery.gallery_id,
    enabled: showHealth && !!workspace?.workspace_id && totalItems > 0,
    autoRefresh: true,
  });

  // Compute AI tagging percentage for display
  const aiTaggedPct = health ? Math.round(
    (health.vision_pct * 0.6 + health.face_pct * 0.4)
  ) : 0;

  // Determine health color
  const getHealthColor = () => {
    if (!health) return 'bg-gray-500/10 text-gray-500';
    if (aiTaggedPct >= 90) return 'bg-success/10 text-success';
    if (aiTaggedPct >= 70) return 'bg-accent/10 text-accent';
    if (aiTaggedPct >= 40) return 'bg-warning/10 text-warning';
    return 'bg-error/10 text-error';
  };

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

      {/* AI Tagging Health - Sparkles icon badge style */}
      {showHealth && totalItems > 0 && (
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getHealthColor().split(' ')[0]}`}>
            {healthLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" />
            ) : (
              <Sparkles size={18} className={getHealthColor().split(' ')[1]} />
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xl font-bold text-text-primary">
              {healthLoading ? '–' : `${aiTaggedPct}%`}
            </span>
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              AI Tagged
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
