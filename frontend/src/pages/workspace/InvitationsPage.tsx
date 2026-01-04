/**
 * InvitationsPage: Digital invitations list/dashboard
 *
 * Displays all invitations for the workspace with filtering,
 * search, and quick actions.
 *
 * Feature: 016-save-the-date
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Share2,
  Copy,
  Users,
  ExternalLink,
  FileText,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { InvitationListSkeleton } from '@/components/features/invitations/InvitationSkeleton';
import {
  InvitationErrorFallback,
  getErrorTypeFromError,
} from '@/components/features/invitations/InvitationErrorFallback';
import * as invitationService from '@/services/invitationService';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatDate, formatRelativeDate } from '@/utils/date';
import type { InvitationListItem, EventType, InvitationStatus } from '@/types/invitations';
import type { InvitationDraft } from '@/services/invitationService';

// Event type display configuration
const EVENT_TYPE_CONFIG: Record<EventType, { label: string; emoji: string }> = {
  wedding: { label: 'Wedding', emoji: '💒' },
  birthday: { label: 'Birthday', emoji: '🎂' },
  anniversary: { label: 'Anniversary', emoji: '💑' },
  baby_shower: { label: 'Baby Shower', emoji: '👶' },
  engagement: { label: 'Engagement', emoji: '💍' },
  festival: { label: 'Festival', emoji: '🎉' },
  corporate: { label: 'Corporate', emoji: '🏢' },
  other: { label: 'Other', emoji: '📋' },
};

// Status badge configuration
const STATUS_CONFIG: Record<InvitationStatus, { variant: 'default' | 'success' | 'warning' | 'error'; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  published: { variant: 'success', label: 'Published' },
  archived: { variant: 'warning', label: 'Archived' },
  expired: { variant: 'warning', label: 'Expired' },
  cancelled: { variant: 'error', label: 'Cancelled' },
  deleted: { variant: 'error', label: 'Deleted' },
};

interface InvitationCardProps {
  invitation: InvitationListItem;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const InvitationCard: React.FC<InvitationCardProps> = ({
  invitation,
  onView,
  onEdit,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const eventConfig = EVENT_TYPE_CONFIG[invitation.event_type] || EVENT_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[invitation.status] || STATUS_CONFIG.draft;

  return (
    <AppCard className="group hover:shadow-lg transition-shadow duration-200">
      {/* Cover image or placeholder - T130: lazy load for performance */}
      <div className="relative h-40 bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-lg overflow-hidden">
        {invitation.cover_image_url ? (
          <img
            src={invitation.cover_image_url}
            alt={invitation.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-5xl">{eventConfig.emoji}</span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 right-3">
          <AppBadge variant={statusConfig.variant}>
            {statusConfig.label}
          </AppBadge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary truncate">
              {invitation.title}
            </h3>
            <p className="text-sm text-text-secondary flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(invitation.event_datetime)}
            </p>
          </div>

          {/* Actions menu */}
          <div className="relative">
            <AppButton
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </AppButton>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover flex items-center gap-2"
                    onClick={() => {
                      onView(invitation.invitation_id);
                      setMenuOpen(false);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    View Details
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover flex items-center gap-2"
                    onClick={() => {
                      onEdit(invitation.invitation_id);
                      setMenuOpen(false);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  {invitation.status === 'published' && (
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover flex items-center gap-2"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  )}
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover flex items-center gap-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate
                  </button>
                  <hr className="my-1 border-border" />
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-error/10 text-error flex items-center gap-2"
                    onClick={() => {
                      onDelete(invitation.invitation_id);
                      setMenuOpen(false);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Venue */}
        {(invitation.venue_name || invitation.venue_city) && (
          <p className="text-xs text-text-tertiary mb-3 truncate">
            📍 {[invitation.venue_name, invitation.venue_city].filter(Boolean).join(', ')}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {invitation.view_count}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {invitation.rsvp_count}
          </span>
        </div>

        {/* Event type tag */}
        <div className="mt-3 pt-3 border-t border-border">
          <span className="text-xs bg-surface-hover px-2 py-1 rounded-full">
            {eventConfig.emoji} {eventConfig.label}
          </span>
        </div>
      </div>
    </AppCard>
  );
};

// ---------------------------------------------------------------------------
// Draft Card Component (Phase 10: T099)
// ---------------------------------------------------------------------------

interface DraftCardProps {
  draft: InvitationDraft;
  onResume: (draftId: string) => void;
  onDelete: (draftId: string) => void;
}

const DraftCard: React.FC<DraftCardProps> = ({ draft, onResume, onDelete }) => {
  const data = draft.data as Record<string, unknown>;
  const title = (data.title as string) || 'Untitled Draft';
  const eventType = (data.event_type as EventType) || 'other';
  const eventConfig = EVENT_TYPE_CONFIG[eventType] || EVENT_TYPE_CONFIG.other;

  // Format last updated time
  const updatedAt = new Date(draft.updated_at);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let timeAgo = '';
  if (diffHours < 1) {
    timeAgo = 'Less than an hour ago';
  } else if (diffHours < 24) {
    timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    timeAgo = updatedAt.toLocaleDateString();
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-surface border border-border/60 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group">
      {/* Icon */}
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <FileText className="w-6 h-6 text-primary" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-text-primary truncate">
          {title}
        </h4>
        <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
          <span>{eventConfig.emoji} {eventConfig.label}</span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <AppButton
          variant="ghost"
          size="icon"
          onClick={() => onDelete(draft.draft_id)}
          className="text-text-tertiary hover:text-error"
          aria-label="Delete draft"
        >
          <X className="w-4 h-4" />
        </AppButton>
        <AppButton
          variant="outline"
          size="sm"
          onClick={() => onResume(draft.draft_id)}
          className="gap-1"
        >
          Resume
          <ChevronRight className="w-3.5 h-3.5" />
        </AppButton>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Drafts Section Component
// ---------------------------------------------------------------------------

interface DraftsSectionProps {
  workspaceId: string;
  onResume: (draftId: string) => void;
}

const DraftsSection: React.FC<DraftsSectionProps> = ({ workspaceId, onResume }) => {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch drafts
  const { data: draftsData, isLoading } = useQuery({
    queryKey: ['invitation-drafts', workspaceId],
    queryFn: () => invitationService.listDrafts(workspaceId),
    enabled: !!workspaceId,
    staleTime: 30000, // 30 seconds
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (draftId: string) => invitationService.deleteDraft(workspaceId, draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation-drafts', workspaceId] });
    },
  });

  const handleDelete = async (draftId: string) => {
    const confirmed = window.confirm('Delete this draft? This cannot be undone.');
    if (confirmed) {
      deleteMutation.mutate(draftId);
    }
  };

  const drafts = draftsData?.data || [];

  // Don't render if no drafts
  if (!isLoading && drafts.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 mb-3 text-text-primary hover:text-primary transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Drafts
        </h2>
        <span className="text-xs text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-full">
          {drafts.length}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-4 p-4 bg-surface-hover rounded-lg animate-pulse">
              <div className="w-12 h-12 bg-border rounded-lg" />
              <div className="flex-1">
                <div className="h-4 bg-border rounded w-1/3 mb-2" />
                <div className="h-3 bg-border rounded w-1/4" />
              </div>
            </div>
          ) : (
            drafts.map((draft) => (
              <DraftCard
                key={draft.draft_id}
                draft={draft}
                onResume={onResume}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const InvitationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'all'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | 'all'>('all');

  // Fetch invitations
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invitations', workspaceId, statusFilter, eventTypeFilter, searchQuery],
    queryFn: () =>
      invitationService.listInvitations(workspaceId!, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        event_type: eventTypeFilter === 'all' ? undefined : eventTypeFilter,
        search: searchQuery || undefined,
      }),
    enabled: !!workspaceId,
  });

  const handleCreateNew = () => {
    navigate('/workspace/invitations/new');
  };

  // Resume draft handler (Phase 10: T099)
  const handleResumeDraft = (draftId: string) => {
    navigate(`/workspace/invitations/new?draft=${draftId}`);
  };

  const handleView = (id: string) => {
    navigate(`/workspace/invitations/${id}`);
  };

  const handleEdit = (id: string) => {
    navigate(`/workspace/invitations/${id}?edit=true`);
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId) return;

    const confirmed = window.confirm('Are you sure you want to delete this invitation?');
    if (confirmed) {
      try {
        await invitationService.deleteInvitation(workspaceId, id);
        refetch();
      } catch (err) {
        console.error('Failed to delete invitation:', err);
      }
    }
  };

  const invitations = data?.data || [];
  const hasInvitations = invitations.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Digital Invitations</h1>
          <p className="text-text-secondary">
            Create and manage beautiful event invitations
          </p>
        </div>
        <AppButton onClick={handleCreateNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New Invitation
        </AppButton>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <AppInput
            placeholder="Search invitations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvitationStatus | 'all')}
          className="px-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>

        {/* Event type filter */}
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value as EventType | 'all')}
          className="px-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Event Types</option>
          {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {config.emoji} {config.label}
            </option>
          ))}
        </select>
      </div>

      {/* Drafts Section (Phase 10: T099) */}
      {workspaceId && (
        <DraftsSection
          workspaceId={workspaceId}
          onResume={handleResumeDraft}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <InvitationListSkeleton count={8} />
      ) : error ? (
        <InvitationErrorFallback
          type={getErrorTypeFromError(error)}
          title="Failed to load invitations"
          message="We couldn't load your invitations. Please try again."
          onRetry={() => refetch()}
          showBack={false}
          showHome={false}
        />
      ) : !hasInvitations ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-border">
          <Calendar className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            No invitations yet
          </h2>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            Create beautiful digital invitations for weddings, birthdays, and other
            special events.
          </p>
          <AppButton onClick={handleCreateNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Your First Invitation
          </AppButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {invitations.map((invitation) => (
            <InvitationCard
              key={invitation.invitation_id}
              invitation={invitation}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination info */}
      {data?.meta && hasInvitations && (
        <div className="mt-6 text-center text-sm text-text-secondary">
          Showing {invitations.length} of {data.meta.total} invitations
        </div>
      )}
    </div>
  );
};

export default InvitationsPage;
