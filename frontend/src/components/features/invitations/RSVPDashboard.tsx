/**
 * RSVPDashboard: Manage and view RSVP responses for an invitation
 *
 * Features:
 * - Summary statistics (attending, not attending, maybe, total party size)
 * - Filterable RSVP list with search
 * - Export to CSV/PDF
 * - Delete RSVP capability
 *
 * Feature: 016-save-the-date
 * Tasks: T050-T059
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserCheck,
  UserX,
  HelpCircle,
  Search,
  Download,
  Trash2,
  Filter,
  ChevronDown,
  Mail,
  Phone,
  Calendar,
  RefreshCw,
  QrCode,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { invitationService } from '@/services/invitationService';
import type { RSVPResponse, RSVPStatsResponse, InvitationRSVP } from '@/types/invitations';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/hooks/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RSVPDashboardProps {
  workspaceId: string;
  invitationId: string;
  className?: string;
}

type FilterStatus = 'all' | 'attending' | 'not_attending' | 'maybe' | 'pending';

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'primary' | 'success' | 'error' | 'warning' | 'info';
  onClick?: () => void;
  active?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  color,
  onClick,
  active,
}) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    error: 'bg-error/10 text-error',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  };

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center p-4 rounded-lg border transition-all
        ${active ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-primary/50'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      <div className={`p-2 rounded-full ${colorClasses[color]} mb-2`}>
        {icon}
      </div>
      <span className="text-2xl font-semibold text-text-primary">{value}</span>
      <span className="text-sm text-text-secondary">{label}</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// RSVP Row Component
// ---------------------------------------------------------------------------

interface RSVPRowProps {
  rsvp: RSVPResponse;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

const RSVPRow: React.FC<RSVPRowProps> = ({ rsvp, onDelete, isDeleting }) => {
  const statusBadge = useMemo(() => {
    if (rsvp.attending === true) {
      return <AppBadge variant="success">Attending</AppBadge>;
    } else if (rsvp.attending === false) {
      return <AppBadge variant="error">Not Attending</AppBadge>;
    }
    return <AppBadge variant="warning">Maybe</AppBadge>;
  }, [rsvp.attending]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <tr className="border-b border-border hover:bg-surface-hover transition-colors">
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{rsvp.guest_name}</span>
          <span className="text-sm text-text-secondary flex items-center gap-1">
            <Mail className="w-3 h-3" />
            {rsvp.guest_email}
          </span>
          {rsvp.guest_phone && (
            <span className="text-sm text-text-tertiary flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {rsvp.guest_phone}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-center">{statusBadge}</td>
      <td className="py-3 px-4 text-center">
        <span className="font-medium">{rsvp.party_size}</span>
        {rsvp.party_names && rsvp.party_names.length > 0 && (
          <div className="text-xs text-text-secondary mt-1">
            {rsvp.party_names.join(', ')}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        {rsvp.dietary_preferences && (
          <span className="text-sm text-text-secondary">{rsvp.dietary_preferences}</span>
        )}
      </td>
      <td className="py-3 px-4">
        {rsvp.message && (
          <span className="text-sm text-text-secondary line-clamp-2">{rsvp.message}</span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-text-tertiary">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatDate(rsvp.created_at)}
        </div>
      </td>
      <td className="py-3 px-4">
        <AppButton
          variant="ghost"
          size="icon"
          onClick={() => onDelete(rsvp.rsvp_id)}
          disabled={isDeleting}
          className="text-text-tertiary hover:text-error"
          title="Delete RSVP"
        >
          <Trash2 className="w-4 h-4" />
        </AppButton>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const RSVPDashboard: React.FC<RSVPDashboardProps> = ({
  workspaceId,
  invitationId,
  className = '',
}) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm } = useConfirmDialog();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const limit = 25;

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: stats } = useQuery({
    queryKey: ['invitation-rsvp-stats', workspaceId, invitationId],
    queryFn: () => invitationService.getRSVPStats(workspaceId, invitationId),
  });

  // Check-in stats (T119)
  const { data: checkinStats } = useQuery({
    queryKey: ['checkin-stats', workspaceId, invitationId],
    queryFn: () => invitationService.getCheckinStats(workspaceId, invitationId),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const attendingFilter = useMemo(() => {
    if (statusFilter === 'attending') return true;
    if (statusFilter === 'not_attending') return false;
    return undefined;
  }, [statusFilter]);

  const { data: rsvpsData, isLoading: rsvpsLoading, refetch } = useQuery({
    queryKey: ['invitation-rsvps', workspaceId, invitationId, page, searchQuery, statusFilter],
    queryFn: () =>
      invitationService.listRSVPs(workspaceId, invitationId, {
        page,
        limit,
        attending: attendingFilter,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: (rsvpId: string) =>
      invitationService.deleteRSVP(workspaceId, invitationId, rsvpId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation-rsvps', workspaceId, invitationId] });
      queryClient.invalidateQueries({ queryKey: ['invitation-rsvp-stats', workspaceId, invitationId] });
      showToast('RSVP deleted successfully', 'success');
    },
    onError: () => {
      showToast('Failed to delete RSVP', 'error');
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleDelete = useCallback(
    async (rsvpId: string) => {
      const confirmed = await confirm({
        title: 'Delete RSVP?',
        description: 'This action cannot be undone. The guest will need to submit a new RSVP.',
        confirmText: 'Delete',
        variant: 'destructive',
      });

      if (confirmed) {
        deleteMutation.mutate(rsvpId);
      }
    },
    [confirm, deleteMutation]
  );

  const handleFilterClick = (filter: FilterStatus) => {
    setStatusFilter(filter);
    setPage(1);
  };

  const handleExportCSV = async () => {
    try {
      const blob = await invitationService.exportRSVPsToCSV(workspaceId, invitationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rsvps-${invitationId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported successfully', 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const handleExportPDF = async () => {
    // TODO: PDF export not yet implemented in backend (T057)
    showToast('PDF export coming soon', 'info');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const rsvps: InvitationRSVP[] = rsvpsData?.rsvps || rsvpsData?.data || [];
  const total = rsvpsData?.total ?? rsvpsData?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Total RSVPs"
          value={stats?.total || 0}
          color="primary"
          onClick={() => handleFilterClick('all')}
          active={statusFilter === 'all'}
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5" />}
          label="Attending"
          value={stats?.attending || 0}
          color="success"
          onClick={() => handleFilterClick('attending')}
          active={statusFilter === 'attending'}
        />
        <StatCard
          icon={<UserX className="w-5 h-5" />}
          label="Not Attending"
          value={stats?.not_attending || 0}
          color="error"
          onClick={() => handleFilterClick('not_attending')}
          active={statusFilter === 'not_attending'}
        />
        <StatCard
          icon={<HelpCircle className="w-5 h-5" />}
          label="Maybe"
          value={stats?.maybe || 0}
          color="warning"
          onClick={() => handleFilterClick('maybe')}
          active={statusFilter === 'maybe'}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Total Guests"
          value={stats?.total_party_size || 0}
          color="info"
        />
        {/* Check-in stats (T119) */}
        <StatCard
          icon={<QrCode className="w-5 h-5" />}
          label="Checked In"
          value={checkinStats?.total_guests_checked_in || 0}
          color="success"
        />
      </div>

      {/* Check-in Rate Bar (T119) */}
      {checkinStats && (checkinStats.expected_guests ?? 0) > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-lg bg-surface border border-border">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-text-primary">Check-in Progress</span>
          </div>
          <div className="flex-1">
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, checkinStats.checkin_rate_percent || 0)}%` }}
              />
            </div>
          </div>
          <div className="text-sm font-medium text-text-secondary whitespace-nowrap">
            {checkinStats.total_guests_checked_in ?? 0} / {checkinStats.expected_guests ?? 0}
            <span className="text-text-tertiary ml-1">
              ({(checkinStats.checkin_rate_percent || 0).toFixed(0)}%)
            </span>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <AppInput
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown
              className={`w-4 h-4 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`}
            />
          </AppButton>

          <AppButton variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </AppButton>

          <div className="relative group">
            <AppButton variant="secondary" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
              <ChevronDown className="w-4 h-4 ml-1" />
            </AppButton>
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
              <button
                onClick={handleExportCSV}
                className="w-full px-4 py-2 text-sm text-left hover:bg-surface-hover transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full px-4 py-2 text-sm text-left hover:bg-surface-hover transition-colors"
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RSVP Table */}
      <AppCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-hover">
                <th className="text-left py-3 px-4 font-medium text-text-secondary">
                  Guest
                </th>
                <th className="text-center py-3 px-4 font-medium text-text-secondary">
                  Status
                </th>
                <th className="text-center py-3 px-4 font-medium text-text-secondary">
                  Party Size
                </th>
                <th className="text-left py-3 px-4 font-medium text-text-secondary">
                  Dietary
                </th>
                <th className="text-left py-3 px-4 font-medium text-text-secondary">
                  Message
                </th>
                <th className="text-left py-3 px-4 font-medium text-text-secondary">
                  Date
                </th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rsvpsLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-secondary">
                    Loading RSVPs...
                  </td>
                </tr>
              ) : rsvps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-secondary">
                    {searchQuery || statusFilter !== 'all'
                      ? 'No RSVPs match your filters'
                      : 'No RSVPs yet. Share your invitation to collect responses!'}
                  </td>
                </tr>
              ) : (
                rsvps.map((rsvp) => (
                  <RSVPRow
                    key={rsvp.rsvp_id}
                    rsvp={rsvp}
                    onDelete={handleDelete}
                    isDeleting={deleteMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-sm text-text-secondary">
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <AppButton
                variant="outline"
                size="sm"
                disabled={page === 1}
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
      </AppCard>
    </div>
  );
};

export default RSVPDashboard;
