/**
 * GalleryHeader Component
 * Displays gallery title, client name, creation date, and status badge
 * Clean, professional layout matching modern gallery management UIs
 */

import React, { useState } from 'react';
import { ArrowLeft, Edit2, Check, X, User } from 'lucide-react';
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
      month: 'short',
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
    <div className="gallery-header">
      {/* Back Navigation - Clean text link style */}
      <button
        onClick={() => navigate('/workspace/galleries')}
        className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-primary transition-colors mb-4 group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to All Galleries</span>
      </button>

      {/* Main Header Content */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Left: Title and Meta */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          {isEditingTitle ? (
            <div className="flex items-center gap-2 mb-2">
              <AppInput
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleTitleSave}
                inputSize="lg"
                className="flex-1 text-2xl font-bold"
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
                className="text-success hover:bg-success/10"
              >
                <Check size={20} />
              </AppButton>
              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleTitleCancel}
                disabled={isSaving}
                aria-label="Cancel editing"
                className="text-text-tertiary hover:text-error hover:bg-error/10"
              >
                <X size={20} />
              </AppButton>
            </div>
          ) : (
            <div className="flex items-center gap-2 group mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary truncate">
                {gallery.title}
              </h1>
              {onTitleUpdate && (
                <button
                  onClick={handleTitleEdit}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-hover transition-all flex-shrink-0"
                  aria-label="Edit title"
                >
                  <Edit2 size={16} className="text-text-tertiary" />
                </button>
              )}
            </div>
          )}

          {/* Client Name and Date - With user icon */}
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {gallery.client_name && (
              <>
                <User size={14} className="text-text-tertiary" />
                <span className="font-medium">{gallery.client_name}</span>
                <span className="text-text-tertiary">•</span>
              </>
            )}
            <span>{formatDate(gallery.created_at)}</span>
          </div>
        </div>

        {/* Right: Status Badge - Hidden on mobile, shown on sm+ */}
        <div className="hidden sm:block flex-shrink-0">
          <GalleryStatusBadge status={gallery.status} size="md" />
        </div>
      </div>

      {/* Mobile Status Badge - Below title on small screens */}
      <div className="sm:hidden mt-3">
        <GalleryStatusBadge status={gallery.status} size="sm" />
      </div>
    </div>
  );
};

