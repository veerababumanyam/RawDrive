/**
 * SocialsSection - Section wrapper for ProfileSocials.
 * Adapts SectionProps to ProfileSocials's expected props.
 */

import React from 'react';
import { ProfileSocials } from '../../ProfileSocials';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';

export const SocialsSection: React.FC<SectionProps> = ({ profileData }) => {
  const socialLinks = (profileData.social_links as Record<string, string>) || {};

  if (Object.keys(socialLinks).length === 0) return null;

  const theme = getTheme();

  return <ProfileSocials theme={theme} socials={socialLinks} />;
};
