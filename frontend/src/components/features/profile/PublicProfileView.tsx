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
 * - Automatic system theme detection (dark/light based on device preference)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { PublicCompanyProfile } from '../../../types/companyProfile';
import { companyProfileService } from '../../../services/companyProfileService';
import { fontService } from '../../../services/fontService';
import { PublicProfileLayout } from './public/PublicProfileLayout';
import { usePublicProfileTheme } from '../../../hooks/usePublicProfileTheme';
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
    
    // Theme management - automatically detects system preference
    const { theme, isDark } = usePublicProfileTheme();

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

    const handleDownloadQr = async () => {
        const url = companyProfileService.getQrCodeUrl(slug);
        try {
            // Fetch the QR code image as a blob
            const response = await fetch(url);
            const blob = await response.blob();
            
            // Create a blob URL and trigger download
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${slug}-qr.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the blob URL
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Failed to download QR code:', error);
            // Fallback: open in new tab if download fails
            window.open(url, '_blank');
        }
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

    // Loading state - Enhanced with accessibility and glass morphism
    if (isLoading) {
        return (
            <div
                data-theme={theme}
                className="
                    min-h-screen flex flex-col items-center justify-center
                    bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
                    dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
                    transition-colors duration-300
                "
            >
                {/* Loading spinner with accessibility */}
                <div
                    role="status"
                    aria-label="Loading profile"
                    className="
                        flex flex-col items-center gap-4
                        p-8 rounded-2xl
                        bg-white/60 dark:bg-gray-900/40
                        backdrop-blur-xl
                        border border-white/50 dark:border-white/10
                        shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
                    "
                >
                    <div
                        className="
                            animate-spin rounded-full
                            h-12 w-12 sm:h-14 sm:w-14
                            border-4 border-gray-200 dark:border-gray-700
                            border-t-primary-500 dark:border-t-primary-400
                        "
                        aria-hidden="true"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        Loading profile...
                    </p>
                </div>
            </div>
        );
    }

    // Error state - Enhanced with glass morphism and retry option
    if (error || !profile) {
        return (
            <div
                data-theme={theme}
                className="
                    min-h-screen flex flex-col items-center justify-center
                    bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
                    dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
                    p-4 transition-colors duration-300
                "
            >
                <div
                    className="
                        text-center max-w-md w-full
                        p-6 sm:p-8
                        rounded-2xl sm:rounded-3xl
                        bg-white/70 dark:bg-gray-900/50
                        backdrop-blur-xl
                        border border-white/50 dark:border-white/10
                        shadow-xl dark:shadow-[0_12px_40px_rgba(0,0,0,0.3)]
                    "
                    role="alert"
                >
                    {/* Error Icon */}
                    <div
                        className="
                            w-16 h-16 mx-auto mb-4
                            flex items-center justify-center
                            rounded-full
                            bg-red-100 dark:bg-red-900/30
                            text-red-500 dark:text-red-400
                        "
                        aria-hidden="true"
                    >
                        <svg
                            className="w-8 h-8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        Oops!
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm sm:text-base">
                        {error || "This profile could not be found or may have been removed."}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <AppButton
                            variant="outline"
                            onClick={() => window.location.reload()}
                            className="
                                min-h-[44px]
                                text-gray-700 dark:text-gray-200
                                border-gray-300 dark:border-gray-600
                                hover:bg-gray-100 dark:hover:bg-gray-800
                            "
                        >
                            Try Again
                        </AppButton>
                        <AppButton
                            variant="primary"
                            onClick={() => window.location.href = '/'}
                            className="min-h-[44px]"
                        >
                            Go Home
                        </AppButton>
                    </div>
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
                {/* Robots directive based on workspace indexing settings */}
                {!profile.indexable && (
                    <meta name="robots" content="noindex, nofollow" />
                )}
                {/* Preconnect to Google Fonts for faster font loading */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {profile.seo_schema && (
                    <script type="application/ld+json">
                        {JSON.stringify(profile.seo_schema)}
                    </script>
                )}
            </Helmet>

            {/* Theme-aware container */}
            <div data-theme={theme} className="min-h-screen transition-colors duration-200">
                {/* Mobile-first full-height layout */}
                <PublicProfileLayout
                    profile={{
                        name: profile.name,
                        tagline: profile.tagline,
                        // Use explicit public logo URL to ensure correct resolution
                        logo_url: profile.logo_url 
                            ? (profile.logo_url.startsWith('http') 
                                ? profile.logo_url 
                                : companyProfileService.getPublicLogoUrl(slug))
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
            </div>
        </>
    );
};
