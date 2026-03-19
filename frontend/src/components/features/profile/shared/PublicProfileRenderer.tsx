/**
 * PublicProfileRenderer
 *
 * Shared renderer for both personal (/u/:slug) and company (/p/:slug) profiles.
 * Applies theme via UnifiedThemeEngine scoped to wrapper element, renders sections
 * from SectionRegistry inside a BentoGrid layout.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { resolveThemeTokens, applyThemeToContainer, removeThemeFromContainer } from './UnifiedThemeEngine';
import { getSectionsForProfile, type ProfileType } from './SectionRegistry';
import { ProfileBentoGrid } from '../ProfileBentoGrid';
import { ProfileGridItem } from '../ProfileGridItem';
import { getTheme } from '../ProfileThemeEngine';

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

  // Detect dark mode preference
  const prefersDark = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, []);

  // Apply theme on mount, clean up on unmount
  useEffect(() => {
    const tokens = resolveThemeTokens(themeId ?? '', prefersDark);
    const el = wrapperRef.current;
    if (el) {
      applyThemeToContainer(tokens, el);
    }

    return () => {
      if (el) {
        removeThemeFromContainer(el);
      }
    };
  }, [themeId, prefersDark]);

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
      className="min-h-screen w-full"
      style={{
        backgroundColor: 'var(--theme-bg)',
        color: 'var(--theme-text)',
        fontFamily: 'var(--theme-font-body)',
      }}
    >
      <div className="max-w-4xl mx-auto py-8 px-4">
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
    </div>
  );
};
