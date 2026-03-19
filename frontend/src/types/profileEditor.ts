/**
 * Profile Editor Types
 *
 * Type definitions for the Public Profile Editor system including:
 * - Theme entities and configurations
 * - Visibility controls
 * - Custom fonts and brand assets
 * - Version control
 * - Preview sharing
 * - Analytics
 */

// =============================================================================
// Color and Typography Types
// =============================================================================

/**
 * Gradient configuration for themes
 */
export interface GradientConfig {
  name: string;
  type: 'linear' | 'radial';
  direction?: string;
  stops: string[];
}

/**
 * Color palette for brand customization
 */
export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string[];
  gradients?: GradientConfig[];
}

/**
 * Font configuration for typography
 */
export interface FontConfig {
  family: string;
  source: 'web' | 'custom';
  custom_font_id?: string;
  fallback: string[];
  weights: number[];
}

/**
 * Typography configuration with role assignments
 */
export interface TypographyConfig {
  heading_font: FontConfig;
  body_font: FontConfig;
  accent_font?: FontConfig;
}

/**
 * Layout preferences for profile display
 */
export interface LayoutPreferences {
  spacing: 'compact' | 'normal' | 'spacious';
  hero_style: 'card' | 'full-bleed';
  section_layout: 'single-column' | 'two-column';
}

// =============================================================================
// Theme Types
// =============================================================================

/**
 * Theme variant (light/dark)
 */
export interface ThemeVariant {
  variant_id: string;
  name: string;
  colors: {
    background: string;
    surface: string;
    text_primary: string;
    text_secondary: string;
    glass?: string;
    glass_border?: string;
  };
}

/**
 * Theme category for organizing themes
 */
export type ThemeCategory = 'minimal' | 'bold' | 'elegant' | 'modern' | 'creative' | 'gradient' | 'dark' | 'nature';

/**
 * Theme entity - pre-built design template
 */
export interface Theme {
  theme_id: string;
  name: string;
  category: ThemeCategory;
  description: string;
  preview_image_url: string;

  base_colors: ColorPalette;
  default_typography: TypographyConfig;
  layout_config: LayoutPreferences;

  is_premium: boolean;
  is_popular: boolean;
  usage_count: number;

  supports_dark_mode: boolean;
  variants?: ThemeVariant[];

  /** Background animation style for public profile page */
  animation_type?: 'gradient-shift' | 'particles' | 'wave' | 'aurora' | 'none';

  created_at: string;
  updated_at: string;
}

/**
 * Theme customization - user-specific modifications
 */
export interface ThemeCustomization {
  customization_id: string;
  workspace_id: string;
  theme_id: string;
  name?: string;

  custom_colors?: Partial<ColorPalette>;
  custom_typography?: Partial<TypographyConfig>;
  custom_layout?: Partial<LayoutPreferences>;

  is_preset: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * Filters for theme browsing
 */
export interface ThemeFilters {
  category?: ThemeCategory;
  is_premium?: boolean;
  is_popular?: boolean;
  supports_dark_mode?: boolean;
  search?: string;
}

// =============================================================================
// Visibility Types
// =============================================================================

/**
 * Social media platform identifiers
 */
export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'
  | 'twitter';

/**
 * Profile field identifiers for visibility control
 */
export type ProfileField =
  | 'name'
  | 'tagline'
  | 'logo_url'
  | 'email'
  | 'phone'
  | 'website'
  | 'address'
  | 'socials'
  | 'custom_links';

/**
 * Per-platform social media visibility
 */
export type SocialVisibility = {
  [K in SocialPlatform]?: boolean;
};

/**
 * Field visibility configuration
 */
export type FieldVisibility = {
  [K in ProfileField]?: boolean;
};

/**
 * Profile visibility configuration entity
 */
export interface ProfileVisibilityConfig {
  visibility_config_id: string;
  workspace_id: string;
  profile_type: 'company' | 'photographer';
  profile_id: string;

  field_visibility: FieldVisibility;
  social_visibility: SocialVisibility;

  preset_name?: string;
  is_default: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * Visibility preset for quick application
 */
export interface VisibilityPreset {
  name: string;
  field_visibility: FieldVisibility;
  social_visibility: SocialVisibility;
}

// =============================================================================
// Custom Font Types
// =============================================================================

/**
 * Allowed font file formats
 */
export type FontFormat = 'woff2' | 'ttf' | 'woff';

/**
 * Font file metadata
 */
export interface FontFile {
  file_id: string;
  object_key: string;
  weight: number;
  style: 'normal' | 'italic';
  format: FontFormat;
}

/**
 * Custom font entity
 */
export interface CustomFont {
  custom_font_id: string;
  workspace_id: string;
  font_family: string;

  font_files: FontFile[];

  file_size_bytes: number;
  format: FontFormat;

  is_validated: boolean;
  validation_date?: string;

  created_at: string;
  updated_at: string;
}

/**
 * Web font from curated list
 */
export interface WebFont {
  family: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  weights: number[];
  styles: ('normal' | 'italic')[];
  preview_url?: string;
}

/**
 * Font pairing suggestion
 */
export interface FontPairing {
  heading_font: string;
  body_font: string;
  reason: string;
  compatibility_score: number;
}

// =============================================================================
// Brand Asset Types
// =============================================================================

/**
 * Asset type categories
 */
export type AssetType = 'logo' | 'favicon' | 'cover';

/**
 * Asset variant for different contexts
 */
export type AssetVariant = 'full' | 'icon' | 'light' | 'dark';

/**
 * Optimized format URLs
 */
export interface OptimizedFormats {
  webp?: string;
  avif?: string;
  png?: string;
}

/**
 * Brand asset entity
 */
export interface BrandAsset {
  asset_id: string;
  workspace_id: string;
  asset_type: AssetType;
  variant: AssetVariant;

  object_key: string;
  optimized_formats: OptimizedFormats;

  width: number;
  height: number;
  file_size_bytes: number;

  recommended_for: string[];

  version: number;
  is_current: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * Asset context for variant selection
 */
export interface AssetContext {
  background_color?: string;
  theme_variant?: 'light' | 'dark';
  size_requirement?: 'full' | 'icon';
}

// =============================================================================
// Version Control Types
// =============================================================================

/**
 * Profile version snapshot
 */
export interface ProfileVersion {
  version_id: string;
  workspace_id: string;
  profile_type: 'company' | 'photographer';
  profile_id: string;

  profile_snapshot: Record<string, unknown>;
  visibility_snapshot: Record<string, unknown>;
  theme_snapshot: Record<string, unknown>;

  version_number: number;
  label?: string;
  is_auto_snapshot: boolean;

  created_at: string;
  created_by?: string;
}

/**
 * Version diff for comparison
 */
export interface VersionDiff {
  field: string;
  old_value: unknown;
  new_value: unknown;
  change_type: 'added' | 'removed' | 'modified';
}

/**
 * Version comparison result
 */
export interface VersionComparison {
  version_a: ProfileVersion;
  version_b: ProfileVersion;
  diffs: VersionDiff[];
}

/**
 * Profile export format
 */
export interface ProfileExport {
  version: string;
  exported_at: string;
  profile_data: Record<string, unknown>;
  visibility_config: ProfileVisibilityConfig;
  theme_customization?: ThemeCustomization;
}

// =============================================================================
// Preview Sharing Types
// =============================================================================

/**
 * Preview link expiration options
 */
export type PreviewExpiration = '24h' | '7d' | '30d';

/**
 * Preview link entity
 */
export interface PreviewLink {
  link_id: string;
  workspace_id: string;
  profile_id: string;

  token: string;
  url: string;

  expires_at: string;
  has_password: boolean;

  view_count: number;
  last_viewed_at?: string;

  is_revoked: boolean;
  revoked_at?: string;

  created_at: string;
  created_by?: string;
}

/**
 * Options for creating a preview link
 */
export interface CreatePreviewLinkOptions {
  expiration: PreviewExpiration;
  password?: string;
}

/**
 * Preview comment for feedback
 */
export interface PreviewComment {
  comment_id: string;
  link_id: string;
  workspace_id: string;

  content: string;
  element_selector?: string;

  commenter_name?: string;
  commenter_email?: string;

  is_resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;

  created_at: string;
}

// =============================================================================
// Analytics Types
// =============================================================================

/**
 * Analytics event types
 */
export type AnalyticsEventType = 'view' | 'link_click' | 'vcard_download' | 'qr_scan';

/**
 * Profile analytics event
 */
export interface ProfileAnalyticsEvent {
  analytics_id: string;
  workspace_id: string;
  profile_id: string;

  event_type: AnalyticsEventType;

  link_url?: string;
  link_label?: string;

  visitor_country?: string;
  visitor_region?: string;
  referrer_source?: string;
  referrer_url?: string;

  session_duration_seconds?: number;

  created_at: string;
}

/**
 * Aggregated analytics data
 */
export interface ProfileAnalytics {
  total_views: number;
  unique_visitors: number;
  link_clicks: number;
  vcard_downloads: number;
  qr_scans: number;

  views_by_day: { date: string; count: number }[];
  views_by_country: { country: string; count: number }[];
  top_referrers: { source: string; count: number }[];
  popular_links: { label: string; url: string; clicks: number }[];

  average_session_duration: number;

  period_start: string;
  period_end: string;
}

// =============================================================================
// Editor State Types
// =============================================================================

/**
 * Device mode for preview
 */
export type DeviceMode = 'phone' | 'tablet' | 'desktop';

/**
 * Device breakpoint dimensions
 */
export const DEVICE_BREAKPOINTS: Record<DeviceMode, { width: number; height: number }> = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

/**
 * Editor undo/redo action
 */
export interface EditorAction {
  id: string;
  type: string;
  timestamp: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Editor state snapshot
 */
export interface EditorState {
  profile: Record<string, unknown>;
  visibility: ProfileVisibilityConfig | null;
  theme: Theme | null;
  customization: ThemeCustomization | null;
  deviceMode: DeviceMode;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt?: string;
}

/**
 * Preview data for rendering
 */
export interface PreviewData {
  profile: Record<string, unknown>;
  visibility: ProfileVisibilityConfig;
  theme: Theme;
  customization?: ThemeCustomization;
  computedStyles: Record<string, string>;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to update visibility configuration
 */
export interface UpdateVisibilityRequest {
  field_visibility?: FieldVisibility;
  social_visibility?: SocialVisibility;
}

/**
 * Request to update theme customization
 */
export interface UpdateCustomizationRequest {
  custom_colors?: Partial<ColorPalette>;
  custom_typography?: Partial<TypographyConfig>;
  custom_layout?: Partial<LayoutPreferences>;
}

/**
 * Color contrast check result
 */
export interface ContrastResult {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  suggestion?: string;
}

/**
 * Validation result for files
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Enhanced Company Profile (with editor fields)
// =============================================================================

/**
 * Extended company profile with theme and customization references
 */
export interface EnhancedCompanyProfile {
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
  address_structured?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  socials: Record<string, string>;
  custom_links: { label: string; url: string; logo_url?: string }[];
  company_visibility: Record<string, boolean>;

  // NEW: Theme and customization fields
  theme_id?: string;
  theme_customization_id?: string;
  color_palette?: ColorPalette;
  typography_config?: TypographyConfig;
  layout_preferences?: LayoutPreferences;
  is_published: boolean;
  published_at?: string;

  created_at: string;
  updated_at: string;
}
