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
import { useClientAvatar } from '../../hooks/useClientAvatar';
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

  // Use the new hook for avatar management
  const { avatarBlobUrl } = useClientAvatar({
    workspaceId: workspace?.workspace_id,
    clientId,
    avatarUrl: client?.avatar_url,
    size: 256
  });

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
      <motion.div variants={staggerItem} className="flex items-center gap-4 card-glass rounded-2xl p-4 backdrop-blur-sm border border-border/20">
        <AppButton
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="flex-shrink-0 hover:bg-surface-hover/80 hover:scale-110 transition-all duration-200"
          aria-label="Back to clients"
          title="Back to clients"
        >
          <ArrowLeft size={20} />
        </AppButton>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gradient truncate">{client.full_name}</h1>
            <StatusBadge status={client.status} />
          </div>
          {client.organization && (
            <p className="text-text-secondary flex items-center gap-2 mt-1">
              <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center">
                <Building2 size={12} className="text-accent" />
              </div>
              {client.organization}
              {client.job_title && ` - ${client.job_title}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="outline"
            onClick={handleEdit}
            leftIcon={<Edit size={18} />}
            className="hover:shadow-md hover:shadow-primary/10 transition-all duration-200"
            title="Edit client"
          >
            Edit
          </AppButton>
          <AppButton
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-error hover:bg-error/10 hover:scale-110 transition-all duration-200"
            title="Delete client"
          >
            <Trash2 size={18} />
          </AppButton>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile & Details */}
        <motion.div variants={staggerItem} className="space-y-6">
          {/* Profile Card - Enhanced with gradient background and glassmorphism */}
          <div className="client-profile-card relative rounded-2xl p-6 backdrop-blur-md border border-white/20 shadow-2xl shadow-primary/10 overflow-hidden group/card transition-all duration-500 hover:shadow-3xl hover:shadow-primary/15">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-surface to-accent/5 opacity-100" />
            <div className="absolute inset-0 bg-gradient-to-tl from-accent/10 via-transparent to-primary/10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />

            {/* Subtle shimmer effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover/card:translate-x-full transition-transform duration-1000 ease-out" />

            <div className="relative flex flex-col items-center text-center">
              {/* Avatar with enhanced ring and glow */}
              <div className="relative mb-4 group/avatar">
                <div className="absolute -inset-2 bg-gradient-to-r from-primary via-accent to-primary rounded-full opacity-30 blur-md group-hover/avatar:opacity-50 transition-opacity duration-300 animate-pulse-slow" />
                {avatarBlobUrl ? (
                  <img
                    src={avatarBlobUrl}
                    alt={client.full_name}
                    className="relative w-32 h-32 rounded-full object-cover ring-4 ring-white/50 group-hover/avatar:ring-white/70 shadow-2xl shadow-primary/20 transition-all duration-300 group-hover/avatar:scale-105"
                  />
                ) : (
                  <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 flex items-center justify-center text-4xl font-bold text-primary ring-4 ring-white/50 group-hover/avatar:ring-white/70 shadow-2xl shadow-primary/20 transition-all duration-300 group-hover/avatar:scale-105">
                    {client.initials || client.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  className="absolute bottom-0 right-0 p-3 rounded-full bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/40 hover:shadow-xl hover:shadow-primary/50 hover:scale-110 active:scale-95 transition-all duration-200 ring-2 ring-white/50"
                  onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=avatar`)}
                  aria-label="Change avatar"
                  title="Change avatar"
                >
                  <Camera size={18} />
                </button>
              </div>

              <h2 className="text-2xl font-bold text-gradient bg-gradient-to-r from-text-primary via-primary to-text-primary bg-clip-text">{client.full_name}</h2>
              {client.nickname && (
                <p className="text-text-secondary text-sm mt-1 italic">"{client.nickname}"</p>
              )}

              {/* Quick Stats with enhanced hover effects */}
              <div className="grid grid-cols-3 gap-3 w-full mt-6 pt-6 border-t border-white/10">
                <div className="stat-card relative p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border border-primary/10 hover:border-primary/30 transition-all duration-300 cursor-default group/stat overflow-hidden">
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/stat:opacity-100 transition-opacity" />
                  <p className="relative text-3xl font-bold text-primary group-hover/stat:scale-110 transition-transform duration-300">{client.stats?.linked_galleries_count || 0}</p>
                  <p className="relative text-xs text-text-secondary font-semibold uppercase tracking-wide mt-1">Galleries</p>
                </div>
                <div className="stat-card relative p-4 rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 hover:from-accent/20 hover:to-accent/10 border border-accent/10 hover:border-accent/30 transition-all duration-300 cursor-default group/stat overflow-hidden">
                  <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover/stat:opacity-100 transition-opacity" />
                  <p className="relative text-3xl font-bold text-accent group-hover/stat:scale-110 transition-transform duration-300">{client.stats?.referrals_count || 0}</p>
                  <p className="relative text-xs text-text-secondary font-semibold uppercase tracking-wide mt-1">Referrals</p>
                </div>
                <div className="stat-card relative p-4 rounded-xl bg-gradient-to-br from-success/10 to-success/5 hover:from-success/20 hover:to-success/10 border border-success/10 hover:border-success/30 transition-all duration-300 cursor-default group/stat overflow-hidden">
                  <div className="absolute inset-0 bg-success/5 opacity-0 group-hover/stat:opacity-100 transition-opacity" />
                  <p className="relative text-3xl font-bold text-success group-hover/stat:scale-110 transition-transform duration-300">{client.stats?.activities_count || 0}</p>
                  <p className="relative text-xs text-text-secondary font-semibold uppercase tracking-wide mt-1">Activities</p>
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
                <p className="text-text-tertiary text-sm text-center py-4">No contacts added</p>
              ) : (
                client.contacts.map((contact) => (
                  <div
                    key={contact.contact_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover/30 hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 border border-transparent hover:border-border/30 transition-all duration-200 group"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 group-hover:scale-110 ${
                      contact.contact_type === 'email' ? 'bg-primary/10' :
                      contact.contact_type === 'phone' ? 'bg-success/10' :
                      contact.contact_type === 'website' ? 'bg-accent/10' : 'bg-info/10'
                    }`}>
                      {contact.contact_type === 'email' && <Mail size={16} className="text-primary" />}
                      {contact.contact_type === 'phone' && <Phone size={16} className="text-success" />}
                      {contact.contact_type === 'website' && <Globe size={16} className="text-accent" />}
                      {contact.contact_type === 'social' && <Users size={16} className="text-info" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate group-hover:text-primary transition-colors">{contact.value}</p>
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
                className="w-full hover:bg-primary/10 hover:text-primary transition-all"
                onClick={() => navigate(`/workspace/clients/${clientId}/edit?tab=contacts`)}
                title="Add new contact"
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

          {/* Additional Details - Enhanced with gradient and glassmorphism */}
          <div className="relative rounded-2xl p-6 space-y-4 backdrop-blur-md border border-white/20 shadow-xl shadow-primary/5 overflow-hidden group/dates">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface to-accent/5" />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 opacity-0 group-hover/dates:opacity-100 transition-opacity duration-500" />

            <h3 className="relative font-semibold text-text-primary flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center shadow-sm">
                <Calendar size={18} className="text-primary" />
              </div>
              <span className="text-lg">Important Dates</span>
            </h3>
            <div className="relative space-y-2">
              {client.date_of_birth && (
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-200 group/item">
                  <span className="text-sm text-text-secondary flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-200">
                      <Gift size={16} className="text-pink-500" />
                    </div>
                    Birthday
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {formatDate(client.date_of_birth)}
                    {client.age && <span className="text-text-tertiary ml-1">({client.age} years)</span>}
                  </span>
                </div>
              )}
              {client.anniversary_date && (
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-200 group/item">
                  <span className="text-sm text-text-secondary flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-200">
                      <Calendar size={16} className="text-rose-500" />
                    </div>
                    Anniversary
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {formatDate(client.anniversary_date)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-200 group/item">
                <span className="text-sm text-text-secondary flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-200">
                    <Clock size={16} className="text-primary" />
                  </div>
                  Client Since
                </span>
                <span className="text-sm font-medium text-text-primary">{formatDate(client.created_at)}</span>
              </div>
              {client.timezone && (
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-200 group/item">
                  <span className="text-sm text-text-secondary flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-200">
                      <Globe size={16} className="text-accent" />
                    </div>
                    Timezone
                  </span>
                  <span className="text-sm font-medium text-text-primary">{client.timezone}</span>
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
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Image size={32} className="text-primary/50" />
                </div>
                <p className="text-text-tertiary font-medium">No galleries linked yet</p>
                <p className="text-text-tertiary/70 text-sm mt-1">Link galleries to track client projects</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {galleries.map((gallery) => (
                  <div
                    key={gallery.link_id}
                    className="gallery-link-card relative p-5 rounded-xl overflow-hidden cursor-pointer group/gallery border border-border/20 hover:border-primary/30 shadow-sm hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
                    onClick={() => navigate(`/workspace/galleries/${gallery.gallery_id}`)}
                  >
                    {/* Gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-surface-hover/50 to-surface" />
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover/gallery:opacity-100 transition-opacity duration-300" />

                    {/* Shimmer on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover/gallery:translate-x-full transition-transform duration-700 ease-out" />

                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-text-primary group-hover/gallery:text-primary transition-colors truncate">
                            {gallery.title || 'Untitled Gallery'}
                          </h4>
                          <p className="text-xs text-text-tertiary capitalize mt-0.5 flex items-center gap-1">
                            <Users size={10} />
                            {gallery.role} client
                          </p>
                        </div>
                        <AppBadge
                          variant={gallery.status === 'published' ? 'success' : 'default'}
                          size="sm"
                          className="group-hover/gallery:scale-105 transition-transform"
                        >
                          {gallery.status}
                        </AppBadge>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                          <Image size={12} />
                          {gallery.asset_count}
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent font-medium">
                          {gallery.picks_count} picks
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-pink-500/10 text-pink-500 font-medium">
                          {gallery.favorites_count} fav
                        </span>
                      </div>
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
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/10 to-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Activity size={32} className="text-accent/50" />
                </div>
                <p className="text-text-tertiary font-medium">No activities recorded yet</p>
                <p className="text-text-tertiary/70 text-sm mt-1">Activities will appear as you interact</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.activity_id}
                    className="activity-item flex gap-4 p-3 rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 border border-transparent hover:border-border/20 transition-all duration-200 group/activity"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center shadow-sm group-hover/activity:shadow-md group-hover/activity:scale-110 transition-all duration-200">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium group-hover/activity:text-primary transition-colors">
                        {activity.description || activity.activity_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-text-tertiary mt-1 flex items-center gap-1">
                        <Clock size={10} />
                        {formatDateTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {activities.length >= 10 && (
                  <AppButton variant="ghost" size="sm" className="w-full hover:bg-primary/10 hover:text-primary mt-2">
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
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-info/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare size={32} className="text-primary/50" />
                </div>
                <p className="text-text-tertiary font-medium">No communications logged yet</p>
                <p className="text-text-tertiary/70 text-sm mt-1">Log emails, calls, and messages here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {communications.map((comm) => (
                  <div
                    key={comm.communication_id}
                    className="communication-item relative p-4 rounded-xl overflow-hidden border border-border/20 hover:border-primary/30 shadow-sm hover:shadow-md transition-all duration-200 group/comm"
                  >
                    {/* Background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-surface-hover/30 to-surface" />
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 opacity-0 group-hover/comm:opacity-100 transition-opacity duration-300" />

                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm group-hover/comm:scale-110 transition-transform ${
                            comm.communication_type === 'email' ? 'bg-primary/10' :
                            comm.communication_type === 'phone' ? 'bg-success/10' :
                            'bg-accent/10'
                          }`}>
                            {getCommunicationIcon(comm.communication_type)}
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-text-primary capitalize group-hover/comm:text-primary transition-colors">
                              {comm.communication_type}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                comm.direction === 'outbound'
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-accent/10 text-accent'
                              }`}>
                                {comm.direction}
                              </span>
                            </div>
                          </div>
                        </div>
                        {comm.follow_up_required && (
                          <div className="px-2.5 py-1 rounded-full bg-warning/15 text-warning text-xs font-semibold flex items-center gap-1 animate-pulse-slow">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                            Follow-up needed
                          </div>
                        )}
                      </div>
                      {comm.subject && (
                        <p className="text-sm font-medium text-text-primary mb-2">{comm.subject}</p>
                      )}
                      {comm.notes && (
                        <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">{comm.notes}</p>
                      )}
                      <div className="flex items-center flex-wrap gap-3 mt-3 pt-3 border-t border-border/10">
                        <span className="text-xs text-text-tertiary flex items-center gap-1">
                          <Clock size={10} />
                          {formatDateTime(comm.created_at)}
                        </span>
                        {comm.duration_minutes && (
                          <span className="text-xs text-text-tertiary px-2 py-0.5 rounded bg-surface-hover/50">
                            {comm.duration_minutes} min
                          </span>
                        )}
                        {comm.follow_up_date && (
                          <span className="text-xs text-warning flex items-center gap-1">
                            <Calendar size={10} />
                            Follow-up: {formatDate(comm.follow_up_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {communications.length >= 10 && (
                  <AppButton variant="ghost" size="sm" className="w-full hover:bg-primary/10 hover:text-primary mt-2">
                    View All Communications
                  </AppButton>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Internal Notes - Enhanced with gradient */}
          {client.internal_notes && (
            <div className="relative rounded-2xl p-6 backdrop-blur-md border border-white/20 shadow-lg shadow-info/5 overflow-hidden group/notes">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-info/5 via-surface to-primary/5" />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-info/10 opacity-0 group-hover/notes:opacity-100 transition-opacity duration-500" />

              <h3 className="relative font-semibold text-text-primary flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-info/15 to-primary/15 flex items-center justify-center shadow-sm">
                  <MessageSquare size={18} className="text-info" />
                </div>
                <span className="text-lg">Internal Notes</span>
              </h3>
              <div className="relative p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {client.internal_notes}
                </p>
              </div>
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
    <div className="collapsible-section relative rounded-2xl overflow-hidden backdrop-blur-md border border-white/20 shadow-lg shadow-primary/5 group/section">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface to-primary/3" />
      <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-primary/5 opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />

      <div
        onClick={onToggle}
        className="relative w-full flex items-center justify-between p-5 hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-300 cursor-pointer group/header"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center shadow-sm group-hover/header:shadow-md group-hover/header:scale-110 transition-all duration-300">
            <span className="text-primary">{icon}</span>
          </div>
          <span className="font-semibold text-lg text-text-primary group-hover/header:text-primary transition-colors duration-200">{title}</span>
          {count !== undefined && (
            <div className="px-2.5 py-1 rounded-full bg-gradient-to-r from-primary/15 to-accent/15 text-primary text-xs font-bold group-hover/header:scale-110 transition-transform shadow-sm">
              {count}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {action && expanded && (
            <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover/section:opacity-100 transition-opacity duration-300">{action}</div>
          )}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${expanded ? 'bg-gradient-to-br from-primary/15 to-accent/15 rotate-180 shadow-sm' : 'hover:bg-surface-hover/50'}`}>
            <ChevronDown size={18} className={`transition-colors duration-200 ${expanded ? 'text-primary' : 'text-text-tertiary'}`} />
          </div>
        </div>
      </div>
      <div className={`relative transition-all duration-300 ease-out ${expanded ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0 overflow-hidden'}`}>
        {expanded && (
          <div className="px-5 pb-5 pt-3 border-t border-white/10">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientDetailPage;
