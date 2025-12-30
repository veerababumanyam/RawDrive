/**
 * Shared Dashboard Page
 * Security & Sharing Dashboard for workspace-wide link management
 *
 * Features:
 * - List all shared links across galleries
 * - Filter by status, gallery, search
 * - Bulk revocation (Kill Switch)
 * - Export for compliance
 * - Statistics overview
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Link2,
  AlertTriangle,
  Download,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Key,
  X,
  ExternalLink,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  TrendingUp,
  Users,
  Loader2,
  Info,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppBadge } from '../../components/ui/AppBadge';
import { DataTable, Column, TablePagination } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { useSharedDashboard, useSharedLinkDetail } from '../../hooks/useSharedLinks';
import { sharedService, SharedLinkItem, ListLinksOptions, AccessLogEntry } from '../../services/sharedService';

/* =============================================================================
   SharedDashboardPage Component
   ============================================================================= */

const SharedDashboardPage: React.FC = () => {
  const { workspace } = useAuth();
  const { addToast } = useToast();

  // Dashboard state management via custom hook
  const {
    links,
    meta,
    stats,
    isLoadingLinks,
    isLoadingStats,
    isRevoking,
    isBulkRevoking,
    isExporting,
    linksError,
    selectedLinkIds,
    handleSelectionChange,
    clearSelection,
    filterOptions,
    handleFilterChange,
    handlePageChange,
    hideRevoked,
    toggleHideRevoked,
    revokeLink,
    bulkRevoke,
    exportData,
    refetch,
  } = useSharedDashboard(workspace?.workspace_id);

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBulkRevokeDialog, setShowBulkRevokeDialog] = useState(false);
  const [showSingleRevokeDialog, setShowSingleRevokeDialog] = useState(false);
  const [linkToRevoke, setLinkToRevoke] = useState<SharedLinkItem | null>(null);
  const [showLinkDetail, setShowLinkDetail] = useState<string | null>(null);

  // Handle search with debounce
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      handleFilterChange({ search: query || undefined });
    },
    [handleFilterChange]
  );

  // Handle status filter
  const handleStatusChange = useCallback(
    (status: 'active' | 'expired' | 'revoked' | 'all') => {
      handleFilterChange({ status });
      setShowFilters(false);
    },
    [handleFilterChange]
  );

  // Handle sort
  const handleSortChange = useCallback(
    (sortBy: ListLinksOptions['sort_by']) => {
      handleFilterChange({
        sort_by: sortBy,
        sort_order: filterOptions.sort_order === 'asc' ? 'desc' : 'asc',
      });
    },
    [handleFilterChange, filterOptions.sort_order]
  );

  // Handle single revoke
  const handleRevokeClick = useCallback((link: SharedLinkItem) => {
    setLinkToRevoke(link);
    setShowSingleRevokeDialog(true);
  }, []);

  const handleConfirmRevoke = useCallback(async () => {
    if (!linkToRevoke) return;

    try {
      await revokeLink(linkToRevoke.link_id);
      addToast({
        variant: 'success',
        message: 'Link revoked successfully',
      });
      setShowSingleRevokeDialog(false);
      setLinkToRevoke(null);
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to revoke link',
      });
    }
  }, [linkToRevoke, revokeLink, addToast]);

  // Handle bulk revoke (Kill Switch)
  // Filter out already-revoked links before bulk revoke
  const revocableLinkIds = useMemo(() => {
    return Array.from(selectedLinkIds).filter((id) => {
      const link = links.find((l) => l.link_id === id);
      return link && link.status !== 'revoked';
    });
  }, [selectedLinkIds, links]);

  const handleBulkRevokeClick = useCallback(() => {
    if (selectedLinkIds.size === 0) {
      addToast({
        variant: 'warning',
        message: 'Please select links to revoke',
      });
      return;
    }

    // Check if any selected links can be revoked
    if (revocableLinkIds.length === 0) {
      addToast({
        variant: 'warning',
        message: 'All selected links are already revoked',
      });
      return;
    }

    setShowBulkRevokeDialog(true);
  }, [selectedLinkIds, revocableLinkIds, addToast]);

  const handleConfirmBulkRevoke = useCallback(async () => {
    try {
      // Only send non-revoked links to the API
      const result = await bulkRevoke({
        linkIds: revocableLinkIds,
        reason: 'Bulk revoke via Security Dashboard',
      });

      const skippedCount = selectedLinkIds.size - revocableLinkIds.length;

      if (result.failed.length > 0 || skippedCount > 0) {
        const messages = [];
        if (result.revoked_count > 0) {
          messages.push(`Revoked ${result.revoked_count} links`);
        }
        if (result.failed.length > 0) {
          messages.push(`${result.failed.length} failed`);
        }
        if (skippedCount > 0) {
          messages.push(`${skippedCount} already revoked`);
        }
        addToast({
          variant: result.revoked_count > 0 ? 'warning' : 'error',
          message: messages.join(', '),
        });
      } else {
        addToast({
          variant: 'success',
          message: `Successfully revoked ${result.revoked_count} links`,
        });
      }

      clearSelection();
      setShowBulkRevokeDialog(false);
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Bulk revoke failed',
      });
    }
  }, [selectedLinkIds, revocableLinkIds, bulkRevoke, clearSelection, addToast]);

  // Handle export
  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      try {
        await exportData({ format });
        addToast({
          variant: 'success',
          message: `Exported sharing data as ${format.toUpperCase()}`,
        });
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Export failed',
        });
      }
    },
    [exportData, addToast]
  );

  // Table columns
  const columns: Column<SharedLinkItem>[] = useMemo(
    () => [
      {
        id: 'gallery',
        header: 'Gallery',
        accessor: (row) => row.gallery_title || 'Untitled',
        sortable: false,
        cell: (_, row) => (
          <div className="min-w-0">
            <p className="font-medium text-text-primary truncate">
              {row.gallery_title || 'Untitled Gallery'}
            </p>
            {row.label && (
              <p className="text-xs text-text-tertiary truncate">{row.label}</p>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        sortable: false,
        cell: (_, row) => <StatusBadge status={row.status} />,
      },
      {
        id: 'target',
        header: 'Target',
        accessor: 'target_type',
        sortable: false,
        hideOnMobile: true,
        cell: (_, row) => (
          <div className="flex items-center gap-2">
            <TargetIcon type={row.target_type} />
            <span className="text-sm text-text-secondary capitalize">
              {row.target_type.replace('_', ' ')}
            </span>
          </div>
        ),
      },
      {
        id: 'access_policy',
        header: 'Protection',
        accessor: 'access_policy',
        sortable: false,
        hideOnMobile: true,
        cell: (_, row) => <AccessPolicyBadges policy={row.access_policy} />,
      },
      {
        id: 'access_count',
        header: 'Views',
        accessor: 'access_count',
        sortable: true,
        align: 'center',
        cell: (_, row) => (
          <div className="flex items-center justify-center gap-1">
            <Eye size={14} className="text-text-tertiary" />
            <span>{sharedService.formatAccessCount(row.access_count, row.max_accesses)}</span>
          </div>
        ),
      },
      {
        id: 'expires_at',
        header: 'Expires',
        accessor: 'expires_at',
        sortable: true,
        hideOnMobile: true,
        cell: (_, row) => (
          <div className="flex items-center gap-1">
            <Clock size={14} className={row.status === 'expired' ? 'text-warning' : 'text-text-tertiary'} />
            <span
              className={`text-sm ${
                row.status === 'expired' ? 'text-warning' : 'text-text-secondary'
              }`}
            >
              {sharedService.formatExpiration(row.expires_at)}
            </span>
          </div>
        ),
      },
      {
        id: 'created_at',
        header: 'Created',
        accessor: 'created_at',
        sortable: true,
        hideOnMobile: true,
        cell: (_, row) => (
          <span className="text-sm text-text-tertiary">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        accessor: 'link_id',
        sortable: false,
        width: '80px',
        cell: (_, row) => (
          <div className="flex items-center justify-end gap-1">
            <a
              href={`/g/${row.gallery_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-primary transition-colors"
              aria-label="Open gallery"
              title="Open gallery"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLinkDetail(row.link_id);
              }}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="View details"
              title="View details"
            >
              <Info size={16} />
            </button>
            {row.status === 'active' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRevokeClick(row);
                }}
                className="p-2 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors"
                aria-label="Revoke link"
                title="Revoke link"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [handleRevokeClick]
  );

  // Pagination calculation
  const currentPage = Math.floor((filterOptions.offset || 0) / (filterOptions.limit || 25)) + 1;
  const totalPages = meta ? Math.ceil(meta.total / (filterOptions.limit || 25)) : 1;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div
        variants={staggerItem}
        className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Shield size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gradient">Security & Sharing</h1>
            <p className="text-text-secondary mt-1">
              Manage all shared links across your workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="outline"
            onClick={() => handleExport('csv')}
            leftIcon={<Download size={18} />}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </AppButton>
          <AppButton
            variant="destructive"
            onClick={handleBulkRevokeClick}
            leftIcon={<AlertTriangle size={18} />}
            disabled={selectedLinkIds.size === 0 || isBulkRevoking}
          >
            {isBulkRevoking ? 'Revoking...' : `Kill Switch${selectedLinkIds.size > 0 ? ` (${selectedLinkIds.size})` : ''}`}
          </AppButton>
        </div>
      </motion.div>

      {/* Stats Overview */}
      <motion.div variants={staggerItem}>
        <StatsOverview stats={stats ?? undefined} isLoading={isLoadingStats} />
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={staggerItem}
        className="card-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by gallery title or label..."
            className="
              w-full pl-10 pr-4 py-2.5
              glass-light border border-white/20 dark:border-white/10
              rounded-xl text-text-primary placeholder:text-text-tertiary
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
              hover:border-white/30 dark:hover:border-white/20
              transition-all duration-200
              min-h-[44px]
            "
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="
                flex items-center gap-2
                px-4 py-2.5
                glass-light border border-white/20 dark:border-white/10
                rounded-xl text-text-secondary hover:text-text-primary hover:border-white/30
                hover:shadow-md
                transition-all duration-200
                min-h-[44px]
              "
            >
              <Filter size={18} />
              <span className="hidden sm:inline">
                {filterOptions.status === 'all' ? 'All' : filterOptions.status}
              </span>
              {filterOptions.status !== 'all' && (
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent animate-pulse" />
              )}
              <ChevronDown size={16} />
            </button>
            {showFilters && (
              <div className="absolute top-full mt-2 right-0 w-48 card-glass rounded-xl shadow-xl z-10 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">
                    Status
                  </p>
                  {(['all', 'active', 'expired', 'revoked'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className={`
                        w-full flex items-center justify-between
                        px-3 py-2 rounded-lg text-sm transition-all duration-200
                        ${filterOptions.status === status ? 'bg-gradient-to-r from-primary/10 to-accent/10 text-primary dark:text-primary-300' : 'hover:bg-surface-hover/50 text-text-secondary'}
                      `}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                      {filterOptions.status === status && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Hide Revoked Toggle */}
          <button
            onClick={toggleHideRevoked}
            className={`
              flex items-center gap-2
              px-3 py-2.5
              glass-light border rounded-xl
              hover:shadow-md
              transition-all duration-200
              min-h-[44px]
              ${hideRevoked
                ? 'border-primary/30 bg-primary/5 text-primary'
                : 'border-white/20 dark:border-white/10 text-text-secondary hover:text-text-primary hover:border-white/30'}
            `}
            aria-label={hideRevoked ? 'Show revoked links' : 'Hide revoked links'}
            title={hideRevoked ? 'Revoked links are hidden (click to show)' : 'Click to hide revoked links'}
          >
            {hideRevoked ? <EyeOff size={16} /> : <Eye size={16} />}
            <span className="hidden sm:inline text-sm">
              {hideRevoked ? 'Revoked Hidden' : 'Show All'}
            </span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            className="
              flex items-center justify-center
              p-2.5
              glass-light border border-white/20 dark:border-white/10
              rounded-xl text-text-secondary hover:text-text-primary hover:border-white/30
              hover:shadow-md
              transition-all duration-200
              min-w-[44px] min-h-[44px]
            "
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={18} className={isLoadingLinks ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {/* Status Summary Bar */}
      {meta && (
        <motion.div variants={staggerItem} className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>{meta.total} total links</span>
            <span className="text-text-tertiary">•</span>
            <span className="text-success">{meta.active_count} active</span>
            <span className="text-text-tertiary">•</span>
            <span className="text-warning">{meta.expired_count} expired</span>
            <span className="text-text-tertiary">•</span>
            <span className="text-error">{meta.revoked_count} revoked</span>
          </div>
          {/* Info about auto-purge */}
          {hideRevoked && meta.revoked_count > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Info size={14} />
              <span>
                {meta.revoked_count} revoked link{meta.revoked_count !== 1 ? 's' : ''} hidden
                (auto-deleted after 90 days)
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Links Table */}
      <motion.div variants={staggerItem}>
        {linksError ? (
          <div className="card-glass rounded-2xl p-12 text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-error" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Failed to load shared links
            </h3>
            <p className="text-text-secondary mb-4">{linksError.message}</p>
            <AppButton onClick={() => refetch()} variant="outline">
              Try Again
            </AppButton>
          </div>
        ) : links.length === 0 && !isLoadingLinks ? (
          <EmptyState
            hasFilters={!!searchQuery || filterOptions.status !== 'all'}
            onClearFilters={() => {
              handleSearch('');
              handleStatusChange('all');
            }}
          />
        ) : (
          <div className="card-glass rounded-2xl overflow-hidden">
            <DataTable
              data={links}
              columns={columns}
              keyAccessor="link_id"
              selectable
              selectedKeys={selectedLinkIds as Set<string | number>}
              onSelectionChange={handleSelectionChange}
              sortable
              sortColumn={filterOptions.sort_by}
              sortDirection={filterOptions.sort_order === 'asc' ? 'asc' : 'desc'}
              onSortChange={(column) =>
                handleSortChange(column as ListLinksOptions['sort_by'])
              }
              isLoading={isLoadingLinks}
              emptyMessage="No shared links found"
              hoverable
              density="normal"
            />

            {/* Pagination */}
            {meta && meta.total > (filterOptions.limit || 25) && (
              <TablePagination
                page={currentPage}
                totalPages={totalPages}
                totalItems={meta.total}
                pageSize={filterOptions.limit || 25}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        )}
      </motion.div>

      {/* Single Revoke Confirmation Dialog */}
      <RevokeConfirmationDialog
        isOpen={showSingleRevokeDialog}
        onClose={() => {
          setShowSingleRevokeDialog(false);
          setLinkToRevoke(null);
        }}
        onConfirm={handleConfirmRevoke}
        isLoading={isRevoking}
        title="Revoke Link"
        description={`This will immediately revoke access for "${linkToRevoke?.label || linkToRevoke?.gallery_title || 'this link'}". Anyone using this link will lose access immediately. This action cannot be undone.`}
      />

      {/* Bulk Revoke Confirmation Dialog */}
      <RevokeConfirmationDialog
        isOpen={showBulkRevokeDialog}
        onClose={() => setShowBulkRevokeDialog(false)}
        onConfirm={handleConfirmBulkRevoke}
        isLoading={isBulkRevoking}
        title="Kill Switch - Bulk Revoke"
        description={`This will immediately revoke access for ${selectedLinkIds.size} links. Anyone with these links will lose access immediately. This action cannot be undone.`}
        isDestructive
      />

      {/* Link Detail Slide-over */}
      {showLinkDetail && (
        <LinkDetailPanel
          workspaceId={workspace?.workspace_id}
          linkId={showLinkDetail}
          onClose={() => setShowLinkDetail(null)}
          onRevoke={handleRevokeClick}
        />
      )}
    </motion.div>
  );
};

/* =============================================================================
   Stats Overview Component
   ============================================================================= */

interface StatsOverviewProps {
  stats?: {
    total_links: number;
    active_links: number;
    expired_links: number;
    revoked_links: number;
    total_accesses_period: number;
    unique_visitors_period: number;
    period_days: number;
    device_breakdown: { desktop: number; mobile: number; tablet: number };
    top_galleries: Array<{
      gallery_id: string;
      gallery_title: string;
      link_count: number;
      access_count: number;
    }>;
  };
  isLoading: boolean;
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card-glass rounded-xl p-4 animate-pulse"
          >
            <div className="h-4 bg-surface-hover rounded w-1/2 mb-2" />
            <div className="h-8 bg-surface-hover rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: 'Active Links',
      value: stats?.active_links || 0,
      icon: Link2,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: `Views (${stats?.period_days || 30}d)`,
      value: stats?.total_accesses_period || 0,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: `Unique Visitors`,
      value: stats?.unique_visitors_period || 0,
      icon: Users,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      label: 'Expired/Revoked',
      value: (stats?.expired_links || 0) + (stats?.revoked_links || 0),
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="card-glass rounded-xl p-4 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-tertiary">{stat.label}</span>
            <div className={`w-8 h-8 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
              <stat.icon size={16} className={stat.color} />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {stat.value.toLocaleString()}
          </p>
        </motion.div>
      ))}
    </div>
  );
};

/* =============================================================================
   Status Badge Component
   ============================================================================= */

const StatusBadge: React.FC<{ status: 'active' | 'expired' | 'revoked' }> = ({
  status,
}) => {
  const config = {
    active: { color: 'success', label: 'Active' },
    expired: { color: 'warning', label: 'Expired' },
    revoked: { color: 'error', label: 'Revoked' },
  };

  const { color, label } = config[status];

  return (
    <AppBadge
      variant={color as 'success' | 'warning' | 'error'}
      size="sm"
    >
      {label}
    </AppBadge>
  );
};

/* =============================================================================
   Target Icon Component
   ============================================================================= */

const TargetIcon: React.FC<{ type: 'gallery' | 'sub_gallery' | 'photo' }> = ({
  type,
}) => {
  const icons = {
    gallery: Globe,
    sub_gallery: Globe,
    photo: Eye,
  };
  const Icon = icons[type] || Globe;
  return <Icon size={14} className="text-text-tertiary" />;
};

/* =============================================================================
   Access Policy Badges Component
   ============================================================================= */

interface AccessPolicyBadgesProps {
  policy: {
    password_protected: boolean;
    pin_protected: boolean;
    email_required: boolean;
    download_policy: string;
  };
}

const AccessPolicyBadges: React.FC<AccessPolicyBadgesProps> = ({ policy }) => {
  const badges: { icon: React.ReactNode; label: string; active: boolean }[] = [
    {
      icon: <Lock size={12} />,
      label: 'Password',
      active: policy.password_protected,
    },
    {
      icon: <Key size={12} />,
      label: 'PIN',
      active: policy.pin_protected,
    },
    {
      icon: <Mail size={12} />,
      label: 'Email',
      active: policy.email_required,
    },
  ];

  const activeBadges = badges.filter((b) => b.active);

  if (activeBadges.length === 0) {
    return <span className="text-xs text-text-tertiary">Public</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {activeBadges.map((badge) => (
        <div
          key={badge.label}
          className="flex items-center gap-1 px-2 py-1 bg-surface-hover/50 rounded text-xs text-text-secondary"
          title={badge.label}
        >
          {badge.icon}
        </div>
      ))}
    </div>
  );
};

/* =============================================================================
   Empty State Component
   ============================================================================= */

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ hasFilters, onClearFilters }) => {
  return (
    <div className="card-glass rounded-2xl p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Link2 size={32} className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        {hasFilters ? 'No links found' : 'No shared links yet'}
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your search or filter criteria.'
          : 'When you share galleries with clients, their links will appear here for easy management.'}
      </p>
      {hasFilters && (
        <AppButton onClick={onClearFilters} variant="outline">
          Clear Filters
        </AppButton>
      )}
    </div>
  );
};

/* =============================================================================
   Link Detail Panel Component
   ============================================================================= */

interface LinkDetailPanelProps {
  workspaceId?: string;
  linkId: string;
  onClose: () => void;
  onRevoke: (link: SharedLinkItem) => void;
}

const LinkDetailPanel: React.FC<LinkDetailPanelProps> = ({
  workspaceId,
  linkId,
  onClose,
  onRevoke,
}) => {
  const { data: link, isLoading, error } = useSharedLinkDetail(workspaceId, linkId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md bg-surface shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Link Details</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle size={48} className="mx-auto mb-4 text-error" />
              <p className="text-text-secondary">{error.message}</p>
            </div>
          ) : link ? (
            <>
              {/* Gallery Info */}
              <div>
                <h3 className="text-xl font-semibold text-text-primary mb-1">
                  {link.gallery_title || 'Untitled Gallery'}
                </h3>
                {link.label && (
                  <p className="text-text-secondary">{link.label}</p>
                )}
                <div className="mt-2">
                  <StatusBadge status={link.status} />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-hover/50 rounded-lg p-3">
                  <p className="text-sm text-text-tertiary">Views</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {sharedService.formatAccessCount(link.access_count, link.max_accesses)}
                  </p>
                </div>
                <div className="bg-surface-hover/50 rounded-lg p-3">
                  <p className="text-sm text-text-tertiary">Created</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {new Date(link.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-surface-hover/50 rounded-lg p-3">
                  <p className="text-sm text-text-tertiary">Expires</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {sharedService.formatExpiration(link.expires_at)}
                  </p>
                </div>
                <div className="bg-surface-hover/50 rounded-lg p-3">
                  <p className="text-sm text-text-tertiary">Created By</p>
                  <p className="text-sm font-medium text-text-primary truncate">
                    {link.created_by_name || link.created_by_email || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Access Policy */}
              <div>
                <h4 className="text-sm font-semibold text-text-primary mb-2">
                  Access Protection
                </h4>
                <div className="space-y-2">
                  <PolicyRow
                    icon={<Lock size={16} />}
                    label="Password Protected"
                    enabled={link.access_policy.password_protected}
                  />
                  <PolicyRow
                    icon={<Key size={16} />}
                    label="PIN Protected"
                    enabled={link.access_policy.pin_protected}
                  />
                  <PolicyRow
                    icon={<Mail size={16} />}
                    label="Email Required"
                    enabled={link.access_policy.email_required}
                  />
                  <PolicyRow
                    icon={<Download size={16} />}
                    label={`Downloads: ${link.access_policy.download_policy}`}
                    enabled={link.access_policy.download_policy !== 'none'}
                  />
                </div>
              </div>

              {/* Recent Access Log */}
              {link.accesses && link.accesses.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-2">
                    Recent Access
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {link.accesses.slice(0, 10).map((access: AccessLogEntry) => (
                      <div
                        key={access.access_id}
                        className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <DeviceIcon type={access.device_type} />
                          <div>
                            <p className="text-sm text-text-primary">
                              {access.visitor?.email || 'Anonymous'}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {access.city && access.country_code
                                ? `${access.city}, ${access.country_code}`
                                : access.country_code || 'Unknown location'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-text-tertiary">
                          {new Date(access.accessed_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {link.status === 'active' && (
                <div className="pt-4 border-t border-border">
                  <AppButton
                    variant="destructive"
                    onClick={() => onRevoke(link as SharedLinkItem)}
                    leftIcon={<Trash2 size={18} />}
                    fullWidth
                  >
                    Revoke This Link
                  </AppButton>
                </div>
              )}
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};

/* =============================================================================
   Policy Row Component
   ============================================================================= */

const PolicyRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}> = ({ icon, label, enabled }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex items-center gap-2 text-text-secondary">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <span
      className={`text-sm font-medium ${enabled ? 'text-success' : 'text-text-tertiary'}`}
    >
      {enabled ? 'Yes' : 'No'}
    </span>
  </div>
);

/* =============================================================================
   Device Icon Component
   ============================================================================= */

const DeviceIcon: React.FC<{ type: string | null }> = ({ type }) => {
  const icons: Record<string, React.ReactNode> = {
    mobile: <Smartphone size={14} className="text-text-tertiary" />,
    tablet: <Tablet size={14} className="text-text-tertiary" />,
    desktop: <Monitor size={14} className="text-text-tertiary" />,
  };
  return <>{icons[type || 'desktop'] || icons.desktop}</>;
};

/* =============================================================================
   Revoke Confirmation Dialog Component
   ============================================================================= */

interface RevokeConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  title: string;
  description: string;
  isDestructive?: boolean;
}

const RevokeConfirmationDialog: React.FC<RevokeConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title,
  description,
  isDestructive = false,
}) => {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${isDestructive ? 'bg-error/20' : 'bg-warning/20'} flex items-center justify-center`}>
            <AlertTriangle size={20} className={isDestructive ? 'text-error' : 'text-warning'} />
          </div>
          <ModalTitle>{title}</ModalTitle>
        </div>
      </ModalHeader>
      <ModalBody>
        <ModalDescription>
          {description}
        </ModalDescription>
      </ModalBody>
      <ModalFooter>
        <AppButton variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </AppButton>
        <AppButton
          variant="destructive"
          onClick={handleConfirm}
          disabled={isLoading}
          leftIcon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        >
          {isLoading ? 'Revoking...' : 'Revoke'}
        </AppButton>
      </ModalFooter>
    </Modal>
  );
};

export default SharedDashboardPage;
