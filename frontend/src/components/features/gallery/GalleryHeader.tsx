/**
 * GalleryHeader Component
 * Displays gallery title, client name, creation date, and status badge
 * Clean, professional layout matching modern gallery management UIs
 */

import React, { useState, useRef } from 'react';
import { ArrowLeft, Edit2, Check, X, User, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../../ui/AppButton';
import { GalleryStatusBadge } from './GalleryStatusBadge';
import { AppInput } from '../../ui/AppInput';
import { clientService } from '../../../services/clientService';
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

  // Title Edit State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(gallery.title);

  // Metadata Edit State
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(gallery.description || '');

  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState(gallery.client_name || '');
  const [clientSearchResults, setClientSearchResults] = useState<ClientSearchResult[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editedDate, setEditedDate] = useState(gallery.shoot_date ? gallery.shoot_date.split('T')[0] : '');

  const [isSaving, setIsSaving] = useState(false);
  // use ReturnType<typeof setTimeout> for environment agnostic timeout handle
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
      // Send as ISO string
      const isoDate = editedDate ? new Date(editedDate).toISOString() : undefined;
      // If we clear the date (empty string), send generic handling if backend accepts null?
      // Since schema accepts Optional[str], if we want to clear it, we might need to send null or handle empty string.
      // Based on my service update, it accepts None. But JSON serializer needs explicit null.
      // The prop type expects string. Let's assume sending empty string or undefined clears it?
      // Actually backend service checks `if value is None`. Pydantic optional.
      // If I want to clear, I should probably send empty string if I can't send null.
      // But my type definition says optional string.
      await onMetadataUpdate?.({ shoot_date: isoDate }); // Handles valid date. Clearing handling might need more logic
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
    <div className="gallery-header">
      {/* Back Navigation */}
      <button
        onClick={() => navigate('/workspace/galleries')}
        className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-primary transition-colors mb-4 group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to All Galleries</span>
      </button>

      {/* Main Header Content */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-3">
          {/* Title */}
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <AppInput
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                inputSize="lg"
                className="flex-1 text-2xl font-bold"
                autoFocus
                disabled={isSaving}
                maxLength={255}
              />
              <AppButton variant="ghost" size="icon" onClick={handleTitleSave} disabled={isSaving} className="text-success"><Check size={20} /></AppButton>
              <AppButton variant="ghost" size="icon" onClick={() => { setEditedTitle(gallery.title); setIsEditingTitle(false); }} disabled={isSaving} className="text-error"><X size={20} /></AppButton>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary truncate">{gallery.title}</h1>
              {onTitleUpdate && (
                <button onClick={() => { setIsEditingTitle(true); setEditedTitle(gallery.title); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-hover transition-all text-text-tertiary hover:text-primary">
                  <Edit2 size={16} />
                </button>
              )}
            </div>
          )}

          {/* Description */}
          {isEditingDescription ? (
            <div className="flex items-center gap-2">
              <AppInput
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                onBlur={handleDescriptionSave}
                onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSave()}
                className="flex-1"
                placeholder="Add a description..."
                autoFocus
                disabled={isSaving}
              />
              <AppButton variant="ghost" size="icon" onClick={handleDescriptionSave} disabled={isSaving} className="text-success"><Check size={18} /></AppButton>
              <AppButton variant="ghost" size="icon" onClick={() => { setEditedDescription(gallery.description || ''); setIsEditingDescription(false); }} disabled={isSaving} className="text-error"><X size={18} /></AppButton>
            </div>
          ) : (
            <div className="group flex items-center gap-2 min-h-[1.5rem]" onClick={() => { setIsEditingDescription(true); setEditedDescription(gallery.description || ''); }}>
              <p className={`text-sm ${gallery.description ? 'text-text-secondary' : 'text-text-tertiary italic'} cursor-pointer hover:text-text-primary transition-colors`}>
                {gallery.description || 'Add description...'}
              </p>
              {onMetadataUpdate && (
                <Edit2 size={12} className="opacity-0 group-hover:opacity-100 text-text-tertiary" />
              )}
            </div>
          )}

          {/* Meta Line: Client and Date */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            {/* Client Picker */}
            <div className="relative group flex items-center gap-2">
              <User size={14} className="text-text-tertiary" />
              {isEditingClient ? (
                <div className="relative">
                  <AppInput
                    value={clientSearchQuery}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    placeholder="Search client..."
                    className="w-48 h-8 text-sm"
                    autoFocus
                    onBlur={() => setTimeout(() => setIsEditingClient(false), 200)} // Delay to allow click
                  />
                  {showClientResults && clientSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {clientSearchResults.map(client => (
                        <div
                          key={client.client_id}
                          className="px-3 py-2 hover:bg-surface-hover cursor-pointer text-sm flex items-center gap-3"
                          onClick={() => selectClient(client)}
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-hover flex-shrink-0 flex items-center justify-center border border-border">
                            {client.avatar_asset_id ? (
                              <img
                                src={`/api/v1/assets/${client.avatar_asset_id}/thumbnail`}
                                alt={client.full_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User size={14} className="text-text-tertiary" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-text-primary">{client.full_name}</div>
                            <div className="text-xs text-text-tertiary">{client.primary_email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span
                  className="font-medium cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => { setIsEditingClient(true); setClientSearchQuery(gallery.client_name || ''); setClientSearchResults([]); }}
                >
                  {gallery.client_name || 'Assign Client'}
                </span>
              )}
            </div>

            <span className="text-text-tertiary">•</span>

            {/* Shoot Date Picker */}
            <div className="group flex items-center gap-2">
              <Calendar size={14} className="text-text-tertiary" />
              {isEditingDate ? (
                <AppInput
                  type="date"
                  value={editedDate}
                  onChange={(e) => { setEditedDate(e.target.value); }}
                  onBlur={handleDateSave}
                  className="w-auto h-8 text-sm"
                  autoFocus
                />
              ) : (
                <span
                  className="cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => { setIsEditingDate(true); setEditedDate(gallery.shoot_date ? gallery.shoot_date.split('T')[0] : (gallery.created_at ? gallery.created_at.split('T')[0] : '')); }}
                >
                  {gallery.shoot_date ? formatDate(gallery.shoot_date) : (gallery.created_at ? formatDate(gallery.created_at) : 'Set Date')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="hidden sm:block flex-shrink-0">
          <GalleryStatusBadge status={gallery.status} size="md" />
        </div>
      </div>

      {/* Mobile Status Badge */}
      <div className="sm:hidden mt-3">
        <GalleryStatusBadge status={gallery.status} size="sm" />
      </div>
    </div>
  );
};
