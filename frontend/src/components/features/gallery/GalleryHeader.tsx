/**
 * GalleryHeader Component
 * Displays gallery title, client name, creation date, and status badge
 * Property 6: Gallery Header Data Display
 */

import React, { useState } from 'react';
import { ArrowLeft, Edit2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../../ui/AppButton';
import { GalleryStatusBadge } from './GalleryStatusBadge';
import { AppInput } from '../../ui/AppInput';
import type { GalleryDetailData } from '../../../types/gallery';

export interface GalleryHeaderProps {
  gallery: GalleryDetailData;
  onTitleUpdate?: (newTitle: string) => Promise<void>;
  isLoading?: boolean;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  gallery,
  onTitleUpdate,
}) => {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(gallery.title);
  const [isSaving, setIsSaving] = useState(false);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
    setEditedTitle(gallery.title);
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
      // Error handling - could show toast here
      console.error('Failed to update title:', error);
      setEditedTitle(gallery.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleCancel = () => {
    setEditedTitle(gallery.title);
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <AppButton
        variant="ghost"
        size="sm"
        onClick={() => navigate('/workspace/galleries')}
        leftIcon={<ArrowLeft size={16} />}
      >
        Back to All Galleries
      </AppButton>

      {/* Title and Status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <AppInput
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleTitleSave}
                inputSize="lg"
                className="flex-1"
                autoFocus
                disabled={isSaving}
                maxLength={255}
              />
              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleTitleSave}
                disabled={isSaving}
                aria-label="Save title"
              >
                <Check size={18} />
              </AppButton>
              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleTitleCancel}
                disabled={isSaving}
                aria-label="Cancel editing"
              >
                <X size={18} />
              </AppButton>
            </div>
          ) : (
            <div className="flex items-center gap-3 group">
              <h1 className="text-3xl font-bold text-text-primary truncate">
                {gallery.title}
              </h1>
              {onTitleUpdate && (
                <button
                  onClick={handleTitleEdit}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-hover"
                  aria-label="Edit title"
                >
                  <Edit2 size={18} className="text-text-tertiary" />
                </button>
              )}
            </div>
          )}

          {/* Client Name and Date */}
          <div className="flex items-center gap-2 mt-2 text-text-secondary">
            {gallery.client_name && (
              <>
                <span className="font-medium">{gallery.client_name}</span>
                <span>•</span>
              </>
            )}
            <span>{formatDate(gallery.created_at)}</span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex-shrink-0">
          <GalleryStatusBadge status={gallery.status} size="md" />
        </div>
      </div>
    </div>
  );
};

