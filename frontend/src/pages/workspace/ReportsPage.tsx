/**
 * ReportsPage
 *
 * Reports management page for creating, viewing, editing, and managing
 * custom analytics reports. Features:
 * - List all custom reports with filtering and search
 * - Create new reports using ReportBuilder
 * - Edit existing reports
 * - Run reports and generate exports
 * - Manage scheduled reports
 * - View recent exports
 *
 * NOTE: This page is rendered inside WorkspaceLayout which provides
 * the header, sidebar, and main content area structure.
 *
 * Feature: Analytics & Reporting
 * Task: T038 - Create ReportsPage
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  Play,
  Edit,
  Trash2,
  Download,
  MoreVertical,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  PieChart,
  Users,
  DollarSign,
  Settings,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowUpDown,
  Eye,
  Archive,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  analyticsService,
  type ReportSummary,
  type ReportDetails,
  type ExportSummary,
  type CreateReportRequest,
  type UpdateReportRequest,
} from '../../services/analyticsService';
import { ReportBuilder, type ReportBuilderTab } from '../../components/features/analytics';
import { ReportType } from '@rawdrive/shared-types';

/* =============================================================================
   Types
   ============================================================================= */

type ViewMode = 'list' | 'create' | 'edit';
type SortOption = 'name' | 'createdAt' | 'lastRunAt' | 'runCount';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'active' | 'scheduled' | 'inactive';

interface ReportTypeConfig {
  value: string;
  label: string;
  icon: typeof FileText;
  color: string;
  bgColor: string;
}

/* =============================================================================
   Constants
   ============================================================================= */

const REPORT_TYPE_CONFIG: ReportTypeConfig[] = [
  {
    value: ReportType.DASHBOARD_SUMMARY,
    label: 'Dashboard Summary',
    icon: BarChart3,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    value: ReportType.GALLERY_PERFORMANCE,
    label: 'Gallery Performance',
    icon: PieChart,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    value: ReportType.CLIENT_ENGAGEMENT,
    label: 'Client Engagement',
    icon: Users,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    value: ReportType.REVENUE_REPORT,
    label: 'Revenue Report',
    icon: DollarSign,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    value: ReportType.DOWNLOAD_REPORT,
    label: 'Download Report',
    icon: Download,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    value: ReportType.CUSTOM,
    label: 'Custom Report',
    icon: Settings,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date Created' },
  { value: 'name', label: 'Name' },
  { value: 'lastRunAt', label: 'Last Run' },
  { value: 'runCount', label: 'Run Count' },
];

/* =============================================================================
   Helper Functions
   ============================================================================= */

function getReportTypeConfig(reportType: string): ReportTypeConfig {
  return (
    REPORT_TYPE_CONFIG.find((c) => c.value === reportType) || {
      value: reportType,
      label: reportType,
      icon: FileText,
      color: 'text-slate-500',
      bgColor: 'bg-slate-500/10',
    }
  );
}

function getStatusBadge(report: ReportSummary): { label: string; color: string; icon: typeof CheckCircle } {
  if (!report.isActive) {
    return {
      label: 'Inactive',
      color: 'bg-slate-500/10 text-slate-500',
      icon: Archive,
    };
  }
  if (report.isScheduled) {
    return {
      label: 'Scheduled',
      color: 'bg-green-500/10 text-green-500',
      icon: Clock,
    };
  }
  return {
    label: 'Active',
    color: 'bg-blue-500/10 text-blue-500',
    icon: CheckCircle,
  };
}

function getLastRunStatusBadge(status?: string): { label: string; color: string; icon: typeof CheckCircle } | null {
  if (!status) return null;

  switch (status.toLowerCase()) {
    case 'success':
      return { label: 'Success', color: 'text-green-500', icon: CheckCircle };
    case 'failed':
      return { label: 'Failed', color: 'text-red-500', icon: XCircle };
    case 'running':
      return { label: 'Running', color: 'text-blue-500', icon: Loader2 };
    default:
      return null;
  }
}

/* =============================================================================
   Helper Components
   ============================================================================= */

/**
 * Loading Spinner
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

/**
 * Error State
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="text-center py-16">
      <div className="empty-state-icon mx-auto mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <p className="text-text-secondary mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-600 transition-colors"
      >
        <RefreshCw size={16} />
        Try Again
      </button>
    </div>
  );
}

/**
 * Empty State
 */
function EmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="text-center py-16">
      <div className="empty-state-icon mx-auto mb-4">
        <FileText className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">No reports yet</h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        Create custom reports to track gallery performance, client engagement, and more.
        Schedule them to run automatically and get insights delivered to your inbox.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
      >
        <Plus size={18} />
        Create Your First Report
      </button>
    </div>
  );
}

/**
 * Report Card Component
 */
interface ReportCardProps {
  report: ReportSummary;
  onView: (report: ReportSummary) => void;
  onEdit: (report: ReportSummary) => void;
  onRun: (report: ReportSummary) => void;
  onDelete: (report: ReportSummary) => void;
  isRunning?: boolean;
}

function ReportCard({
  report,
  onView,
  onEdit,
  onRun,
  onDelete,
  isRunning,
}: ReportCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const typeConfig = getReportTypeConfig(report.reportType);
  const statusBadge = getStatusBadge(report);
  const lastRunBadge = getLastRunStatusBadge(report.lastRunStatus);
  const StatusIcon = statusBadge.icon;
  const TypeIcon = typeConfig.icon;

  return (
    <div className="group glass-card glass-card-hover rounded-xl p-4 transition-all hover:shadow-lg">
      <div className="flex items-start gap-4">
        {/* Report Type Icon */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${typeConfig.bgColor}`}>
          <TypeIcon className={`w-6 h-6 ${typeConfig.color}`} />
        </div>

        {/* Report Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                {report.name}
              </h3>
              {report.description && (
                <p className="text-sm text-text-tertiary truncate mt-0.5">
                  {report.description}
                </p>
              )}
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <MoreVertical size={16} />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-8 z-20 bg-surface-elevated border border-border rounded-xl shadow-lg py-1.5 min-w-[160px]">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onView(report);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Eye size={14} />
                      View Details
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onEdit(report);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Edit size={14} />
                      Edit Report
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onRun(report);
                      }}
                      disabled={isRunning}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
                    >
                      {isRunning ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      Run Now
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(report);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Status Badge */}
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
              <StatusIcon size={12} className={report.isScheduled && report.lastRunStatus === 'running' ? 'animate-spin' : ''} />
              {statusBadge.label}
            </span>

            {/* Type Badge */}
            <span className="text-xs text-text-tertiary">
              {typeConfig.label}
            </span>

            {/* Separator */}
            <span className="text-border">|</span>

            {/* Run Count */}
            <span className="text-xs text-text-tertiary flex items-center gap-1">
              <Play size={10} />
              {report.runCount} run{report.runCount !== 1 ? 's' : ''}
            </span>

            {/* Last Run Status */}
            {lastRunBadge && (
              <>
                <span className="text-border">|</span>
                <span className={`text-xs flex items-center gap-1 ${lastRunBadge.color}`}>
                  <lastRunBadge.icon size={10} className={lastRunBadge.label === 'Running' ? 'animate-spin' : ''} />
                  {lastRunBadge.label}
                </span>
              </>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              Created {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
            </span>
            {report.lastRunAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Last run {formatDistanceToNow(new Date(report.lastRunAt), { addSuffix: true })}
              </span>
            )}
            {report.isScheduled && (
              <span className="flex items-center gap-1 text-green-500">
                <Mail size={10} />
                Scheduled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
        <button
          onClick={() => onRun(report)}
          disabled={isRunning}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Run
        </button>
        <button
          onClick={() => onEdit(report)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary bg-surface-hover hover:bg-surface-elevated rounded-lg transition-colors"
        >
          <Edit size={14} />
          Edit
        </button>
      </div>
    </div>
  );
}

/**
 * Export History Card
 */
interface ExportCardProps {
  exportItem: ExportSummary;
  onDownload: (exportItem: ExportSummary) => void;
}

function ExportCard({ exportItem, onDownload }: ExportCardProps) {
  const getStatusIcon = () => {
    switch (exportItem.status.toLowerCase()) {
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-500' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500' };
      case 'generating':
        return { icon: Loader2, color: 'text-blue-500 animate-spin' };
      default:
        return { icon: Clock, color: 'text-slate-500' };
    }
  };

  const { icon: StatusIcon, color: statusColor } = getStatusIcon();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover transition-colors">
      <div className="flex-shrink-0">
        <StatusIcon size={16} className={statusColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {exportItem.name}
        </p>
        <p className="text-xs text-text-tertiary">
          {format(new Date(exportItem.createdAt), 'MMM d, yyyy h:mm a')} - {exportItem.format.toUpperCase()}
        </p>
      </div>
      {exportItem.status === 'completed' && (
        <button
          onClick={() => onDownload(exportItem)}
          className="p-2 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary/10 transition-colors"
          title="Download"
        >
          <Download size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * Delete Confirmation Modal
 */
interface DeleteModalProps {
  report: ReportSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteModal({ report, onConfirm, onCancel, isDeleting }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary">Delete Report</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Are you sure you want to delete <strong>{report.name}</strong>? This action cannot be undone.
              All associated exports will also be deleted.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   Main Component
   ============================================================================= */

const ReportsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['analytics', 'common']);
  const { workspace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const mode = searchParams.get('mode');
    return mode === 'create' || mode === 'edit' ? mode : 'list';
  });

  // List state
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [exports, setExports] = useState<ExportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingExports, setIsLoadingExports] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected report for editing
  const [selectedReport, setSelectedReport] = useState<ReportDetails | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Filter/Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Action state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningReportIds, setRunningReportIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<ReportSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch reports
  const fetchReports = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await analyticsService.listReports(workspace.workspace_id, {
        limit: 100,
      });
      setReports(response.reports);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.workspace_id]);

  // Fetch recent exports
  const fetchExports = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    try {
      setIsLoadingExports(true);
      const response = await analyticsService.listExports(workspace.workspace_id, {
        limit: 5,
      });
      setExports(response.exports);
    } catch (err) {
      console.error('Failed to fetch exports:', err);
    } finally {
      setIsLoadingExports(false);
    }
  }, [workspace?.workspace_id]);

  // Initial load
  useEffect(() => {
    fetchReports();
    fetchExports();
  }, [fetchReports, fetchExports]);

  // Handle URL params
  useEffect(() => {
    const mode = searchParams.get('mode');
    const reportId = searchParams.get('reportId');

    if (mode === 'create') {
      setViewMode('create');
      setSelectedReport(null);
    } else if (mode === 'edit' && reportId) {
      handleEditReport({ reportId } as ReportSummary);
    } else if (mode !== viewMode && viewMode !== 'list') {
      setViewMode('list');
    }
  }, [searchParams]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchReports(), fetchExports()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchReports, fetchExports]);

  // Create report handler
  const handleCreateReport = useCallback(() => {
    setSelectedReport(null);
    setViewMode('create');
    setSearchParams({ mode: 'create' });
  }, [setSearchParams]);

  // Edit report handler
  const handleEditReport = useCallback(
    async (report: ReportSummary) => {
      if (!workspace?.workspace_id) return;

      try {
        setIsLoadingReport(true);
        const fullReport = await analyticsService.getReport(
          workspace.workspace_id,
          report.reportId
        );
        setSelectedReport(fullReport);
        setViewMode('edit');
        setSearchParams({ mode: 'edit', reportId: report.reportId });
      } catch (err) {
        console.error('Failed to fetch report details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setIsLoadingReport(false);
      }
    },
    [workspace?.workspace_id, setSearchParams]
  );

  // View report handler
  const handleViewReport = useCallback(
    (report: ReportSummary) => {
      handleEditReport(report);
    },
    [handleEditReport]
  );

  // Run report handler
  const handleRunReport = useCallback(
    async (report: ReportSummary) => {
      if (!workspace?.workspace_id) return;

      setRunningReportIds((prev) => new Set(prev).add(report.reportId));
      try {
        await analyticsService.runReport(workspace.workspace_id, report.reportId);
        // Refresh reports to get updated run count/status
        await fetchReports();
        await fetchExports();
      } catch (err) {
        console.error('Failed to run report:', err);
        setError(err instanceof Error ? err.message : 'Failed to run report');
      } finally {
        setRunningReportIds((prev) => {
          const next = new Set(prev);
          next.delete(report.reportId);
          return next;
        });
      }
    },
    [workspace?.workspace_id, fetchReports, fetchExports]
  );

  // Delete report handler
  const handleDeleteReport = useCallback(
    async (report: ReportSummary) => {
      setReportToDelete(report);
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    if (!workspace?.workspace_id || !reportToDelete) return;

    try {
      setIsDeleting(true);
      await analyticsService.deleteReport(workspace.workspace_id, reportToDelete.reportId);
      setReportToDelete(null);
      await fetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete report');
    } finally {
      setIsDeleting(false);
    }
  }, [workspace?.workspace_id, reportToDelete, fetchReports]);

  // Submit handler (create/update)
  const handleSubmit = useCallback(
    async (data: CreateReportRequest | UpdateReportRequest) => {
      if (!workspace?.workspace_id) return;

      try {
        setIsSubmitting(true);

        if (viewMode === 'create') {
          await analyticsService.createReport(workspace.workspace_id, data as CreateReportRequest);
        } else if (selectedReport) {
          await analyticsService.updateReport(
            workspace.workspace_id,
            selectedReport.reportId,
            data as UpdateReportRequest
          );
        }

        // Return to list view
        setViewMode('list');
        setSelectedReport(null);
        setSearchParams({});
        await fetchReports();
      } catch (err) {
        console.error('Failed to save report:', err);
        throw err; // Re-throw to let ReportBuilder handle it
      } finally {
        setIsSubmitting(false);
      }
    },
    [workspace?.workspace_id, viewMode, selectedReport, setSearchParams, fetchReports]
  );

  // Cancel handler
  const handleCancel = useCallback(() => {
    setViewMode('list');
    setSelectedReport(null);
    setSearchParams({});
  }, [setSearchParams]);

  // Download export handler
  const handleDownloadExport = useCallback(
    async (exportItem: ExportSummary) => {
      if (!workspace?.workspace_id) return;

      try {
        const downloadInfo = await analyticsService.downloadExport(
          workspace.workspace_id,
          exportItem.exportId
        );
        // In a real implementation, this would trigger the file download
        console.log('Download info:', downloadInfo);
        // TODO: Implement actual file download
      } catch (err) {
        console.error('Failed to download export:', err);
        setError(err instanceof Error ? err.message : 'Failed to download export');
      }
    },
    [workspace?.workspace_id]
  );

  // Toggle sort direction
  const handleSort = useCallback(
    (option: SortOption) => {
      if (sortBy === option) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(option);
        setSortDirection('desc');
      }
    },
    [sortBy]
  );

  // Filtered and sorted reports
  const filteredReports = useMemo(() => {
    let result = [...reports];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query) ||
          r.reportType.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter((r) => {
        switch (filterStatus) {
          case 'active':
            return r.isActive;
          case 'scheduled':
            return r.isScheduled;
          case 'inactive':
            return !r.isActive;
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'lastRunAt':
          if (!a.lastRunAt && !b.lastRunAt) comparison = 0;
          else if (!a.lastRunAt) comparison = -1;
          else if (!b.lastRunAt) comparison = 1;
          else comparison = new Date(a.lastRunAt).getTime() - new Date(b.lastRunAt).getTime();
          break;
        case 'runCount':
          comparison = a.runCount - b.runCount;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [reports, searchQuery, filterStatus, sortBy, sortDirection]);

  // Stats summary
  const stats = useMemo(
    () => ({
      total: reports.length,
      active: reports.filter((r) => r.isActive).length,
      scheduled: reports.filter((r) => r.isScheduled).length,
      totalRuns: reports.reduce((sum, r) => sum + r.runCount, 0),
    }),
    [reports]
  );

  // Loading state
  if (isLoading && viewMode === 'list') {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error && !reports.length && viewMode === 'list') {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <ErrorState message={error} onRetry={handleRefresh} />
      </div>
    );
  }

  // Create/Edit view
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        {/* Header */}
        <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mr-4"
              >
                <ChevronLeft size={20} />
                <span className="text-sm font-medium">Back to Reports</span>
              </button>
            </div>
          </div>
        </div>

        {/* Builder */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {isLoadingReport ? (
            <LoadingSpinner />
          ) : (
            <ReportBuilder
              mode={viewMode}
              existingReport={selectedReport || undefined}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          )}
        </main>
      </div>
    );
  }

  // List view
  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/workspace/analytics')}
                  className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                    {t('reports.title', { defaultValue: 'Custom Reports' })}
                  </h1>
                  <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                    {t('reports.subtitle', {
                      defaultValue: 'Create, schedule, and export analytics reports',
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2.5 rounded-xl bg-surface-elevated border border-border/50 text-text-secondary hover:text-primary hover:border-primary/50 transition-all disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? 'animate-spin' : ''}
                />
              </button>

              {/* Create Report Button */}
              <button
                onClick={handleCreateReport}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Create Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="glass-card rounded-xl p-4">
            <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
            <div className="text-sm text-text-tertiary">Total Reports</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-500">{stats.active}</div>
            <div className="text-sm text-text-tertiary">Active</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-2xl font-bold text-green-500">{stats.scheduled}</div>
            <div className="text-sm text-text-tertiary">Scheduled</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-500">{stats.totalRuns}</div>
            <div className="text-sm text-text-tertiary">Total Runs</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content - Reports List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search and Filters */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search reports..."
                    className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className="px-4 py-2.5 bg-surface border border-border rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="inactive">Inactive</option>
                </select>

                {/* Sort */}
                <div className="flex items-center gap-1">
                  <select
                    value={sortBy}
                    onChange={(e) => handleSort(e.target.value as SortOption)}
                    className="px-4 py-2.5 bg-surface border border-border rounded-xl text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="p-2.5 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-primary/50 transition-all"
                    title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    <ArrowUpDown size={16} className={sortDirection === 'asc' ? 'rotate-180' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Reports Grid */}
            {filteredReports.length === 0 ? (
              reports.length === 0 ? (
                <EmptyState onCreate={handleCreateReport} />
              ) : (
                <div className="text-center py-16">
                  <div className="empty-state-icon mx-auto mb-4">
                    <Search className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    No matching reports
                  </h3>
                  <p className="text-text-secondary">
                    Try adjusting your search or filters
                  </p>
                </div>
              )
            ) : (
              <div className="grid gap-4">
                {filteredReports.map((report) => (
                  <ReportCard
                    key={report.reportId}
                    report={report}
                    onView={handleViewReport}
                    onEdit={handleEditReport}
                    onRun={handleRunReport}
                    onDelete={handleDeleteReport}
                    isRunning={runningReportIds.has(report.reportId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar - Recent Exports & Quick Actions */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="glass-card rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Settings size={14} className="text-text-tertiary" />
                Quick Actions
              </h3>
              <div className="space-y-2">
                {REPORT_TYPE_CONFIG.slice(0, 4).map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={handleCreateReport}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type.bgColor}`}>
                        <Icon size={16} className={type.color} />
                      </div>
                      <span className="text-sm text-text-primary">{type.label}</span>
                      <ChevronRight size={14} className="ml-auto text-text-tertiary" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent Exports */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Download size={14} className="text-text-tertiary" />
                  Recent Exports
                </h3>
                {exports.length > 0 && (
                  <button
                    onClick={() => navigate('/workspace/analytics/exports')}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    View All
                  </button>
                )}
              </div>

              {isLoadingExports ? (
                <div className="animate-pulse space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 bg-surface-hover rounded-lg" />
                  ))}
                </div>
              ) : exports.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-6">
                  No exports yet. Run a report to generate exports.
                </p>
              ) : (
                <div className="space-y-2">
                  {exports.map((exportItem) => (
                    <ExportCard
                      key={exportItem.exportId}
                      exportItem={exportItem}
                      onDownload={handleDownloadExport}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Help Card */}
            <div className="glass-card rounded-xl p-4 bg-gradient-to-br from-primary/5 to-purple-500/5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={16} className="text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-text-primary">Need Help?</h4>
                  <p className="text-xs text-text-tertiary mt-1">
                    Create custom reports to track your gallery performance, client engagement, and more.
                    Schedule them to run automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {reportToDelete && (
        <DeleteModal
          report={reportToDelete}
          onConfirm={confirmDelete}
          onCancel={() => setReportToDelete(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
};

export default ReportsPage;
