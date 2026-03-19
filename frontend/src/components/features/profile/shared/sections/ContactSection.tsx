/**
 * ContactSection - Section wrapper for ProfileContactGrid.
 * Adapts SectionProps to ProfileContactGrid's expected props.
 */

import React from 'react';
import { ProfileContactGrid } from '../../ProfileContactGrid';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';
import type { CustomLink } from '@/types/personalProfile';

export const ContactSection: React.FC<SectionProps> = ({ profileData }) => {
  const email = profileData.email as string | undefined;
  const phone = profileData.phone as string | undefined;
  const website = profileData.website as string | undefined;
  const bookingUrl = profileData.booking_url as string | undefined;
  const customLinks = (profileData.custom_links as CustomLink[]) || [];
  const brandColor = profileData.brand_color as string | undefined;

  // Only render if at least one contact field exists
  if (!email && !phone && !website && !bookingUrl && customLinks.length === 0) {
    return null;
  }

  const theme = getTheme();

  return (
    <ProfileContactGrid
      theme={theme}
      email={email}
      phone={phone}
      website={website}
      bookingUrl={bookingUrl}
      customLinks={customLinks}
      brandColor={brandColor}
    />
  );
};
