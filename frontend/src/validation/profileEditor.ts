/**
 * Profile Editor Validation Schemas
 *
 * Zod validation schemas for the Public Profile Editor system.
 * These schemas ensure data integrity and provide type-safe validation
 * for all profile editor operations.
 */

import { z } from 'zod';

// =============================================================================
// Color Validation
// =============================================================================

/**
 * Hex color validation (3 or 6 digits)
 */
export const hexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format (use #RGB or #RRGGBB)');

/**
 * RGB color validation
 */
export const rgbColorSchema = z
  .string()
  .regex(/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/, 'Invalid RGB format (use rgb(r, g, b))');

/**
 * HSL color validation
 */
export const hslColorSchema = z
  .string()
  .regex(/^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/, 'Invalid HSL format (use hsl(h, s%, l%))');

/**
 * Any valid color format
 */
export const colorSchema = z.union([hexColorSchema, rgbColorSchema, hslColorSchema]);

// =============================================================================
// Gradient Schema
// =============================================================================

export const gradientConfigSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['linear', 'radial']),
  direction: z.string().optional(),
  stops: z.array(hexColorSchema).min(2).max(5),
});

// =============================================================================
// Color Palette Schema
// =============================================================================

export const colorPaletteSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema,
  neutral: z.array(hexColorSchema).min(1).max(10),
  gradients: z.array(gradientConfigSchema).optional(),
});

// =============================================================================
// Font Schemas
// =============================================================================

export const fontWeightSchema = z.number().int().min(100).max(900).multipleOf(100);

export const fontConfigSchema = z.object({
  family: z.string().min(1).max(100),
  source: z.enum(['web', 'custom']),
  custom_font_id: z.string().uuid().optional(),
  fallback: z.array(z.string()).min(1),
  weights: z.array(fontWeightSchema).min(1),
});

export const typographyConfigSchema = z.object({
  heading_font: fontConfigSchema,
  body_font: fontConfigSchema,
  accent_font: fontConfigSchema.optional(),
});

// =============================================================================
// Layout Schema
// =============================================================================

export const layoutPreferencesSchema = z.object({
  spacing: z.enum(['compact', 'normal', 'spacious']),
  hero_style: z.enum(['card', 'full-bleed']),
  section_layout: z.enum(['single-column', 'two-column']),
});

// =============================================================================
// Theme Schemas
// =============================================================================

export const themeCategorySchema = z.enum(['minimal', 'bold', 'elegant', 'modern', 'creative']);

export const themeVariantSchema = z.object({
  variant_id: z.string(),
  name: z.string(),
  colors: z.object({
    background: hexColorSchema,
    surface: hexColorSchema,
    text_primary: hexColorSchema,
    text_secondary: hexColorSchema,
    glass: z.string().optional(),
    glass_border: z.string().optional(),
  }),
});

export const themeSchema = z.object({
  theme_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: themeCategorySchema,
  description: z.string().max(500),
  preview_image_url: z.string().url().or(z.string().startsWith('/')),

  base_colors: colorPaletteSchema,
  default_typography: typographyConfigSchema,
  layout_config: layoutPreferencesSchema,

  is_premium: z.boolean(),
  is_popular: z.boolean(),
  usage_count: z.number().int().min(0),

  supports_dark_mode: z.boolean(),
  variants: z.array(themeVariantSchema).optional(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const themeFiltersSchema = z.object({
  category: themeCategorySchema.optional(),
  is_premium: z.boolean().optional(),
  is_popular: z.boolean().optional(),
  supports_dark_mode: z.boolean().optional(),
  search: z.string().max(100).optional(),
});

// =============================================================================
// Theme Customization Schemas
// =============================================================================

export const themeCustomizationSchema = z.object({
  customization_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  theme_id: z.string().uuid(),
  name: z.string().max(100).optional(),

  custom_colors: colorPaletteSchema.partial().optional(),
  custom_typography: typographyConfigSchema.partial().optional(),
  custom_layout: layoutPreferencesSchema.partial().optional(),

  is_preset: z.boolean(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const updateCustomizationRequestSchema = z.object({
  custom_colors: colorPaletteSchema.partial().optional(),
  custom_typography: typographyConfigSchema.partial().optional(),
  custom_layout: layoutPreferencesSchema.partial().optional(),
});

// =============================================================================
// Visibility Schemas
// =============================================================================

export const socialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'whatsapp',
  'tiktok',
  'linkedin',
  'youtube',
  'twitter',
]);

export const profileFieldSchema = z.enum([
  'name',
  'tagline',
  'logo_url',
  'email',
  'phone',
  'website',
  'address',
  'socials',
  'custom_links',
]);

export const fieldVisibilitySchema = z.record(profileFieldSchema, z.boolean());

export const socialVisibilitySchema = z.record(socialPlatformSchema, z.boolean());

export const profileVisibilityConfigSchema = z.object({
  visibility_config_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  profile_type: z.enum(['company', 'photographer']),
  profile_id: z.string().uuid(),

  field_visibility: fieldVisibilitySchema,
  social_visibility: socialVisibilitySchema,

  preset_name: z.string().max(100).optional(),
  is_default: z.boolean(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const updateVisibilityRequestSchema = z.object({
  field_visibility: z.record(z.string(), z.boolean()).optional(),
  social_visibility: z.record(z.string(), z.boolean()).optional(),
});

export const visibilityPresetSchema = z.object({
  name: z.string().min(1).max(100),
  field_visibility: z.record(z.string(), z.boolean()),
  social_visibility: z.record(z.string(), z.boolean()),
});

// =============================================================================
// Custom Font Schemas
// =============================================================================

export const fontFormatSchema = z.enum(['woff2', 'ttf', 'woff']);

export const fontFileSchema = z.object({
  file_id: z.string().uuid(),
  object_key: z.string(),
  weight: fontWeightSchema,
  style: z.enum(['normal', 'italic']),
  format: fontFormatSchema,
});

export const customFontSchema = z.object({
  custom_font_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  font_family: z.string().min(1).max(100),

  font_files: z.array(fontFileSchema).min(1),

  file_size_bytes: z.number().int().min(0).max(500 * 1024), // Max 500KB
  format: fontFormatSchema,

  is_validated: z.boolean(),
  validation_date: z.string().datetime().optional(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// File upload validation (for frontend pre-upload checks)
export const fontFileUploadSchema = z.object({
  name: z.string().regex(/\.(woff2|ttf|woff)$/i, 'Invalid font file extension'),
  size: z.number().max(500 * 1024, 'Font file must be under 500KB'),
  type: z.string().refine(
    (type) =>
      ['font/woff2', 'font/woff', 'font/ttf', 'application/x-font-ttf'].includes(type) ||
      type.startsWith('font/'),
    'Invalid font file type'
  ),
});

// =============================================================================
// Brand Asset Schemas
// =============================================================================

export const assetTypeSchema = z.enum(['logo', 'favicon', 'cover']);
export const assetVariantSchema = z.enum(['full', 'icon', 'light', 'dark']);

export const optimizedFormatsSchema = z.object({
  webp: z.string().optional(),
  avif: z.string().optional(),
  png: z.string().optional(),
});

export const brandAssetSchema = z.object({
  asset_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  asset_type: assetTypeSchema,
  variant: assetVariantSchema,

  object_key: z.string(),
  optimized_formats: optimizedFormatsSchema,

  width: z.number().int().min(1),
  height: z.number().int().min(1),
  file_size_bytes: z.number().int().min(0).max(5 * 1024 * 1024), // Max 5MB

  recommended_for: z.array(z.string()),

  version: z.number().int().min(1),
  is_current: z.boolean(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// File upload validation
export const assetFileUploadSchema = z.object({
  name: z.string().regex(/\.(png|jpg|jpeg|svg)$/i, 'Invalid image file extension'),
  size: z.number().max(5 * 1024 * 1024, 'Asset file must be under 5MB'),
  type: z.string().refine(
    (type) => ['image/png', 'image/jpeg', 'image/svg+xml'].includes(type),
    'Invalid image file type'
  ),
});

// =============================================================================
// Version Control Schemas
// =============================================================================

export const profileVersionSchema = z.object({
  version_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  profile_type: z.enum(['company', 'photographer']),
  profile_id: z.string().uuid(),

  profile_snapshot: z.record(z.string(), z.unknown()),
  visibility_snapshot: z.record(z.string(), z.unknown()),
  theme_snapshot: z.record(z.string(), z.unknown()),

  version_number: z.number().int().min(1),
  label: z.string().max(200).optional(),
  is_auto_snapshot: z.boolean(),

  created_at: z.string().datetime(),
  created_by: z.string().uuid().optional(),
});

export const createSnapshotRequestSchema = z.object({
  label: z.string().max(200).optional(),
});

// =============================================================================
// Preview Link Schemas
// =============================================================================

export const previewExpirationSchema = z.enum(['24h', '7d', '30d']);

export const previewLinkSchema = z.object({
  link_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  profile_id: z.string().uuid(),

  token: z.string().min(32).max(64),
  url: z.string().url(),

  expires_at: z.string().datetime(),
  has_password: z.boolean(),

  view_count: z.number().int().min(0),
  last_viewed_at: z.string().datetime().optional(),

  is_revoked: z.boolean(),
  revoked_at: z.string().datetime().optional(),

  created_at: z.string().datetime(),
  created_by: z.string().uuid().optional(),
});

export const createPreviewLinkRequestSchema = z.object({
  expiration: previewExpirationSchema,
  password: z.string().min(8).max(100).optional(),
});

export const previewCommentSchema = z.object({
  comment_id: z.string().uuid(),
  link_id: z.string().uuid(),
  workspace_id: z.string().uuid(),

  content: z.string().min(1).max(2000),
  element_selector: z.string().max(255).optional(),

  commenter_name: z.string().max(100).optional(),
  commenter_email: z.string().email().optional(),

  is_resolved: z.boolean(),
  resolved_at: z.string().datetime().optional(),
  resolved_by: z.string().uuid().optional(),

  created_at: z.string().datetime(),
});

export const createCommentRequestSchema = z.object({
  content: z.string().min(1).max(2000),
  element_selector: z.string().max(255).optional(),
  commenter_name: z.string().max(100).optional(),
  commenter_email: z.string().email().optional(),
});

// =============================================================================
// Analytics Schemas
// =============================================================================

export const analyticsEventTypeSchema = z.enum(['view', 'link_click', 'vcard_download', 'qr_scan']);

export const profileAnalyticsEventSchema = z.object({
  analytics_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  profile_id: z.string().uuid(),

  event_type: analyticsEventTypeSchema,

  link_url: z.string().url().optional(),
  link_label: z.string().max(100).optional(),

  visitor_country: z.string().length(2).optional(),
  visitor_region: z.string().max(100).optional(),
  referrer_source: z.string().max(50).optional(),
  referrer_url: z.string().url().optional(),

  session_duration_seconds: z.number().int().min(0).optional(),

  created_at: z.string().datetime(),
});

export const analyticsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('week'),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

// =============================================================================
// XSS Prevention - Input Sanitization
// =============================================================================

/**
 * Sanitized string schema that prevents XSS attacks
 * Strips HTML tags and potentially dangerous content
 */
export const sanitizedStringSchema = z.string().transform((val) => {
  // Remove HTML tags
  let sanitized = val.replace(/<[^>]*>/g, '');
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  // Remove event handlers
  sanitized = sanitized.replace(/on\w+=/gi, '');
  // Remove data: protocol for non-images
  sanitized = sanitized.replace(/data:(?!image)/gi, '');
  return sanitized.trim();
});

/**
 * Safe URL schema that prevents javascript: and data: exploits
 */
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      const lowerUrl = url.toLowerCase();
      return (
        !lowerUrl.startsWith('javascript:') &&
        !lowerUrl.startsWith('data:') &&
        !lowerUrl.startsWith('vbscript:')
      );
    },
    'URL contains potentially dangerous protocol'
  );

/**
 * Slug validation (URL-safe string)
 */
export const slugSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens');

// =============================================================================
// Editor State Schemas
// =============================================================================

export const deviceModeSchema = z.enum(['phone', 'tablet', 'desktop']);

export const editorActionSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  timestamp: z.number(),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
});

// =============================================================================
// Export Types from Schemas
// =============================================================================

export type GradientConfigInput = z.input<typeof gradientConfigSchema>;
export type ColorPaletteInput = z.input<typeof colorPaletteSchema>;
export type FontConfigInput = z.input<typeof fontConfigSchema>;
export type TypographyConfigInput = z.input<typeof typographyConfigSchema>;
export type LayoutPreferencesInput = z.input<typeof layoutPreferencesSchema>;
export type ThemeInput = z.input<typeof themeSchema>;
export type ThemeFiltersInput = z.input<typeof themeFiltersSchema>;
export type ThemeCustomizationInput = z.input<typeof themeCustomizationSchema>;
export type UpdateCustomizationInput = z.input<typeof updateCustomizationRequestSchema>;
export type ProfileVisibilityConfigInput = z.input<typeof profileVisibilityConfigSchema>;
export type UpdateVisibilityInput = z.input<typeof updateVisibilityRequestSchema>;
export type VisibilityPresetInput = z.input<typeof visibilityPresetSchema>;
export type CustomFontInput = z.input<typeof customFontSchema>;
export type BrandAssetInput = z.input<typeof brandAssetSchema>;
export type ProfileVersionInput = z.input<typeof profileVersionSchema>;
export type PreviewLinkInput = z.input<typeof previewLinkSchema>;
export type CreatePreviewLinkInput = z.input<typeof createPreviewLinkRequestSchema>;
export type PreviewCommentInput = z.input<typeof previewCommentSchema>;
export type CreateCommentInput = z.input<typeof createCommentRequestSchema>;
export type AnalyticsQueryInput = z.input<typeof analyticsQuerySchema>;
