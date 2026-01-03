import React, { useMemo } from 'react';
import { GlassContainer } from './GlassContainer';
import { HeroGlassCard } from './HeroGlassCard';
import { StudioInfoCard } from './StudioInfoCard';
import { ContactMethodsCard } from './ContactMethodsCard';
import { ServicesGlassGrid } from './ServicesGlassGrid';
import { FooterGlassStrip } from './FooterGlassStrip';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../../types/companyProfile';

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
  // Theme layout is unused in the new design as it enforces its own layout, 
  // but kept for compatibility with existing types/props if needed
  themeLayout?: any; 
  onDownloadVCard?: () => void;
  onDownloadQr?: () => void;
  onShare?: () => void;
}

export const PublicProfileLayout: React.FC<PublicProfileLayoutProps> = ({
  profile,
  visibility = {},
  slug,
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

  // Construct gradient from theme colors
  const themeGradient = useMemo(() => {
    const primary = themeColors?.primary || '#EFF6FF';
    const accent = themeColors?.accent || '#E0F2FE';
    return `linear-gradient(135deg, ${primary}20 0%, ${accent}20 100%)`;
  }, [themeColors]);

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

  return (
    <GlassContainer themeGradient={themeGradient}>
      <div style={styleVariables} className="font-body text-text-primary">
        
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
          className="mb-0"
        />

        {/* Main Content Grid */}
        <div id="profile-content" className="container mx-auto px-4 py-12 lg:py-20 relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Info & Contact (4 cols) */}
            <div className="lg:col-span-5 space-y-8">
              {/* Studio Info (Logo/Name/Socials simplified) */}
              <StudioInfoCard 
                name={profile.name || ''}
                tagline={visibility.tagline ? profile.tagline : undefined}
                logoUrl={visibility.logo_url ? profile.logo_url : undefined}
                website={visibility.website ? profile.website : undefined}
              />

              {/* Contact Details */}
              <div id="contact-section">
                <ContactMethodsCard 
                  email={visibility.email ? (profile.email || '') : ''}
                  phone={visibility.phone && profile.phone ? profile.phone : undefined}
                  address={visibility.address ? profile.address_structured : undefined}
                  socials={profile.socials} // Visibility handled inside? Or check keys here.
                  // Note: ContactMethodsCard checks visibility internally mostly by existence, 
                  // but we should respect the toggle if we want to be strict.
                  // For now passing full socials, component will render if non-empty. 
                  // TO-DO: Filter socials based on visibility config if granular control exists
                  onDownloadVCard={visibility.vcard ? onDownloadVCard : undefined}
                  onDownloadQr={visibility.qr_code ? onDownloadQr : undefined}
                />
              </div>
            </div>

            {/* Right Column: Custom Links / Services (8 cols) */}
            <div className="lg:col-span-7">
              {visibility.custom_links && profile.custom_links && (
                <ServicesGlassGrid 
                  links={profile.custom_links} 
                />
              )}
              
              {/* Placeholder for future gallery or portfolio grid if data existed */}
              {/* <div className="mt-8 p-8 glass-card rounded-2xl border border-glass-border-2 bg-glass-2 text-center text-text-secondary">
                 Portfolio gallery coming soon...
              </div> */}
            </div>

          </div>
        </div>

        <FooterGlassStrip />
      </div>
    </GlassContainer>
  );
};
