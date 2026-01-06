/**
 * AnalyticsOverviewCard Component
 *
 * A card component for displaying analytics metrics with trend indicators.
 * Used on the analytics dashboard to show key metrics like views, downloads,
 * clients, and revenue with visual trend comparison.
 *
 * Feature: Analytics & Reporting
 * Task: T031 - Create AnalyticsOverviewCard component
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/AppCard';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Download,
  Users,
  DollarSign,
  Image,
  HardDrive,
  BarChart3,
  LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricType =
  | 'views'
  | 'downloads'
  | 'clients'
  | 'revenue'
  | 'galleries'
  | 'assets'
  | 'storage'
  | 'custom';

export interface AnalyticsOverviewCardProps {
  /** Title of the metric */
  title: string;
  /** Primary value to display */
  value: number | string;
  /** Formatted value (optional, overrides value formatting) */
  formattedValue?: string;
  /** Percentage change from previous period */
  change?: number;
  /** Whether the change represents a positive trend */
  changeIsPositive?: boolean;
  /** Label for the change period (e.g., "vs last month") */
  changeLabel?: string;
  /** Type of metric (determines icon and formatting) */
  metricType?: MetricType;
  /** Custom icon (overrides metricType icon) */
  icon?: LucideIcon;
  /** Icon color class (e.g., "text-blue-500") */
  iconColor?: string;
  /** Icon background color class (e.g., "bg-blue-500/10") */
  iconBgColor?: string;
  /** Whether the card is in loading state */
  isLoading?: boolean;
  /** Whether to show compact version */
  compact?: boolean;
  /** Click handler for the card */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Subtitle or description */
  subtitle?: string;
  /** Whether to show hover effects */
  hoverable?: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get icon configuration for a metric type
 */
function getMetricConfig(metricType: MetricType): {
  icon: LucideIcon;
  color: string;
  bgColor: string;
} {
  switch (metricType) {
    case 'views':
      return {
        icon: Eye,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
      };
    case 'downloads':
      return {
        icon: Download,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
      };
    case 'clients':
      return {
        icon: Users,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
      };
    case 'revenue':
      return {
        icon: DollarSign,
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
      };
    case 'galleries':
      return {
        icon: Image,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
      };
    case 'assets':
      return {
        icon: Image,
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-500/10',
      };
    case 'storage':
      return {
        icon: HardDrive,
        color: 'text-rose-500',
        bgColor: 'bg-rose-500/10',
      };
    case 'custom':
    default:
      return {
        icon: BarChart3,
        color: 'text-zinc-500',
        bgColor: 'bg-zinc-500/10',
      };
  }
}

/**
 * Format a number for display
 */
function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

/**
 * Format currency value (cents to dollars)
 */
function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`;
  }
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format value based on metric type
 */
function formatValue(value: number | string, metricType: MetricType): string {
  if (typeof value === 'string') {
    return value;
  }

  switch (metricType) {
    case 'revenue':
      return formatCurrency(value);
    default:
      return formatNumber(value);
  }
}

/**
 * Get trend icon and color based on change value
 */
function getTrendConfig(
  change: number,
  isPositive?: boolean
): { icon: LucideIcon; color: string } {
  if (change === 0) {
    return { icon: Minus, color: 'text-zinc-500' };
  }

  // If isPositive is explicitly set, use it
  // Otherwise, positive change means positive trend
  const positive = isPositive !== undefined ? isPositive : change > 0;

  if (change > 0) {
    return {
      icon: TrendingUp,
      color: positive ? 'text-green-500' : 'text-red-500',
    };
  }

  return {
    icon: TrendingDown,
    color: positive ? 'text-green-500' : 'text-red-500',
  };
}

// ---------------------------------------------------------------------------
// Loading Skeleton Component
// ---------------------------------------------------------------------------

function LoadingSkeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-zinc-700" />
        <div className="flex-1">
          <div className="h-4 w-16 bg-zinc-700 rounded mb-1" />
          <div className="h-6 w-24 bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-700" />
        <div className="h-4 w-24 bg-zinc-700 rounded" />
      </div>
      <div className="h-8 w-32 bg-zinc-700 rounded mb-2" />
      <div className="h-4 w-20 bg-zinc-700 rounded" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AnalyticsOverviewCard({
  title,
  value,
  formattedValue,
  change,
  changeIsPositive,
  changeLabel = 'vs last period',
  metricType = 'custom',
  icon: CustomIcon,
  iconColor,
  iconBgColor,
  isLoading = false,
  compact = false,
  onClick,
  className,
  subtitle,
  hoverable = false,
}: AnalyticsOverviewCardProps) {
  // Get icon and colors from metric type or custom values
  const metricConfig = getMetricConfig(metricType);
  const IconComponent = CustomIcon || metricConfig.icon;
  const finalIconColor = iconColor || metricConfig.color;
  const finalIconBgColor = iconBgColor || metricConfig.bgColor;

  // Format the displayed value
  const displayValue = formattedValue ?? formatValue(value, metricType);

  // Get trend configuration
  const hasTrend = change !== undefined;
  const trendConfig = hasTrend ? getTrendConfig(change, changeIsPositive) : null;
  const TrendIcon = trendConfig?.icon;

  // Handle loading state
  if (isLoading) {
    return (
      <Card
        variant="elevated"
        className={cn(
          'p-4 transition-all duration-200',
          compact ? 'p-3' : 'p-5',
          className
        )}
      >
        <LoadingSkeleton compact={compact} />
      </Card>
    );
  }

  // Compact layout
  if (compact) {
    return (
      <Card
        variant="elevated"
        hoverable={hoverable || !!onClick}
        clickable={!!onClick}
        onClick={onClick}
        className={cn(
          'p-3 transition-all duration-200',
          onClick && 'cursor-pointer',
          className
        )}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
              finalIconBgColor
            )}
          >
            <IconComponent className={cn('w-4 h-4', finalIconColor)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-tertiary truncate">{title}</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-text-primary tabular-nums">
                {displayValue}
              </span>
              {hasTrend && TrendIcon && (
                <div className={cn('flex items-center gap-0.5 text-xs', trendConfig?.color)}>
                  <TrendIcon className="w-3 h-3" />
                  <span className="tabular-nums">{Math.abs(change).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Standard layout
  return (
    <Card
      variant="elevated"
      hoverable={hoverable || !!onClick}
      clickable={!!onClick}
      onClick={onClick}
      className={cn(
        'p-5 transition-all duration-200',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Header with icon and title */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
            finalIconBgColor
          )}
        >
          <IconComponent className={cn('w-5 h-5', finalIconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-secondary truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-text-tertiary truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Value */}
      <div className="mb-2">
        <span className="text-2xl font-bold text-text-primary tabular-nums">
          {displayValue}
        </span>
      </div>

      {/* Trend indicator */}
      {hasTrend && TrendIcon && (
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium',
              change > 0
                ? trendConfig?.color === 'text-green-500'
                  ? 'bg-green-500/10'
                  : 'bg-red-500/10'
                : change < 0
                  ? trendConfig?.color === 'text-green-500'
                    ? 'bg-green-500/10'
                    : 'bg-red-500/10'
                  : 'bg-zinc-500/10',
              trendConfig?.color
            )}
          >
            <TrendIcon className="w-3 h-3" />
            <span className="tabular-nums">{Math.abs(change).toFixed(1)}%</span>
          </div>
          <span className="text-xs text-text-tertiary">{changeLabel}</span>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Convenience Components for Common Metrics
// ---------------------------------------------------------------------------

export interface QuickStatCardProps {
  value: number;
  change?: number;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Pre-configured card for Views metric
 */
export function ViewsCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="Total Views"
      value={value}
      change={change}
      metricType="views"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for Downloads metric
 */
export function DownloadsCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="Downloads"
      value={value}
      change={change}
      metricType="downloads"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for New Clients metric
 */
export function NewClientsCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="New Clients"
      value={value}
      change={change}
      metricType="clients"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for Revenue metric
 */
export function RevenueCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="Revenue"
      value={value}
      change={change}
      metricType="revenue"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for Total Galleries metric
 */
export function GalleriesCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="Galleries"
      value={value}
      change={change}
      metricType="galleries"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for Active Clients metric
 */
export function ActiveClientsCard({
  value,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps) {
  return (
    <AnalyticsOverviewCard
      title="Active Clients"
      value={value}
      change={change}
      metricType="clients"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

/**
 * Pre-configured card for Storage Used metric
 */
export function StorageCard({
  value,
  formattedValue,
  change,
  isLoading,
  onClick,
  className,
  compact,
}: QuickStatCardProps & { formattedValue?: string }) {
  return (
    <AnalyticsOverviewCard
      title="Storage Used"
      value={value}
      formattedValue={formattedValue}
      change={change}
      metricType="storage"
      isLoading={isLoading}
      onClick={onClick}
      className={className}
      compact={compact}
      changeLabel="vs last period"
    />
  );
}

// ---------------------------------------------------------------------------
// Stats Grid Component
// ---------------------------------------------------------------------------

export interface StatsGridProps {
  /** Stats to display */
  children: React.ReactNode;
  /** Number of columns (responsive by default) */
  columns?: 2 | 3 | 4;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Grid layout component for analytics cards
 */
export function StatsGrid({ children, columns, className }: StatsGridProps) {
  const gridCols = columns
    ? {
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      }[columns]
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return <div className={cn('grid gap-4', gridCols, className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default AnalyticsOverviewCard;
