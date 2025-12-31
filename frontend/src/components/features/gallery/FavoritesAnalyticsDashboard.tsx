/**
 * FavoritesAnalyticsDashboard Component
 *
 * Dashboard showing favorites analytics for photographers.
 * Displays which photos are most favorited by clients.
 *
 * Feature: 012-client-favorites (US5)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Heart,
  Users,
  TrendingUp,
  Image,
  Download,
  RefreshCw,
  Loader2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { galleryService } from '../../../services/galleryService';

/* =============================================================================
   Types
   ============================================================================= */

interface PhotoAnalytics {
  asset_id: string;
  filename: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  favorite_count: number;
  unique_clients: number;
  first_favorited_at: string | null;
  last_favorited_at: string | null;
}

interface FavoritesByDay {
  date: string;
  count: number;
}

interface MostFavoritedPhoto {
  asset_id: string;
  filename: string;
  thumbnail_url: string | null;
  favorite_count: number;
}

interface AnalyticsSummary {
  gallery_id: string;
  gallery_title: string;
  total_favorites: number;
  unique_clients: number;
  favorited_photos: number;
  total_photos: number;
  total_lists: number;
  engagement_rate: number;
  most_favorited_photo: MostFavoritedPhoto | null;
  favorites_by_day: FavoritesByDay[];
}

interface FavoritesAnalyticsDashboardProps {
  workspaceId: string;
  galleryId: string;
  className?: string;
}

/* =============================================================================
   Summary Card Component
   ============================================================================= */

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  icon,
  label,
  value,
  subtext,
  colorClass = 'bg-primary/10 text-primary',
}) => (
  <div className="bg-surface rounded-xl border border-border p-4 flex items-start gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-sm text-text-secondary">{label}</p>
      {subtext && (
        <p className="text-xs text-text-tertiary mt-1">{subtext}</p>
      )}
    </div>
  </div>
);

/* =============================================================================
   Mini Chart Component (Simple bar visualization)
   ============================================================================= */

interface MiniChartProps {
  data: FavoritesByDay[];
}

const MiniChart: React.FC<MiniChartProps> = ({ data }) => {
  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);

  if (data.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-text-tertiary text-sm">
        No data for the last 30 days
      </div>
    );
  }

  return (
    <div className="h-24 flex items-end gap-0.5">
      {data.map((item) => {
        const height = (item.count / maxCount) * 100;
        return (
          <div
            key={item.date}
            className="flex-1 min-w-[4px] max-w-[12px] bg-primary/80 hover:bg-primary rounded-t transition-colors cursor-default group relative"
            style={{ height: `${Math.max(height, 4)}%` }}
            title={`${new Date(item.date).toLocaleDateString()}: ${item.count} favorites`}
          />
        );
      })}
    </div>
  );
};

/* =============================================================================
   Photo Table Component
   ============================================================================= */

interface PhotoTableProps {
  photos: PhotoAnalytics[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onPhotoClick?: (assetId: string) => void;
}

const PhotoTable: React.FC<PhotoTableProps> = ({
  photos,
  sortBy,
  sortOrder,
  onSort,
  onPhotoClick,
}) => {
  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 font-medium text-text-secondary">Photo</th>
            <th
              className="p-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary"
              onClick={() => onSort('favorite_count')}
            >
              <span className="flex items-center gap-1">
                Favorites <SortIcon field="favorite_count" />
              </span>
            </th>
            <th className="p-3 font-medium text-text-secondary hidden sm:table-cell">
              Unique Clients
            </th>
            <th
              className="p-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary hidden md:table-cell"
              onClick={() => onSort('first_favorited_at')}
            >
              <span className="flex items-center gap-1">
                First Favorited <SortIcon field="first_favorited_at" />
              </span>
            </th>
            <th
              className="p-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary hidden lg:table-cell"
              onClick={() => onSort('last_favorited_at')}
            >
              <span className="flex items-center gap-1">
                Last Favorited <SortIcon field="last_favorited_at" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {photos.map((photo) => (
            <tr
              key={photo.asset_id}
              className="border-b border-border/50 hover:bg-surface-hover cursor-pointer"
              onClick={() => onPhotoClick?.(photo.asset_id)}
            >
              <td className="p-3">
                <div className="flex items-center gap-3">
                  {photo.thumbnail_url ? (
                    <img
                      src={photo.thumbnail_url}
                      alt={photo.filename}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-surface-hover flex items-center justify-center">
                      <Image className="w-4 h-4 text-text-tertiary" />
                    </div>
                  )}
                  <span className="text-text-primary truncate max-w-[150px]">
                    {photo.filename}
                  </span>
                </div>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-error fill-error" />
                  <span className="font-medium text-text-primary">
                    {photo.favorite_count}
                  </span>
                </div>
              </td>
              <td className="p-3 hidden sm:table-cell">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-text-tertiary" />
                  <span className="text-text-secondary">{photo.unique_clients}</span>
                </div>
              </td>
              <td className="p-3 text-text-secondary hidden md:table-cell">
                {photo.first_favorited_at
                  ? new Date(photo.first_favorited_at).toLocaleDateString()
                  : '—'}
              </td>
              <td className="p-3 text-text-secondary hidden lg:table-cell">
                {photo.last_favorited_at
                  ? new Date(photo.last_favorited_at).toLocaleDateString()
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* =============================================================================
   Main Dashboard Component
   ============================================================================= */

export const FavoritesAnalyticsDashboard: React.FC<FavoritesAnalyticsDashboardProps> = ({
  workspaceId,
  galleryId,
  className = '',
}) => {
  const { addToast } = useToast();

  // State
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [photos, setPhotos] = useState<PhotoAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<string>('favorite_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  // Fetch summary data
  const fetchSummary = useCallback(async () => {
    try {
      const data = await galleryService.getFavoritesSummary(workspaceId, galleryId);
      setSummary(data as unknown as AnalyticsSummary);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [workspaceId, galleryId]);

  // Fetch photos analytics
  const fetchPhotos = useCallback(async () => {
    try {
      const result = await galleryService.getFavoritesAnalytics(
        workspaceId,
        galleryId,
        {
          sort_by: sortBy,
          order: sortOrder,
          page,
          limit,
        }
      );
      setPhotos(result.data as unknown as PhotoAnalytics[]);
      setTotalPages(result.meta.total_pages);
    } catch (error) {
      console.error('Failed to fetch photos:', error);
    }
  }, [workspaceId, galleryId, sortBy, sortOrder, page]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSummary(), fetchPhotos()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSummary, fetchPhotos]);

  // Handle sort
  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'));
    setSortBy(field);
    setPage(1);
  }, [sortBy]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await galleryService.refreshFavoritesAnalytics(workspaceId, galleryId);
      await Promise.all([fetchSummary(), fetchPhotos()]);
      addToast({ variant: 'success', message: 'Analytics refreshed' });
    } catch (error) {
      addToast({ variant: 'error', message: 'Failed to refresh analytics' });
    } finally {
      setRefreshing(false);
    }
  }, [workspaceId, galleryId, fetchSummary, fetchPhotos, addToast]);

  // Handle CSV export
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const csvContent = await galleryService.exportFavoritesCsv(
        workspaceId,
        galleryId
      );

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `favorites_${galleryId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast({ variant: 'success', message: 'Export downloaded' });
    } catch (error) {
      addToast({ variant: 'error', message: 'Failed to export CSV' });
    } finally {
      setExporting(false);
    }
  }, [workspaceId, galleryId, addToast]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  // No favorites yet
  if (!summary || summary.total_favorites === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <Heart className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">
          No favorites yet
        </h3>
        <p className="text-text-secondary">
          When clients favorite photos, their activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Heart className="w-5 h-5 text-error fill-error" />
          Favorites Analytics
        </h2>
        <div className="flex items-center gap-2">
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline ml-1.5">Refresh</span>
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline ml-1.5">Export CSV</span>
          </AppButton>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Heart className="w-5 h-5" />}
          label="Total Favorites"
          value={summary.total_favorites}
          colorClass="bg-error/10 text-error"
        />
        <SummaryCard
          icon={<Users className="w-5 h-5" />}
          label="Unique Clients"
          value={summary.unique_clients}
          colorClass="bg-accent/10 text-accent"
        />
        <SummaryCard
          icon={<Image className="w-5 h-5" />}
          label="Favorited Photos"
          value={`${summary.favorited_photos} / ${summary.total_photos}`}
          subtext={`${summary.engagement_rate}% engagement`}
          colorClass="bg-primary/10 text-primary"
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Total Lists"
          value={summary.total_lists}
          colorClass="bg-success/10 text-success"
        />
      </div>

      {/* Most Favorited Photo */}
      {summary.most_favorited_photo && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">
            Most Favorited Photo
          </h3>
          <div className="flex items-center gap-4">
            {summary.most_favorited_photo.thumbnail_url ? (
              <img
                src={summary.most_favorited_photo.thumbnail_url}
                alt={summary.most_favorited_photo.filename}
                className="w-20 h-20 rounded-lg object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-surface-hover flex items-center justify-center">
                <Image className="w-8 h-8 text-text-tertiary" />
              </div>
            )}
            <div>
              <p className="font-medium text-text-primary">
                {summary.most_favorited_photo.filename}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-error">
                <Heart className="w-4 h-4 fill-error" />
                <span className="font-bold">
                  {summary.most_favorited_photo.favorite_count}
                </span>
                <span className="text-text-secondary text-sm">favorites</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          Favorites Trend (Last 30 Days)
        </h3>
        <MiniChart data={summary.favorites_by_day} />
      </div>

      {/* Photos Table */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-medium text-text-primary">
            Favorited Photos
          </h3>
        </div>
        <PhotoTable
          photos={photos}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-text-secondary">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <AppButton
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </AppButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoritesAnalyticsDashboard;
