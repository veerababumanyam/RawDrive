/**
 * GalleryPreviewSection - Section wrapper for ProfileGalleryPreview.
 * Adapts SectionProps to ProfileGalleryPreview's expected props.
 */

import React from 'react';
import { ProfileGalleryPreview } from '../../ProfileGalleryPreview';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';
import type { FeaturedGalleryInfo } from '@/types/personalProfile';

export const GalleryPreviewSection: React.FC<SectionProps> = ({ profileData }) => {
  const theme = getTheme();

  // Support both single featured_gallery and galleries array
  const galleries: FeaturedGalleryInfo[] = [];

  const featuredGallery = profileData.featured_gallery as FeaturedGalleryInfo | null | undefined;
  if (featuredGallery && featuredGallery.gallery_id) {
    galleries.push(featuredGallery);
  }

  const galleryArray = profileData.galleries as FeaturedGalleryInfo[] | undefined;
  if (galleryArray && Array.isArray(galleryArray)) {
    for (const g of galleryArray) {
      if (g.gallery_id && !galleries.some((existing) => existing.gallery_id === g.gallery_id)) {
        galleries.push(g);
      }
    }
  }

  if (galleries.length === 0) return null;

  return <ProfileGalleryPreview theme={theme} galleries={galleries} />;
};
