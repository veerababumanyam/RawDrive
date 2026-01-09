/**
 * PersonalProfilePreview Component
 *
 * Real-time preview of the personal profile as it will appear publicly.
 * Shows a device-framed preview with responsive mobile/desktop modes.
 */

import { useState } from 'react';
import {
  Smartphone,
  Monitor,
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
} from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import type {
  CustomLink,
  SecondaryContact,
  EmbeddedMedia,
  PersonalVisibilityConfig,
  BackgroundTheme,
} from '../../types/personalProfile';

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
const THEME_STYLES: Record<BackgroundTheme, { bg: string; text: string; accent: string }> = {
  dark: { bg: 'bg-gray-900', text: 'text-white', accent: 'text-gray-300' },
  pastel: { bg: 'bg-pink-50', text: 'text-gray-800', accent: 'text-gray-600' },
  bold: { bg: 'bg-gradient-to-br from-purple-600 to-pink-500', text: 'text-white', accent: 'text-white/80' },
  cinematic: { bg: 'bg-gradient-to-b from-gray-800 to-gray-900', text: 'text-white', accent: 'text-gray-400' },
  minimal: { bg: 'bg-white', text: 'text-gray-900', accent: 'text-gray-600' },
};

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
}

interface PersonalProfilePreviewProps {
  data: PreviewData;
}

export function PersonalProfilePreview({ data }: PersonalProfilePreviewProps) {
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');

  const theme = THEME_STYLES[data.background_theme || 'minimal'];
  const brandColor = data.brand_color || '#3B82F6';

  // Filter visible socials
  const visibleSocials = Object.entries(data.socials || {}).filter(([, url]) => url);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Preview Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-text-primary">Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('mobile')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'mobile'
                ? 'bg-primary/10 text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            title="Mobile view"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('desktop')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'desktop'
                ? 'bg-primary/10 text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            title="Desktop view"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview Container */}
      <div className="p-4 bg-surface-hover flex justify-center">
        <div
          className={`transition-all duration-300 overflow-hidden rounded-2xl shadow-lg ${
            viewMode === 'mobile' ? 'w-[320px]' : 'w-full max-w-[600px]'
          }`}
        >
          {/* Device Frame */}
          <div className={`${theme.bg} min-h-[500px] overflow-y-auto`}>
            {/* Profile Content */}
            <div className="p-6">
              {/* Avatar & Name */}
              <div className="text-center mb-6">
                {data.avatar_url ? (
                  <img
                    src={data.avatar_url}
                    alt={data.display_name || 'Avatar'}
                    className="w-24 h-24 rounded-full mx-auto mb-4 object-cover ring-4 ring-white/20"
                  />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white"
                    style={{ backgroundColor: brandColor }}
                  >
                    {data.display_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}

                <div className="flex items-center justify-center gap-2">
                  <h1 className={`text-xl font-bold ${theme.text}`}>
                    {data.display_name || 'Your Name'}
                  </h1>
                  {data.is_verified && (
                    <CheckCircle
                      className="w-5 h-5"
                      style={{ color: brandColor }}
                    />
                  )}
                </div>

                {data.profile_title && (
                  <p className={`mt-1 ${theme.accent}`}>{data.profile_title}</p>
                )}

                {data.location && (
                  <p className={`mt-2 text-sm ${theme.accent} flex items-center justify-center gap-1`}>
                    <MapPin className="w-4 h-4" />
                    {data.location}
                  </p>
                )}
              </div>

              {/* Bio */}
              {data.bio && (
                <p className={`text-center mb-6 ${theme.accent} text-sm leading-relaxed`}>
                  {data.bio}
                </p>
              )}

              {/* Categories */}
              {data.categories && data.categories.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                  {data.categories.slice(0, 5).map((category) => (
                    <span
                      key={category}
                      className="px-3 py-1 text-xs font-medium rounded-full"
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
              <div className="space-y-3 mb-6">
                {data.email && (
                  <a
                    href={`mailto:${data.email}`}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-medium transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: brandColor }}
                  >
                    <Mail className="w-5 h-5" />
                    Email Me
                  </a>
                )}

                {data.phone && (
                  <a
                    href={`tel:${data.phone}`}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border font-medium transition-colors"
                    style={{
                      borderColor: brandColor,
                      color: brandColor,
                    }}
                  >
                    <Phone className="w-5 h-5" />
                    Call Me
                  </a>
                )}

                {data.booking_calendar_url && (
                  <a
                    href={data.booking_calendar_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border font-medium transition-colors"
                    style={{
                      borderColor: brandColor,
                      color: brandColor,
                    }}
                  >
                    <Calendar className="w-5 h-5" />
                    Book a Session
                  </a>
                )}
              </div>

              {/* Social Links */}
              {visibleSocials.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  {visibleSocials.map(([platform, url]) => {
                    const Icon = SOCIAL_ICONS[platform] || Globe;
                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-3 rounded-full transition-transform hover:scale-110 ${
                          data.background_theme === 'minimal' || data.background_theme === 'pastel'
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                        title={platform}
                      >
                        <Icon className="w-5 h-5" />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Custom Links */}
              {data.custom_links && data.custom_links.length > 0 && (
                <div className="space-y-2 mb-6">
                  {data.custom_links.filter((l) => l.label && l.url).map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl transition-colors ${
                        data.background_theme === 'minimal' || data.background_theme === 'pastel'
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <span className="font-medium">{link.label}</span>
                      <ExternalLink className="w-4 h-4 opacity-50" />
                    </a>
                  ))}
                </div>
              )}

              {/* Website */}
              {data.website && (
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl mb-6 ${
                    data.background_theme === 'minimal' || data.background_theme === 'pastel'
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Globe className="w-5 h-5" />
                  Visit Website
                </a>
              )}

              {/* Quick Actions */}
              <div className="flex justify-center gap-4 pt-4 border-t border-white/10">
                <button
                  className={`flex flex-col items-center gap-1 ${theme.accent} hover:opacity-80`}
                  title="Download vCard"
                >
                  <Download className="w-5 h-5" />
                  <span className="text-xs">vCard</span>
                </button>
                <button
                  className={`flex flex-col items-center gap-1 ${theme.accent} hover:opacity-80`}
                  title="QR Code"
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-xs">QR</span>
                </button>
                <button
                  className={`flex flex-col items-center gap-1 ${theme.accent} hover:opacity-80`}
                  title="Share"
                >
                  <Share2 className="w-5 h-5" />
                  <span className="text-xs">Share</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Footer */}
      <div className="px-4 py-3 border-t border-border bg-surface">
        <p className="text-xs text-text-tertiary text-center">
          {data.is_public ? (
            <span className="text-success flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Profile is public
            </span>
          ) : (
            'Profile is private - enable "Public Profile" to share'
          )}
        </p>
      </div>
    </div>
  );
}

export default PersonalProfilePreview;
