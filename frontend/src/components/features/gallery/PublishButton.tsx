/**
 * PublishButton Component
 * Button for publishing/unpublishing galleries with validation
 * Property 22: Publish Button Visibility
 * Property 23: Publish Validation
 */

import React, { useState } from 'react';
import { Globe, EyeOff, Loader2 } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import type { GalleryDetailData } from '../../../types/gallery';

export interface PublishButtonProps {
  gallery: GalleryDetailData;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export const PublishButton: React.FC<PublishButtonProps> = ({
  gallery,
  onPublish,
  onUnpublish,
  isLoading = false,
  className = '',
}) => {
  const { addToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const isPublished = gallery.status === 'published';
  const isDraft = gallery.status === 'draft';
  const isArchived = gallery.status === 'archived';
  const hasPhotos = (gallery.stats?.total_items || 0) > 0;

  const handleClick = async () => {
    if (isArchived) {
      addToast({ message: 'Archived galleries cannot be published or unpublished', variant: 'error' });
      return;
    }

    if (isDraft && !hasPhotos) {
      addToast({ message: 'Please add at least one photo before publishing', variant: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (isPublished) {
        await onUnpublish();
        addToast({ message: 'Gallery unpublished successfully', variant: 'success' });
      } else {
        await onPublish();
        addToast({ message: 'Gallery published successfully', variant: 'success' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update gallery status';
      addToast({ message, variant: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't show button for archived galleries
  if (isArchived) {
    return null;
  }

  const buttonText = isPublished ? 'Unpublish' : 'Publish';
  const buttonIcon = isPublished ? <EyeOff size={16} /> : <Globe size={16} />;
  const isDisabled = isLoading || isProcessing || (isDraft && !hasPhotos);

  return (
    <AppButton
      variant={isPublished ? 'outline' : 'primary'}
      size="sm"
      leftIcon={isProcessing ? <Loader2 size={16} className="animate-spin" /> : buttonIcon}
      onClick={handleClick}
      disabled={isDisabled}
      title={
        isDraft && !hasPhotos
          ? 'Add at least one photo before publishing'
          : isPublished
          ? 'Unpublish this gallery'
          : 'Publish this gallery'
      }
      className={className}
    >
      {buttonText}
    </AppButton>
  );
};

