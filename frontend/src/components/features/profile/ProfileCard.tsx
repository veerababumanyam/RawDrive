/**
 * Profile Card Component (Shared)
 *
 * Renders the company profile card content.
 * Used by both PublicProfileView (public page) and CompanyProfilePreview (live preview).
 * This ensures the preview matches exactly what users see on the public page.
 */

import React, { useMemo } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
import {
    Globe,
    Mail,
    Phone,
    MapPin,
    Instagram,
    Facebook,
    Twitter,
    Linkedin,
    Download,
    QrCode,
    Share2,
    ExternalLink,
} from 'lucide-react';

import type { CompanyProfile, CompanyVisibilityConfig } from '../../../types/companyProfile';

// =============================================================================
// Types
// =============================================================================

export interface ThemeColors {
    primary?: string;
    secondary?: string;
    accent?: string;
}

export interface ThemeTypography {
    headingFont?: string;
    bodyFont?: string;
}

export interface ThemeLayout {
    spacing?: 'compact' | 'normal' | 'spacious';
    heroStyle?: 'card' | 'full-bleed';
    sectionLayout?: 'single-column' | 'two-column';
}

export interface ProfileCardProps {
    profile: Partial<CompanyProfile>;
    visibility?: Partial<CompanyVisibilityConfig>;
    /** Whether to show action buttons (Save Contact, QR, Share) */
    showActions?: boolean;
    /** Slug for generating vCard/QR URLs */
    slug?: string;
    /** Compact mode for smaller preview sizes */
    compact?: boolean;
    /** Theme colors for dynamic styling */
    themeColors?: ThemeColors;
    /** Theme typography (fonts) */
    themeTypography?: ThemeTypography;
    /** Theme layout settings */
    themeLayout?: ThemeLayout;
    /** QR Code URL for display */
    qrCodeUrl?: string;
    /** Callback for downloading vCard */
    onDownloadVCard?: () => void;
    /** Callback for downloading QR code */
    onDownloadQr?: () => void;
    /** Callback for share */
    onShare?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const ProfileCard: React.FC<ProfileCardProps> = ({
    profile,
    visibility = {},
    showActions = false,
    slug: _slug,
    compact = false,
    themeColors,
    themeTypography,
    themeLayout,
    qrCodeUrl,
    onDownloadVCard,
    onDownloadQr,
    onShare,
}) => {
    const displayName = profile.name || 'Company Profile';

    // Generate CSS custom properties for theme colors and typography
    const themeStyle = useMemo(() => {
        const styles: React.CSSProperties = {};

        if (themeColors) {
            Object.assign(styles, {
                '--profile-primary': themeColors.primary || '#2563EB',
                '--profile-secondary': themeColors.secondary || '#64748B',
                '--profile-accent': themeColors.accent || '#06B6D4',
            });
        }

        if (themeTypography?.headingFont) {
            styles.fontFamily = themeTypography.headingFont;
        }

        return styles;
    }, [themeColors, themeTypography]);

    // Check if a field should be visible
    const isVisible = (field: keyof CompanyVisibilityConfig): boolean => {
        return visibility[field] !== false;
    };

    // Check if a social platform should be visible
    const isSocialVisible = (platform: string): boolean => {
        const key = `socials_${platform}` as keyof CompanyVisibilityConfig;
        return visibility[key] !== false;
    };

    // Get visible socials
    const visibleSocials = profile.socials
        ? Object.entries(profile.socials).filter(
            ([platform, url]) => url && isSocialVisible(platform)
        )
        : [];

    // Check if address has values
    const hasAddress = profile.address_structured &&
        (profile.address_structured.line1 || profile.address_structured.city);

    // Size classes based on compact mode and layout spacing
    const layoutSpacing = themeLayout?.spacing || 'normal';
    const isCompactSpacing = compact || layoutSpacing === 'compact';
    const isSpaciousSpacing = !compact && layoutSpacing === 'spacious';

    const sizes = {
        logo: isCompactSpacing ? 'w-20 h-20' : isSpaciousSpacing ? 'w-36 h-36' : 'w-28 h-28 sm:w-32 sm:h-32',
        logoText: isCompactSpacing ? 'text-2xl' : isSpaciousSpacing ? 'text-5xl' : 'text-3xl sm:text-4xl',
        name: isCompactSpacing ? 'text-xl' : isSpaciousSpacing ? 'text-3xl' : 'text-2xl sm:text-3xl',
        tagline: isCompactSpacing ? 'text-xs' : isSpaciousSpacing ? 'text-base' : 'text-sm sm:text-base',
        padding: isCompactSpacing ? 'px-4 py-4' : isSpaciousSpacing ? 'px-8 py-10' : 'px-6 py-8 sm:px-8',
        headerPadding: isCompactSpacing ? 'pt-8 pb-6 px-4' : isSpaciousSpacing ? 'pt-14 pb-10 px-8' : 'pt-10 pb-8 px-6 sm:px-8',
        gap: isCompactSpacing ? 'gap-3' : isSpaciousSpacing ? 'gap-5' : 'gap-4',
        icon: isCompactSpacing ? 16 : isSpaciousSpacing ? 24 : 20,
        iconBg: isCompactSpacing ? 'p-1.5' : isSpaciousSpacing ? 'p-3' : 'p-2',
        label: isCompactSpacing ? 'text-[10px]' : isSpaciousSpacing ? 'text-sm' : 'text-xs',
        value: isCompactSpacing ? 'text-xs' : isSpaciousSpacing ? 'text-base' : 'text-sm',
    };

    // Construct logo URL - prefer blob URLs (from preview), then public endpoint, then fallback
    const logoUrl = useMemo(() => {
        if (!profile.logo_url) return null;

        // If it's a blob URL (from live preview), use directly
        if (profile.logo_url.startsWith('blob:')) {
            return profile.logo_url;
        }

        // If already absolute URL (http/https), use as-is
        if (profile.logo_url.startsWith('http://') || profile.logo_url.startsWith('https://')) {
            return profile.logo_url;
        }

        // For relative paths, construct full URL
        // If slug is available and logo_url is a public endpoint path, construct properly
        return `${API_BASE_URL}${profile.logo_url}`;
    }, [profile.logo_url]);

    // Determine the theme colors for inline styles
    const primaryColor = themeColors?.primary || '#2563EB';
    const accentColor = themeColors?.accent || '#06B6D4';

    // Helper function to create rgba from hex
    const hexToRgba = (hex: string, alpha: number): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    return (
        <div className="h-full bg-white dark:bg-gray-900 flex flex-col" style={themeStyle}>
            {/* Header / Brand */}
            <div
                className={`relative ${sizes.headerPadding} text-center`}
                style={{ background: `linear-gradient(to bottom, ${hexToRgba(primaryColor, 0.15)}, transparent)` }}
            >
                {/* Logo - Always show if logo_url exists */}
                {logoUrl ? (
                    <div className={`mx-auto ${sizes.logo} rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-4 bg-white dark:bg-gray-800 flex items-center justify-center`}>
                        <img src={logoUrl} alt={displayName} className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div
                        className={`mx-auto ${sizes.logo} rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-4 flex items-center justify-center text-white ${sizes.logoText} font-bold`}
                        style={{ background: `linear-gradient(to bottom right, ${primaryColor}, ${themeColors?.accent || '#9333EA'})` }}
                    >
                        {displayName.charAt(0)}
                    </div>
                )}

                {/* Name */}
                {isVisible('name') && profile.name && (
                    <h1
                        className={`${sizes.name} font-bold text-gray-900 dark:text-white mb-1`}
                        style={themeTypography?.headingFont ? { fontFamily: themeTypography.headingFont } : undefined}
                    >
                        {profile.name}
                    </h1>
                )}

                {/* Tagline */}
                {isVisible('tagline') && profile.tagline && (
                    <p
                        className={`${sizes.tagline} text-gray-600 dark:text-gray-400 font-medium`}
                        style={themeTypography?.bodyFont ? { fontFamily: themeTypography.bodyFont } : undefined}
                    >
                        {profile.tagline}
                    </p>
                )}
            </div>

            {/* Actions */}
            {showActions && (
                <div className={`${sizes.padding} pb-6 flex ${sizes.gap} justify-center`}>
                    <button
                        onClick={onDownloadVCard}
                        className={`flex-1 flex items-center justify-center ${sizes.gap} text-white ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} px-4 rounded-xl font-medium transition-colors`}
                        style={{ backgroundColor: primaryColor }}
                    >
                        <Download size={sizes.icon - 2} />
                        <span>Save Contact</span>
                    </button>
                    <button
                        onClick={onDownloadQr}
                        className={`${compact ? 'p-2' : 'p-3'} border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
                        title="QR Code"
                    >
                        <QrCode size={sizes.icon} />
                    </button>
                    <button
                        onClick={onShare}
                        className={`${compact ? 'p-2' : 'p-3'} border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
                        title="Share"
                    >
                        <Share2 size={sizes.icon} />
                    </button>
                </div>
            )}

            {/* Contact Details - flex-1 to fill remaining space */}
            <div className={`${sizes.padding} border-t border-gray-100 dark:border-gray-800 space-y-3 flex-1`}>
                {/* Email */}
                {isVisible('email') && profile.email && (
                    <a
                        href={`mailto:${profile.email}`}
                        className={`flex items-center ${sizes.gap} text-gray-700 dark:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800`}
                    >
                        <div
                            className={`${sizes.iconBg} rounded-lg`}
                            style={{
                                backgroundColor: hexToRgba(primaryColor, 0.1),
                                color: primaryColor,
                            }}
                        >
                            <Mail size={sizes.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>Email</div>
                            <div className={`${sizes.value} font-medium truncate`}>{profile.email}</div>
                        </div>
                    </a>
                )}

                {/* Phone */}
                {isVisible('phone') && profile.phone && (
                    <a
                        href={`tel:${profile.phone}`}
                        className={`flex items-center ${sizes.gap} text-gray-700 dark:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800`}
                    >
                        <div
                            className={`${sizes.iconBg} rounded-lg`}
                            style={{
                                backgroundColor: hexToRgba(accentColor, 0.1),
                                color: accentColor,
                            }}
                        >
                            <Phone size={sizes.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>Phone</div>
                            <div className={`${sizes.value} font-medium`}>{profile.phone}</div>
                        </div>
                    </a>
                )}

                {/* Secondary Emails */}
                {profile.secondary_emails?.map((contact, index) => {
                    const visibilityKey = `secondary_email_${index + 1}` as keyof CompanyVisibilityConfig;
                    if (!contact.value || visibility[visibilityKey] === false) return null;
                    return (
                        <a
                            key={`sec-email-${index}`}
                            href={`mailto:${contact.value}`}
                            className={`flex items-center ${sizes.gap} text-gray-700 dark:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800`}
                        >
                            <div
                                className={`${sizes.iconBg} rounded-lg`}
                                style={{
                                    backgroundColor: hexToRgba(primaryColor, 0.1),
                                    color: primaryColor,
                                }}
                            >
                                <Mail size={sizes.icon} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>
                                    {contact.label || `Email ${index + 2}`}
                                </div>
                                <div className={`${sizes.value} font-medium truncate`}>{contact.value}</div>
                            </div>
                        </a>
                    );
                })}

                {/* Secondary Phones */}
                {profile.secondary_phones?.map((contact, index) => {
                    const visibilityKey = `secondary_phone_${index + 1}` as keyof CompanyVisibilityConfig;
                    if (!contact.value || visibility[visibilityKey] === false) return null;
                    return (
                        <a
                            key={`sec-phone-${index}`}
                            href={`tel:${contact.value}`}
                            className={`flex items-center ${sizes.gap} text-gray-700 dark:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800`}
                        >
                            <div
                                className={`${sizes.iconBg} rounded-lg`}
                                style={{
                                    backgroundColor: hexToRgba(accentColor, 0.1),
                                    color: accentColor,
                                }}
                            >
                                <Phone size={sizes.icon} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>
                                    {contact.label || `Phone ${index + 2}`}
                                </div>
                                <div className={`${sizes.value} font-medium`}>{contact.value}</div>
                            </div>
                        </a>
                    );
                })}

                {/* Website */}
                {isVisible('website') && profile.website && (
                    <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center ${sizes.gap} text-gray-700 dark:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800`}
                    >
                        <div
                            className={`${sizes.iconBg} rounded-lg`}
                            style={{
                                backgroundColor: hexToRgba(primaryColor, 0.1),
                                color: primaryColor,
                            }}
                        >
                            <Globe size={sizes.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>Website</div>
                            <div className={`${sizes.value} font-medium truncate`}>{profile.website.replace(/^https?:\/\//, '')}</div>
                        </div>
                    </a>
                )}

                {/* Address */}
                {isVisible('address') && hasAddress && profile.address_structured && (
                    <div className={`flex items-start ${sizes.gap} text-gray-700 dark:text-gray-300 p-2 rounded-xl`}>
                        <div
                            className={`${sizes.iconBg} rounded-lg flex-shrink-0`}
                            style={{
                                backgroundColor: hexToRgba(accentColor, 0.1),
                                color: accentColor,
                            }}
                        >
                            <MapPin size={sizes.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`${sizes.label} text-gray-500 uppercase font-semibold`}>Location</div>
                            <div className={`${sizes.value} font-medium`}>
                                {profile.address_structured.line1}
                                {profile.address_structured.city && (
                                    <>
                                        <br />
                                        {profile.address_structured.city}
                                        {profile.address_structured.state && `, ${profile.address_structured.state}`}
                                        {profile.address_structured.postal_code && ` ${profile.address_structured.postal_code}`}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Links & Socials */}
            {(visibleSocials.length > 0 || (isVisible('custom_links') && profile.custom_links?.length)) && (
                <div className={`${sizes.padding} bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800`}>
                    {/* Social Icons */}
                    {visibleSocials.length > 0 && (
                        <div className={`flex flex-wrap ${sizes.gap} justify-center`}>
                            {visibleSocials.map(([platform, url]) => {
                                const IconComponent = platform === 'instagram' ? Instagram :
                                    platform === 'facebook' ? Facebook :
                                        platform === 'twitter' ? Twitter :
                                            platform === 'linkedin' ? Linkedin : Globe;
                                const colorClass = platform === 'instagram' ? 'text-pink-600' :
                                    platform === 'facebook' ? 'text-blue-600' :
                                        platform === 'twitter' ? 'text-sky-500' :
                                            platform === 'linkedin' ? 'text-blue-700' : 'text-gray-600';

                                return (
                                    <a
                                        key={platform}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${compact ? 'p-2' : 'p-3'} bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full ${colorClass} transition-all hover:-translate-y-1`}
                                    >
                                        <IconComponent size={compact ? 18 : 24} />
                                    </a>
                                );
                            })}
                        </div>
                    )}

                    {/* Custom Links */}
                    {isVisible('custom_links') && profile.custom_links && profile.custom_links.length > 0 && (
                        <div className={`${visibleSocials.length > 0 ? 'mt-4' : ''} space-y-2`}>
                            {profile.custom_links.map((link, idx) => (
                                <a
                                    key={idx}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center justify-between w-full ${compact ? 'py-2 px-3 text-xs' : 'py-3 px-4 text-sm'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary transition-all shadow-sm hover:shadow`}
                                >
                                    <span className="truncate">{link.label}</span>
                                    <ExternalLink size={compact ? 12 : 16} className="flex-shrink-0 ml-2" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* QR Code Section - Always visible when qr_code visibility is true */}
            {isVisible('qr_code') && qrCodeUrl && (
                <div className={`${sizes.padding} border-t border-gray-100 dark:border-gray-800 flex flex-col items-center`}>
                    <div
                        className={`${compact ? 'w-24 h-24' : 'w-32 h-32'} bg-white rounded-xl p-2 shadow-sm border border-gray-200 dark:border-gray-700`}
                    >
                        <img
                            src={qrCodeUrl}
                            alt="Scan to connect"
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <p className={`mt-2 ${sizes.label} text-gray-500 font-medium`}>
                        Scan to connect
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className={`py-3 text-center ${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 border-t border-gray-100 dark:border-gray-800`}>
                Powered by RawDrive
            </div>
        </div>
    );
};

export default ProfileCard;
