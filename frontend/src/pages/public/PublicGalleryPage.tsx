import React from 'react';
import { PublicGalleryShell } from './PublicGalleryShell';

/**
 * Route wrapper for /gallery/:galleryId
 * All logic lives in PublicGalleryShell and its context providers.
 */
const PublicGalleryPage: React.FC = () => {
  return <PublicGalleryShell />;
};

export default PublicGalleryPage;
