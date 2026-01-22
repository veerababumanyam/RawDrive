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
        <div
          className={`transition-all duration-300 shadow-2xl overflow-hidden bg-white ${viewMode === 'mobile'
              ? 'w-[375px] h-full rounded-[3rem] border-8 border-zinc-900'
              : 'w-full h-full rounded-lg border border-zinc-200 dark:border-zinc-800'
            }`}
        >
          {/* Scrollable Content Area */}
          <div className="h-full w-full overflow-y-auto custom-scrollbar">
            <ProfileContainer
              theme={theme}
              brandColor={brandColor}
              className="!min-h-full" // Override min-h-screen for preview
            >
              <ProfileHeader
                theme={theme}
                displayName={data.display_name || 'Your Name'}
                profileTitle={data.profile_title}
                avatarUrl={data.avatar_url}
                location={data.location}
                isVerified={data.is_verified}
                badges={data.badges}
                brandColor={brandColor}
              />

              {data.bio && <ProfileBio theme={theme} bio={data.bio} />}

              {data.socials && <ProfileSocials theme={theme} socials={data.socials} />}

              <ProfileContactGrid
                theme={theme}
                email={data.email}
                phone={data.phone}
                website={data.website}
                bookingUrl={data.booking_calendar_url}
                customLinks={data.custom_links}
                brandColor={brandColor}
              />

              {data.embedded_media && (
                <ProfileMediaEmbed theme={theme} media={data.embedded_media} />
              )}

              {/* Featured Gallery Preview (Mock if missing) */}
              {data.featured_gallery && (
                <ProfileGalleryPreview theme={theme} gallery={data.featured_gallery} />
              )}

              {/* Watermark */}
              <div className={`text-center text-xs opacity-40 mt-8 pb-12 ${theme.colors.text}`}>
                <p>Powered by RawDrive</p>
              </div>

              {/* Note: ProfileActions usually fixed, might be weird in preview container. 
                   We can render them but maybe absolute within the container. 
               */}
              <div className="relative h-16 pointer-events-none">
                {/* Spacer for floating actions visually */}
              </div>

            </ProfileContainer>

            {/* Render Actions absolute to the container so they look 'fixed' inside the phone/desktop frame */}
            <div className="sticky bottom-6 flex justify-center w-full pointer-events-none">
              <div className="pointer-events-auto">
                <ProfileActions
                  theme={theme}
                  slug={data.slug || 'preview'}
                  showVCard={true}
                  showQrCode={true}
                  onShare={() => { }}
                  onDownloadVCard={() => { }}
                  onDownloadQr={() => { }}
                />
              </div>
            </div>
          </div>
        </div>
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
