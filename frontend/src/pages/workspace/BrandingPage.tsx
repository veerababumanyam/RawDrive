import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CompanyProfileForm, type ProfileFormChangeData } from '../../components/features/settings/CompanyProfileForm';
import { CompanyProfilePreview } from '../../components/features/settings/CompanyProfilePreview';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../types/companyProfile';
import type { Theme, ThemeCustomization } from '../../types/profileEditor';

/* =============================================================================
   Workspace Branding Page Component
   ============================================================================= */

/**
 * Workspace Branding Page
 *
 * Dedicated page for managing company/workspace branding:
 * - Company profile (logo, brand colors, tagline)
 * - Business information (email, phone, website, address)
 * - Social media profiles
 * - Custom links
 * - Theme customization
 * - Visibility settings
 *
 * Generates public profile at /p/{slug}
 */

// Extended profile type for preview with theme data
interface PreviewProfile extends Partial<CompanyProfile> {
  _theme?: Theme | null;
  _themeCustomization?: Partial<ThemeCustomization> | null;
}

const BrandingPage: React.FC = () => {
  const { user } = useAuth();

  // Preview state
  const [previewProfile, setPreviewProfile] = useState<PreviewProfile | null>(null);
  const [visibility, setVisibility] = useState<Partial<CompanyVisibilityConfig>>({});

  const workspaceId = user?.workspace_id;

  if (!workspaceId) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="text-center text-text-secondary">No workspace selected.</div>
      </div>
    );
  }

  const handleProfileChange = (data: ProfileFormChangeData) => {
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
      _theme: data._theme,
      _themeCustomization: data._themeCustomization,
    };
    setPreviewProfile(profile);
    setVisibility(data.company_visibility || {});
  };

  return (
    <div className="h-full flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Main Content Column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Building2 size={24} className="text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gradient">Branding</h1>
                <p className="text-text-secondary text-sm mt-0.5">
                  Manage your company profile and brand identity
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6 min-h-[500px]">
              <CompanyProfileForm onProfileChange={handleProfileChange} />
            </div>
          </div>
        </main>
      </div>

      {/* Preview Panel */}
      <div className="hidden lg:flex lg:flex-col w-[450px] border-l border-border/50 bg-gradient-to-br from-surface-hover/50 to-surface/30 backdrop-blur-sm overflow-hidden transition-all">
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

export default BrandingPage;
