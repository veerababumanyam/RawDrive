/**
 * PublicProfileRenderer
 *
 * Shared renderer for both personal (/u/:slug) and company (/p/:slug) profiles.
 * Applies theme via UnifiedThemeEngine scoped to wrapper element, renders sections
 * from SectionRegistry inside a BentoGrid layout.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { resolveThemeTokens, applyThemeToContainer, removeThemeFromContainer } from './UnifiedThemeEngine';
import type { ThemeTokens } from './UnifiedThemeEngine';
import { getSectionsForProfile, type ProfileType } from './SectionRegistry';
import { ProfileBentoGrid } from '../ProfileBentoGrid';
import { ProfileGridItem } from '../ProfileGridItem';
import { getTheme } from '../ProfileThemeEngine';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AnimatedBackgroundRenderer, type AnimationType } from '../public/animations/AnimatedBackgroundRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicProfileRendererProps {
  profileData: Record<string, unknown>;
  profileType: ProfileType;
  themeId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PublicProfileRenderer: React.FC<PublicProfileRendererProps> = ({
  profileData,
  profileType,
  themeId,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Normalize company profile field names so sections work uniformly
  const normalizedData = useMemo(() => {
    if (profileType === 'company') {
      return {
        ...profileData,
        display_name: profileData.display_name || profileData.company_name,
        avatar_url: profileData.avatar_url || profileData.logo_url,
      };
    }
    return profileData;
  }, [profileData, profileType]);

  // Reactive dark mode detection
  const colorScheme = useColorScheme();
  const prefersDark = colorScheme === 'dark';

  // Resolve theme tokens (reactive to theme + dark mode changes)
  const tokens: ThemeTokens = useMemo(
    () => resolveThemeTokens(themeId ?? '', prefersDark),
    [themeId, prefersDark],
  );

  const animationType = (tokens['--theme-animation-type'] ?? 'gradient-shift') as AnimationType;

  // Apply theme on mount, clean up on unmount
  useEffect(() => {
    const el = wrapperRef.current;
    if (el) {
      applyThemeToContainer(tokens, el);
    }

    return () => {
      if (el) {
        removeThemeFromContainer(el);
      }
    };
  }, [tokens]);

  // Get applicable sections
  const sections = useMemo(
    () => getSectionsForProfile(profileType, normalizedData),
    [profileType, normalizedData],
  );

  // Get a theme object for ProfileGridItem compatibility
  const legacyTheme = useMemo(() => getTheme(), []);

  return (
    <div
      ref={wrapperRef}
      data-profile-renderer
      data-color-scheme={prefersDark ? 'dark' : 'light'}
      className="min-h-screen w-full"
      style={{
        backgroundColor: 'var(--theme-bg)',
        color: 'var(--theme-text)',
        fontFamily: 'var(--theme-font-body)',
      }}
    >
      <AnimatedBackgroundRenderer animationType={animationType} themeTokens={tokens}>
        <div className="max-w-5xl mx-auto py-8 px-4">
          <ProfileBentoGrid>
            {sections.map((section) => {
              const SectionComponent = section.component;
              const colSpan = section.gridSpan?.cols ?? 4;
              return (
                <ProfileGridItem
                  key={section.id}
                  theme={legacyTheme}
                  colSpan={colSpan as 1 | 2 | 3 | 4}
                  rowSpan={(section.gridSpan?.rows ?? 1) as 1 | 2}
                >
                  <SectionComponent
                    profileData={normalizedData}
                    profileType={profileType}
                  />
                </ProfileGridItem>
              );
            })}
          </ProfileBentoGrid>
        </div>
      </AnimatedBackgroundRenderer>
    </div>
  );
};
