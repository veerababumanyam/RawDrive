/**
 * ClientMergeDialog Component
 *
 * Dialog for merging duplicate clients.
 * Requirements: 23.3, 23.4 - Select primary client, preview merge result
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  X,
  Users,
  Loader2,
  Check,
  AlertTriangle,
  Mail,
  MapPin,
  Tag,
  Image,
  Calendar,
  Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import { useClientAvatar } from '../../../hooks/useClientAvatar';
import type { ClientDetail } from '../../../types/client';

/* =============================================================================
   ClientMergeDialog Component
   ============================================================================= */

interface ClientMergeDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** First client (source) */
  sourceClient: ClientDetail;
  /** Second client (target) */
  targetClient: ClientDetail;
  /** Callback when merge is successful */
  onMerged?: (mergedClientId: string) => void;
}

export const ClientMergeDialog: React.FC<ClientMergeDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  sourceClient,
  targetClient,
  onMerged,
}) => {
  const { addToast } = useToast();

  // Fetch authenticated avatar URLs for both clients
  const { avatarBlobUrl: sourceAvatarUrl } = useClientAvatar({
    workspaceId,
    clientId: sourceClient.client_id,
    avatarUrl: sourceClient.avatar_url,
    size: 64,
  });
  const { avatarBlobUrl: targetAvatarUrl } = useClientAvatar({
    workspaceId,
    clientId: targetClient.client_id,
    avatarUrl: targetClient.avatar_url,
    size: 64,
  });

  // State
  const [primaryClientId, setPrimaryClientId] = useState<string>(targetClient.client_id);
  const [isMerging, setIsMerging] = useState(false);

  // Derived values
  const primaryClient = primaryClientId === sourceClient.client_id ? sourceClient : targetClient;
  const secondaryClient = primaryClientId === sourceClient.client_id ? targetClient : sourceClient;

  // Calculate merge preview
  const mergePreview = useMemo(() => {
    return {
      name: primaryClient.full_name,
      organization: primaryClient.organization || secondaryClient.organization,
      contacts: [
        ...(primaryClient.contacts || []),
        ...(secondaryClient.contacts || []).filter(
          (c) =>
            !(primaryClient.contacts || []).some(
              (pc) => pc.value === c.value && pc.contact_type === c.contact_type
            )
        ),
      ],
      addresses: [
        ...(primaryClient.addresses || []),
        ...(secondaryClient.addresses || []).filter(
          (a) =>
            !(primaryClient.addresses || []).some(
              (pa) =>
                pa.address_line1 === a.address_line1 &&
                pa.city === a.city
            )
        ),
      ],
      tags: [
        ...(primaryClient.tags || []),
        ...(secondaryClient.tags || []).filter(
          (t) => !(primaryClient.tags || []).some((pt) => pt.tag_id === t.tag_id)
        ),
      ],
      galleries: [
        ...(primaryClient.linked_galleries || []),
        ...(secondaryClient.linked_galleries || []).filter(
          (g) =>
            !(primaryClient.linked_galleries || []).some(
              (pg) => pg.gallery_id === g.gallery_id
            )
        ),
      ],
    };
  }, [primaryClient, secondaryClient]);

  // Handle merge
  const handleMerge = useCallback(async () => {
    setIsMerging(true);
    try {
      const result = await clientService.mergeClients(workspaceId, {
        primary_client_id: primaryClientId,
        duplicate_client_id:
          primaryClientId === sourceClient.client_id
            ? targetClient.client_id
            : sourceClient.client_id,
      });
      addToast({
        variant: 'success',
        message: `Clients merged successfully. ${result.galleries_merged} galleries and ${result.activities_merged} activities transferred.`,
      });
      onMerged?.(result.client_id);
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to merge clients',
      });
    } finally {
      setIsMerging(false);
    }
  }, [workspaceId, primaryClientId, sourceClient, targetClient, addToast, onMerged]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Dialog */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="merge-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Merge Clients
                </h2>
                <p className="text-sm text-text-secondary">
                  Combine two client records into one
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close dialog"
            >
              <X size={20} className="text-text-tertiary" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle size={18} className="text-warning mt-0.5" />
              <div className="text-sm text-text-secondary">
                <p className="font-medium text-warning mb-1">
                  This action cannot be undone
                </p>
                <p>
                  The secondary client will be deleted and all their data
                  (galleries, activities, communications) will be transferred to
                  the primary client.
                </p>
              </div>
            </div>

            {/* Client Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-text-primary">
                Select Primary Client
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Client */}
                <ClientSelectionCard
                  client={sourceClient}
                  isSelected={primaryClientId === sourceClient.client_id}
                  onSelect={() => setPrimaryClientId(sourceClient.client_id)}
                  label="Keep as primary"
                  avatarBlobUrl={sourceAvatarUrl}
                />

                {/* Target Client */}
                <ClientSelectionCard
                  client={targetClient}
                  isSelected={primaryClientId === targetClient.client_id}
                  onSelect={() => setPrimaryClientId(targetClient.client_id)}
                  label="Keep as primary"
                  avatarBlobUrl={targetAvatarUrl}
                />
              </div>
            </div>

            {/* Merge Preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-text-primary">
                Merge Preview
              </h3>
              <div className="p-4 rounded-xl bg-surface-hover/50 space-y-4">
                {/* Name & Organization */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {mergePreview.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">
                      {mergePreview.name}
                    </p>
                    {mergePreview.organization && (
                      <p className="text-sm text-text-secondary flex items-center gap-1">
                        <Building2 size={14} />
                        {mergePreview.organization}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MergePreviewStat
                    icon={<Mail size={14} />}
                    label="Contacts"
                    count={mergePreview.contacts.length}
                    color="primary"
                  />
                  <MergePreviewStat
                    icon={<MapPin size={14} />}
                    label="Addresses"
                    count={mergePreview.addresses.length}
                    color="accent"
                  />
                  <MergePreviewStat
                    icon={<Tag size={14} />}
                    label="Tags"
                    count={mergePreview.tags.length}
                    color="success"
                  />
                  <MergePreviewStat
                    icon={<Image size={14} />}
                    label="Galleries"
                    count={mergePreview.galleries.length}
                    color="info"
                  />
                </div>

                {/* What will be merged */}
                <div className="text-sm text-text-secondary space-y-1">
                  <p className="font-medium text-text-primary mb-2">
                    What will be merged:
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>All contacts from both clients</li>
                    <li>All addresses from both clients</li>
                    <li>All tags from both clients</li>
                    <li>All linked galleries from both clients</li>
                    <li>All activities and communication history</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface flex-shrink-0">
            <AppButton variant="outline" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleMerge}
              disabled={isMerging}
              leftIcon={
                isMerging ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Users size={16} />
                )
              }
            >
              {isMerging ? 'Merging...' : 'Merge Clients'}
            </AppButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/* =============================================================================
   ClientSelectionCard Component
   ============================================================================= */

interface ClientSelectionCardProps {
  client: ClientDetail;
  isSelected: boolean;
  onSelect: () => void;
  label: string;
  avatarBlobUrl: string | null;
}

const ClientSelectionCard: React.FC<ClientSelectionCardProps> = ({
  client,
  isSelected,
  onSelect,
  label,
  avatarBlobUrl,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-xl text-left transition-all ${isSelected
        ? 'bg-primary/10 border-2 border-primary'
        : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
        }`}
    >
      <div className="flex items-start gap-3">
        {/* Selection Indicator */}
        <div
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected
            ? 'border-primary bg-primary text-white'
            : 'border-text-tertiary'
            }`}
        >
          {isSelected && <Check size={12} />}
        </div>

        {/* Client Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {avatarBlobUrl ? (
              <img
                src={avatarBlobUrl}
                alt={client.full_name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                {client.initials || client.full_name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-text-primary truncate">
                {client.full_name}
              </p>
              <p className="text-xs text-text-tertiary">
                {label}
              </p>
            </div>
          </div>

          <div className="space-y-1 text-xs text-text-secondary mt-2">
            {client.primary_email && (
              <p className="flex items-center gap-1 truncate">
                <Mail size={12} />
                {client.primary_email}
              </p>
            )}
            {client.organization && (
              <p className="flex items-center gap-1 truncate">
                <Building2 size={12} />
                {client.organization}
              </p>
            )}
            <p className="flex items-center gap-1">
              <Calendar size={12} />
              Created {new Date(client.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
            <span>{(client.contacts || []).length} contacts</span>
            <span>{(client.linked_galleries || []).length} galleries</span>
            <span>{(client.tags || []).length} tags</span>
          </div>
        </div>
      </div>
    </button>
  );
};

/* =============================================================================
   MergePreviewStat Component
   ============================================================================= */

interface MergePreviewStatProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'primary' | 'accent' | 'success' | 'info';
}

const MergePreviewStat: React.FC<MergePreviewStatProps> = ({
  icon,
  label,
  count,
  color,
}) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-surface">
      <div className={`p-1.5 rounded-md ${colorClasses[color]}`}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-text-primary">{count}</p>
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
};

export default ClientMergeDialog;
