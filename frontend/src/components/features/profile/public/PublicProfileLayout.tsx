import React, { useMemo } from 'react';
import { GlassContainer } from './GlassContainer';
import { HeroGlassCard } from './HeroGlassCard';
import { StudioInfoCard } from './StudioInfoCard';
import { ContactMethodsCard } from './ContactMethodsCard';
import { ServicesGlassGrid } from './ServicesGlassGrid';
import { FooterGlassStrip } from './FooterGlassStrip';
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
      '--theme-bg': themeColors?.background || '#F8FAFC',
      '--theme-text': themeColors?.text || '#0F172A',
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
      <div style={styleVariables} className="text-gray-900 dark:text-white">
        
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

        {/* Hero Section */}
        <HeroGlassCard 
          name={profile.name || 'Company Name'}
          tagline={visibility.tagline ? profile.tagline : undefined}
          logoUrl={visibility.logo_url ? profile.logo_url : undefined}
          onViewPortfolio={handleViewPortfolio}
          onBookNow={handleBookNow}
        />

        {/* Main Content - Mobile-first layout */}
        <div 
          id="profile-content" 
          className="
            container mx-auto 
            px-4 sm:px-6 lg:px-8 
            py-8 sm:py-12 lg:py-16
            relative z-20
          "
        >
          {/* Mobile: Single column stack | Desktop: Two column flex */}
          <div className="flex flex-col lg:flex-row lg:gap-8 xl:gap-12">
            
            {/* Left Column: Website + Contact (narrower on desktop) */}
            <div className="w-full lg:w-5/12 xl:w-4/12 space-y-4 sm:space-y-6">
              
              {/* Website Link Card - only shows if website exists */}
              {hasWebsite && (
                <StudioInfoCard 
                  name={profile.name || ''}
                  tagline={visibility.tagline ? profile.tagline : undefined}
                  website={profile.website}
                />
              )}

              {/* Contact Details */}
              {hasContactInfo && (
                <div id="contact-section">
                  <ContactMethodsCard 
                    email={visibility.email ? (profile.email || '') : ''}
                    phone={visibility.phone && profile.phone ? profile.phone : undefined}
                    address={visibility.address ? profile.address_structured : undefined}
                    socials={profile.socials}
                    onDownloadVCard={visibility.vcard ? onDownloadVCard : undefined}
                    onDownloadQr={visibility.qr_code ? onDownloadQr : undefined}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Services/Links (wider on desktop) */}
            {hasServices && (
              <div className="w-full lg:w-7/12 xl:w-8/12 mt-6 lg:mt-0">
                <ServicesGlassGrid 
                  links={profile.custom_links!} 
                />
              </div>
            )}

          </div>
        </div>

        <FooterGlassStrip />
      </div>
    </GlassContainer>
  );
};
