/**
 * GalleryEmptyState Component
 * Empty state display when no galleries exist
 */

import React from 'react';
import { Plus, Image } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface GalleryEmptyStateProps {
  hasFilters?: boolean;
  onCreateGallery: () => void;
}

export const GalleryEmptyState: React.FC<GalleryEmptyStateProps> = ({
  hasFilters = false,
  onCreateGallery,
}) => {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
        <Image size={32} className="text-text-tertiary" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {hasFilters ? 'No galleries found' : 'No galleries yet'}
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your search or filters to find what you\'re looking for.'
          : 'Create your first gallery to start organizing and sharing photos with clients.'}
      </p>
      {!hasFilters && (
        <AppButton
          onClick={onCreateGallery}
          variant="primary"
          leftIcon={<Plus size={20} />}
        >
          Create Gallery
        </AppButton>
      )}
    </div>
  );
};

