import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { PublicCompanyProfile } from '../../../types/companyProfile';
import { companyProfileService } from '../../../services/companyProfileService';
import { ProfileCard, ThemeColors, ThemeTypography, ThemeLayout } from './ProfileCard';
import { AppButton } from '../../ui/AppButton';

interface Props {
    slug: string;
}

export const PublicProfileView: React.FC<Props> = ({ slug }) => {
    const [profile, setProfile] = useState<PublicCompanyProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            try {
                const data = await companyProfileService.getPublicProfile(slug);
                setProfile(data);
            } catch (err: any) {
                console.error(err);
                if (err.response?.status === 404) {
                    setError("Profile not found");
                } else {
                    setError("Failed to load profile");
                }
            } finally {
                setIsLoading(false);
            }
        };
        if (slug) fetchProfile();
    }, [slug]);

    const handleDownloadVCard = () => {
        window.open(companyProfileService.getVCardUrl(slug), '_blank');
    };

    const handleDownloadQr = () => {
        const url = companyProfileService.getQrCodeUrl(slug);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: profile?.name || 'Company Profile',
                url: window.location.href,
            });
        } else {
            navigator.clipboard.writeText(window.location.href);
        }
    };

    // Extract theme data from profile
    const themeColors: ThemeColors | undefined = useMemo(() => {
        if (!profile?.theme?.base_colors) return undefined;
        return {
            primary: profile.theme.base_colors.primary,
            secondary: profile.theme.base_colors.secondary,
            accent: profile.theme.base_colors.accent,
        };
    }, [profile?.theme?.base_colors]);

    const themeTypography: ThemeTypography | undefined = useMemo(() => {
        if (!profile?.theme?.typography) return undefined;
        return {
            headingFont: profile.theme.typography.headingFont,
            bodyFont: profile.theme.typography.bodyFont,
        };
    }, [profile?.theme?.typography]);

    const themeLayout: ThemeLayout | undefined = useMemo(() => {
        if (!profile?.theme?.layout) return undefined;
        return {
            spacing: profile.theme.layout.spacing,
            heroStyle: profile.theme.layout.heroStyle,
            sectionLayout: profile.theme.layout.sectionLayout,
        };
    }, [profile?.theme?.layout]);

    // Determine background color based on theme
    const bgStyle = useMemo(() => {
        if (profile?.theme?.base_colors?.background) {
            return { backgroundColor: profile.theme.base_colors.background };
        }
        return {};
    }, [profile?.theme?.base_colors?.background]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="text-center max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "Profile not found"}</p>
                    <AppButton variant="primary" onClick={() => window.location.href = '/'}>Go Home</AppButton>
                </div>
            </div>
        );
    }

    const displayName = profile.name || 'Company Profile';

    return (
        <>
            <Helmet>
                <title>{displayName} | Profile</title>
                <meta name="description" content={profile.tagline || `${displayName} business profile`} />
                {profile.seo_schema && <script type="application/ld+json">{JSON.stringify(profile.seo_schema)}</script>}
            </Helmet>

            {/* Mobile-first full-height layout */}
            <div
                className="min-h-screen flex flex-col items-center p-4 sm:py-12 sm:px-6 lg:px-8"
                style={{
                    backgroundColor: bgStyle.backgroundColor || undefined,
                    ...(!bgStyle.backgroundColor && { background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' })
                }}
            >
                {/* Main Card - Mobile: full width, Desktop: max-width */}
                <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-all hover:shadow-2xl">
                    <ProfileCard
                        profile={{
                            name: profile.name,
                            tagline: profile.tagline,
                            logo_url: profile.logo_url,
                            email: profile.email,
                            phone: profile.phone,
                            website: profile.website,
                            secondary_emails: profile.secondary_emails,
                            secondary_phones: profile.secondary_phones,
                            address_structured: profile.address_structured,
                            socials: profile.socials,
                            custom_links: profile.custom_links,
                        }}
                        visibility={profile.company_visibility}
                        showActions={true}
                        slug={slug}
                        compact={false}
                        themeColors={themeColors}
                        themeTypography={themeTypography}
                        themeLayout={themeLayout}
                        onDownloadVCard={handleDownloadVCard}
                        onDownloadQr={handleDownloadQr}
                        onShare={handleShare}
                    />
                </div>
            </div>
        </>
    );
};
