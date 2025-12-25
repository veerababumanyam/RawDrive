/**
 * Company Profile Page
 *
 * Edit company profile with live preview panel.
 * Uses centralized design system classes for consistent styling.
 */

import React, { useState, useCallback } from 'react';
import { Building2 } from 'lucide-react';
import { CompanyProfileForm, type ProfileFormChangeData } from '../../../components/features/settings/CompanyProfileForm';
import { CompanyProfilePreview } from '../../../components/features/settings/CompanyProfilePreview';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../types/companyProfile';
import type { Theme, ThemeCustomization } from '../../../types/profileEditor';

// Extended profile type for preview with theme data
interface PreviewProfile extends Partial<CompanyProfile> {
    _theme?: Theme | null;
    _themeCustomization?: Partial<ThemeCustomization> | null;
}

const CompanyProfilePage: React.FC = () => {
    const [previewProfile, setPreviewProfile] = useState<PreviewProfile | null>(null);
    const [visibility, setVisibility] = useState<Partial<CompanyVisibilityConfig>>({});

    const handleProfileChange = useCallback((data: ProfileFormChangeData) => {
        // Convert CreateCompanyProfileRequest to Partial<CompanyProfile> for preview
        // Use _previewLogoUrl (blob URL from form) for immediate preview, fallback to stored logo_url
        const profile: PreviewProfile = {
            name: data.name,
            tagline: data.tagline,
            slug: data.slug,
            logo_url: data._previewLogoUrl || data.logo_url,
            brand_color: data.brand_color,
            email: data.email,
            phone: data.phone,
            website: data.website,
            address_structured: data.address_structured,
            socials: data.socials || {},
            custom_links: data.custom_links || [],
            // Include theme data for preview
            _theme: data._theme,
            _themeCustomization: data._themeCustomization,
        };
        setPreviewProfile(profile);
        setVisibility(data.company_visibility || {});
    }, []);

    return (
        <div className="h-full flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Form Panel - Scrollable */}
            <div className="flex-1 overflow-auto">
                {/* Page Header */}
                <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                                    <div className="section-header-icon icon-container-accent">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    Company Profile
                                </h1>
                                <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                    Customize your business profile and branding
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <CompanyProfileForm onProfileChange={handleProfileChange} />
                    </div>
                </main>
            </div>

            {/* Preview Panel - Fixed with glassmorphism styling */}
            <div className="hidden lg:flex lg:flex-col w-[450px] border-l border-border/50 bg-gradient-to-br from-surface-hover/50 to-surface/30 backdrop-blur-sm overflow-hidden">
                <div className="p-4 border-b border-border/50 glass-premium">
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent animate-pulse" />
                        Live Preview
                    </h2>
                </div>
                <div className="flex-1 overflow-auto">
                    <CompanyProfilePreview
                        profile={previewProfile}
                        visibility={visibility}
                    />
                </div>
            </div>
        </div>
    );
};

export default CompanyProfilePage;
