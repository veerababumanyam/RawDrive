/**
 * GalleryLinkDialog Component
 *
 * Dialog for linking a gallery to a client.
 * Requirements: 9.1, 9.5, 9.6 - Select gallery and role
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  Image,
  Loader2,
  Link2,
  Check,
  Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import galleryService from '../../../services/galleryService';
import type { GalleryListItem } from '../../../types/gallery';
import type { GalleryRole } from '../../../types/client';

/* =============================================================================
   GalleryLinkDialog Component
   ============================================================================= */

interface GalleryLinkDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Client ID to link gallery to */
  clientId: string;
  /** Workspace ID */
  workspaceId: string;
  /** IDs of galleries already linked (to exclude) */
  existingGalleryIds?: string[];
  /** Callback when gallery is successfully linked */
  onGalleryLinked?: () => void;
}

const roles: { value: GalleryRole; label: string; description: string }[] = [
  {
    value: 'primary',
    label: 'Primary',
    description: 'Main client for this gallery',
  },
  {
    value: 'secondary',
    label: 'Secondary',
    description: 'Additional client (e.g., spouse, family member)',
  },
  {
    value: 'guest',
    label: 'Guest',
    description: 'Guest with limited access',
  },
];

export const GalleryLinkDialog: React.FC<GalleryLinkDialogProps> = ({
  isOpen,
  onClose,
  clientId,
  workspaceId,
  existingGalleryIds = [],
  onGalleryLinked,
}) => {
  const { addToast } = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<GalleryListItem | null>(
    null
  );
  const [selectedRole, setSelectedRole] = useState<GalleryRole>('primary');
  const [isLinking, setIsLinking] = useState(false);

  // Fetch galleries
  const fetchGalleries = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const response = await galleryService.listGalleries(workspaceId, {
        limit: 50,
        sort: 'created_at',
      });
      // Filter out already linked galleries
      const availableGalleries = response.data.filter(
        (g) => !existingGalleryIds.includes(g.gallery_id)
      );
      setGalleries(availableGalleries);
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to load galleries',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, existingGalleryIds, addToast]);

  // Load galleries when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchGalleries();
      setSearchQuery('');
      setSelectedGallery(null);
      setSelectedRole('primary');
    }
  }, [isOpen, fetchGalleries]);

  // Filter galleries by search
  const filteredGalleries = galleries.filter((gallery) => {
    const query = searchQuery.toLowerCase();
    return (
      gallery.title.toLowerCase().includes(query) ||
      gallery.client_name?.toLowerCase().includes(query) ||
      gallery.description?.toLowerCase().includes(query)
    );
  });

  // Handle link
  const handleLink = async () => {
    if (!selectedGallery) return;

    setIsLinking(true);
    try {
      await clientService.linkGallery(workspaceId, clientId, {
        gallery_id: selectedGallery.gallery_id,
        role: selectedRole,
      });
      onGalleryLinked?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to link gallery',
      });
    } finally {
      setIsLinking(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return (
          <AppBadge variant="success" size="sm">
            Published
          </AppBadge>
        );
      case 'draft':
        return (
          <AppBadge variant="warning" size="sm">
            Draft
          </AppBadge>
        );
      case 'archived':
        return (
          <AppBadge variant="default" size="sm">
            Archived
          </AppBadge>
        );
      default:
        return null;
    }
  };

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
          className="relative w-full max-w-2xl max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-link-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="gallery-link-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Link Gallery
                </h2>
                <p className="text-sm text-text-secondary">
                  Select a gallery to link to this client
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

          {/* Search */}
          <div className="p-4 border-b border-border">
            <AppInput
              placeholder="Search galleries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={18} />}
              className="w-full"
            />
          </div>

          {/* Gallery List */}
          <div className="max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredGalleries.length === 0 ? (
              <div className="text-center py-12">
                <Image size={32} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-text-tertiary">
                  {searchQuery
                    ? 'No galleries match your search'
                    : 'No available galleries to link'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredGalleries.map((gallery) => (
                  <button
                    key={gallery.gallery_id}
                    onClick={() => setSelectedGallery(gallery)}
                    className={`w-full p-4 text-left hover:bg-surface-hover transition-colors ${
                      selectedGallery?.gallery_id === gallery.gallery_id
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-hover flex-shrink-0">
                        {gallery.cover_image_url ? (
                          <img
                            src={gallery.cover_image_url}
                            alt={gallery.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image
                              size={24}
                              className="text-text-tertiary"
                            />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-text-primary truncate">
                            {gallery.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(gallery.status)}
                            {selectedGallery?.gallery_id ===
                              gallery.gallery_id && (
                              <div className="p-1 rounded-full bg-primary text-white">
                                <Check size={12} />
                              </div>
                            )}
                          </div>
                        </div>
                        {gallery.client_name && (
                          <p className="text-sm text-text-secondary truncate">
                            {gallery.client_name}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                          <span className="flex items-center gap-1">
                            <Image size={12} />
                            {gallery.photo_count} photos
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {formatDate(gallery.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Role Selection */}
          {selectedGallery && (
            <div className="p-4 border-t border-border bg-surface-hover/30">
              <h3 className="text-sm font-medium text-text-primary mb-3">
                Select Role
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {roles.map((role) => (
                  <button
                    key={role.value}
                    onClick={() => setSelectedRole(role.value)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      selectedRole === role.value
                        ? 'bg-primary/10 border-2 border-primary'
                        : 'bg-surface border-2 border-transparent hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {selectedRole === role.value && (
                        <Check size={14} className="text-primary" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          selectedRole === role.value
                            ? 'text-primary'
                            : 'text-text-primary'
                        }`}
                      >
                        {role.label}
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {role.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface">
            <AppButton variant="outline" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleLink}
              disabled={!selectedGallery || isLinking}
              leftIcon={
                isLinking ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Link2 size={16} />
                )
              }
            >
              {isLinking ? 'Linking...' : 'Link Gallery'}
            </AppButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GalleryLinkDialog;
