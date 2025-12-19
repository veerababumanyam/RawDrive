/**
 * GalleryStatusBadge Component
 * Displays gallery status with distinct visual styles
 * Property 3: Status Badge Visual Distinction
 */

import React from 'react';
import { AppBadge } from '../../ui/AppBadge';
import type { GalleryStatus } from '../../../types/gallery';

export interface GalleryStatusBadgeProps {
  status: GalleryStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<GalleryStatus, { variant: 'default' | 'success' | 'warning' | 'error'; label: string }> = {
  draft: {
    variant: 'default',
    label: 'Draft',
  },
  published: {
    variant: 'success',
    label: 'Published',
  },
  archived: {
    variant: 'warning',
    label: 'Archived',
  },
};

export const GalleryStatusBadge: React.FC<GalleryStatusBadgeProps> = ({ status, size = 'sm' }) => {
  const config = statusConfig[status];

  return (
    <AppBadge variant={config.variant} size={size} pill>
      {config.label}
    </AppBadge>
  );
};

