/**
 * GalleryStatusBadge Component
 * Displays gallery status with clean, minimal styling
 * Matches screenshot: green "Published" text
 */

import React from 'react';
import type { GalleryStatus } from '../../../types/gallery';

export interface GalleryStatusBadgeProps {
  status: GalleryStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<GalleryStatus, { color: string; label: string }> = {
  draft: {
    color: 'text-text-tertiary',
    label: 'Draft',
  },
  published: {
    color: 'text-green-500',
    label: 'Published',
  },
  archived: {
    color: 'text-amber-500',
    label: 'Archived',
  },
};

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export const GalleryStatusBadge: React.FC<GalleryStatusBadgeProps> = ({ status, size = 'sm' }) => {
  const config = statusConfig[status];

  return (
    <span className={`font-medium ${config.color} ${sizeClasses[size]}`}>
      {config.label}
    </span>
  );
};
