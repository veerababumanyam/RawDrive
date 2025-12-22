export interface CompanyAddress {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
}

export interface CustomLink {
    label: string;
    url: string;
    logo_url?: string;
}

/**
 * Secondary contact (email or phone) with optional label.
 * Used for additional contact information beyond primary email/phone.
 */
export interface SecondaryContact {
    value: string;
    label?: string;
}

export interface CompanyVisibilityConfig {
    name: boolean;
    tagline: boolean;
    logo_url: boolean;
    email: boolean;
    phone: boolean;
    website: boolean;
    address: boolean;
    socials_instagram: boolean;
    socials_facebook: boolean;
    socials_twitter: boolean;
    socials_linkedin: boolean;
    custom_links: boolean;
    // Secondary contacts visibility
    secondary_email_1: boolean;
    secondary_email_2: boolean;
    secondary_phone_1: boolean;
    secondary_phone_2: boolean;
    // Public profile button visibility
    qr_code: boolean;
    vcard: boolean;
}

export interface CompanyProfile {
    profile_id: string;
    workspace_id: string;
    name: string;
    tagline?: string;
    slug: string;
    logo_url?: string;
    favicon_url?: string;
    brand_color?: string;
    brand_font?: string;
    email: string;
    phone?: string;
    website?: string;
    // Secondary contacts (max 2 each)
    secondary_emails: SecondaryContact[];
    secondary_phones: SecondaryContact[];
    address_structured?: CompanyAddress | null;
    socials: Record<string, string>;
    custom_links: CustomLink[];
    company_visibility: Partial<CompanyVisibilityConfig>;
    created_at: string;
    updated_at: string;
}

export interface CreateCompanyProfileRequest {
    name: string;
    tagline?: string;
    slug: string;
    logo_url?: string;
    favicon_url?: string;
    brand_color?: string;
    brand_font?: string;
    email: string;
    phone?: string;
    website?: string;
    // Secondary contacts (max 2 each)
    secondary_emails?: SecondaryContact[];
    secondary_phones?: SecondaryContact[];
    address_structured?: CompanyAddress;
    socials?: Record<string, string>;
    custom_links?: CustomLink[];
    company_visibility?: Partial<CompanyVisibilityConfig>;
}

export interface UpdateCompanyProfileRequest extends Partial<CreateCompanyProfileRequest> { }

// Theme data returned with public profile
export interface PublicProfileTheme {
    theme_id: string;
    name?: string;
    category?: string;
    base_colors?: {
        primary?: string;
        secondary?: string;
        accent?: string;
        background?: string;
        surface?: string;
        text?: string;
    };
    dark_colors?: {
        primary?: string;
        secondary?: string;
        accent?: string;
        background?: string;
        surface?: string;
        text?: string;
    };
    typography?: {
        headingFont?: string;
        bodyFont?: string;
    };
    layout?: {
        spacing?: 'compact' | 'normal' | 'spacious';
        heroStyle?: 'card' | 'full-bleed';
        sectionLayout?: 'single-column' | 'two-column';
    };
}

// For public profile response which is a filtered dict + seo_schema + theme
export interface PublicCompanyProfile extends Partial<CompanyProfile> {
    seo_schema?: Record<string, any>;
    theme?: PublicProfileTheme;
    theme_id?: string;
}
