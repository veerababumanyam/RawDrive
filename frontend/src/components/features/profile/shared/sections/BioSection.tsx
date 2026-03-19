/**
 * BioSection - Section wrapper for ProfileBio.
 * Adapts SectionProps to ProfileBio's expected props.
 */

import React from 'react';
import { ProfileBio } from '../../ProfileBio';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';

export const BioSection: React.FC<SectionProps> = ({ profileData }) => {
  const bio = (profileData.bio as string) || '';

  if (!bio) return null;

  const theme = getTheme();

  return <ProfileBio theme={theme} bio={bio} />;
};
