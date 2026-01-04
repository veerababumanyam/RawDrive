import React, { useMemo } from 'react';
import { GlassContainer } from './GlassContainer';
import { HeroGlassCard } from './HeroGlassCard';
import { ProfileBody } from './ProfileBody';
import { ServicesGlassGrid } from './ServicesGlassGrid';
import { FooterGlassStrip } from './FooterGlassStrip';
import { companyProfileService } from '../../../../services/companyProfileService';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../../types/companyProfile';

/* =============================================================================
   PublicProfileLayout Component

   Mobile-first responsive layout for public profile pages.
   Supports both light and dark themes.
   ============================================================================= */

interface PublicProfileLayoutProps {
  profile: Partial<CompanyProfile>;
  visibility?: Partial<CompanyVisibilityConfig>;
  showActions?: boolean;
  slug?: string;
  compact?: boolean;
  themeColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    text?: string;
  };
  themeTypography?: {
    headingFont?: string;
    bodyFont?: string;
  };
  themeLayout?: any; 
  onDownloadVCard?: () => void;
  onDownloadQr?: () => void;
  onShare?: () => void;
}

export const PublicProfileLayout: React.FC<PublicProfileLayoutProps> = ({
  profile,
  visibility = {},
  themeColors,
  themeTypography,
  onDownloadVCard,
  onDownloadQr,
}) => {
  // Generate CSS variables for the theme
  const styleVariables = useMemo(() => {
    return {
      '--theme-primary': themeColors?.primary || '#2563EB',
      '--theme-secondary': themeColors?.secondary || '#64748B',
      '--theme-accent': themeColors?.accent || '#06B6D4',
      '--theme-bg': themeColors?.background,
      '--theme-text': themeColors?.text,
      '--theme-font-heading': themeTypography?.headingFont ? `${themeTypography.headingFont}` : 'inherit',
      '--theme-font-body': themeTypography?.bodyFont ? `${themeTypography.bodyFont}` : 'inherit',
    } as React.CSSProperties;
  }, [themeColors, themeTypography]);

  // Scroll to content section
  const handleViewPortfolio = () => {
    const contentElement = document.getElementById('profile-content');
    contentElement?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleBookNow = () => {
    // Check if there's a custom link for booking, otherwise scroll to contact
    const bookingLink = profile.custom_links?.find(l => 
      l.label.toLowerCase().includes('book') || l.label.toLowerCase().includes('schedule')
    );
    
    if (bookingLink) {
      window.open(bookingLink.url, '_blank');
    } else {
      const contactElement = document.getElementById('contact-section');
      contactElement?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Check if we have any content to show in the main area
  const hasContactInfo = visibility.email || visibility.phone || visibility.address;
  const hasServices = visibility.custom_links && profile.custom_links && profile.custom_links.length > 0;
  const hasWebsite = visibility.website && profile.website;

  return (
    <GlassContainer>
      <div style={styleVariables} className="text-gray-900 dark:text-white pb-20">
        
        {/* Skip Link for Accessibility */}
        <a 
          href="#profile-content" 
          className="
            sr-only focus:not-sr-only 
            focus:absolute focus:top-4 focus:left-4 focus:z-[60]
            focus:px-4 focus:py-2 
            focus:bg-primary-500 focus:text-white 
            focus:rounded-lg focus:outline-none
          "
        >
          Skip to content
        </a>

        {/* Global font application */}
        <style>{`
          .font-heading { font-family: var(--theme-font-heading, inherit); }
          .font-body { font-family: var(--theme-font-body, inherit); }
          h1, h2, h3, h4, h5, h6 { font-family: var(--theme-font-heading, inherit); }
        `}</style>

        {/* Hero Section - Top Branding & Identity (Separated) */}
        <HeroGlassCard 
          name={profile.name || 'Company Name'}
          tagline={visibility.tagline ? profile.tagline : undefined}
          logoUrl={visibility.logo_url ? profile.logo_url : undefined}
        />

        {/* Body Section - Actions, Socials, Details (Separated) */}
        <div className="relative z-20 px-4 mt-6">
            <ProfileBody 
                name={profile.name || 'Company Name'}
                email={visibility.email ? profile.email : undefined}
                phone={visibility.phone ? profile.phone : undefined}
                address={visibility.address && profile.address_structured ? 
                    `${profile.address_structured.line1 || ''} ${profile.address_structured.city || ''} ${profile.address_structured.state || ''} ${profile.address_structured.postal_code || ''} ${profile.address_structured.country || ''}`.trim() 
                    : undefined}
                websiteUrl={visibility.website ? profile.website : undefined}
                socials={profile.socials}
                qrCodeUrl={visibility.qr_code && profile.slug ? companyProfileService.getQrCodeUrl(profile.slug) : undefined}
                profileUrl={profile.slug ? `${window.location.origin}/p/${profile.slug}` : undefined}
                onDownloadQr={visibility.qr_code ? onDownloadQr : undefined}
                onDownloadVCard={visibility.vcard ? onDownloadVCard : undefined}
            />
        </div>

        {/* Main Content - Only show services/links if they exist */}
        {hasServices && (
          <div 
            id="profile-content" 
            className="
              container mx-auto 
              px-4 sm:px-6 lg:px-8 
              py-8 sm:py-12
              relative z-20
            "
          >
            <ServicesGlassGrid links={profile.custom_links!} />
          </div>
        )}

        <FooterGlassStrip companyName={profile.name} />
      </div>
    </GlassContainer>
  );
};

