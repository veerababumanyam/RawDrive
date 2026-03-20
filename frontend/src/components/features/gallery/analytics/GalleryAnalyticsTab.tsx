/**
 * GalleryAnalyticsTab Component
 *
 * Analytics dashboard tab for the gallery detail page.
 * Shows summary cards, views chart, device breakdown, geo breakdown, and download stats.
 */

import React, { useState } from 'react';
import { Eye, Users, Clock, TrendingUp, BarChart3 } from 'lucide-react';
import {
  useGalleryAnalyticsTab,
  type AnalyticsPeriod,
} from '../../../../hooks/useGalleryAnalyticsTab';
import { ViewsChart } from './ViewsChart';
import { DeviceBreakdownChart } from './DeviceBreakdown';
import { GeoBreakdownChart } from './GeoBreakdown';
import { DownloadStats } from './DownloadStats';

interface GalleryAnalyticsTabProps {
  galleryId: string;
}

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="analytics-skeleton">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-surface-secondary dark:bg-slate-800/50 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-surface-secondary dark:bg-slate-800/50 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 bg-surface-secondary dark:bg-slate-800/50 rounded-xl" />
        <div className="h-64 bg-surface-secondary dark:bg-slate-800/50 rounded-xl" />
      </div>
    </div>
  );
}

export const GalleryAnalyticsTab: React.FC<GalleryAnalyticsTabProps> = ({
  galleryId,
}) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');

  const { data, isLoading, isError, error } = useGalleryAnalyticsTab({
    galleryId,
    period,
  });

  // Loading state
  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BarChart3 size={48} className="text-text-tertiary mb-4" />
        <p className="text-text-secondary mb-2">Failed to load analytics</p>
        <p className="text-sm text-text-tertiary">{error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  // Empty state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BarChart3 size={48} className="text-text-tertiary mb-4" />
        <p className="text-text-secondary mb-2">No analytics data yet</p>
        <p className="text-sm text-text-tertiary">
          Share your gallery to start tracking views.
        </p>
      </div>
    );
  }

  const { summary, daily_stats, device_breakdown, geo_breakdown, download_summary } = data;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              period === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-secondary dark:bg-slate-800/50 text-text-secondary hover:bg-surface-hover'
            }`}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Eye size={18} />}
          label="Total Views"
          value={summary.total_views.toLocaleString()}
          color="indigo"
        />
        <SummaryCard
          icon={<Users size={18} />}
          label="Unique Visitors"
          value={summary.unique_visitors.toLocaleString()}
          color="cyan"
        />
        <SummaryCard
          icon={<Clock size={18} />}
          label="Avg. Time Spent"
          value={formatTime(summary.avg_time_spent_seconds)}
          color="amber"
        />
        <SummaryCard
          icon={<TrendingUp size={18} />}
          label="Views Today"
          value={summary.views_today.toLocaleString()}
          color="emerald"
        />
      </div>

      {/* Views Chart - Full Width */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">Views Over Time</h3>
        <ViewsChart data={daily_stats} />
      </div>

      {/* Device + Geo - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-4">Device Breakdown</h3>
          <DeviceBreakdownChart data={device_breakdown} />
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-4">Top Countries</h3>
          <GeoBreakdownChart data={geo_breakdown} />
        </div>
      </div>

      {/* Downloads - Full Width */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">Downloads</h3>
        <DownloadStats
          totalDownloads={download_summary.total_downloads}
          totalBytes={download_summary.total_bytes}
        />
      </div>
    </div>
  );
};

// Summary card sub-component
interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'indigo' | 'cyan' | 'amber' | 'emerald';
}

const colorClasses: Record<string, { bg: string; icon: string }> = {
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
};

function SummaryCard({ icon, label, value, color }: SummaryCardProps) {
  const colors = colorClasses[color];
  return (
    <div className="flex items-center gap-3 p-4 bg-surface-secondary dark:bg-slate-800/50 rounded-xl">
      <div className={`p-2 ${colors.bg} rounded-lg`}>
        <span className={colors.icon}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}
