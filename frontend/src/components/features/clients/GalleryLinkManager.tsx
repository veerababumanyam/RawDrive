/**
 * GalleryLinkManager Component
 *
 * Manages gallery links for a client.
 * Requirements: 9.1, 9.2 - Display and manage linked galleries
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Image,
  Plus,
  Trash2,
  Link2,
  Eye,
  Heart,
  Check,
  Loader2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { DeleteConfirmationDialog } from '../../ui/DeleteConfirmationDialog';
import { GalleryLinkDialog } from './GalleryLinkDialog';
import { clientService } from '../../../services/clientService';
import type { GalleryLinkDetail, GalleryRole } from '../../../types/client';

/* =============================================================================
   GalleryLinkManager Component
   ============================================================================= */

interface GalleryLinkManagerProps {
  /** Client ID */
  clientId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Initial linked galleries */
  initialGalleries?: GalleryLinkDetail[];
  /** Callback when galleries are updated */
  onGalleriesChange?: (galleries: GalleryLinkDetail[]) => void;
  /** Whether the component is in read-only mode */
  readOnly?: boolean;
}

export const GalleryLinkManager: React.FC<GalleryLinkManagerProps> = ({
  clientId,
  workspaceId,
  initialGalleries = [],
  onGalleriesChange,
  readOnly = false,
}) => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // State
  const [galleries, setGalleries] = useState<GalleryLinkDetail[]>(initialGalleries);
  const [loading, setLoading] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<GalleryLinkDetail | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null);

  // Sync with props
  useEffect(() => {
    setGalleries(initialGalleries);
  }, [initialGalleries]);

  // Refresh galleries from API
  const refreshGalleries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await clientService.getLinkedGalleries(workspaceId, clientId);
      setGalleries(data);
      onGalleriesChange?.(data);
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to load galleries',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, clientId, addToast, onGalleriesChange]);

  // Handle gallery link
  const handleGalleryLinked = useCallback(async () => {
    await refreshGalleries();
    setLinkDialogOpen(false);
    addToast({
      variant: 'success',
      message: 'Gallery linked successfully',
    });
  }, [refreshGalleries, addToast]);

  // Handle unlink
  const handleUnlink = useCallback(async () => {
    if (!selectedGallery) return;

    setIsUnlinking(true);
    try {
      await clientService.unlinkGallery(
        workspaceId,
        clientId,
        selectedGallery.gallery_id
      );
      await refreshGalleries();
      addToast({
        variant: 'success',
        message: 'Gallery unlinked successfully',
      });
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to unlink gallery',
      });
    } finally {
      setIsUnlinking(false);
      setUnlinkDialogOpen(false);
      setSelectedGallery(null);
    }
  }, [workspaceId, clientId, selectedGallery, refreshGalleries, addToast]);

  // Handle role change
  const handleRoleChange = useCallback(
    async (galleryId: string, newRole: GalleryRole) => {
      try {
        await clientService.updateGalleryRole(workspaceId, clientId, galleryId, {
          role: newRole,
        });
        await refreshGalleries();
        addToast({
          variant: 'success',
          message: 'Role updated successfully',
        });
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to update role',
        });
      } finally {
        setRoleMenuOpen(null);
      }
    },
    [workspaceId, clientId, refreshGalleries, addToast]
  );

  // Get role badge variant
  const getRoleBadgeVariant = (role: GalleryRole): 'primary' | 'accent' | 'default' => {
    switch (role) {
      case 'primary':
        return 'primary';
      case 'secondary':
        return 'accent';
      default:
        return 'default';
    }
  };

  // Get status badge
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'published':
        return <AppBadge variant="success" size="sm">Published</AppBadge>;
      case 'draft':
        return <AppBadge variant="warning" size="sm">Draft</AppBadge>;
      case 'archived':
        return <AppBadge variant="default" size="sm">Archived</AppBadge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-text-tertiary" />
          <h3 className="font-semibold text-text-primary">Linked Galleries</h3>
          <AppBadge variant="default" size="sm">
            {galleries.length}
          </AppBadge>
        </div>
        {!readOnly && (
          <AppButton
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setLinkDialogOpen(true)}
          >
            Link Gallery
          </AppButton>
        )}
      </div>

      {/* Gallery List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : galleries.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surface-hover/30">
          <Image size={32} className="text-text-tertiary mx-auto mb-2" />
          <p className="text-text-tertiary text-sm">No galleries linked yet</p>
          {!readOnly && (
            <AppButton
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={14} />}
              className="mt-3"
              onClick={() => setLinkDialogOpen(true)}
            >
              Link Your First Gallery
            </AppButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {galleries.map((gallery) => (
            <div
              key={gallery.link_id}
              className="group p-4 rounded-xl bg-surface-hover/30 hover:bg-surface-hover/50 transition-colors"
            >
              {/* Gallery Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() =>
                      navigate(`/workspace/galleries/${gallery.gallery_id}`)
                    }
                    className="font-medium text-text-primary hover:text-primary transition-colors text-left truncate block w-full"
                  >
                    {gallery.title || 'Untitled Gallery'}
                  </button>
                  {gallery.description && (
                    <p className="text-xs text-text-tertiary truncate mt-0.5">
                      {gallery.description}
                    </p>
                  )}
                </div>
                {getStatusBadge(gallery.status)}
              </div>

              {/* Role Selector */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-text-tertiary">Role:</span>
                {readOnly ? (
                  <AppBadge
                    variant={getRoleBadgeVariant(gallery.role)}
                    size="sm"
                  >
                    {gallery.role}
                  </AppBadge>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() =>
                        setRoleMenuOpen(
                          roleMenuOpen === gallery.link_id
                            ? null
                            : gallery.link_id
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-surface-hover hover:bg-surface-hover/80 transition-colors"
                    >
                      <span className="capitalize">{gallery.role}</span>
                      <ChevronDown size={12} />
                    </button>
                    {roleMenuOpen === gallery.link_id && (
                      <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[120px]">
                        {(['primary', 'secondary', 'guest'] as GalleryRole[]).map(
                          (role) => (
                            <button
                              key={role}
                              onClick={() =>
                                handleRoleChange(gallery.gallery_id, role)
                              }
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors"
                            >
                              {gallery.role === role && (
                                <Check size={14} className="text-primary" />
                              )}
                              <span
                                className={
                                  gallery.role === role
                                    ? 'text-primary font-medium'
                                    : 'text-text-primary'
                                }
                              >
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-text-tertiary mb-3">
                <span className="flex items-center gap-1">
                  <Image size={12} />
                  {gallery.asset_count} photos
                </span>
                <span className="flex items-center gap-1">
                  <Check size={12} />
                  {gallery.picks_count} picks
                </span>
                <span className="flex items-center gap-1">
                  <Heart size={12} />
                  {gallery.favorites_count} favorites
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <AppButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<Eye size={14} />}
                  onClick={() =>
                    navigate(`/workspace/galleries/${gallery.gallery_id}`)
                  }
                >
                  View
                </AppButton>
                {gallery.status === 'published' && (
                  <AppButton
                    variant="ghost"
                    size="sm"
                    leftIcon={<ExternalLink size={14} />}
                    onClick={() =>
                      window.open(`/g/${gallery.gallery_id}`, '_blank')
                    }
                  >
                    Open
                  </AppButton>
                )}
                {!readOnly && (
                  <AppButton
                    variant="ghost"
                    size="sm"
                    className="text-error hover:bg-error/10 ml-auto"
                    leftIcon={<Trash2 size={14} />}
                    onClick={() => {
                      setSelectedGallery(gallery);
                      setUnlinkDialogOpen(true);
                    }}
                  >
                    Unlink
                  </AppButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Gallery Dialog */}
      <GalleryLinkDialog
        isOpen={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        clientId={clientId}
        workspaceId={workspaceId}
        existingGalleryIds={galleries.map((g) => g.gallery_id)}
        onGalleryLinked={handleGalleryLinked}
      />

      {/* Unlink Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={unlinkDialogOpen}
        onClose={() => {
          setUnlinkDialogOpen(false);
          setSelectedGallery(null);
        }}
        onConfirm={handleUnlink}
        deleteType="soft"
        entityType="gallery link"
        entityName={selectedGallery?.title || 'this gallery'}
        isLoading={isUnlinking}
      />
    </div>
  );
};

export default GalleryLinkManager;
