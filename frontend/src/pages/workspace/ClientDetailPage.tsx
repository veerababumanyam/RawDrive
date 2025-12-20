import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  Globe,
  Building2,
  MapPin,
  Calendar,
  Clock,
  Tag,
  Image,
  MessageSquare,
  Activity,
  Users,
  Gift,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Camera,
  Link2,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppBadge, StatusBadge } from '../../components/ui/AppBadge';
import { useToast } from '../../components/ui/Toast';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { clientService } from '../../services/clientService';
import type {
  ClientDetail,
  ClientActivity,
  ClientCommunication,
  GalleryLinkDetail,
} from '../../types/client';

/* =============================================================================
   ClientDetailPage Component

   Detailed client view with all related information organized in sections.
   ============================================================================= */

const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();

  // Data state
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [communications, setCommunications] = useState<ClientCommunication[]>([]);
  const [galleries, setGalleries] = useState<GalleryLinkDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // UI state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    contacts: true,
    galleries: true,
    activity: false,
    communications: false,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch client data
  const fetchClient = useCallback(async () => {
    if (!workspace?.workspace_id || !clientId) return;

    setLoading(true);
    setError(null);

    try {
      const clientData = await clientService.getClient(workspace.workspace_id, clientId);
      setClient(clientData);

      // Fetch related data in parallel
      const [activitiesData, communicationsData, galleriesData] = await Promise.all([
        clientService.getActivities(workspace.workspace_id, clientId, { limit: 10 }),
        clientService.getCommunications(workspace.workspace_id, clientId, { limit: 10 }),
        clientService.getLinkedGalleries(workspace.workspace_id, clientId),
      ]);

      setActivities(activitiesData.activities);
      setCommunications(communicationsData.communications);
      setGalleries(galleriesData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch client'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.workspace_id, clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  // Handlers
  const handleBack = () => navigate('/workspace/clients');
  const handleEdit = () => navigate(`/workspace/clients/${clientId}/edit`);

  const handleDelete = async () => {
    if (!workspace?.workspace_id || !clientId) return;

    setIsDeleting(true);
    try {
      await clientService.deleteClient(workspace.workspace_id, clientId);
      addToast({ variant: 'success', message: 'Client deleted successfully' });
      navigate('/workspace/clients');
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete client',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'gallery_linked':
        return <Link2 size={14} className="text-primary" />;
      case 'communication':
        return <MessageSquare size={14} className="text-accent" />;
      case 'note':
        return <MessageSquare size={14} className="text-info" />;
      case 'contact_added':
        return <Phone size={14} className="text-success" />;
      default:
        return <Activity size={14} className="text-text-tertiary" />;
    }
  };

  const getCommunicationIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail size={14} className="text-primary" />;
      case 'phone':
        return <Phone size={14} className="text-success" />;
      case 'whatsapp':
        return <MessageSquare size={14} className="text-green-500" />;
      case 'sms':
        return <MessageSquare size={14} className="text-blue-500" />;
      default:
        return <MessageSquare size={14} className="text-text-tertiary" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="text-center py-32">
        <p className="text-error mb-4">{error?.message || 'Client not found'}</p>
        <AppButton onClick={handleBack} variant="outline" leftIcon={<ArrowLeft size={18} />}>
          Back to Clients
        </AppButton>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="flex items-center gap-4">
        <AppButton
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="flex-shrink-0"
          aria-label="Back to clients"
        >
          <ArrowLeft size={20} />
        </AppButton>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary truncate">{client.full_name}</h1>
            <StatusBadge status={client.status} />
          </div>
          {client.organization && (
            <p className="text-text-secondary flex items-center gap-1 mt-1">
              <Building2 size={14} />
              {client.organization}
              {client.job_title && ` - ${client.job_title}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AppButton variant="outline" onClick={handleEdit} leftIcon={<Edit size={18} />}>
            Edit
          </AppButton>
          <AppButton
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-error hover:bg-error/10"
          >
            <Trash2 size={18} />
          </AppButton>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile & Details */}
        <motion.div variants={staggerItem} className="space-y-6">
          {/* Profile Card */}
          <div className="card-glass rounded-2xl p-6">
            <div className="flex flex-col items-center text-center">
              {/* Avatar */}
              <div className="relative mb-4">
                {client.avatar_url ? (
                  <img
                    src={client.avatar_url}
                    alt={client.full_name}
                    className="w-24 h-24 rounded-full object-cover ring-4 ring-primary/20"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-3xl font-bold text-primary ring-4 ring-primary/10">
                    {client.initials || client.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-white shadow-lg hover:bg-primary-600 transition-colors"
                  onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=avatar`)}
                  aria-label="Change avatar"
                >
                  <Camera size={14} />
                </button>
              </div>

              <h2 className="text-xl font-semibold text-text-primary">{client.full_name}</h2>
              {client.nickname && (
                <p className="text-text-tertiary text-sm">"{client.nickname}"</p>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 w-full mt-6 pt-6 border-t border-white/10">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{client.stats?.linked_galleries_count || 0}</p>
                  <p className="text-xs text-text-tertiary">Galleries</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-accent">{client.stats?.referrals_count || 0}</p>
                  <p className="text-xs text-text-tertiary">Referrals</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-success">{client.stats?.activities_count || 0}</p>
                  <p className="text-xs text-text-tertiary">Activities</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <CollapsibleSection
            title="Contact Information"
            icon={<Phone size={18} />}
            expanded={expandedSections.contacts}
            onToggle={() => toggleSection('contacts')}
            count={client.contacts.length}
          >
            <div className="space-y-3">
              {client.contacts.length === 0 ? (
                <p className="text-text-tertiary text-sm">No contacts added</p>
              ) : (
                client.contacts.map((contact) => (
                  <div
                    key={contact.contact_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover/30 hover:bg-surface-hover/50 transition-colors"
                  >
                    {contact.contact_type === 'email' && <Mail size={16} className="text-primary" />}
                    {contact.contact_type === 'phone' && <Phone size={16} className="text-success" />}
                    {contact.contact_type === 'website' && <Globe size={16} className="text-accent" />}
                    {contact.contact_type === 'social' && <Users size={16} className="text-info" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{contact.value}</p>
                      <p className="text-xs text-text-tertiary capitalize">
                        {contact.contact_subtype || contact.contact_type}
                        {contact.is_primary && ' (Primary)'}
                      </p>
                    </div>
                    {contact.verified && (
                      <AppBadge variant="success" size="sm">Verified</AppBadge>
                    )}
                  </div>
                ))
              )}
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                className="w-full"
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=contacts`)}
              >
                Add Contact
              </AppButton>
            </div>
          </CollapsibleSection>

          {/* Addresses */}
          <CollapsibleSection
            title="Addresses"
            icon={<MapPin size={18} />}
            expanded={expandedSections.addresses}
            onToggle={() => toggleSection('addresses')}
            count={client.addresses.length}
          >
            <div className="space-y-3">
              {client.addresses.length === 0 ? (
                <p className="text-text-tertiary text-sm">No addresses added</p>
              ) : (
                client.addresses.map((address) => (
                  <div
                    key={address.address_id}
                    className="p-3 rounded-xl bg-surface-hover/30"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AppBadge variant="outline" size="sm">
                        {address.address_type}
                      </AppBadge>
                      {address.is_primary && (
                        <AppBadge variant="primary" size="sm">Primary</AppBadge>
                      )}
                    </div>
                    <p className="text-sm text-text-primary">
                      {[address.address_line1, address.address_line2].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {[address.city, address.state, address.postal_code].filter(Boolean).join(', ')}
                    </p>
                    {address.country && (
                      <p className="text-sm text-text-tertiary">{address.country}</p>
                    )}
                  </div>
                ))
              )}
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                className="w-full"
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=addresses`)}
              >
                Add Address
              </AppButton>
            </div>
          </CollapsibleSection>

          {/* Tags */}
          <CollapsibleSection
            title="Tags"
            icon={<Tag size={18} />}
            expanded={expandedSections.tags}
            onToggle={() => toggleSection('tags')}
            count={client.tags.length}
          >
            <div className="flex flex-wrap gap-2">
              {client.tags.length === 0 ? (
                <p className="text-text-tertiary text-sm">No tags added</p>
              ) : (
                client.tags.map((tag) => (
                  <AppBadge
                    key={tag.tag_id}
                    variant="outline"
                    icon={
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color || '#6B7280' }}
                      />
                    }
                  >
                    {tag.name}
                  </AppBadge>
                ))
              )}
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=tags`)}
              >
                Add Tag
              </AppButton>
            </div>
          </CollapsibleSection>

          {/* Additional Details */}
          <div className="card-glass rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <Calendar size={18} />
              Important Dates
            </h3>
            <div className="space-y-3">
              {client.date_of_birth && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <Gift size={14} />
                    Birthday
                  </span>
                  <span className="text-sm text-text-primary">
                    {formatDate(client.date_of_birth)}
                    {client.age && ` (${client.age} years)`}
                  </span>
                </div>
              )}
              {client.anniversary_date && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <Calendar size={14} />
                    Anniversary
                  </span>
                  <span className="text-sm text-text-primary">
                    {formatDate(client.anniversary_date)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary flex items-center gap-2">
                  <Clock size={14} />
                  Client Since
                </span>
                <span className="text-sm text-text-primary">{formatDate(client.created_at)}</span>
              </div>
              {client.timezone && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <Globe size={14} />
                    Timezone
                  </span>
                  <span className="text-sm text-text-primary">{client.timezone}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Right Column - Galleries, Activity, Communications */}
        <motion.div variants={staggerItem} className="lg:col-span-2 space-y-6">
          {/* Linked Galleries */}
          <CollapsibleSection
            title="Linked Galleries"
            icon={<Image size={18} />}
            expanded={expandedSections.galleries}
            onToggle={() => toggleSection('galleries')}
            count={galleries.length}
            action={
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=galleries`)}
              >
                Link Gallery
              </AppButton>
            }
          >
            {galleries.length === 0 ? (
              <div className="text-center py-8">
                <Image size={32} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-text-tertiary">No galleries linked yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {galleries.map((gallery) => (
                  <div
                    key={gallery.link_id}
                    className="p-4 rounded-xl bg-surface-hover/30 hover:bg-surface-hover/50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/workspace/galleries/${gallery.gallery_id}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-text-primary group-hover:text-primary transition-colors">
                          {gallery.title || 'Untitled Gallery'}
                        </h4>
                        <p className="text-xs text-text-tertiary capitalize">{gallery.role} client</p>
                      </div>
                      <AppBadge variant={gallery.status === 'published' ? 'success' : 'default'} size="sm">
                        {gallery.status}
                      </AppBadge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-tertiary">
                      <span>{gallery.asset_count} photos</span>
                      <span>{gallery.picks_count} picks</span>
                      <span>{gallery.favorites_count} favorites</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Activity Timeline */}
          <CollapsibleSection
            title="Activity Timeline"
            icon={<Activity size={18} />}
            expanded={expandedSections.activity}
            onToggle={() => toggleSection('activity')}
            count={activities.length}
            action={
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=activity`)}
              >
                Add Note
              </AppButton>
            }
          >
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <Activity size={32} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-text-tertiary">No activities recorded yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.activity_id} className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-hover/50 flex items-center justify-center">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        {activity.description || activity.activity_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-text-tertiary">{formatDateTime(activity.created_at)}</p>
                    </div>
                  </div>
                ))}
                {activities.length >= 10 && (
                  <AppButton variant="ghost" size="sm" className="w-full">
                    View All Activities
                  </AppButton>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Communications */}
          <CollapsibleSection
            title="Communication History"
            icon={<MessageSquare size={18} />}
            expanded={expandedSections.communications}
            onToggle={() => toggleSection('communications')}
            count={communications.length}
            action={
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=communications`)}
              >
                Log Communication
              </AppButton>
            }
          >
            {communications.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare size={32} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-text-tertiary">No communications logged yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {communications.map((comm) => (
                  <div
                    key={comm.communication_id}
                    className="p-4 rounded-xl bg-surface-hover/30"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getCommunicationIcon(comm.communication_type)}
                        <span className="text-sm font-medium text-text-primary capitalize">
                          {comm.communication_type}
                        </span>
                        <AppBadge
                          variant={comm.direction === 'outbound' ? 'primary' : 'accent'}
                          size="sm"
                        >
                          {comm.direction}
                        </AppBadge>
                      </div>
                      {comm.follow_up_required && (
                        <AppBadge variant="warning" size="sm" dot>
                          Follow-up needed
                        </AppBadge>
                      )}
                    </div>
                    {comm.subject && (
                      <p className="text-sm font-medium text-text-primary mb-1">{comm.subject}</p>
                    )}
                    {comm.notes && (
                      <p className="text-sm text-text-secondary line-clamp-2">{comm.notes}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                      <span>{formatDateTime(comm.created_at)}</span>
                      {comm.duration_minutes && <span>{comm.duration_minutes} min</span>}
                      {comm.follow_up_date && (
                        <span>Follow-up: {formatDate(comm.follow_up_date)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {communications.length >= 10 && (
                  <AppButton variant="ghost" size="sm" className="w-full">
                    View All Communications
                  </AppButton>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Internal Notes */}
          {client.internal_notes && (
            <div className="card-glass rounded-2xl p-6">
              <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
                <MessageSquare size={18} />
                Internal Notes
              </h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {client.internal_notes}
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        deleteType="hard"
        entityType="client"
        entityName={client.full_name}
        isLoading={isDeleting}
      />
    </motion.div>
  );
};

/* =============================================================================
   Collapsible Section Component
   ============================================================================= */

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  expanded,
  onToggle,
  count,
  action,
  children,
}) => {
  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-hover/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">{icon}</span>
          <span className="font-semibold text-text-primary">{title}</span>
          {count !== undefined && (
            <AppBadge variant="default" size="sm">
              {count}
            </AppBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action && expanded && (
            <div onClick={(e) => e.stopPropagation()}>{action}</div>
          )}
          {expanded ? (
            <ChevronUp size={18} className="text-text-tertiary" />
          ) : (
            <ChevronDown size={18} className="text-text-tertiary" />
          )}
        </div>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

export default ClientDetailPage;
