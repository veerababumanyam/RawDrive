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

export interface CompanyVisibilityConfig {
    name: boolean;
    tagline: boolean;
    logo_url: boolean;
    email: boolean;
    phone: boolean;
    website: boolean;
    address: boolean;
    socials: boolean;
    custom_links: boolean;
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
    address_structured?: CompanyAddress;
    socials?: Record<string, string>;
    custom_links?: CustomLink[];
    company_visibility?: Partial<CompanyVisibilityConfig>;
}

export interface UpdateCompanyProfileRequest extends Partial<CreateCompanyProfileRequest> { }

// For public profile response which is a filtered dict + seo_schema
export interface PublicCompanyProfile extends Partial<CompanyProfile> {
    seo_schema?: Record<string, any>;
}
