/**
 * InvitationDetailPage: View and manage a single invitation
 *
 * Features:
 * - View invitation details and preview
 * - Edit invitation settings
 * - Publish/unpublish controls
 * - RSVP statistics overview
 * - Share and QR code generation
 *
 * Feature: 016-save-the-date
 */

import React, { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Eye,
  EyeOff,
  Share2,
  QrCode,
  Copy,
  Check,
  Users,
  Calendar,
  MapPin,
  Trash2,
  ExternalLink,
  MoreVertical,
  Loader2,
  Clock,
  Mail,
  Download,
  Settings,
  X,
  Files,
  Bell,
  BellOff,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { InvitationPreview } from '@/components/features/invitations/InvitationPreview';
import { ShareMenu } from '@/components/features/invitations/ShareMenu';
import * as invitationService from '@/services/invitationService';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/hooks/useToast';
import type { Invitation, InvitationStats, RSVPStats } from '@/types/invitations';

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

const StatusBadge: React.FC<{ status: Invitation['status'] }> = ({ status }) => {
  const variants: Record<
    Invitation['status'],
    { variant: 'default' | 'success' | 'warning' | 'error'; label: string }
  > = {
    draft: { variant: 'default', label: 'Draft' },
    published: { variant: 'success', label: 'Published' },
    archived: { variant: 'warning', label: 'Archived' },
    deleted: { variant: 'error', label: 'Deleted' },
  };

  const { variant, label } = variants[status];
  return <AppBadge variant={variant}>{label}</AppBadge>;
};

// ---------------------------------------------------------------------------
// Stats Card Component
// ---------------------------------------------------------------------------

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ icon, label, value, subtext }) => (
  <AppCard className="p-4">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-2xl font-semibold text-text-primary">{value}</p>
        {subtext && <p className="text-xs text-text-tertiary">{subtext}</p>}
      </div>
    </div>
  </AppCard>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const InvitationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');

  // Fetch invitation details
  const {
    data: invitation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['invitation', id],
    queryFn: () => invitationService.getInvitation(id!),
    enabled: !!id,
  });

  // Fetch RSVP stats
  const { data: rsvpStats } = useQuery({
    queryKey: ['invitation-rsvp-stats', id],
    queryFn: () => invitationService.getRSVPStats(id!),
    enabled: !!id && invitation?.status === 'published',
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => invitationService.publishInvitation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation', id] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation published successfully!', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to publish invitation', 'error');
    },
  });

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: () => invitationService.unpublishInvitation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation', id] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation unpublished', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to unpublish invitation', 'error');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => invitationService.deleteInvitation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation deleted', 'success');
      navigate('/workspace/invitations');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to delete invitation', 'error');
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: () => invitationService.duplicateInvitation(id!),
    onSuccess: (newInvitation) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation duplicated! Opening copy...', 'success');
      // Navigate to the new invitation
      navigate(`/workspace/invitations/${newInvitation.invitation_id}`);
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to duplicate invitation', 'error');
    },
  });

  // Notification settings mutation
  const notificationMutation = useMutation({
    mutationFn: (preference: 'immediate' | 'daily_digest' | 'disabled') =>
      invitationService.updateNotificationSettings(id!, preference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation', id] });
      showToast('Notification settings updated', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to update notification settings', 'error');
    },
  });

  // Copy URL to clipboard
  const copyUrl = useCallback(async () => {
    if (invitation?.public_url) {
      try {
        await navigator.clipboard.writeText(invitation.public_url);
        setCopiedUrl(true);
        showToast('URL copied to clipboard', 'success');
        setTimeout(() => setCopiedUrl(false), 2000);
      } catch {
        showToast('Failed to copy URL', 'error');
      }
    }
  }, [invitation?.public_url, showToast]);

  // Download ICS
  const downloadICS = useCallback(async () => {
    try {
      await invitationService.downloadICS(id!);
      showToast('Calendar event downloaded', 'success');
    } catch {
      showToast('Failed to download calendar event', 'error');
    }
  }, [id, showToast]);

  // Confirm delete
  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this invitation? This cannot be undone.')) {
      deleteMutation.mutate();
    }
  }, [deleteMutation]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !invitation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Invitation Not Found
        </h2>
        <p className="text-text-secondary mb-4">
          The invitation you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <AppButton onClick={() => navigate('/workspace/invitations')}>
          Back to Invitations
        </AppButton>
      </div>
    );
  }

  const isPending =
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    deleteMutation.isPending ||
    duplicateMutation.isPending ||
    notificationMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => navigate('/workspace/invitations')}
                aria-label="Back to invitations"
              >
                <ArrowLeft className="w-5 h-5" />
              </AppButton>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-text-primary">
                    {invitation.title}
                  </h1>
                  <StatusBadge status={invitation.status} />
                </div>
                <p className="text-sm text-text-secondary">
                  Created{' '}
                  {new Date(invitation.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {invitation.status === 'draft' && (
                <AppButton
                  onClick={() => publishMutation.mutate()}
                  disabled={isPending}
                >
                  {publishMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 mr-2" />
                  )}
                  Publish
                </AppButton>
              )}

              {invitation.status === 'published' && (
                <>
                  <AppButton variant="outline" onClick={() => setShowShareModal(true)}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </AppButton>
                  <AppButton
                    variant="outline"
                    onClick={() => unpublishMutation.mutate()}
                    disabled={isPending}
                  >
                    {unpublishMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <EyeOff className="w-4 h-4 mr-2" />
                    )}
                    Unpublish
                  </AppButton>
                </>
              )}

              <AppButton
                variant="outline"
                onClick={() => navigate(`/workspace/invitations/${id}/edit`)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </AppButton>

              <AppButton
                variant="outline"
                onClick={() => duplicateMutation.mutate()}
                disabled={isPending}
                title="Create a copy of this invitation"
              >
                {duplicateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Files className="w-4 h-4 mr-2" />
                )}
                Duplicate
              </AppButton>

              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                disabled={isPending}
                className="text-error hover:bg-error/10"
                aria-label="Delete invitation"
              >
                <Trash2 className="w-5 h-5" />
              </AppButton>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Details & Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard
                icon={<Eye className="w-5 h-5" />}
                label="Views"
                value={invitation.view_count}
                subtext={`${invitation.unique_view_count} unique`}
              />
              <StatsCard
                icon={<Users className="w-5 h-5" />}
                label="RSVPs"
                value={invitation.rsvp_count}
                subtext={rsvpStats ? `${rsvpStats.attending} attending` : undefined}
              />
              <StatsCard
                icon={<Calendar className="w-5 h-5" />}
                label="Event Date"
                value={new Date(invitation.event_datetime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              />
              <StatsCard
                icon={<Clock className="w-5 h-5" />}
                label="Time"
                value={new Date(invitation.event_datetime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              />
            </div>

            {/* Event Details Card */}
            <AppCard className="p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Event Details
              </h2>

              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-text-secondary">Event Type</dt>
                  <dd className="text-text-primary capitalize">
                    {invitation.event_type.replace('_', ' ')}
                  </dd>
                </div>

                {invitation.description && (
                  <div>
                    <dt className="text-sm text-text-secondary">Description</dt>
                    <dd className="text-text-primary">{invitation.description}</dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm text-text-secondary">Date & Time</dt>
                  <dd className="text-text-primary">
                    {new Date(invitation.event_datetime).toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: invitation.event_timezone,
                    })}
                    {' '}
                    ({invitation.event_timezone})
                  </dd>
                </div>

                <div>
                  <dt className="text-sm text-text-secondary">Venue</dt>
                  <dd className="text-text-primary">
                    {invitation.venue.name && (
                      <span className="font-medium">{invitation.venue.name}</span>
                    )}
                    {invitation.venue.address && (
                      <p className="text-sm text-text-secondary">
                        {[
                          invitation.venue.address,
                          invitation.venue.city,
                          invitation.venue.state,
                          invitation.venue.country,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                    {invitation.venue.map_url && (
                      <a
                        href={invitation.venue.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                      >
                        <MapPin className="w-4 h-4" />
                        View on Map
                      </a>
                    )}
                  </dd>
                </div>

                {invitation.host_names.length > 0 && (
                  <div>
                    <dt className="text-sm text-text-secondary">Hosts</dt>
                    <dd className="text-text-primary">
                      {invitation.host_names.join(', ')}
                    </dd>
                  </div>
                )}
              </dl>
            </AppCard>

            {/* RSVP Settings Card */}
            <AppCard className="p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                RSVP Settings
              </h2>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">RSVP Collection</dt>
                  <dd className="text-text-primary">
                    {invitation.rsvp_settings.enabled ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
                {invitation.rsvp_settings.enabled && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Max Party Size</dt>
                      <dd className="text-text-primary">
                        {invitation.rsvp_settings.max_party_size}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Collect Dietary Info</dt>
                      <dd className="text-text-primary">
                        {invitation.rsvp_settings.collect_dietary ? 'Yes' : 'No'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Collect Phone</dt>
                      <dd className="text-text-primary">
                        {invitation.rsvp_settings.collect_phone ? 'Yes' : 'No'}
                      </dd>
                    </div>
                    {invitation.rsvp_settings.deadline && (
                      <div className="flex justify-between">
                        <dt className="text-text-secondary">Deadline</dt>
                        <dd className="text-text-primary">
                          {new Date(invitation.rsvp_settings.deadline).toLocaleDateString()}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>

              {invitation.status === 'published' && invitation.rsvp_count > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <Link
                    to={`/workspace/invitations/${id}/rsvps`}
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    <Users className="w-4 h-4" />
                    View All RSVPs ({invitation.rsvp_count})
                  </Link>
                </div>
              )}
            </AppCard>

            {/* Notification Settings Card */}
            <AppCard className="p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notification Settings
              </h2>

              <p className="text-sm text-text-secondary mb-4">
                Choose how you want to be notified when guests respond to your invitation.
              </p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="notification_preference"
                    value="immediate"
                    checked={invitation.notification_preference === 'immediate'}
                    onChange={() => notificationMutation.mutate('immediate')}
                    disabled={notificationMutation.isPending}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-text-primary">Immediate</div>
                    <div className="text-sm text-text-secondary">
                      Get notified immediately when each guest responds
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="notification_preference"
                    value="daily_digest"
                    checked={invitation.notification_preference === 'daily_digest'}
                    onChange={() => notificationMutation.mutate('daily_digest')}
                    disabled={notificationMutation.isPending}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-text-primary">Daily Digest</div>
                    <div className="text-sm text-text-secondary">
                      Receive a summary of all responses once a day at 9 AM
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="notification_preference"
                    value="disabled"
                    checked={invitation.notification_preference === 'disabled'}
                    onChange={() => notificationMutation.mutate('disabled')}
                    disabled={notificationMutation.isPending}
                    className="mt-0.5"
                  />
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="font-medium text-text-primary flex items-center gap-2">
                        <BellOff className="w-4 h-4 text-text-tertiary" />
                        Disabled
                      </div>
                      <div className="text-sm text-text-secondary">
                        Don't send notifications (you can still view RSVPs in the dashboard)
                      </div>
                    </div>
                  </div>
                </label>
              </div>

              {notificationMutation.isPending && (
                <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
            </AppCard>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
              <AppButton variant="outline" onClick={downloadICS}>
                <Download className="w-4 h-4 mr-2" />
                Download Calendar (.ics)
              </AppButton>

              {invitation.public_url && (
                <AppButton
                  variant="outline"
                  as="a"
                  href={invitation.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Public Page
                </AppButton>
              )}
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                Preview
              </h2>
              <InvitationPreview
                title={invitation.title}
                description={invitation.description}
                eventType={invitation.event_type}
                eventDatetime={invitation.event_datetime}
                eventEndDatetime={invitation.event_end_datetime}
                timezone={invitation.event_timezone}
                venue={invitation.venue}
                hostNames={invitation.host_names}
                coverImageUrl={invitation.cover_image_url}
                customization={invitation.customization as { colors?: Record<string, string>; fonts?: Record<string, string> }}
                rsvpSettings={invitation.rsvp_settings}
                viewMode={previewMode}
                onViewModeChange={setPreviewMode}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Share Modal (T081-T084) */}
      {showShareModal && invitation.public_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Share Invitation
              </h3>
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => setShowShareModal(false)}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            {/* Share Options */}
            <div className="mb-6">
              <label className="text-sm text-text-secondary mb-3 block">
                Share via
              </label>
              <ShareMenu
                url={invitation.public_url}
                title={invitation.title}
                eventDate={new Date(invitation.event_datetime).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                hostNames={invitation.host_names}
                description={invitation.description}
                venueName={invitation.venue?.name}
                variant="buttons"
                onShare={(platform) => {
                  showToast(`Shared via ${platform}`, 'success');
                }}
              />
            </div>

            {/* URL Copy */}
            <div className="mb-6">
              <label className="text-sm text-text-secondary mb-2 block">
                Public URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={invitation.public_url}
                  readOnly
                  className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary"
                />
                <AppButton variant="outline" onClick={copyUrl}>
                  {copiedUrl ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </AppButton>
              </div>
            </div>

            {/* QR Code */}
            <div className="mb-4">
              <label className="text-sm text-text-secondary mb-2 block">
                QR Code
              </label>
              <div className="aspect-square max-w-[200px] mx-auto bg-surface-hover rounded-lg flex items-center justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invitation.public_url)}`}
                  alt="QR Code"
                  className="w-full h-full"
                />
              </div>
              <p className="text-xs text-text-tertiary text-center mt-2">
                Scan to view invitation
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitationDetailPage;
