/**
 * Live Preview Panel Component
 *
 * Displays a real-time preview of the public profile with responsive
 * device mode switching. Uses the same rendering components as the
 * live public profile.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 2.11
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { RefreshCw, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { ProfileCard } from '@/components/features/profile/ProfileCard';
import type {
  DeviceMode,
  Theme,
  ThemeCustomization,
  ProfileVisibilityConfig,
  EnhancedCompanyProfile,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface LivePreviewPanelProps {
  profile: EnhancedCompanyProfile | null;
  visibility: ProfileVisibilityConfig | null;
  theme: Theme | null;
  customization: ThemeCustomization | null;
  deviceMode: DeviceMode;
  onRefresh?: () => void;
}

// =============================================================================
// Device Dimensions
// =============================================================================

const DEVICE_DIMENSIONS: Record<DeviceMode, { width: number; height: number; label: string }> = {
  phone: { width: 375, height: 812, label: 'iPhone 13' },
  tablet: { width: 768, height: 1024, label: 'iPad' },
  desktop: { width: 1440, height: 900, label: 'Desktop' },
};

// =============================================================================
// Component
// =============================================================================

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  profile,
  visibility,
  theme,
  customization,
  deviceMode,
  onRefresh,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const dimensions = DEVICE_DIMENSIONS[deviceMode];

  // Calculate optimal scale to fit preview in container
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerWidth = container.clientWidth - 64; // padding
      const containerHeight = container.clientHeight - 100; // padding + header

      const scaleX = containerWidth / dimensions.width;
      const scaleY = containerHeight / dimensions.height;

      // Use the smaller scale to ensure the preview fits
      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(Math.max(newScale, 0.25)); // Min 25% scale
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [dimensions.width, dimensions.height, deviceMode]);

  // Compute CSS variables from theme + customization
  const computedStyles = useMemo(() => {
    if (!theme) return {};

    const baseColors = theme.base_colors;
    const customColors = customization?.custom_colors || {};

    return {
      '--preview-primary': customColors.primary || baseColors.primary,
      '--preview-secondary': customColors.secondary || baseColors.secondary,
      '--preview-accent': customColors.accent || baseColors.accent,
      '--preview-bg': theme.variants?.[0]?.colors.background || '#ffffff',
      '--preview-surface': theme.variants?.[0]?.colors.surface || '#f8fafc',
      '--preview-text-primary': theme.variants?.[0]?.colors.text_primary || '#0f172a',
      '--preview-text-secondary': theme.variants?.[0]?.colors.text_secondary || '#64748b',
    } as React.CSSProperties;
  }, [theme, customization]);

  // Filter profile data based on visibility
  const filteredProfile = useMemo(() => {
    if (!profile || !visibility) return profile;

    const fieldVisibility = visibility.field_visibility || {};
    const socialVisibility = visibility.social_visibility || {};

    const filtered: Record<string, unknown> = {};

    // Filter fields
    Object.entries(profile).forEach(([key, value]) => {
      if ((fieldVisibility as Record<string, boolean>)[key] !== false) {
        filtered[key] = value;
      }
    });

    // Filter socials
    if (filtered.socials && typeof filtered.socials === 'object') {
      const filteredSocials: Record<string, string> = {};
      Object.entries(filtered.socials as Record<string, string>).forEach(
        ([platform, url]) => {
          if ((socialVisibility as Record<string, boolean>)[platform] !== false) {
            filteredSocials[platform] = url;
          }
        }
      );
      filtered.socials = filteredSocials;
    }

    return filtered as unknown as EnhancedCompanyProfile;
  }, [profile, visibility]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Compute CSS variables for ProfileCard
  const cssVariables = useMemo(() => {
    if (!theme) return {};

    const baseColors = theme.base_colors;
    const customColors = customization?.custom_colors || {};

    const vars: Record<string, string> = {
      '--color-primary': customColors.primary || baseColors.primary,
      '--color-secondary': customColors.secondary || baseColors.secondary,
      '--color-accent': customColors.accent || baseColors.accent,
    };

    // Add font variables from theme/customization
    const typography = theme.default_typography;
    const customTypography = customization?.custom_typography;

    if (customTypography?.heading_font?.family || typography?.heading_font?.family) {
      vars['--font-heading'] = `"${customTypography?.heading_font?.family || typography?.heading_font?.family}", system-ui, sans-serif`;
    }
    if (customTypography?.body_font?.family || typography?.body_font?.family) {
      vars['--font-body'] = `"${customTypography?.body_font?.family || typography?.body_font?.family}", system-ui, sans-serif`;
    }

    return vars;
  }, [theme, customization]);

  // Render the profile preview content
  const renderPreviewContent = () => {
    if (!filteredProfile) {
      return (
        <div className="flex items-center justify-center h-full text-text-tertiary">
          <p>No profile data available</p>
        </div>
      );
    }

    // Use ProfileCard for card-style preview (phone/tablet)
    // Use PublicProfilePreview for full-page desktop view
    if (deviceMode === 'phone' || deviceMode === 'tablet') {
      return (
        <div className="flex items-center justify-center min-h-full p-4 bg-gray-100">
          <ProfileCard
            profile={{
              name: filteredProfile.name,
              tagline: filteredProfile.tagline,
              logo_url: filteredProfile.logo_url,
              email: filteredProfile.email,
              phone: filteredProfile.phone,
              website: filteredProfile.website,
              address_structured: filteredProfile.address_structured,
              socials: filteredProfile.socials,
              custom_links: filteredProfile.custom_links,
            }}
            cssVariables={cssVariables}
            actionsEnabled={true}
            isPreview={true}
          />
        </div>
      );
    }

    return <PublicProfilePreview profile={filteredProfile} theme={theme} />;
  };

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col items-center justify-start p-8 bg-surface-hover/50 overflow-auto"
    >
      {/* Preview Header */}
      <div className="flex items-center justify-between w-full max-w-[800px] mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">
            {dimensions.label} ({dimensions.width}×{dimensions.height})
          </span>
          <span className="text-xs text-text-tertiary">
            {Math.round(scale * 100)}% scale
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="ghost"
            size="icon"
            onClick={() => setScale((s) => Math.max(s - 0.1, 0.25))}
            title="Zoom out"
            aria-label="Zoom out preview"
          >
            <ZoomOut className="w-4 h-4" />
          </AppButton>
          <AppButton
            variant="ghost"
            size="icon"
            onClick={() => setScale((s) => Math.min(s + 0.1, 1.5))}
            title="Zoom in"
            aria-label="Zoom in preview"
          >
            <ZoomIn className="w-4 h-4" />
          </AppButton>
          <AppButton
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh preview"
            aria-label="Refresh preview"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </AppButton>
          {profile?.slug && (
            <AppButton
              variant="ghost"
              size="icon"
              onClick={() => window.open(`/p/${profile.slug}`, '_blank')}
              title="Open live profile"
              aria-label="Open live profile in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </AppButton>
          )}
        </div>
      </div>

      {/* Device Frame */}
      <div
        className="relative bg-gray-800 rounded-[32px] p-2 shadow-2xl transition-all duration-300"
        style={{
          width: dimensions.width * scale + 16,
          minHeight: dimensions.height * scale + 16,
        }}
      >
        {/* Device notch (for phone) */}
        {deviceMode === 'phone' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-800 rounded-b-xl z-10" />
        )}

        {/* Preview iframe/container */}
        <div
          className="bg-white rounded-[24px] overflow-hidden"
          style={{
            width: dimensions.width * scale,
            height: dimensions.height * scale,
            transformOrigin: 'top left',
          }}
        >
          {/* Scaled content wrapper */}
          <div
            className="origin-top-left"
            style={{
              width: dimensions.width,
              height: dimensions.height,
              transform: `scale(${scale})`,
              ...computedStyles,
            }}
          >
            {/* Read-only overlay to prevent interaction */}
            <div
              className="absolute inset-0 z-50"
              style={{ pointerEvents: 'auto', cursor: 'default' }}
              onClick={(e) => e.preventDefault()}
              onKeyDown={(e) => e.preventDefault()}
              tabIndex={-1}
              role="presentation"
              aria-hidden="true"
            />

            {/* Actual preview content */}
            <div className="h-full overflow-auto" style={{ pointerEvents: 'none' }}>
              {renderPreviewContent()}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Banner */}
      <div className="mt-4 px-4 py-2 bg-amber-100 text-amber-800 text-xs rounded-full">
        Preview Mode - Changes are reflected in real-time
      </div>
    </div>
  );
};

// =============================================================================
// Public Profile Preview Component
// =============================================================================

interface PublicProfilePreviewProps {
  profile: EnhancedCompanyProfile;
  theme: Theme | null;
}

const PublicProfilePreview: React.FC<PublicProfilePreviewProps> = ({ profile, theme }) => {
  // Use theme colors or defaults
  const themeColors = theme?.variants?.[0]?.colors || {
    background: '#ffffff',
    surface: '#f8fafc',
    text_primary: '#0f172a',
    text_secondary: '#64748b',
  };

  const primaryColor = theme?.base_colors?.primary || '#2563eb';
  const accentColor = theme?.base_colors?.accent || '#06b6d4';

  return (
    <div
      className="min-h-full"
      style={{
        backgroundColor: themeColors.background,
        color: themeColors.text_primary,
      }}
    >
      {/* Hero Section */}
      <header
        className="relative px-6 py-12 text-center"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
        }}
      >
        {/* Logo */}
        {profile.logo_url && (
          <div className="mb-6">
            <img
              src={profile.logo_url}
              alt={`${profile.name} logo`}
              className="w-24 h-24 mx-auto rounded-full bg-white p-2 shadow-lg object-contain"
            />
          </div>
        )}

        {/* Name */}
        {profile.name && (
          <h1 className="text-3xl font-bold text-white mb-2">{profile.name}</h1>
        )}

        {/* Tagline */}
        {profile.tagline && (
          <p className="text-lg text-white/90 max-w-md mx-auto">{profile.tagline}</p>
        )}
      </header>

      {/* Main Content */}
      <main className="px-6 py-8 space-y-6">
        {/* Contact Info */}
        <section
          className="p-6 rounded-xl shadow-sm"
          style={{ backgroundColor: themeColors.surface }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: themeColors.text_primary }}
          >
            Contact
          </h2>
          <div className="space-y-3">
            {profile.email && (
              <ContactItem
                label="Email"
                value={profile.email}
                href={`mailto:${profile.email}`}
                color={themeColors.text_secondary}
              />
            )}
            {profile.phone && (
              <ContactItem
                label="Phone"
                value={profile.phone}
                href={`tel:${profile.phone}`}
                color={themeColors.text_secondary}
              />
            )}
            {profile.website && (
              <ContactItem
                label="Website"
                value={profile.website}
                href={profile.website}
                color={themeColors.text_secondary}
              />
            )}
          </div>
        </section>

        {/* Social Links */}
        {profile.socials && Object.keys(profile.socials).length > 0 && (
          <section
            className="p-6 rounded-xl shadow-sm"
            style={{ backgroundColor: themeColors.surface }}
          >
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: themeColors.text_primary }}
            >
              Connect
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(profile.socials).map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: `${primaryColor}10`,
                    color: primaryColor,
                  }}
                >
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Custom Links */}
        {profile.custom_links && profile.custom_links.length > 0 && (
          <section
            className="p-6 rounded-xl shadow-sm"
            style={{ backgroundColor: themeColors.surface }}
          >
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: themeColors.text_primary }}
            >
              Links
            </h2>
            <div className="space-y-2">
              {profile.custom_links.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  className="block p-3 rounded-lg transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: primaryColor,
                    color: 'white',
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Address */}
        {profile.address_structured && (
          <section
            className="p-6 rounded-xl shadow-sm"
            style={{ backgroundColor: themeColors.surface }}
          >
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: themeColors.text_primary }}
            >
              Location
            </h2>
            <address
              className="not-italic text-sm leading-relaxed"
              style={{ color: themeColors.text_secondary }}
            >
              {profile.address_structured.line1}
              {profile.address_structured.line2 && (
                <>
                  <br />
                  {profile.address_structured.line2}
                </>
              )}
              <br />
              {profile.address_structured.city}, {profile.address_structured.state}{' '}
              {profile.address_structured.postal_code}
              <br />
              {profile.address_structured.country}
            </address>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 text-center border-t" style={{ borderColor: themeColors.surface }}>
        <p className="text-xs" style={{ color: themeColors.text_secondary }}>
          Powered by RawDrive
        </p>
      </footer>
    </div>
  );
};

// =============================================================================
// Helper Components
// =============================================================================

interface ContactItemProps {
  label: string;
  value: string;
  href: string;
  color: string;
}

const ContactItem: React.FC<ContactItemProps> = ({ label, value, href, color }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs uppercase tracking-wide" style={{ color }}>
      {label}
    </span>
    <a
      href={href}
      className="text-sm font-medium hover:underline"
      style={{ color }}
    >
      {value}
    </a>
  </div>
);

export default LivePreviewPanel;
