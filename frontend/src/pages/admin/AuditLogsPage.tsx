/**
 * Audit Logs Page
 *
 * Admin interface for viewing and searching audit logs.
 * Provides filtering, pagination, and export capabilities.
 *
 * Part of the Audit & Compliance system implementation.
 *
 * @module AuditLogsPage
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Search,
  RefreshCcw,
  Download,
  Filter,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Activity,
  CheckCircle2,
  X,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { DataTable, TablePagination, type Column } from '../../components/ui/DataTable';
import { DatePicker } from '../../components/ui/DatePicker';
import {
  useAuditLogs,
  useAuditExports,
  type AuditLogSummary,
} from '../../hooks/useAuditLogs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterState {
  search: string;
  event_type: string;
  event_category: string;
  actor_type: string;
  resource_type: string;
  status: string;
  start_date: string;
  end_date: string;
}

const initialFilters: FilterState = {
  search: '',
  event_type: '',
  event_category: '',
  actor_type: '',
  resource_type: '',
  status: '',
  start_date: '',
  end_date: '',
};

// ---------------------------------------------------------------------------
// Constants for filter options
// ---------------------------------------------------------------------------

const EVENT_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'data_access', label: 'Data Access' },
  { value: 'data_modification', label: 'Data Modification' },
  { value: 'data_deletion', label: 'Data Deletion' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'security', label: 'Security' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'system', label: 'System' },
];

const ACTOR_TYPES = [
  { value: '', label: 'All Actors' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'system', label: 'System' },
  { value: 'api', label: 'API' },
  { value: 'service', label: 'Service' },
];

const RESOURCE_TYPES = [
  { value: '', label: 'All Resources' },
  { value: 'file', label: 'File' },
  { value: 'folder', label: 'Folder' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'user', label: 'User' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'invitation', label: 'Invitation' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'api_key', label: 'API Key' },
  { value: 'settings', label: 'Settings' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
];

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtext,
  colorClass = 'text-primary',
}) => (
  <div className="glass-card rounded-xl p-4 hover:shadow-lg transition-shadow">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg bg-surface-hover ${colorClass}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {subtext && <p className="text-xs text-text-secondary truncate">{subtext}</p>}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Filter Panel Component
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  isExpanded,
  onToggleExpand,
}) => {
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'search') return false; // search is handled separately
    return value !== '';
  });

  return (
    <div className="glass-card rounded-xl overflow-hidden mb-6">
      {/* Filter Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-hover/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-accent" />
          <span className="font-medium text-text-primary">Filters</span>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-0.5 bg-accent/10 text-accent text-xs font-medium rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearFilters();
              }}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-text-tertiary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-tertiary" />
          )}
        </div>
      </button>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-border space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Event Category */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Category
              </label>
              <select
                value={filters.event_category}
                onChange={(e) => onFiltersChange({ ...filters, event_category: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {EVENT_CATEGORIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Actor Type */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Actor Type
              </label>
              <select
                value={filters.actor_type}
                onChange={(e) => onFiltersChange({ ...filters, actor_type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {ACTOR_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Resource Type */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Resource Type
              </label>
              <select
                value={filters.resource_type}
                onChange={(e) => onFiltersChange({ ...filters, resource_type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {RESOURCE_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatePicker
              label="Start Date"
              value={filters.start_date}
              onChange={(date) => onFiltersChange({ ...filters, start_date: date })}
              placeholder="From date"
            />
            <DatePicker
              label="End Date"
              value={filters.end_date}
              onChange={(date) => onFiltersChange({ ...filters, end_date: date })}
              placeholder="To date"
              minDate={filters.start_date ? new Date(filters.start_date) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Audit Log Row Detail Component
// ---------------------------------------------------------------------------

interface LogDetailProps {
  log: AuditLogSummary;
}

const LogDetail: React.FC<LogDetailProps> = ({ log }) => {
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 bg-surface-hover/50 border-t border-border">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-text-tertiary">Event ID:</span>
          <p className="text-text-primary font-mono text-xs truncate">{log.event_id}</p>
        </div>
        <div>
          <span className="text-text-tertiary">Category:</span>
          <p className="text-text-primary">{log.event_category}</p>
        </div>
        <div>
          <span className="text-text-tertiary">Actor:</span>
          <p className="text-text-primary">{log.actor_email || log.actor_type}</p>
        </div>
        <div>
          <span className="text-text-tertiary">Occurred:</span>
          <p className="text-text-primary">{formatDate(log.occurred_at)}</p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusStyle = () => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'bg-success/10 text-success';
      case 'failure':
      case 'failed':
      case 'error':
        return 'bg-error/10 text-error';
      case 'pending':
        return 'bg-gold/10 text-gold';
      case 'partial':
        return 'bg-accent/10 text-accent';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary';
    }
  };

  const getStatusIcon = () => {
    switch (status.toLowerCase()) {
      case 'success':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'failure':
      case 'failed':
      case 'error':
        return <XCircle className="w-3 h-3" />;
      case 'pending':
        return <Clock className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getStatusStyle()}`}
    >
      {getStatusIcon()}
      {status}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Export Modal Component
// ---------------------------------------------------------------------------

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'csv' | 'json') => void;
  isExporting: boolean;
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  isExporting,
}) => {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Export Audit Logs</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          Export audit logs with current filters applied. Large exports may take a few minutes to generate.
        </p>

        <div className="space-y-3 mb-6">
          <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide">
            Export Format
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setFormat('csv')}
              className={`flex-1 p-3 rounded-lg border transition-colors ${format === 'csv'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-surface-hover text-text-secondary'
                }`}
            >
              <span className="font-medium">CSV</span>
              <p className="text-xs mt-1 opacity-75">Spreadsheet compatible</p>
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`flex-1 p-3 rounded-lg border transition-colors ${format === 'json'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-surface-hover text-text-secondary'
                }`}
            >
              <span className="font-medium">JSON</span>
              <p className="text-xs mt-1 opacity-75">Machine readable</p>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <AppButton variant="secondary" onClick={onClose} disabled={isExporting}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => onExport(format)}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const AuditLogsPage: React.FC = () => {
  // Filter state
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Fetch audit logs - using hook's internal state management
  const {
    logs,
    meta,
    isLoading,
    isFetching,
    error,
    refetch,
    setFilters: setQueryFilters,
    goToPage,
  } = useAuditLogs({
    limit: 25,
  });

  // Exports hook
  const {
    createExport,
    isCreating: isExporting,
  } = useAuditExports();

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync local filter state to hook
  React.useEffect(() => {
    setQueryFilters({
      search: debouncedSearch || undefined,
      event_type: filters.event_type || undefined,
      event_category: filters.event_category || undefined,
      actor_type: filters.actor_type || undefined,
      resource_type: filters.resource_type || undefined,
      status: filters.status || undefined,
      start_date: filters.start_date || undefined,
      end_date: filters.end_date || undefined,
    });
  }, [debouncedSearch, filters, setQueryFilters]);

  // Handlers
  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery('');
  }, []);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      await createExport({
        format,
        filters: {
          search: debouncedSearch || undefined,
          event_type: filters.event_type || undefined,
          event_category: filters.event_category || undefined,
          actor_type: filters.actor_type || undefined,
          resource_type: filters.resource_type || undefined,
          status: filters.status || undefined,
          start_date: filters.start_date || undefined,
          end_date: filters.end_date || undefined,
        },
      });
      setIsExportModalOpen(false);
    } catch {
      // Error handled by hook with toast
    }
  }, [createExport, debouncedSearch, filters]);

  const handleRowClick = useCallback((log: AuditLogSummary) => {
    setSelectedLogId(selectedLogId === log.event_id ? null : log.event_id);
  }, [selectedLogId]);

  // Table columns
  const columns: Column<AuditLogSummary>[] = useMemo(() => [
    {
      id: 'occurred_at',
      header: 'Time',
      accessor: 'occurred_at',
      sortable: true,
      width: '160px',
      cell: (value) => {
        const date = new Date(value as string);
        return (
          <div className="text-sm">
            <div className="text-text-primary">{date.toLocaleDateString()}</div>
            <div className="text-text-tertiary text-xs">{date.toLocaleTimeString()}</div>
          </div>
        );
      },
    },
    {
      id: 'event_type',
      header: 'Event',
      accessor: 'event_type',
      sortable: true,
      cell: (value, row) => (
        <div>
          <div className="font-medium text-text-primary">{String(value).replace(/_/g, ' ')}</div>
          <div className="text-xs text-text-tertiary">{row.action}</div>
        </div>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      accessor: 'actor_email',
      hideOnMobile: true,
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-sm">
            <div className="text-text-primary truncate max-w-[150px]">
              {String(value || row.actor_type)}
            </div>
            <div className="text-xs text-text-tertiary">{row.actor_type}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'resource_type',
      header: 'Resource',
      accessor: 'resource_type',
      hideOnMobile: true,
      cell: (value) => value ? (
        <span className="inline-flex items-center px-2 py-0.5 bg-surface-hover text-text-secondary text-xs font-medium rounded-full">
          {String(value)}
        </span>
      ) : (
        <span className="text-text-tertiary text-xs">-</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      width: '100px',
      cell: (value) => <StatusBadge status={String(value)} />,
    },
  ], []);

  // Format relative time for stats
  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <FileText className="w-5 h-5" />
                </div>
                Audit Logs
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                View and search audit trail for compliance and security
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AppButton
                variant="secondary"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-2"
              >
                <RefreshCcw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </AppButton>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error.message}</span>
            <button
              onClick={() => refetch()}
              className="ml-auto p-1 hover:bg-error/10 rounded"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            label="Total Events"
            value={meta?.total || 0}
            subtext="Matching filters"
            colorClass="text-primary"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="This Page"
            value={logs.length}
            subtext={`Page ${meta?.page || 1} of ${meta?.totalPages || 1}`}
            colorClass="text-accent"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Success Rate"
            value={`${logs.length > 0 ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) : 0}%`}
            subtext="On this page"
            colorClass="text-success"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Latest Event"
            value={logs[0] ? formatTimeAgo(logs[0].occurred_at) : '-'}
            subtext={logs[0]?.event_type?.replace(/_/g, ' ') || 'No events'}
            colorClass="text-gold"
          />
        </div>

        {/* Search Bar */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit logs by event, actor, resource..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-hover rounded"
              >
                <X className="w-4 h-4 text-text-tertiary" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={handleClearFilters}
          isExpanded={isFilterExpanded}
          onToggleExpand={() => setIsFilterExpanded(!isFilterExpanded)}
        />

        {/* Audit Logs Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <DataTable
            data={logs}
            columns={columns}
            keyAccessor="event_id"
            isLoading={isLoading}
            emptyMessage="No audit logs found matching your filters"
            hoverable
            stickyHeader
            maxHeight="500px"
            onRowClick={handleRowClick}
          />

          {/* Expanded Row Detail */}
          {selectedLogId && logs.find(l => l.event_id === selectedLogId) && (
            <LogDetail log={logs.find(l => l.event_id === selectedLogId)!} />
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <TablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              totalItems={meta.total}
              pageSize={meta.limit}
              onPageChange={goToPage}
            />
          )}
        </div>

        {/* Summary Footer */}
        {!isLoading && logs.length > 0 && (
          <div className="mt-4 text-center text-sm text-text-tertiary">
            Showing {logs.length} of {meta?.total || 0} audit log entries
          </div>
        )}
      </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        isExporting={isExporting}
      />
    </div>
  );
};

export default AuditLogsPage;
