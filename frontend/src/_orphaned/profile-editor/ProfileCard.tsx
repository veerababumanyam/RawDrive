/**
 * ProfileCard Component
 *
 * Reusable profile card component that renders company profile data.
 * Used by both PublicProfileView (live) and LivePreviewPanel (editor).
 *
 * Requirements: 2.7
 */

import React from 'react';
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  MessageCircle,
  Music2,
  Download,
  QrCode,
  Share2,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

// =============================================================================
// Types
// =============================================================================

export interface ProfileCardData {
  name?: string;
  tagline?: string;
  logo_url?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_structured?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  socials?: Record<string, string>;
  custom_links?: Array<{ label: string; url: string }>;
}

export interface ProfileCardProps {
  /** Profile data to display */
  profile: ProfileCardData;
  /** CSS variables to apply (from theme/customization) */
  cssVariables?: Record<string, string>;
  /** Whether actions (download, share) are enabled */
  actionsEnabled?: boolean;
  /** Callback for download vCard */
  onDownloadVCard?: () => void;
  /** Callback for download QR code */
  onDownloadQR?: () => void;
  /** Callback for share */
  onShare?: () => void;
  /** Whether the card is in preview mode (read-only, no interactions) */
  isPreview?: boolean;
  /** Additional class names */
  className?: string;
}

// =============================================================================
// Social Icon Mapping
// =============================================================================

const SOCIAL_ICONS: Record<string, { icon: React.ReactNode; color: string; urlPrefix?: string }> = {
  instagram: { icon: <Instagram size={24} />, color: '#E4405F', urlPrefix: 'https://instagram.com/' },
  facebook: { icon: <Facebook size={24} />, color: '#1877F2' },
  twitter: { icon: <Twitter size={24} />, color: '#1DA1F2' },
  linkedin: { icon: <Linkedin size={24} />, color: '#0A66C2' },
  youtube: { icon: <Youtube size={24} />, color: '#FF0000' },
  whatsapp: { icon: <MessageCircle size={24} />, color: '#25D366', urlPrefix: 'https://wa.me/' },
  tiktok: { icon: <Music2 size={24} />, color: '#000000' },
};

// =============================================================================
// Component
// =============================================================================

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  cssVariables = {},
  actionsEnabled = true,
  onDownloadVCard,
  onDownloadQR,
  onShare,
  isPreview = false,
  className = '',
}) => {
  const {
    name,
    tagline,
    logo_url,
    email,
    phone,
    website,
    address_structured,
    socials,
    custom_links,
  } = profile;

  const displayName = name || 'Company Profile';

  // Build inline styles from CSS variables
  // CSS custom properties need to be passed as a style object with string keys
  const cardStyle = cssVariables as React.CSSProperties;

  const handleAction = (action: (() => void) | undefined) => {
    if (isPreview || !action) return;
    action();
  };

  const getSocialUrl = (platform: string, value: string): string => {
    const config = SOCIAL_ICONS[platform];
    if (!config) return value;

    // If the value already looks like a URL, use it directly
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    // Otherwise, prepend the platform's URL prefix if available
    if (config.urlPrefix) {
      return `${config.urlPrefix}${value.replace('@', '')}`;
    }

    return value;
  };

  return (
    <div
      className={`w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-all ${isPreview ? '' : 'hover:shadow-2xl'} ${className}`}
      style={cardStyle}
      data-testid="profile-card"
    >
      {/* Header / Brand */}
      <div className="relative pt-12 pb-8 px-8 text-center bg-gradient-to-b from-primary/5 to-transparent">
        {logo_url ? (
          <div className="mx-auto w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-6 bg-white dark:bg-gray-800 flex items-center justify-center">
            <img src={logo_url} alt={displayName} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="mx-auto w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-6 bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
            {displayName.charAt(0)}
          </div>
        )}

        {name && (
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2" style={{ fontFamily: cssVariables['--font-heading'] }}>
            {name}
          </h1>
        )}
        {tagline && (
          <p className="text-lg text-gray-600 dark:text-gray-400 font-medium" style={{ fontFamily: cssVariables['--font-body'] }}>
            {tagline}
          </p>
        )}
      </div>

      {/* Actions */}
      {actionsEnabled && (
        <div className="px-8 pb-8 flex gap-3 justify-center">
          <AppButton
            variant="primary"
            className="flex-1"
            onClick={() => handleAction(onDownloadVCard)}
            disabled={isPreview}
          >
            <Download size={18} className="mr-2" />
            Save Contact
          </AppButton>
          <AppButton
            variant="outline"
            size="icon"
            onClick={() => handleAction(onDownloadQR)}
            disabled={isPreview}
            title="QR Code"
          >
            <QrCode size={20} />
          </AppButton>
          <AppButton
            variant="outline"
            size="icon"
            onClick={() => handleAction(onShare)}
            disabled={isPreview}
            title="Share"
          >
            <Share2 size={20} />
          </AppButton>
        </div>
      )}

      {/* Contact Details */}
      <div className="px-8 py-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
        {email && (
          <a
            href={isPreview ? undefined : `mailto:${email}`}
            className={`flex items-center gap-4 text-gray-700 dark:text-gray-300 transition-colors p-3 rounded-xl ${isPreview ? 'cursor-default' : 'hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            onClick={(e) => isPreview && e.preventDefault()}
          >
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
              <Mail size={20} />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">Email</div>
              <div className="font-medium">{email}</div>
            </div>
          </a>
        )}

        {phone && (
          <a
            href={isPreview ? undefined : `tel:${phone}`}
            className={`flex items-center gap-4 text-gray-700 dark:text-gray-300 transition-colors p-3 rounded-xl ${isPreview ? 'cursor-default' : 'hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            onClick={(e) => isPreview && e.preventDefault()}
          >
            <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
              <Phone size={20} />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">Phone</div>
              <div className="font-medium">{phone}</div>
            </div>
          </a>
        )}

        {website && (
          <a
            href={isPreview ? undefined : website}
            target={isPreview ? undefined : '_blank'}
            rel={isPreview ? undefined : 'noopener noreferrer'}
            className={`flex items-center gap-4 text-gray-700 dark:text-gray-300 transition-colors p-3 rounded-xl ${isPreview ? 'cursor-default' : 'hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            onClick={(e) => isPreview && e.preventDefault()}
          >
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg">
              <Globe size={20} />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">Website</div>
              <div className="font-medium truncate">
                {website.replace(/^https?:\/\//, '')}
              </div>
            </div>
          </a>
        )}

        {address_structured?.line1 && (
          <div className="flex items-center gap-4 text-gray-700 dark:text-gray-300 p-3 rounded-xl">
            <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
              <MapPin size={20} />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">Location</div>
              <div className="font-medium">
                {address_structured.line1}
                {address_structured.line2 && <><br />{address_structured.line2}</>}
                <br />
                {[
                  address_structured.city,
                  address_structured.state,
                  address_structured.postal_code,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Socials & Custom Links */}
      {(socials && Object.keys(socials).length > 0) || (custom_links && custom_links.length > 0) ? (
        <div className="px-8 py-6 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          {/* Social Icons */}
          {socials && Object.keys(socials).length > 0 && (
            <div className="grid grid-cols-4 gap-4 justify-items-center">
              {Object.entries(socials).map(([platform, value]) => {
                if (!value) return null;
                const config = SOCIAL_ICONS[platform];
                if (!config) return null;

                return (
                  <a
                    key={platform}
                    href={isPreview ? undefined : getSocialUrl(platform, value)}
                    target={isPreview ? undefined : '_blank'}
                    rel={isPreview ? undefined : 'noopener noreferrer'}
                    className={`p-3 bg-white dark:bg-gray-800 shadow-sm rounded-full transition-transform ${isPreview ? 'cursor-default' : 'hover:shadow-md hover:-translate-y-1'}`}
                    style={{ color: config.color }}
                    onClick={(e) => isPreview && e.preventDefault()}
                    aria-label={platform}
                  >
                    {config.icon}
                  </a>
                );
              })}
            </div>
          )}

          {/* Custom Links */}
          {custom_links && custom_links.length > 0 && (
            <div className="mt-6 space-y-3">
              {custom_links.map((link, idx) => (
                <a
                  key={idx}
                  href={isPreview ? undefined : link.url}
                  target={isPreview ? undefined : '_blank'}
                  rel={isPreview ? undefined : 'noopener noreferrer'}
                  className={`block w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-center font-medium text-gray-700 dark:text-gray-200 shadow-sm ${isPreview ? 'cursor-default' : 'hover:border-primary hover:text-primary hover:shadow transition-all'}`}
                  onClick={(e) => isPreview && e.preventDefault()}
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Footer */}
      <div className="py-4 text-center text-xs text-gray-400">
        Powered by RawDrive
      </div>
    </div>
  );
};

export default ProfileCard;
