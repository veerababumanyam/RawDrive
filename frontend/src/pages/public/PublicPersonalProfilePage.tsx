/**
 * PublicPersonalProfilePage
 *
 * Public page for viewing personal photographer profiles at /u/:slug.
 * Includes SEO meta tags, JSON-LD schema, share buttons, and embedded media.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  ExternalLink,
  Calendar,
  Download,
  QrCode,
  Share2,
  CheckCircle,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Music,
  Palette,
  Image,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { personalProfileService } from '../../services/personalProfileService';
import { EmbeddedTikTok } from '../../components/features/profile/EmbeddedTikTok';
import { EmbeddedSpotify } from '../../components/features/profile/EmbeddedSpotify';
import type { PublicPersonalProfile, BackgroundTheme } from '../../types/personalProfile';

// Social platform icons mapping
const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: Music,
  pinterest: Image,
  behance: Palette,
  dribbble: Palette,
  spotify: Music,
  whatsapp: Phone,
};

// Theme styles
const THEME_STYLES: Record<BackgroundTheme, { bg: string; text: string; accent: string; surface: string }> = {
  dark: {
    bg: 'bg-gray-900',
    text: 'text-white',
    accent: 'text-gray-300',
    surface: 'bg-gray-800',
  },
  pastel: {
    bg: 'bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50',
    text: 'text-gray-800',
    accent: 'text-gray-600',
    surface: 'bg-white/80',
  },
  bold: {
    bg: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
    text: 'text-white',
    accent: 'text-white/80',
    surface: 'bg-white/10',
  },
  cinematic: {
    bg: 'bg-gradient-to-b from-gray-900 via-gray-800 to-black',
    text: 'text-white',
    accent: 'text-gray-400',
    surface: 'bg-white/5',
  },
  minimal: {
    bg: 'bg-gray-50',
    text: 'text-gray-900',
    accent: 'text-gray-600',
    surface: 'bg-white',
  },
};

export function PublicPersonalProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicPersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

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
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(profile.public_url);
      alert('Link copied to clipboard!');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {error || 'Profile not found'}
        </h1>
        <p className="text-gray-600 text-center max-w-md">
          The profile you're looking for doesn't exist or has been made private.
        </p>
      </div>
    );
  }

  const theme = THEME_STYLES[profile.background_theme || 'minimal'];
  const brandColor = profile.brand_color || '#3B82F6';
  const visibleSocials = Object.entries(profile.socials || {}).filter(([, url]) => url);

  // SEO metadata
  const seoTitle = profile.seo_metadata?.meta_title || profile.display_name || 'Profile';
  const seoDescription =
    profile.seo_metadata?.meta_description ||
    profile.bio ||
    `${profile.display_name || 'Photographer'}'s profile`;
  const ogImage = profile.seo_metadata?.og_image || profile.avatar_url;

  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        {/* Robots directive based on workspace indexing settings */}
        {!profile.indexable && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        {profile.seo_metadata?.meta_keywords && (
          <meta name="keywords" content={profile.seo_metadata.meta_keywords.join(', ')} />
        )}

        {/* Open Graph */}
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={profile.seo_metadata?.og_title || seoTitle} />
        <meta
          property="og:description"
          content={profile.seo_metadata?.og_description || seoDescription}
        />
        <meta property="og:url" content={profile.public_url} />
        {ogImage && <meta property="og:image" content={ogImage} />}

        {/* Twitter Card */}
        <meta
          name="twitter:card"
          content={profile.seo_metadata?.twitter_card || 'summary_large_image'}
        />
        <meta name="twitter:title" content={profile.seo_metadata?.twitter_title || seoTitle} />
        <meta
          name="twitter:description"
          content={profile.seo_metadata?.twitter_description || seoDescription}
        />
        {(profile.seo_metadata?.twitter_image || ogImage) && (
          <meta name="twitter:image" content={profile.seo_metadata?.twitter_image || ogImage} />
        )}

        {/* JSON-LD Schema */}
        {profile.seo_schema && (
          <script type="application/ld+json">{JSON.stringify(profile.seo_schema)}</script>
        )}
      </Helmet>

      {/* Main Content */}
      <div className={`min-h-screen ${theme.bg}`}>
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Profile Header */}
          <div className="text-center mb-8">
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || 'Avatar'}
                className="w-32 h-32 rounded-full mx-auto mb-6 object-cover ring-4 ring-white/30 shadow-xl"
              />
            ) : (
              <div
                className="w-32 h-32 rounded-full mx-auto mb-6 flex items-center justify-center text-4xl font-bold text-white shadow-xl"
                style={{ backgroundColor: brandColor }}
              >
                {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}

            {/* Name & Verification */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <h1 className={`text-3xl font-bold ${theme.text}`}>
                {profile.display_name || 'Photographer'}
              </h1>
              {profile.is_verified && (
                <CheckCircle className="w-6 h-6" style={{ color: brandColor }} />
              )}
            </div>

            {/* Title */}
            {profile.profile_title && (
              <p className={`text-lg ${theme.accent} mb-2`}>{profile.profile_title}</p>
            )}

            {/* Location */}
            {profile.location && (
              <p className={`${theme.accent} flex items-center justify-center gap-1`}>
                <MapPin className="w-4 h-4" />
                {profile.location}
              </p>
            )}

            {/* Badges */}
            {profile.badges && profile.badges.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {profile.badges.map((badge) => (
                  <span
                    key={badge}
                    className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-600"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p
              className={`text-center mb-8 ${theme.accent} text-lg leading-relaxed max-w-lg mx-auto`}
            >
              {profile.bio}
            </p>
          )}

          {/* Categories */}
          {profile.categories && profile.categories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {profile.categories.map((category) => (
                <span
                  key={category}
                  className="px-4 py-1.5 text-sm font-medium rounded-full"
                  style={{
                    backgroundColor: `${brandColor}20`,
                    color: brandColor,
                  }}
                >
                  {category}
                </span>
              ))}
            </div>
          )}

          {/* Contact Buttons */}
          <div className="space-y-3 mb-8">
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-white font-semibold text-lg transition-transform hover:scale-[1.02] shadow-lg"
                style={{ backgroundColor: brandColor }}
              >
                <Mail className="w-5 h-5" />
                Email Me
              </a>
            )}

            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-semibold text-lg transition-transform hover:scale-[1.02] ${theme.surface} shadow-md`}
                style={{ color: brandColor }}
              >
                <Phone className="w-5 h-5" />
                Call Me
              </a>
            )}

            {profile.booking_calendar_url && (
              <a
                href={profile.booking_calendar_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-semibold text-lg transition-transform hover:scale-[1.02] border-2 ${theme.surface}`}
                style={{ borderColor: brandColor, color: brandColor }}
              >
                <Calendar className="w-5 h-5" />
                Book a Session
              </a>
            )}
          </div>

          {/* Social Media */}
          {visibleSocials.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {visibleSocials.map(([platform, url]) => {
                const Icon = SOCIAL_ICONS[platform] || Globe;
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-4 rounded-2xl transition-all hover:scale-110 shadow-md ${theme.surface}`}
                    title={platform}
                  >
                    <Icon className={`w-6 h-6 ${theme.text}`} />
                  </a>
                );
              })}
            </div>
          )}

          {/* Custom Links */}
          {profile.custom_links && profile.custom_links.length > 0 && (
            <div className="space-y-3 mb-8">
              {profile.custom_links
                .filter((l) => l.label && l.url)
                .map((link, index) => (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl transition-transform hover:scale-[1.01] shadow-md ${theme.surface}`}
                  >
                    <span className={`font-medium ${theme.text}`}>{link.label}</span>
                    <ExternalLink className={`w-5 h-5 ${theme.accent}`} />
                  </a>
                ))}
            </div>
          )}

          {/* Website */}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl mb-8 transition-transform hover:scale-[1.01] shadow-md ${theme.surface} ${theme.text}`}
            >
              <Globe className="w-5 h-5" />
              Visit Website
            </a>
          )}

          {/* Embedded Media */}
          {profile.embedded_media?.tiktok_username && (
            <div className="mb-8">
              <EmbeddedTikTok username={profile.embedded_media.tiktok_username} />
            </div>
          )}

          {profile.embedded_media?.spotify_playlist_id && (
            <div className="mb-8">
              <EmbeddedSpotify playlistId={profile.embedded_media.spotify_playlist_id} />
            </div>
          )}

          {/* Featured Gallery Preview */}
          {profile.featured_gallery && (
            <div className={`rounded-2xl overflow-hidden shadow-lg mb-8 ${theme.surface}`}>
              {profile.featured_gallery.cover_image_url && (
                <img
                  src={profile.featured_gallery.cover_image_url}
                  alt={profile.featured_gallery.name}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <h3 className={`font-semibold ${theme.text}`}>{profile.featured_gallery.name}</h3>
                {profile.featured_gallery.asset_count && (
                  <p className={`text-sm ${theme.accent}`}>
                    {profile.featured_gallery.asset_count} photos
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Service Areas */}
          {profile.service_areas && profile.service_areas.length > 0 && (
            <div className={`rounded-2xl p-6 mb-8 ${theme.surface}`}>
              <h3 className={`font-semibold mb-3 ${theme.text}`}>Available In</h3>
              <div className="flex flex-wrap gap-2">
                {profile.service_areas.map((area) => (
                  <span
                    key={area}
                    className={`px-3 py-1 text-sm rounded-full ${theme.accent}`}
                    style={{ backgroundColor: `${brandColor}10` }}
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div
            className={`flex justify-center gap-8 py-6 border-t ${
              profile.background_theme === 'dark' || profile.background_theme === 'cinematic'
                ? 'border-white/10'
                : 'border-gray-200'
            }`}
          >
            {profile.show_vcard && (
              <a
                href={personalProfileService.getVCardUrl(profile.slug)}
                className={`flex flex-col items-center gap-2 ${theme.accent} hover:opacity-70 transition-opacity`}
              >
                <Download className="w-6 h-6" />
                <span className="text-sm">vCard</span>
              </a>
            )}
            {profile.show_qr_code && (
              <button
                onClick={() => setShowQrModal(true)}
                className={`flex flex-col items-center gap-2 ${theme.accent} hover:opacity-70 transition-opacity`}
              >
                <QrCode className="w-6 h-6" />
                <span className="text-sm">QR Code</span>
              </button>
            )}
            <button
              onClick={handleShare}
              className={`flex flex-col items-center gap-2 ${theme.accent} hover:opacity-70 transition-opacity`}
            >
              <Share2 className="w-6 h-6" />
              <span className="text-sm">Share</span>
            </button>
          </div>

          {/* Powered By */}
          <p className={`text-center text-sm ${theme.accent} mt-8 opacity-50`}>
            Powered by RawDrive
          </p>
        </div>

        {/* QR Code Modal */}
        {showQrModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowQrModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Scan to Connect</h3>
              <img
                src={personalProfileService.getQrCodeUrl(profile.slug)}
                alt="QR Code"
                className="w-full aspect-square"
              />
              <a
                href={personalProfileService.getQrCodeUrl(profile.slug)}
                download={`${profile.slug}-qr.png`}
                className="flex items-center justify-center gap-2 w-full mt-4 py-3 bg-gray-100 rounded-xl text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download QR Code
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default PublicPersonalProfilePage;
