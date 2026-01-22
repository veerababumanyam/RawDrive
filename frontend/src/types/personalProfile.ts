/**
 * TypeScript types for Personal Profile Digital Visiting Cards.
 *
 * These types mirror the Pydantic schemas in backend/src/app/api/personal_profile_schemas.py
 */

/**
 * Structured address with optional GPS coordinates.
 * All fields are optional to allow partial address entry.
 */
export interface PersonalProfileAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  /** GPS latitude for map integration (-90 to 90) */
  latitude?: number;
  /** GPS longitude for map integration (-180 to 180) */
  longitude?: number;
}

/**
 * Custom navigation link for portfolio, services, etc.
 */
export interface CustomLink {
  label: string;
  url: string;
  logo_url?: string;
  /** Link type: portfolio, service, contact, pricing, gallery, booking, blog, proofing */
  type?: string;
}

/**
 * Secondary contact (email or phone) with optional label.
 * Examples: { value: "work@example.com", label: "Work" }
 */
export interface SecondaryContact {
  value: string;
  /** Optional label like 'Work', 'Personal' */
  label?: string;
}

/**
 * Embedded media configuration for TikTok and Spotify.
 */
export interface EmbeddedMedia {
  /** TikTok username for profile embed */
  tiktok_username?: string;
  /** Spotify playlist ID for embed */
  spotify_playlist_id?: string;
}

/**
 * SEO metadata for search engine optimization.
 */
export interface SEOMetadata {
  /** Page title (50-60 characters recommended) */
  meta_title?: string;
  /** Meta description (150-160 characters) */
  meta_description?: string;
  /** Array of keywords */
  meta_keywords?: string[];
  /** Open Graph title */
  og_title?: string;
  /** Open Graph description */
  og_description?: string;
  /** Open Graph image URL */
  og_image?: string;
  /** Twitter card type: summary or summary_large_image */
  twitter_card?: 'summary' | 'summary_large_image';
  /** Twitter card title */
  twitter_title?: string;
  /** Twitter card description */
  twitter_description?: string;
  /** Twitter card image URL */
  twitter_image?: string;
}

/**
 * Visibility configuration for personal profile fields.
 * Each field can be toggled on/off for public display.
 */
export interface PersonalVisibilityConfig {
  // Identity
  display_name: boolean;
  profile_title: boolean;
  avatar_url: boolean;
  bio: boolean;
  location: boolean;

  // Contact
  email: boolean;
  phone: boolean;
  website: boolean;
  address: boolean;

  // Social media (per-platform)
  socials_instagram: boolean;
  socials_facebook: boolean;
  socials_twitter: boolean;
  socials_linkedin: boolean;
  socials_youtube: boolean;
  socials_tiktok: boolean;
  socials_pinterest: boolean;
  socials_behance: boolean;
  socials_dribbble: boolean;
  socials_spotify: boolean;
  socials_whatsapp: boolean;

  // Other
  custom_links: boolean;
  embedded_media: boolean;
  featured_gallery: boolean;
  categories: boolean;
  service_areas: boolean;
  booking_calendar: boolean;

  // Secondary contacts
  secondary_email_1: boolean;
  secondary_email_2: boolean;
  secondary_phone_1: boolean;
  secondary_phone_2: boolean;

  // Public profile features
  qr_code: boolean;
  vcard: boolean;
}

/**
 * Predefined photography categories.
 */
export const PERSONAL_PROFILE_CATEGORIES = [
  'Photography',
  'Videography',
  'Wedding Services',
  'Commercial Production',
  'Portrait Photography',
  'Event Photography',
  'Creative Services',
  'Travel Photography',
  'Fashion Photography',
  'Product Photography',
  'Real Estate Photography',
  'Food Photography',
  'Sports Photography',
  'Documentary',
  'Fine Art',
] as const;

export type PersonalProfileCategory = (typeof PERSONAL_PROFILE_CATEGORIES)[number];

/**
 * Background theme options.
 */
export const BACKGROUND_THEMES = ['dark', 'pastel', 'bold', 'cinematic', 'minimal'] as const;

export type BackgroundTheme = (typeof BACKGROUND_THEMES)[number];

/**
 * Social media platforms supported for personal profiles.
 */
export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'behance'
  | 'dribbble'
  | 'spotify'
  | 'whatsapp';

/**
 * Full personal profile data (returned from API).
 */
export interface PersonalProfile {
  profile_id: string;
  workspace_id: string;
  user_id: string;

  // Identity
  display_name: string;
  profile_title?: string;
  slug: string;
  avatar_url?: string;
  bio?: string;
  location?: string;

  // Contact info
  email: string;
  phone?: string;
  website?: string;

  // Secondary contacts (max 2 each)
  secondary_emails: SecondaryContact[];
  secondary_phones: SecondaryContact[];

  // Location & Travel
  address_structured?: PersonalProfileAddress | null;
  service_areas: string[];

  // Social media & links
  socials: Record<SocialPlatform, string>;
  custom_links: CustomLink[];

  // Embedded media
  embedded_media?: EmbeddedMedia | null;

  // Featured gallery
  featured_gallery_id?: string | null;

  // Categories
  categories: string[];

  // Branding
  brand_color?: string;
  background_theme?: BackgroundTheme;

  // Visibility
  visibility_config: Partial<PersonalVisibilityConfig>;

  // Public toggle
  is_public: boolean;

  // SEO
  seo_metadata?: SEOMetadata | null;

  // Verification & Badges
  is_verified: boolean;
  badges: string[];

  // Calendar
  booking_calendar_url?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new personal profile.
 */
export interface CreatePersonalProfileRequest {
  // Required
  display_name: string;
  slug: string;
  email: string;

  // Optional identity
  profile_title?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;

  // Contact
  phone?: string;
  website?: string;
  secondary_emails?: SecondaryContact[];
  secondary_phones?: SecondaryContact[];

  // Location & Travel
  address_structured?: PersonalProfileAddress;
  service_areas?: string[];

  // Social media & links
  socials?: Partial<Record<SocialPlatform, string>>;
  custom_links?: CustomLink[];

  // Embedded media
  embedded_media?: EmbeddedMedia;

  // Featured gallery
  featured_gallery_id?: string;

  // Categories
  categories?: string[];

  // Branding
  brand_color?: string;
  background_theme?: BackgroundTheme;

  // Visibility
  visibility_config?: Partial<PersonalVisibilityConfig>;

  // Public toggle
  is_public?: boolean;

  // SEO
  seo_metadata?: SEOMetadata;

  // Calendar
  booking_calendar_url?: string;
}

/**
 * Request to update an existing personal profile.
 * All fields are optional for partial updates.
 */
export interface UpdatePersonalProfileRequest
  extends Partial<Omit<CreatePersonalProfileRequest, 'slug'>> {
  /** Slug can be updated but requires availability check */
  slug?: string;
}

/**
 * Public personal profile response with SEO schema.
 * Only includes fields that are marked visible in visibility configuration.
 */

/**
 * Featured gallery info for public display.
 */
export interface FeaturedGalleryInfo {
  gallery_id: string;
  name: string;
  cover_image_url?: string;
  asset_count?: number;
}

export interface PublicPersonalProfile {
  // Identity (always included if profile is public)
  display_name?: string;
  profile_title?: string;
  slug: string;
  avatar_url?: string;
  bio?: string;
  location?: string;

  // Contact info (based on visibility)
  email?: string;
  phone?: string;
  website?: string;

  // Secondary contacts (based on visibility)
  secondary_emails: SecondaryContact[];
  secondary_phones: SecondaryContact[];

  // Address (based on visibility)
  address_structured?: PersonalProfileAddress | null;
  service_areas: string[];

  // Social media & links (based on visibility)
  socials: Partial<Record<SocialPlatform, string>>;
  custom_links: CustomLink[];

  // Embedded media (based on visibility)
  embedded_media?: EmbeddedMedia | null;

  // Featured gallery (based on visibility)
  featured_gallery_id?: string | null;
  featured_gallery?: FeaturedGalleryInfo | null;

  // Categories (based on visibility)
  categories: string[];

  // Branding (always included for theming)
  brand_color?: string;
  background_theme?: BackgroundTheme;

  // Verification & Badges (always included)
  is_verified: boolean;
  badges: string[];

  // Booking calendar (based on visibility)
  booking_calendar_url?: string;

  // Visibility flags (for client to know what buttons to show)
  show_qr_code: boolean;
  show_vcard: boolean;

  // SEO schema (JSON-LD Person schema)
  seo_schema?: Record<string, unknown>;

  // SEO metadata for meta tags
  seo_metadata?: SEOMetadata | null;

  // Public profile URL
  public_url: string;

  /** Whether this profile should be indexed by search engines */
  indexable?: boolean;
}

/**
 * Slug availability check response.
 */
export interface SlugAvailabilityResponse {
  slug: string;
  available: boolean;
  message?: string;
}

/**
 * Avatar upload response.
 */
export interface AvatarUploadResponse {
  avatar_url: string;
  message: string;
}

/**
 * Prefill data for new profile creation.
 */
export interface ProfilePrefillData {
  display_name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar_url?: string;
  location?: string;
}

/**
 * Profile existence check response.
 */
export interface ProfileExistsResponse {
  exists: boolean;
  profile_id?: string;
  slug?: string;
}

/**
 * Avatar size options for fetching.
 */
export type AvatarSize = 64 | 128 | 256 | 512;

/**
 * Default visibility configuration for new profiles.
 */
export const DEFAULT_VISIBILITY_CONFIG: PersonalVisibilityConfig = {
  // Identity
  display_name: true,
  profile_title: true,
  avatar_url: true,
  bio: true,
  location: true,

  // Contact
  email: true,
  phone: true,
  website: true,
  address: true,

  // Social media
  socials_instagram: true,
  socials_facebook: true,
  socials_twitter: true,
  socials_linkedin: true,
  socials_youtube: true,
  socials_tiktok: true,
  socials_pinterest: true,
  socials_behance: true,
  socials_dribbble: true,
  socials_spotify: true,
  socials_whatsapp: true,

  // Other
  custom_links: true,
  embedded_media: true,
  featured_gallery: true,
  categories: true,
  service_areas: true,
  booking_calendar: true,

  // Secondary contacts
  secondary_email_1: true,
  secondary_email_2: true,
  secondary_phone_1: true,
  secondary_phone_2: true,

  // Public profile features
  qr_code: true,
  vcard: true,
};
