import React, { useState, useCallback } from 'react';
import { CompanyProfileForm } from '../../../components/features/settings/CompanyProfileForm';
import { CompanyProfilePreview } from '../../../components/features/settings/CompanyProfilePreview';
import type { CreateCompanyProfileRequest, CompanyProfile, CompanyVisibilityConfig } from '../../../types/companyProfile';

// Extended type to include preview logo URL from form
type ProfileFormData = CreateCompanyProfileRequest & { _previewLogoUrl?: string };

const CompanyProfilePage: React.FC = () => {
    const [previewProfile, setPreviewProfile] = useState<Partial<CompanyProfile> | null>(null);
    const [visibility, setVisibility] = useState<Partial<CompanyVisibilityConfig>>({});

    const handleProfileChange = useCallback((data: ProfileFormData) => {
        // Convert CreateCompanyProfileRequest to Partial<CompanyProfile> for preview
        // Use _previewLogoUrl (blob URL from form) for immediate preview, fallback to stored logo_url
        const profile: Partial<CompanyProfile> = {
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
        };
        setPreviewProfile(profile);
        setVisibility(data.company_visibility || {});
    }, []);

    return (
        <div className="h-full flex">
            {/* Form Panel - Scrollable */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <CompanyProfileForm onProfileChange={handleProfileChange} />
                </div>
            </div>

            {/* Preview Panel - Fixed */}
            <div className="hidden lg:block w-[450px] border-l border-border bg-surface-hover/30 overflow-hidden">
                <CompanyProfilePreview
                    profile={previewProfile}
                    visibility={visibility}
                />
            </div>
        </div>
    );
};

export default CompanyProfilePage;
