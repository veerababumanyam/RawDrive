/**
 * HeaderSection - Section wrapper for ProfileHeader.
 * Adapts SectionProps to ProfileHeader's expected props.
 */

import React from 'react';
import { ProfileHeader } from '../../ProfileHeader';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';

export const HeaderSection: React.FC<SectionProps> = ({ profileData, profileType }) => {
  const displayName = (profileData.display_name as string) ||
    (profileType === 'company' ? (profileData.company_name as string) : '') ||
    '';

  const avatarUrl = (profileData.avatar_url as string) ||
    (profileType === 'company' ? (profileData.logo_url as string) : '') ||
    undefined;

  // Use a minimal theme object for ProfileHeader compatibility
  const theme = getTheme();

  return (
    <ProfileHeader
      theme={theme}
      displayName={displayName}
      avatarUrl={avatarUrl}
      profileTitle={profileData.title as string | undefined}
      location={profileData.location as string | undefined}
      isVerified={profileData.is_verified as boolean | undefined}
      badges={profileData.badges as string[] | undefined}
      brandColor={profileData.brand_color as string | undefined}
    />
  );
};
