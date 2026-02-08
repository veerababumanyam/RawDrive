/**
 * WebhookDeliveryDashboard Component
 *
 * A comprehensive dashboard for monitoring webhook delivery metrics including:
 * - Success/failure rates
 * - Delivery volume over time
 * - Response time analytics
 * - Status breakdown charts
 *
 * Feature: Webhooks Integration
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Zap,
  Timer,
  BarChart3,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { Card } from '../../ui/AppCard';
import {
  AnalyticsChart,
  type DataPoint,
  type ChartSeries,
} from '../analytics/AnalyticsChart';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliveryMetrics {
  period: string;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  retried_deliveries: number;
  exhausted_deliveries: number;
  success_rate: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
}

export interface DeliveryTimeSeriesPoint {
  timestamp: string;
  successful: number;
  failed: number;
  total: number;
  avg_response_time_ms: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface EventTypeBreakdown {
  event_type: string;
  count: number;
  success_rate: number;
}

export interface WebhookDeliveryDashboardProps {
  /** Subscription ID to show stats for (null for all workspace) */
  subscriptionId?: string | null;
  /** Current metrics summary */
  metrics?: DeliveryMetrics;
  /** Time series data for charts */
  timeSeriesData?: DeliveryTimeSeriesPoint[];
  /** Status breakdown for pie chart */
  statusBreakdown?: StatusBreakdown[];
  /** Event type breakdown */
  eventTypeBreakdown?: EventTypeBreakdown[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Callback to refresh data */
  onRefresh?: () => void;
  /** Selected time period */
  period?: '24h' | '7d' | '30d';
  /** Callback when period changes */
  onPeriodChange?: (period: '24h' | '7d' | '30d') => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Metric Card Component
// ---------------------------------------------------------------------------

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  trend?: number;
  trendLabel?: string;
  isLoading?: boolean;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBgColor,
  iconColor,
  trend,
  trendLabel = 'vs last period',
  isLoading,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card variant="elevated" className="p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-700" />
          <div className="h-4 w-24 bg-zinc-700 rounded" />
        </div>
        <div className="h-8 w-32 bg-zinc-700 rounded mb-2" />
        <div className="h-3 w-20 bg-zinc-700 rounded" />
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
            iconBgColor
          )}
        >
          <div className={iconColor}>{icon}</div>
        </div>
        <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
      </div>

      <div className="mb-2">
        <span className="text-2xl font-bold text-text-primary tabular-nums">
          {value}
        </span>
        {subtitle && (
          <span className="ml-2 text-sm text-text-tertiary">{subtitle}</span>
        )}
      </div>

      {trend !== undefined && (
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium',
              trend > 0
                ? 'bg-green-500/10 text-green-500'
                : trend < 0
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-zinc-500/10 text-zinc-500'
            )}
          >
            {trend > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : trend < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : null}
            <span className="tabular-nums">{Math.abs(trend).toFixed(1)}%</span>
          </div>
          <span className="text-xs text-text-tertiary">{trendLabel}</span>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Period Selector Component
// ---------------------------------------------------------------------------

interface PeriodSelectorProps {
  value: '24h' | '7d' | '30d';
  onChange: (value: '24h' | '7d' | '30d') => void;
}

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const options = [
    { value: '24h' as const, label: 'Last 24h' },
    { value: '7d' as const, label: 'Last 7 days' },
    { value: '30d' as const, label: 'Last 30 days' },
  ];

  return (
    <div className="flex rounded-lg bg-surface-hover p-1 gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === option.value
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WebhookDeliveryDashboard({
  subscriptionId,
  metrics,
  timeSeriesData = [],
  statusBreakdown = [],
  eventTypeBreakdown = [],
  isLoading = false,
  error,
  onRefresh,
  period = '7d',
  onPeriodChange,
  className,
}: WebhookDeliveryDashboardProps) {
  // Prepare chart data
  const deliveryChartData = useMemo<ChartSeries[]>(() => {
    if (timeSeriesData.length === 0) return [];

    return [
      {
        id: 'successful',
        name: 'Successful',
        data: timeSeriesData.map((d) => ({
          label: d.timestamp,
          value: d.successful,
        })),
        color: '#22C55E',
      },
      {
        id: 'failed',
        name: 'Failed',
        data: timeSeriesData.map((d) => ({
          label: d.timestamp,
          value: d.failed,
        })),
        color: '#EF4444',
      },
    ];
  }, [timeSeriesData]);

  const responseTimeData = useMemo<DataPoint[]>(() => {
    return timeSeriesData.map((d) => ({
      label: d.timestamp,
      value: d.avg_response_time_ms,
    }));
  }, [timeSeriesData]);

  const statusChartData = useMemo<DataPoint[]>(() => {
    const statusColors: Record<string, string> = {
      delivered: '#22C55E',
      pending: '#3B82F6',
      retrying: '#F59E0B',
      failed: '#EF4444',
      exhausted: '#6B7280',
    };

    return statusBreakdown.map((s) => ({
      label: s.status.charAt(0).toUpperCase() + s.status.slice(1),
      value: s.count,
      color: statusColors[s.status] || '#6B7280',
    }));
  }, [statusBreakdown]);

  const eventTypeChartData = useMemo<DataPoint[]>(() => {
    return eventTypeBreakdown.slice(0, 8).map((e) => ({
      label: e.event_type.split('.').pop() || e.event_type,
      value: e.count,
    }));
  }, [eventTypeBreakdown]);

  // Format date labels
  const formatDateLabel = (label: string) => {
    try {
      const date = new Date(label);
      if (period === '24h') {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return label;
    }
  };

  // Handle error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12', className)}>
        <AlertTriangle className="w-12 h-12 text-warning mb-4" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Failed to Load Dashboard
        </h3>
        <p className="text-text-secondary mb-4">{error.message}</p>
        {onRefresh && (
          <AppButton
            onClick={onRefresh}
            variant="outline"
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Retry
          </AppButton>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            Delivery Dashboard
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {subscriptionId
              ? 'Delivery metrics for this webhook'
              : 'Platform-wide webhook delivery metrics'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onPeriodChange && (
            <PeriodSelector value={period} onChange={onPeriodChange} />
          )}
          {onRefresh && (
            <AppButton
              onClick={onRefresh}
              variant="outline"
              size="sm"
              leftIcon={
                isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )
              }
              disabled={isLoading}
            >
              Refresh
            </AppButton>
          )}
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Deliveries"
          value={metrics?.total_deliveries?.toLocaleString() ?? '-'}
          icon={<Zap className="w-5 h-5" />}
          iconBgColor="bg-blue-500/10"
          iconColor="text-blue-500"
          isLoading={isLoading}
        />
        <MetricCard
          title="Success Rate"
          value={metrics ? `${metrics.success_rate.toFixed(1)}%` : '-'}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBgColor="bg-green-500/10"
          iconColor="text-green-500"
          isLoading={isLoading}
        />
        <MetricCard
          title="Failed Deliveries"
          value={metrics?.failed_deliveries?.toLocaleString() ?? '-'}
          subtitle={
            metrics?.exhausted_deliveries
              ? `(${metrics.exhausted_deliveries} exhausted)`
              : undefined
          }
          icon={<XCircle className="w-5 h-5" />}
          iconBgColor="bg-red-500/10"
          iconColor="text-red-500"
          isLoading={isLoading}
        />
        <MetricCard
          title="Avg Response Time"
          value={metrics ? `${Math.round(metrics.avg_response_time_ms)}ms` : '-'}
          subtitle={metrics ? `p95: ${Math.round(metrics.p95_response_time_ms)}ms` : undefined}
          icon={<Timer className="w-5 h-5" />}
          iconBgColor="bg-purple-500/10"
          iconColor="text-purple-500"
          isLoading={isLoading}
        />
      </div>

      {/* Charts Row 1: Delivery Volume & Success Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          type="area"
          title="Delivery Volume"
          subtitle="Successful vs failed deliveries over time"
          series={deliveryChartData}
          height={300}
          isLoading={isLoading}
          showGrid
          showLegend
          formatLabel={formatDateLabel}
          emptyMessage="No delivery data for this period"
        />

        <AnalyticsChart
          type="line"
          title="Response Time"
          subtitle="Average endpoint response time (ms)"
          data={responseTimeData}
          height={300}
          isLoading={isLoading}
          showGrid
          showLegend={false}
          formatLabel={formatDateLabel}
          formatValue={(v) => `${Math.round(v)}ms`}
          colors={['#A855F7']}
          emptyMessage="No response time data"
        />
      </div>

      {/* Charts Row 2: Status Breakdown & Event Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          type="donut"
          title="Status Breakdown"
          subtitle="Delivery status distribution"
          data={statusChartData}
          height={280}
          isLoading={isLoading}
          showLabels
          emptyMessage="No status data available"
        />

        <AnalyticsChart
          type="bar"
          title="Top Event Types"
          subtitle="Most frequently delivered event types"
          data={eventTypeChartData}
          height={280}
          isLoading={isLoading}
          showLabels
          showLegend={false}
          emptyMessage="No event type data"
        />
      </div>

      {/* Additional Stats Row */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="elevated" className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <RefreshCw className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Retried</p>
                <p className="text-xl font-bold text-text-primary">
                  {metrics.retried_deliveries.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-zinc-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Exhausted (DLQ)</p>
                <p className="text-xl font-bold text-text-primary">
                  {metrics.exhausted_deliveries.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Period</p>
                <p className="text-xl font-bold text-text-primary capitalize">
                  {metrics.period}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default WebhookDeliveryDashboard;
