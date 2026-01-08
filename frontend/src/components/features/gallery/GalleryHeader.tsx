/**
 * GalleryHeader Component
 * Clean, professional header matching modern gallery management UIs
 * Layout: Back link -> Cover Photo + Logo/Title/Description -> Metadata (author, date) -> Status badge
 * Mobile-first responsive design
 */

import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Edit2, Check, X, User, Calendar, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../../ui/AppButton';
import { GalleryStatusBadge } from './GalleryStatusBadge';
import { TaggingHealthBadge } from './TaggingHealthBadge';
import { AppInput } from '../../ui/AppInput';
import { clientService } from '../../../services/clientService';
import { galleryService } from '../../../services/galleryService';
import { useAuth } from '../../../contexts/AuthContext';
import { useGalleryTaggingHealth } from '../../../hooks/useGalleryTaggingHealth';
import type { GalleryDetailData } from '../../../types/gallery';
import type { ClientSearchResult } from '../../../types/client';

export interface GalleryHeaderProps {
  gallery: GalleryDetailData;
  onTitleUpdate?: (newTitle: string) => Promise<void>;
  onMetadataUpdate?: (updates: { description?: string; client_id?: string; shoot_date?: string }) => Promise<void>;
  isLoading?: boolean;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  gallery,
  onTitleUpdate,
  onMetadataUpdate,
}) => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { health: healthData, loading: healthLoading, error: healthError, refreshStats: refreshHealth } = useGalleryTaggingHealth({
    workspaceId: gallery.workspace_id,
    galleryId: gallery.gallery_id,
  });

  // Cover Photo State
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageError, setCoverImageError] = useState(false);

  // Fetch signed URL for cover image
  useEffect(() => {
    if (gallery.cover_asset_id && workspace?.workspace_id && !coverImageUrl && !coverImageError) {
      galleryService
        .getSignedUrl(workspace.workspace_id, gallery.cover_asset_id, 'thumbnail')
        .then((url) => {
          setCoverImageUrl(url);
        })
        .catch((error) => {
          console.error('Failed to fetch cover image URL:', error);
          setCoverImageError(true);
        });
    }
  }, [gallery.cover_asset_id, workspace?.workspace_id, coverImageUrl, coverImageError]);

  // Reset cover image state when gallery changes
  useEffect(() => {
    setCoverImageUrl(null);
    setCoverImageError(false);
  }, [gallery.gallery_id]);

  // Title Edit State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(gallery.title);

  // Description Edit State
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(gallery.description || '');

  // Client Edit State
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState(gallery.client_name || '');
  const [clientSearchResults, setClientSearchResults] = useState<ClientSearchResult[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);

  // Date Edit State
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editedDate, setEditedDate] = useState(gallery.shoot_date ? gallery.shoot_date.split('T')[0] : '');

  const [isSaving, setIsSaving] = useState(false);
  const clientSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleTitleSave = async () => {
    if (editedTitle.trim() === gallery.title.trim()) {
      setIsEditingTitle(false);
      return;
    }
    if (!editedTitle.trim()) {
      setEditedTitle(gallery.title);
      setIsEditingTitle(false);
      return;
    }
    setIsSaving(true);
    try {
      await onTitleUpdate?.(editedTitle.trim());
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      setEditedTitle(gallery.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDescriptionSave = async () => {
    if (editedDescription.trim() === (gallery.description || '').trim()) {
      setIsEditingDescription(false);
      return;
    }
    setIsSaving(true);
    try {
      await onMetadataUpdate?.({ description: editedDescription.trim() });
      setIsEditingDescription(false);
    } catch (error) {
      console.error('Failed to update description:', error);
      setEditedDescription(gallery.description || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDateSave = async () => {
    if (editedDate === (gallery.shoot_date ? gallery.shoot_date.split('T')[0] : '')) {
      setIsEditingDate(false);
      return;
    }
    setIsSaving(true);
    try {
      const isoDate = editedDate ? new Date(editedDate).toISOString() : undefined;
      await onMetadataUpdate?.({ shoot_date: isoDate });
      setIsEditingDate(false);
    } catch (error) {
      console.error('Failed to update date:', error);
      setEditedDate(gallery.shoot_date ? gallery.shoot_date.split('T')[0] : '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClientSearch = async (query: string) => {
    setClientSearchQuery(query);
    setShowClientResults(true);

    if (clientSearchDebounceRef.current) {
      clearTimeout(clientSearchDebounceRef.current);
    }

    if (!query.trim()) {
      setClientSearchResults([]);
      return;
    }

    clientSearchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await clientService.searchClients(gallery.workspace_id, query);
        setClientSearchResults(results);
      } catch (error) {
        console.error('Failed to search clients:', error);
      }
    }, 300);
  };

  const selectClient = async (client: ClientSearchResult) => {
    setClientSearchQuery(client.full_name);
    setShowClientResults(false);
    setIsSaving(true);
    try {
      // onMetadataUpdate in parent will handle auto-publish when client_id is set
      await onMetadataUpdate?.({ client_id: client.client_id });
      setIsEditingClient(false);
    } catch (error) {
      console.error('Failed to update client:', error);
      setClientSearchQuery(gallery.client_name || '');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="gallery-header space-y-4">
      {/* Back Navigation - Clean and minimal */}
      <button
        onClick={() => navigate('/workspace/galleries')}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to All Galleries</span>
      </button>

      {/* Main Header Row - Cover Photo + Title + Description + Metadata */}
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Cover Photo Thumbnail - Smaller on mobile */}
        <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-surface-hover border border-border/50 shadow-sm">
          {coverImageUrl && !coverImageError ? (
            <img
              src={coverImageUrl}
              alt={`${gallery.title} cover`}
              className="w-full h-full object-cover"
              onError={() => setCoverImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-hover to-surface">
              <ImageIcon size={20} className="text-text-tertiary" />
            </div>
          )}
        </div>

        {/* Title, Description, and Metadata */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title - Inline editable */}
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <AppInput
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                inputSize="lg"
                className="flex-1 text-base sm:text-lg font-semibold"
                autoFocus
                disabled={isSaving}
                maxLength={255}
              />
              <AppButton variant="ghost" size="icon" onClick={handleTitleSave} disabled={isSaving} className="text-success h-7 w-7">
                <Check size={14} />
              </AppButton>
              <AppButton variant="ghost" size="icon" onClick={() => { setEditedTitle(gallery.title); setIsEditingTitle(false); }} disabled={isSaving} className="text-error h-7 w-7">
                <X size={14} />
              </AppButton>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h1 className="text-base sm:text-lg font-semibold text-text-primary truncate">
                {gallery.title}
              </h1>
              {onTitleUpdate && (
                <button
                  onClick={() => { setIsEditingTitle(true); setEditedTitle(gallery.title); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover transition-all text-text-tertiary hover:text-primary"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          )}

          {/* Description - Inline editable (optional) */}
          {(gallery.description || onMetadataUpdate) && (
            <>
              {isEditingDescription ? (
                <div className="flex items-center gap-1.5">
                  <AppInput
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    onBlur={handleDescriptionSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSave()}
                    className="flex-1 text-xs sm:text-sm"
                    placeholder="Add a description..."
                    autoFocus
                    disabled={isSaving}
                  />
                  <AppButton variant="ghost" size="icon" onClick={handleDescriptionSave} disabled={isSaving} className="text-success h-6 w-6">
                    <Check size={12} />
                  </AppButton>
                  <AppButton variant="ghost" size="icon" onClick={() => { setEditedDescription(gallery.description || ''); setIsEditingDescription(false); }} disabled={isSaving} className="text-error h-6 w-6">
                    <X size={12} />
                  </AppButton>
                </div>
              ) : (
                <div
                  className="group flex items-center gap-1 cursor-pointer"
                  onClick={() => { if (onMetadataUpdate) { setIsEditingDescription(true); setEditedDescription(gallery.description || ''); }}}
                >
                  <p className={`text-xs sm:text-sm leading-relaxed ${gallery.description ? 'text-text-secondary' : 'text-text-tertiary/70 italic'} hover:text-text-primary transition-colors`}>
                    {gallery.description || (onMetadataUpdate ? 'Add description...' : '')}
                  </p>
                  {onMetadataUpdate && (
                    <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-text-tertiary transition-opacity flex-shrink-0" />
                  )}
                </div>
              )}
            </>
          )}

          {/* Metadata Row - Below Description (Apple iOS style, compact) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
            {/* Author/Client - Compact iOS style */}
            <div className="relative group flex items-center gap-1">
              {isEditingClient ? (
                <div className="relative">
                  <AppInput
                    value={clientSearchQuery}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    placeholder="Search client..."
                    className="w-32 sm:w-40 h-7 text-xs sm:text-sm"
                    autoFocus
                    onBlur={() => setTimeout(() => setIsEditingClient(false), 200)}
                  />
                  {showClientResults && clientSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {clientSearchResults.map(client => (
                        <div
                          key={client.client_id}
                          className="px-3 py-2 hover:bg-surface-hover cursor-pointer text-sm flex items-center gap-2.5"
                          onClick={() => selectClient(client)}
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-surface-hover flex-shrink-0 flex items-center justify-center border border-border">
                            {client.avatar_asset_id ? (
                              <img
                                src={`/api/v1/assets/${client.avatar_asset_id}/thumbnail`}
                                alt={client.full_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User size={12} className="text-text-tertiary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-text-primary truncate">{client.full_name}</div>
                            <div className="text-xs text-text-tertiary truncate">{client.primary_email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span
                  className="text-xs sm:text-sm text-text-secondary hover:text-primary transition-colors cursor-pointer font-medium"
                  onClick={() => { if (onMetadataUpdate) { setIsEditingClient(true); setClientSearchQuery(gallery.client_name || ''); setClientSearchResults([]); }}}
                >
                  {gallery.client_name || 'Assign Client'}
                </span>
              )}
            </div>

            {/* Separator - iOS style dot */}
            <span className="text-text-tertiary/40 text-xs">•</span>

            {/* Date - Compact */}
            <div className="group flex items-center gap-1">
              <Calendar size={11} className="text-text-tertiary flex-shrink-0" />
              {isEditingDate ? (
                <AppInput
                  type="date"
                  value={editedDate}
                  onChange={(e) => setEditedDate(e.target.value)}
                  onBlur={handleDateSave}
                  className="w-auto h-7 text-xs sm:text-sm"
                  autoFocus
                />
              ) : (
                <span
                  className="text-xs sm:text-sm text-text-secondary hover:text-primary transition-colors cursor-pointer font-medium"
                  onClick={() => { if (onMetadataUpdate) { setIsEditingDate(true); setEditedDate(gallery.shoot_date ? gallery.shoot_date.split('T')[0] : (gallery.created_at ? gallery.created_at.split('T')[0] : '')); }}}
                >
                  {gallery.shoot_date ? formatDate(gallery.shoot_date) : (gallery.created_at ? formatDate(gallery.created_at) : 'Set Date')}
                </span>
              )}
            </div>

            {/* Status Badge - Compact */}
            <div className="flex items-center gap-1.5">
              <GalleryStatusBadge status={gallery.status} size="sm" />
              <TaggingHealthBadge
                health={healthData}
                loading={healthLoading}
                error={!!healthError}
                showRefresh={true}
                onRefresh={refreshHealth}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
