/**
 * Profile Analytics Component
 *
 * Displays comprehensive analytics for personal profiles including:
 * - View counts and unique visitors
 * - Time-based metrics (today, week, month)
 * - Device breakdown (desktop, mobile, tablet)
 * - Geographic distribution (top countries)
 * - Referrer sources
 * - Daily view chart
 *
 * Feature: Personal Profile Analytics
 */

import { useState, useEffect, useMemo } from 'react';
import { personalProfileService } from '@/services/personalProfileService';
import { useWorkspace } from '../../../hooks/useWorkspace';
import type {
  ProfileAnalyticsResponse,
  ProfileAnalyticsSummary,
  ProfileAnalyticsTimeSeries,
} from '@/types/personalProfile';

// Simple line chart using SVG
interface SimpleLineChartProps {
  data: ProfileAnalyticsTimeSeries[];
  height?: number;
}

function SimpleLineChart({ data, height = 200 }: SimpleLineChartProps) {
  const maxViews = useMemo(() => Math.max(...data.map((d) => d.views), 1), [data]);
  const points = useMemo(() => {
    const width = 100; // percentage
    const padding = 2;
    return data.map((d, i) => ({
      x: padding + ((width - 2 * padding) / (data.length - 1 || 1)) * i,
      y: 100 - padding - ((100 - 2 * padding) * d.views) / maxViews,
      views: d.views,
      date: d.date,
    }));
  }, [data, maxViews]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [points]);

  const areaPathD = useMemo(() => {
    if (points.length === 0) return '';
    return `${pathD} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`;
  }, [pathD, points]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-neutral-50 dark:bg-neutral-800 rounded-lg"
        style={{ height }}
      >
        <span className="text-neutral-400 text-sm">No data available</span>
      </div>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      {/* Grid lines */}
      <g className="text-neutral-200 dark:text-neutral-700">
        {[0, 25, 50, 75, 100].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.2" />
        ))}
      </g>

      {/* Area fill */}
      <path d={areaPathD} fill="url(#gradient)" fillOpacity="0.3" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="0.8" />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1" fill="rgb(59, 130, 246)" className="hover:r-2" />
      ))}
    </svg>
  );
}

// Stat card component
interface StatCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, subtext, icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtext && <p className="text-xs text-neutral-400 mt-1">{subtext}</p>}
        </div>
        {icon && <div className="text-neutral-400">{icon}</div>}
      </div>
    </div>
  );
}

// Device breakdown bar
interface DeviceBreakdownProps {
  desktop: number;
  mobile: number;
  tablet: number;
}

function DeviceBreakdown({ desktop, mobile, tablet }: DeviceBreakdownProps) {
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-700">
        {desktop > 0 && (
          <div className="bg-blue-500" style={{ width: `${desktop}%` }} title={`Desktop: ${desktop}%`} />
        )}
        {mobile > 0 && (
          <div className="bg-green-500" style={{ width: `${mobile}%` }} title={`Mobile: ${mobile}%`} />
        )}
        {tablet > 0 && (
          <div className="bg-purple-500" style={{ width: `${tablet}%` }} title={`Tablet: ${tablet}%`} />
        )}
      </div>
      <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Desktop {desktop.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Mobile {mobile.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          Tablet {tablet.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// Country flag emoji helper (simple version using country codes)
function getCountryFlag(countryCode: string): string {
  // Convert country code to flag emoji
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export interface ProfileAnalyticsProps {
  /** Number of days of history to display */
  days?: number;
  /** Compact mode for widget display */
  compact?: boolean;
}

export function ProfileAnalytics({ days = 30, compact = false }: ProfileAnalyticsProps) {
  const { workspaceId } = useWorkspace();
  const [analytics, setAnalytics] = useState<ProfileAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!workspaceId) return;

      setLoading(true);
      setError(null);

      try {
        const data = await personalProfileService.getAnalytics(workspaceId, days);
        setAnalytics(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('No profile found. Create a profile to see analytics.');
        } else {
          setError('Failed to load analytics. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [workspaceId, days]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-6 text-center">
        <p className="text-neutral-500 dark:text-neutral-400">{error}</p>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { summary, daily_stats } = analytics;

  if (compact) {
    // Compact widget view
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Views" value={summary.total_views} />
          <StatCard label="This Month" value={summary.views_this_month} />
        </div>
        <SimpleLineChart data={daily_stats} height={120} />
      </div>
    );
  }

  // Full analytics view
  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Views"
          value={summary.total_views}
          subtext={`${summary.unique_visitors} unique visitors`}
        />
        <StatCard label="Today" value={summary.views_today} />
        <StatCard label="This Week" value={summary.views_this_week} />
        <StatCard label="This Month" value={summary.views_this_month} />
      </div>

      {/* Views Chart */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">
          Views over last {days} days
        </h3>
        <SimpleLineChart data={daily_stats} height={200} />
        {daily_stats.length > 0 && (
          <div className="flex justify-between text-xs text-neutral-400 mt-2">
            <span>{new Date(daily_stats[0].date).toLocaleDateString()}</span>
            <span>{new Date(daily_stats[daily_stats.length - 1].date).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Device Breakdown */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">Device Breakdown</h3>
        <DeviceBreakdown
          desktop={summary.desktop_percentage}
          mobile={summary.mobile_percentage}
          tablet={summary.tablet_percentage}
        />
      </div>

      {/* Two-column layout for countries and referrers */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top Countries */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">Top Countries</h3>
          {summary.top_countries && summary.top_countries.length > 0 ? (
            <ul className="space-y-2">
              {summary.top_countries.slice(0, 5).map((country, idx) => (
                <li key={idx} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{getCountryFlag(country.country_code)}</span>
                    <span className="text-neutral-700 dark:text-neutral-300">{country.country_code}</span>
                  </span>
                  <span className="text-neutral-500">{country.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-400">No geographic data yet</p>
          )}
        </div>

        {/* Top Referrers */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">Top Referrers</h3>
          {summary.top_referrers && summary.top_referrers.length > 0 ? (
            <ul className="space-y-2">
              {summary.top_referrers.slice(0, 5).map((referrer, idx) => (
                <li key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700 dark:text-neutral-300 truncate max-w-[180px]">
                    {referrer.referrer === 'direct' ? 'Direct traffic' : referrer.referrer}
                  </span>
                  <span className="text-neutral-500">{referrer.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-400">No referrer data yet</p>
          )}
        </div>
      </div>

      {/* Last viewed */}
      {summary.last_viewed_at && (
        <p className="text-xs text-neutral-400 text-center">
          Last viewed: {new Date(summary.last_viewed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default ProfileAnalytics;
