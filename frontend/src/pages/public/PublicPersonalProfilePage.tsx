/**
 * PublicPersonalProfilePage
 *
 * Public page for viewing personal photographer profiles at /u/:slug.
 * NOW UPDATED to use the Bento Grid Design System.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, AlertCircle } from 'lucide-react';

import { personalProfileService } from '../../services/personalProfileService';
import type { PublicPersonalProfile } from '../../types/personalProfile';

// New Design System Components
import { getTheme } from '../../components/features/profile/ProfileThemeEngine';
import { ProfileContainer } from '../../components/features/profile/ProfileContainer';
import { ProfileHeader } from '../../components/features/profile/ProfileHeader';
import { ProfileBio } from '../../components/features/profile/ProfileBio';
import { ProfileContactGrid } from '../../components/features/profile/ProfileContactGrid';
import { ProfileSocials } from '../../components/features/profile/ProfileSocials';
import { ProfileGalleryPreview } from '../../components/features/profile/ProfileGalleryPreview';
import { ProfileMediaEmbed } from '../../components/features/profile/ProfileMediaEmbed';
import { ProfileActions } from '../../components/features/profile/ProfileActions';
import { ProfileBentoGrid } from '../../components/features/profile/ProfileBentoGrid';
import { ProfileGridItem } from '../../components/features/profile/ProfileGridItem';

export function PublicPersonalProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicPersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    if (!slug) return;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await personalProfileService.getPublicProfile(slug);
        setProfile(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('Profile not found');
        } else {
          setError('Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [slug]);

  // Handle share
  const handleShare = async () => {
    if (!profile) return;

    const shareData = {
      title: profile.display_name || 'Profile',
      text: profile.bio || `Check out ${profile.display_name}'s profile`,
      url: profile.public_url,
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(profile.public_url);
      alert('Link copied to clipboard!');
    }
  };

  const handleDownloadVCard = () => {
    if (profile) {
      window.location.href = personalProfileService.getVCardUrl(profile.slug);
    }
  };

  const handleDownloadQr = () => {
    // Logic to download as image or open modal (simplifying to new window for now or we can reimplement modal)
    // The previous implementation had a modal. For "ProfileActions", we might want a modal handling at this level.
    // For now, let's just open the image in new tab to force download
    if (profile) {
      const link = document.createElement('a');
      link.href = personalProfileService.getQrCodeUrl(profile.slug);
      link.download = `${profile.slug}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <AlertCircle className="w-16 h-16 text-gray-300 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {error || 'Profile not found'}
        </h1>
        <p className="text-gray-500 text-center max-w-md">
          The profile you're looking for doesn't exist or has been made private.
        </p>
      </div>
    );
  }

  // ... (keeping imports and state logic same until the return)
  const theme = getTheme(profile.background_theme);
  const brandColor = '#3B82F6';

  // SEO metadata
  const seoTitle = profile.seo_metadata?.meta_title || profile.display_name || 'Profile';
  const seoDescription =
    profile.seo_metadata?.meta_description ||
    profile.bio ||
    `${profile.display_name || 'Photographer'}'s profile`;
  const ogImage = profile.seo_metadata?.og_image || profile.avatar_url;

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        {!profile.indexable && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        {profile.seo_metadata?.meta_keywords && (
          <meta name="keywords" content={profile.seo_metadata.meta_keywords.join(', ')} />
        )}

        <meta property="og:type" content="profile" />
        <meta property="og:title" content={profile.seo_metadata?.og_title || seoTitle} />
        <meta property="og:description" content={profile.seo_metadata?.og_description || seoDescription} />
        <meta property="og:url" content={profile.public_url} />
        {ogImage && <meta property="og:image" content={ogImage} />}

        <meta name="twitter:card" content={profile.seo_metadata?.twitter_card || 'summary_large_image'} />
        <meta name="twitter:title" content={profile.seo_metadata?.twitter_title || seoTitle} />
        <meta name="twitter:description" content={profile.seo_metadata?.twitter_description || seoDescription} />
        {(profile.seo_metadata?.twitter_image || ogImage) && (
          <meta name="twitter:image" content={profile.seo_metadata?.twitter_image || ogImage} />
        )}

        {profile.seo_schema && (
          <script type="application/ld+json">{JSON.stringify(profile.seo_schema)}</script>
        )}
      </Helmet>

      <ProfileContainer theme={theme} brandColor={brandColor}>

        {/* Bento Grid Layout */}
        <ProfileBentoGrid>
          {/* Header: Full Width */}
          <ProfileGridItem theme={theme} colSpan="full" className="p-0 bg-transparent shadow-none border-none">
            <ProfileHeader
              theme={theme}
              displayName={profile.display_name || 'Photographer'}
              profileTitle={profile.profile_title}
              avatarUrl={profile.avatar_url}
              location={profile.location}
              isVerified={profile.is_verified}
              badges={profile.badges}
              brandColor={brandColor}
            />
          </ProfileGridItem>

          {/* Main Content Row: Bio + Socials */}
          {profile.bio && (
            <ProfileGridItem theme={theme} colSpan={2} rowSpan={1} className="p-6 flex flex-col justify-center">
              <ProfileBio theme={theme} bio={profile.bio} />
            </ProfileGridItem>
          )}

          {profile.socials && Object.keys(profile.socials).length > 0 && (
            <ProfileGridItem theme={theme} colSpan={2} className="p-6 flex items-center justify-center">
              <ProfileSocials theme={theme} socials={profile.socials} />
            </ProfileGridItem>
          )}

          {/* Featured Section: Gallery (Prominent) */}
          {profile.featured_gallery && (
            <ProfileGridItem theme={theme} colSpan={2} rowSpan={2} className="p-0 overflow-hidden relative group cursor-pointer">
              <ProfileGalleryPreview theme={theme} gallery={profile.featured_gallery} />
            </ProfileGridItem>
          )}

          {/* Embedded Media (TikTok/Spotify) */}
          {profile.embedded_media && (
            <ProfileGridItem theme={theme} colSpan={2} rowSpan={1} className="p-0 overflow-hidden">
              <ProfileMediaEmbed theme={theme} media={profile.embedded_media} />
            </ProfileGridItem>
          )}

          {/* Contact & Links Grid - Spanning remaining space */}
          <ProfileGridItem theme={theme} colSpan={2} className="p-6">
            <ProfileContactGrid
              theme={theme}
              email={profile.email}
              phone={profile.phone}
              website={profile.website}
              bookingUrl={profile.booking_calendar_url}
              customLinks={profile.custom_links}
              brandColor={brandColor}
            />
          </ProfileGridItem>

        </ProfileBentoGrid>

        {/* Footer actions / Floating actions */}
        <div className="mt-8 mb-24 flex justify-center w-full">
          <ProfileActions
            theme={theme}
            slug={profile.slug}
            showVCard={profile.show_vcard}
            showQrCode={profile.show_qr_code}
            onShare={handleShare}
            onDownloadVCard={handleDownloadVCard}
            onDownloadQr={handleDownloadQr}
          />
        </div>

        <div className={`text-center text-xs opacity-40 pb-12 ${theme.colors.text}`}>
          <p>Powered by RawDrive</p>
        </div>

      </ProfileContainer>
    </>
  );
}

export default PublicPersonalProfilePage;
