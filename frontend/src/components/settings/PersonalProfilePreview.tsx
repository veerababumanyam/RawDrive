/**
 * PersonalProfilePreview Component
 *
 * Real-time preview of the personal profile using the NEW Bento Grid components.
 * Matches PublicPersonalProfilePage.tsx exactly for WYSIWYG.
 */

import { useState } from 'react';
import { Smartphone, Monitor, CheckCircle } from 'lucide-react';
import { getTheme } from '../../components/features/profile/ProfileThemeEngine';
import { ProfileContainer } from '../../components/features/profile/ProfileContainer';
import { ProfileHeader } from '../../components/features/profile/ProfileHeader';
import { ProfileBio } from '../../components/features/profile/ProfileBio';
import { ProfileContactGrid } from '../../components/features/profile/ProfileContactGrid';
import { ProfileSocials } from '../../components/features/profile/ProfileSocials';
import { ProfileGalleryPreview } from '../../components/features/profile/ProfileGalleryPreview';
import { ProfileMediaEmbed } from '../../components/features/profile/ProfileMediaEmbed';
import { ProfileBentoGrid } from '../../components/features/profile/ProfileBentoGrid';
import { ProfileGridItem } from '../../components/features/profile/ProfileGridItem';
// ProfileActions is optional in preview as they are fixed position, maybe we mock them or render them absolute
import { ProfileActions } from '../../components/features/profile/ProfileActions';

import type {
  CustomLink,
  SecondaryContact,
  EmbeddedMedia,
  PersonalVisibilityConfig,
  BackgroundTheme,
} from '../../types/personalProfile';

interface PreviewData {
  display_name?: string;
  profile_title?: string;
  slug?: string;
  email?: string;
  phone?: string;
  website?: string;
  bio?: string;
  location?: string;
  avatar_url?: string;
  socials?: Record<string, string>;
  custom_links?: CustomLink[];
  categories?: string[];
  service_areas?: string[];
  brand_color?: string;
  background_theme?: BackgroundTheme;
  is_public?: boolean;
  embedded_media?: EmbeddedMedia;
  booking_calendar_url?: string;
  visibility_config?: Partial<PersonalVisibilityConfig>;
  secondary_emails?: SecondaryContact[];
  secondary_phones?: SecondaryContact[];
  is_verified?: boolean;
  badges?: string[];
  featured_gallery?: any; // Add this if available in preview data
}

interface PersonalProfilePreviewProps {
  data: PreviewData;
}

export function PersonalProfilePreview({ data }: PersonalProfilePreviewProps) {
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');

  const theme = getTheme(data.background_theme);
  const brandColor = data.brand_color || '#3B82F6';

  const Content = () => (
    <ProfileContainer
      theme={theme}
      brandColor={brandColor}
      className="!min-h-full" // Override min-h-screen for preview
    >
      <ProfileBentoGrid>
        {/* Header: Full Width */}
        <ProfileGridItem theme={theme} colSpan="full" className="p-0 bg-transparent shadow-none border-none">
          <ProfileHeader
            theme={theme}
            displayName={data.visibility_config?.display_name !== false ? (data.display_name || 'Your Name') : 'Anonymous'}
            profileTitle={data.visibility_config?.profile_title !== false ? data.profile_title : undefined}
            avatarUrl={data.visibility_config?.avatar_url !== false ? data.avatar_url : undefined}
            location={data.visibility_config?.location !== false ? data.location : undefined}
            isVerified={data.is_verified}
            badges={data.badges}
            brandColor={brandColor}
          />
        </ProfileGridItem>

        {/* Bio */}
        {data.bio && data.visibility_config?.bio !== false && (
          <ProfileGridItem theme={theme} colSpan={2} rowSpan={1} className="p-6 flex flex-col justify-center">
            <ProfileBio theme={theme} bio={data.bio} />
          </ProfileGridItem>
        )}

        {/* Socials - Filtered by visibility */}
        {(() => {
          const visibleSocials = data.socials ? Object.fromEntries(
            Object.entries(data.socials).filter(([key]) => {
              const visibilityKey = `socials_${key}` as keyof PersonalVisibilityConfig;
              return data.visibility_config?.[visibilityKey] !== false;
            })
          ) : {};

          return Object.keys(visibleSocials).length > 0 ? (
            <ProfileGridItem theme={theme} colSpan={2} className="p-6 flex items-center justify-center">
              <ProfileSocials theme={theme} socials={visibleSocials} />
            </ProfileGridItem>
          ) : null;
        })()}

        {/* Featured Gallery */}
        {data.featured_gallery && data.visibility_config?.featured_gallery !== false && (
          <ProfileGridItem theme={theme} colSpan={2} rowSpan={2} className="p-0 overflow-hidden relative group cursor-pointer">
            <ProfileGalleryPreview theme={theme} gallery={data.featured_gallery} />
          </ProfileGridItem>
        )}

        {/* Embedded Media */}
        {data.embedded_media && data.visibility_config?.embedded_media !== false && (
          <ProfileGridItem theme={theme} colSpan={2} rowSpan={1} className="p-0 overflow-hidden">
            <ProfileMediaEmbed theme={theme} media={data.embedded_media} />
          </ProfileGridItem>
        )}

        {/* Contact Grid - Filter values */}
        <ProfileGridItem theme={theme} colSpan={2} className="p-6">
          <ProfileContactGrid
            theme={theme}
            email={data.visibility_config?.email !== false ? data.email : undefined}
            phone={data.visibility_config?.phone !== false ? data.phone : undefined}
            website={data.visibility_config?.website !== false ? data.website : undefined}
            bookingUrl={data.visibility_config?.booking_calendar !== false ? data.booking_calendar_url : undefined}
            customLinks={data.visibility_config?.custom_links !== false ? data.custom_links : []}
            brandColor={brandColor}
          />
        </ProfileGridItem>
      </ProfileBentoGrid>

      {/* Watermark */}
      <div className={`text-center text-xs opacity-40 mt-8 pb-12 ${theme.colors.text}`}>
        <p>Powered by RawDrive</p>
      </div>
    </ProfileContainer>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-100px)]">
      {/* Preview Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Live Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('mobile')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'mobile'
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            title="Mobile view"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('desktop')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'desktop'
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            title="Desktop view"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview Viewport */}
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 p-4 md:p-8 overflow-hidden flex justify-center items-start">
        {viewMode === 'mobile' ? (
          // Realistic iPhone 15 Pro Frame
          <div className="relative w-[390px] h-[800px] bg-zinc-950 rounded-[55px] shadow-[0_0_0_12px_#1f1f1f,0_20px_50px_-10px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-white/10">
            {/* Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-full z-50 flex items-center justify-center pointer-events-none">
              <div className="w-2 h-2 rounded-full bg-zinc-800 ml-auto mr-3"></div>
            </div>

            {/* Side Buttons (Visual Only) */}
            <div className="absolute top-24 -left-[16px] w-[4px] h-8 bg-zinc-800 rounded-l-md"></div>
            <div className="absolute top-36 -left-[16px] w-[4px] h-16 bg-zinc-800 rounded-l-md"></div>
            <div className="absolute top-28 -right-[16px] w-[4px] h-24 bg-zinc-800 rounded-r-md"></div>

            {/* Screen Content */}
            <div className="w-full h-full bg-black overflow-hidden rounded-[44px] relative">
              <div className="h-full w-full overflow-y-auto scrollbar-hide pt-12">
                {/* Status Bar Mockup */}
                <div className="absolute top-0 w-full h-12 flex justify-between items-center px-6 text-white text-xs font-medium z-40 pointer-events-none">
                  <span>9:41</span>
                  <div className="flex gap-1.5">
                    <div className="w-4 h-2.5 rounded-[1px] border border-white/30"></div>
                    <div className="w-3 h-2.5 bg-white rounded-[1px]"></div>
                  </div>
                </div>
                <Content />
              </div>
            </div>
          </div>
        ) : (
          // Desktop View
          <div className="w-full h-full bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden relative">
            <div className="h-full w-full overflow-y-auto custom-scrollbar">
              <Content />
            </div>
          </div>
        )}
      </div>
      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
        <p className="text-xs text-zinc-500">
          {data.is_public ? (
            <span className="text-green-600 flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Publicly visible
            </span>
          ) : (
            'Private - visible only to you'
          )}
        </p>
      </div>
    </div>
  );
}

export default PersonalProfilePreview;
