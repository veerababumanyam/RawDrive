/**
 * ClientAnalyticsTable Component
 *
 * A comprehensive table component for displaying client analytics data.
 * Shows client engagement metrics, activity, churn risk indicators,
 * and lifetime value with sorting and pagination support.
 *
 * Feature: Analytics & Reporting
 * Task: T034 - Create ClientAnalyticsTable component
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/AppCard';
import { DataTable, TablePagination, Column, SortDirection } from '@/components/ui/DataTable';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Eye,
  Download,
  Heart,
  MessageSquare,
  Clock,
  DollarSign,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Search,
  Filter,
  ChevronDown,
  Mail,
  User,
  LucideIcon,
} from 'lucide-react';
import type {
  TopClientEntry,
  ChurnRiskEntry,
} from '@/services/analyticsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Client data shape for the table
 */
export interface ClientTableRow {
  clientId: string;
  clientName?: string;
  email?: string;
  engagementScore?: number;
  engagementTier?: string;
  engagementTrend?: number;
  churnRiskScore?: number;
  totalGalleryViews: number;
  totalDownloads: number;
  totalFavorites?: number;
  totalComments?: number;
  totalSessions?: number;
  lifetimeValueCents: number;
  lastActivityAt?: string;
  daysSinceLastActivity?: number;
  riskFactors?: string[];
}

export type SortableColumn =
  | 'clientName'
  | 'engagementScore'
  | 'churnRiskScore'
  | 'totalGalleryViews'
  | 'totalDownloads'
  | 'lifetimeValueCents'
  | 'lastActivityAt';

export type ClientFilterType = 'all' | 'engaged' | 'at_risk' | 'inactive';

export interface ClientAnalyticsTableProps {
  /** Client data to display */
  clients: ClientTableRow[];
  /** Whether the data is loading */
  isLoading?: boolean;
  /** Whether an error occurred */
  isError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Total number of clients (for pagination) */
  totalClients?: number;
  /** Current page (1-indexed) */
  page?: number;
  /** Page size */
  pageSize?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Page size change handler */
  onPageSizeChange?: (size: number) => void;
  /** Sort column */
  sortColumn?: SortableColumn;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Sort change handler */
  onSortChange?: (column: SortableColumn, direction: SortDirection) => void;
  /** Row click handler */
  onClientClick?: (client: ClientTableRow) => void;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Whether to show the filter bar */
  showFilters?: boolean;
  /** Current filter type */
  filterType?: ClientFilterType;
  /** Filter change handler */
  onFilterChange?: (filter: ClientFilterType) => void;
  /** Search query */
  searchQuery?: string;
  /** Search change handler */
  onSearchChange?: (query: string) => void;
  /** Table title */
  title?: string;
  /** Table density */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Show engagement column */
  showEngagement?: boolean;
  /** Show churn risk column */
  showChurnRisk?: boolean;
  /** Show lifetime value column */
  showLifetimeValue?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

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
 * Format relative time (days ago)
 */
function formatLastActivity(dateStr?: string, daysSince?: number): string {
  if (daysSince !== undefined && daysSince !== null) {
    if (daysSince === 0) return 'Today';
    if (daysSince === 1) return 'Yesterday';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    if (daysSince < 365) return `${Math.floor(daysSince / 30)} months ago`;
    return `${Math.floor(daysSince / 365)}+ years ago`;
  }

  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)}+ years ago`;
}

/**
 * Get engagement tier from score
 */
function getEngagementTier(score?: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score === undefined || score === null) {
    return { label: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' };
  }
  if (score >= 80) {
    return { label: 'Champion', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' };
  }
  if (score >= 60) {
    return { label: 'Engaged', color: 'text-green-500', bgColor: 'bg-green-500/10' };
  }
  if (score >= 40) {
    return { label: 'Active', color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
  }
  if (score >= 20) {
    return { label: 'Occasional', color: 'text-amber-500', bgColor: 'bg-amber-500/10' };
  }
  return { label: 'Dormant', color: 'text-red-500', bgColor: 'bg-red-500/10' };
}

/**
 * Get churn risk level from score
 */
function getChurnRiskLevel(score?: number): {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
} {
  if (score === undefined || score === null) {
    return { label: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10', icon: Minus };
  }
  if (score >= 70) {
    return { label: 'High Risk', color: 'text-red-500', bgColor: 'bg-red-500/10', icon: AlertTriangle };
  }
  if (score >= 40) {
    return { label: 'Medium Risk', color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: AlertTriangle };
  }
  return { label: 'Low Risk', color: 'text-green-500', bgColor: 'bg-green-500/10', icon: TrendingUp };
}

/**
 * Get trend indicator config
 */
function getTrendConfig(
  value: number | undefined
): { icon: LucideIcon; color: string } | null {
  if (value === undefined || value === null) return null;
  if (value === 0) {
    return { icon: Minus, color: 'text-zinc-500' };
  }
  if (value > 0) {
    return { icon: TrendingUp, color: 'text-green-500' };
  }
  return { icon: TrendingDown, color: 'text-red-500' };
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the table
 */
function TableSkeleton({ density = 'normal' }: { density?: 'compact' | 'normal' | 'comfortable' }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-700" />
          <div className="h-5 w-40 bg-zinc-700 rounded" />
        </div>
        <div className="h-8 w-32 bg-zinc-700 rounded" />
      </div>

      {/* Table header */}
      <div className="border-b border-border bg-background-alt">
        <div className="flex items-center gap-4 px-4 py-3">
          {[150, 80, 80, 80, 80, 100].map((width, i) => (
            <div key={i} className="h-4 bg-zinc-700 rounded" style={{ width: `${width}px` }} />
          ))}
        </div>
      </div>

      {/* Table rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-full bg-zinc-700" />
            <div>
              <div className="h-4 w-32 bg-zinc-700 rounded mb-1" />
              <div className="h-3 w-24 bg-zinc-700/50 rounded" />
            </div>
          </div>
          {[60, 60, 60, 60, 80].map((width, j) => (
            <div key={j} className="h-4 bg-zinc-700/50 rounded" style={{ width: `${width}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        Failed to Load Client Data
      </h3>
      <p className="text-sm text-text-tertiary mb-4 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState({ filterType }: { filterType?: ClientFilterType }) {
  const getMessage = () => {
    switch (filterType) {
      case 'engaged':
        return 'No highly engaged clients found in the selected period.';
      case 'at_risk':
        return 'No clients at risk of churning. Great news!';
      case 'inactive':
        return 'No inactive clients found.';
      default:
        return 'No client analytics data available yet. Clients will appear here once they start interacting with your galleries.';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
        <Users className="w-6 h-6 text-blue-500" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        No Clients Found
      </h3>
      <p className="text-sm text-text-tertiary max-w-sm">
        {getMessage()}
      </p>
    </div>
  );
}

/**
 * Table header with title, search, and filter controls
 */
interface TableHeaderProps {
  title?: string;
  totalClients?: number;
  showFilters?: boolean;
  filterType?: ClientFilterType;
  onFilterChange?: (filter: ClientFilterType) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function TableHeader({
  title = 'Client Analytics',
  totalClients,
  showFilters = true,
  filterType = 'all',
  onFilterChange,
  searchQuery = '',
  onSearchChange,
  isRefreshing,
  onRefresh,
}: TableHeaderProps) {
  const filterOptions: { value: ClientFilterType; label: string }[] = [
    { value: 'all', label: 'All Clients' },
    { value: 'engaged', label: 'Highly Engaged' },
    { value: 'at_risk', label: 'At Risk' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 shrink-0">
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {totalClients !== undefined && (
              <p className="text-xs text-text-tertiary">
                {totalClients.toLocaleString()} {totalClients === 1 ? 'client' : 'clients'}
              </p>
            )}
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          {onSearchChange && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search clients..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Filter dropdown */}
          {onFilterChange && (
            <div className="relative">
              <select
                value={filterType}
                onChange={(e) => onFilterChange(e.target.value as ClientFilterType)}
                className="appearance-none pl-9 pr-8 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors cursor-pointer"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Client name/info cell renderer
 */
function ClientInfoCell({ client }: { client: ClientTableRow }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Avatar placeholder */}
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 shrink-0">
        <User className="w-4 h-4 text-purple-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {client.clientName || 'Unknown Client'}
        </p>
        {client.email && (
          <p className="text-xs text-text-tertiary truncate flex items-center gap-1">
            <Mail className="w-3 h-3" />
            {client.email}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Engagement score cell renderer
 */
function EngagementCell({ score, trend }: { score?: number; trend?: number }) {
  const tier = getEngagementTier(score);
  const trendConfig = getTrendConfig(trend);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary tabular-nums">
          {score !== undefined ? score : '-'}
        </span>
        {trendConfig && trend !== undefined && (
          <trendConfig.icon className={cn('w-3 h-3', trendConfig.color)} />
        )}
      </div>
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded-md font-medium',
          tier.color,
          tier.bgColor
        )}
      >
        {tier.label}
      </span>
    </div>
  );
}

/**
 * Churn risk cell renderer
 */
function ChurnRiskCell({ score, riskFactors }: { score?: number; riskFactors?: string[] }) {
  const risk = getChurnRiskLevel(score);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary tabular-nums">
          {score !== undefined ? score : '-'}
        </span>
        <risk.icon className={cn('w-3.5 h-3.5', risk.color)} />
      </div>
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded-md font-medium',
          risk.color,
          risk.bgColor
        )}
      >
        {risk.label}
      </span>
    </div>
  );
}

/**
 * Metric cell renderer
 */
function MetricCell({
  value,
  icon: Icon,
  iconColor = 'text-text-tertiary',
}: {
  value: number;
  icon: LucideIcon;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn('w-3.5 h-3.5', iconColor)} />
      <span className="text-sm text-text-primary tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

/**
 * Lifetime value cell renderer
 */
function LifetimeValueCell({ valueCents }: { valueCents: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
      <span className="text-sm font-medium text-text-primary tabular-nums">
        {formatCurrency(valueCents)}
      </span>
    </div>
  );
}

/**
 * Last activity cell renderer
 */
function LastActivityCell({
  lastActivityAt,
  daysSinceLastActivity,
}: {
  lastActivityAt?: string;
  daysSinceLastActivity?: number;
}) {
  const formattedTime = formatLastActivity(lastActivityAt, daysSinceLastActivity);
  const isRecent = daysSinceLastActivity !== undefined && daysSinceLastActivity < 7;

  return (
    <div className="flex items-center gap-1.5">
      <Clock className={cn('w-3.5 h-3.5', isRecent ? 'text-green-500' : 'text-text-tertiary')} />
      <span
        className={cn(
          'text-sm tabular-nums',
          isRecent ? 'text-green-600' : 'text-text-secondary'
        )}
      >
        {formattedTime}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ClientAnalyticsTable({
  clients,
  isLoading = false,
  isError = false,
  errorMessage = 'An error occurred while loading client analytics.',
  totalClients,
  page = 1,
  pageSize = 10,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  sortColumn,
  sortDirection,
  onSortChange,
  onClientClick,
  onRefresh,
  showFilters = true,
  filterType = 'all',
  onFilterChange,
  searchQuery = '',
  onSearchChange,
  title = 'Client Analytics',
  density = 'normal',
  showEngagement = true,
  showChurnRisk = true,
  showLifetimeValue = true,
  className,
}: ClientAnalyticsTableProps) {
  // Build columns based on props
  const columns = useMemo<Column<ClientTableRow>[]>(() => {
    const cols: Column<ClientTableRow>[] = [
      {
        id: 'clientName',
        header: 'Client',
        accessor: 'clientName',
        sortable: true,
        minWidth: '200px',
        cell: (_, row) => <ClientInfoCell client={row} />,
      },
    ];

    if (showEngagement) {
      cols.push({
        id: 'engagementScore',
        header: 'Engagement',
        accessor: 'engagementScore',
        sortable: true,
        width: '120px',
        headerAlign: 'center',
        align: 'center',
        cell: (_, row) => (
          <EngagementCell score={row.engagementScore} trend={row.engagementTrend} />
        ),
      });
    }

    if (showChurnRisk) {
      cols.push({
        id: 'churnRiskScore',
        header: 'Churn Risk',
        accessor: 'churnRiskScore',
        sortable: true,
        width: '120px',
        headerAlign: 'center',
        align: 'center',
        hideOnMobile: true,
        cell: (_, row) => (
          <ChurnRiskCell score={row.churnRiskScore} riskFactors={row.riskFactors} />
        ),
      });
    }

    cols.push(
      {
        id: 'totalGalleryViews',
        header: 'Views',
        accessor: 'totalGalleryViews',
        sortable: true,
        width: '100px',
        headerAlign: 'center',
        align: 'center',
        hideOnMobile: true,
        cell: (value) => (
          <MetricCell value={value as number} icon={Eye} iconColor="text-blue-500" />
        ),
      },
      {
        id: 'totalDownloads',
        header: 'Downloads',
        accessor: 'totalDownloads',
        sortable: true,
        width: '100px',
        headerAlign: 'center',
        align: 'center',
        hideOnMobile: true,
        cell: (value) => (
          <MetricCell value={value as number} icon={Download} iconColor="text-green-500" />
        ),
      }
    );

    if (showLifetimeValue) {
      cols.push({
        id: 'lifetimeValueCents',
        header: 'LTV',
        accessor: 'lifetimeValueCents',
        sortable: true,
        width: '100px',
        headerAlign: 'center',
        align: 'center',
        hideOnMobile: true,
        cell: (value) => <LifetimeValueCell valueCents={value as number} />,
      });
    }

    cols.push({
      id: 'lastActivityAt',
      header: 'Last Active',
      accessor: 'lastActivityAt',
      sortable: true,
      width: '130px',
      headerAlign: 'center',
      align: 'center',
      cell: (_, row) => (
        <LastActivityCell
          lastActivityAt={row.lastActivityAt}
          daysSinceLastActivity={row.daysSinceLastActivity}
        />
      ),
    });

    return cols;
  }, [showEngagement, showChurnRisk, showLifetimeValue]);

  // Handle sort
  const handleSortChange = useCallback(
    (columnId: string, direction: SortDirection) => {
      onSortChange?.(columnId as SortableColumn, direction);
    },
    [onSortChange]
  );

  // Show loading skeleton
  if (isLoading && clients.length === 0) {
    return (
      <Card variant="elevated" className={cn('overflow-hidden', className)}>
        <TableSkeleton density={density} />
      </Card>
    );
  }

  // Show error state
  if (isError && clients.length === 0) {
    return (
      <Card variant="elevated" className={cn('overflow-hidden', className)}>
        <TableHeader
          title={title}
          showFilters={false}
          onRefresh={onRefresh}
        />
        <ErrorState message={errorMessage} onRetry={onRefresh} />
      </Card>
    );
  }

  // Show empty state
  if (!isLoading && clients.length === 0) {
    return (
      <Card variant="elevated" className={cn('overflow-hidden', className)}>
        <TableHeader
          title={title}
          totalClients={0}
          showFilters={showFilters}
          filterType={filterType}
          onFilterChange={onFilterChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onRefresh={onRefresh}
        />
        <EmptyState filterType={filterType} />
      </Card>
    );
  }

  return (
    <Card variant="elevated" className={cn('overflow-hidden', className)}>
      {/* Header */}
      <TableHeader
        title={title}
        totalClients={totalClients ?? clients.length}
        showFilters={showFilters}
        filterType={filterType}
        onFilterChange={onFilterChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        isRefreshing={isLoading}
        onRefresh={onRefresh}
      />

      {/* Table */}
      <DataTable
        data={clients}
        columns={columns}
        keyAccessor="clientId"
        sortable
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        onRowClick={onClientClick}
        isLoading={isLoading}
        emptyMessage="No clients found"
        density={density}
        hoverable
        className="border-0 rounded-none"
      />

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalClients}
          pageSize={pageSize}
          onPageChange={onPageChange}
          showPageSizeSelector={!!onPageSizeChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Convenience Components
// ---------------------------------------------------------------------------

export interface TopClientsTableProps {
  /** Top clients data from API */
  clients: TopClientEntry[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Row click handler */
  onClientClick?: (client: TopClientEntry) => void;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Pre-configured table for displaying top clients
 */
export function TopClientsTable({
  clients,
  isLoading,
  onClientClick,
  onRefresh,
  className,
}: TopClientsTableProps) {
  // Transform TopClientEntry to ClientTableRow
  const tableData: ClientTableRow[] = useMemo(
    () =>
      clients.map((client) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        email: client.email,
        engagementScore: client.engagementScore,
        churnRiskScore: client.churnRiskScore,
        totalGalleryViews: client.totalGalleryViews,
        totalDownloads: client.totalDownloads,
        totalFavorites: client.totalFavorites,
        lifetimeValueCents: client.lifetimeValueCents,
        lastActivityAt: client.lastActivityAt,
      })),
    [clients]
  );

  return (
    <ClientAnalyticsTable
      clients={tableData}
      isLoading={isLoading}
      title="Top Clients"
      showFilters={false}
      showChurnRisk={false}
      onClientClick={onClientClick ? (row) => onClientClick(clients.find((c) => c.clientId === row.clientId)!) : undefined}
      onRefresh={onRefresh}
      className={className}
      density="compact"
    />
  );
}

export interface ChurnRiskTableProps {
  /** Churn risk clients data from API */
  clients: ChurnRiskEntry[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Row click handler */
  onClientClick?: (client: ChurnRiskEntry) => void;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Pre-configured table for displaying clients at churn risk
 */
export function ChurnRiskTable({
  clients,
  isLoading,
  onClientClick,
  onRefresh,
  className,
}: ChurnRiskTableProps) {
  // Transform ChurnRiskEntry to ClientTableRow
  const tableData: ClientTableRow[] = useMemo(
    () =>
      clients.map((client) => ({
        clientId: client.clientId,
        clientName: client.clientName,
        email: client.email,
        engagementScore: client.engagementScore,
        churnRiskScore: client.churnRiskScore,
        totalGalleryViews: 0, // Not available in ChurnRiskEntry
        totalDownloads: 0, // Not available in ChurnRiskEntry
        lifetimeValueCents: 0, // Not available in ChurnRiskEntry
        lastActivityAt: client.lastActivityAt,
        daysSinceLastActivity: client.daysSinceLastActivity,
        riskFactors: client.riskFactors,
      })),
    [clients]
  );

  return (
    <ClientAnalyticsTable
      clients={tableData}
      isLoading={isLoading}
      title="Clients at Risk"
      showFilters={false}
      showLifetimeValue={false}
      onClientClick={onClientClick ? (row) => onClientClick(clients.find((c) => c.clientId === row.clientId)!) : undefined}
      onRefresh={onRefresh}
      className={className}
      density="compact"
    />
  );
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default ClientAnalyticsTable;
