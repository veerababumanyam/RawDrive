/**
 * Public Profile View Component
 *
 * Displays a public company profile page at /p/{slug}.
 * Uses the shared ProfileCard component for visual parity with the editor preview.
 *
 * Key features:
 * - Theme data extraction and transformation from API response
 * - Dynamic font loading for theme typography
 * - SEO metadata via react-helmet
 * - Action buttons: vCard download, QR code, share
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { PublicCompanyProfile } from '../../../types/companyProfile';
import { companyProfileService } from '../../../services/companyProfileService';
import { fontService } from '../../../services/fontService';
import { PublicProfileLayout } from './public/PublicProfileLayout';
import { AppButton } from '../../ui/AppButton';
import {
    transformThemeForProfileCard,
    extractFontsToLoad,
    type BackendThemeData,
} from '../../../utils/themeTransformer';

interface Props {
    slug: string;
}

export const PublicProfileView: React.FC<Props> = ({ slug }) => {
    const [profile, setProfile] = useState<PublicCompanyProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fontsLoaded, setFontsLoaded] = useState(false);

    // Fetch profile data
    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            setFontsLoaded(false);
            try {
                const data = await companyProfileService.getPublicProfile(slug);
                setProfile(data);
            } catch (err: any) {
                console.error('Failed to fetch profile:', err);
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

    // Load theme fonts dynamically
    useEffect(() => {
        if (!profile?.theme) {
            setFontsLoaded(true);
            return;
        }

        const loadFonts = async () => {
            // Extract font families from theme
            const fontsToLoad = extractFontsToLoad({
                apiTheme: profile.theme as BackendThemeData,
            });

            if (fontsToLoad.length === 0) {
                setFontsLoaded(true);
                return;
            }

            // Load all fonts in parallel
            const loadPromises = fontsToLoad.map(async (fontFamily) => {
                if (!fontService.isFontLoaded(fontFamily)) {
                    try {
                        await fontService.loadFont(fontFamily);
                    } catch (err) {
                        console.warn(`Failed to load font: ${fontFamily}`, err);
                    }
                }
            });

            await Promise.allSettled(loadPromises);
            setFontsLoaded(true);
        };

        loadFonts();
    }, [profile?.theme]);

    // Transform theme data using the shared transformer
    const themeProps = useMemo(() => {
        if (!profile?.theme) return {};

        return transformThemeForProfileCard({
            apiTheme: profile.theme as BackendThemeData,
        });
    }, [profile?.theme]);

    // Action handlers
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

    const handleShare = async () => {
        const shareData = {
            title: profile?.name || 'Company Profile',
            url: window.location.href,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                // User cancelled or share failed - fall back to clipboard
                await navigator.clipboard.writeText(window.location.href);
            }
        } else {
            await navigator.clipboard.writeText(window.location.href);
        }
    };

    // Determine background styling
    const bgStyle = useMemo(() => {
        // Priority 1: Theme gradient
        if (themeProps.backgroundGradient) {
            return { background: themeProps.backgroundGradient };
        }
        // Priority 2: Theme background color
        if (themeProps.backgroundColor) {
            return { backgroundColor: themeProps.backgroundColor };
        }
        // Priority 3: Default gradient
        return { background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' };
    }, [themeProps.backgroundGradient, themeProps.backgroundColor]);

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Error state
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
                {/* Preconnect to Google Fonts for faster font loading */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {profile.seo_schema && (
                    <script type="application/ld+json">
                        {JSON.stringify(profile.seo_schema)}
                    </script>
                )}
            </Helmet>

            {/* Mobile-first full-height layout */}
            <PublicProfileLayout
                profile={{
                    name: profile.name,
                    tagline: profile.tagline,
                    // Use explicit public logo URL to ensure correct resolution
                    logo_url: profile.logo_url 
                        ? (profile.logo_url.startsWith('/') 
                            ? companyProfileService.getPublicLogoUrl(slug)
                            : profile.logo_url)
                        : undefined,
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
                themeColors={themeProps.themeColors}
                themeTypography={themeProps.themeTypography}
                themeLayout={themeProps.themeLayout}
                onDownloadVCard={handleDownloadVCard}
                onDownloadQr={handleDownloadQr}
                onShare={handleShare}
            />
        </>
    );
};
