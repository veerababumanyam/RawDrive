/**
 * Runtime validation schemas for RawDrive API types.
 *
 * These Zod schemas provide runtime validation for API responses,
 * ensuring data integrity even when TypeScript types match.
 *
 * @example
 * ```typescript
 * import { galleryResponseSchema, validateApiResponse } from '@rawdrive/api-types/schemas';
 *
 * // Validate API response at runtime
 * const result = validateApiResponse(response.data, galleryResponseSchema);
 * if (result.success) {
 *   console.log('Validated gallery:', result.data);
 * } else {
 *   console.error('Validation failed:', result.error);
 * }
 * ```
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * UUID schema with validation.
 */
export const uuidSchema = z.string().uuid();

/**
 * ISO 8601 datetime string schema.
 */
export const dateTimeSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

/**
 * Pagination metadata schema.
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/**
 * Standard API error response schema.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
    details: z.record(z.unknown()).optional(),
    status: z.number().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// ============================================================================
// Gallery Schemas
// ============================================================================

/**
 * Gallery status enum schema.
 */
export const galleryStatusSchema = z.enum(['draft', 'published', 'archived']);

export type GalleryStatus = z.infer<typeof galleryStatusSchema>;

/**
 * Download policy enum schema.
 */
export const downloadPolicySchema = z.enum([
  'view_only',
  'web_only',
  'watermarked_only',
  'original_allowed',
]);

export type DownloadPolicy = z.infer<typeof downloadPolicySchema>;

/**
 * Gallery schema.
 */
export const gallerySchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  status: galleryStatusSchema,
  shoot_date: z.string().nullable().optional(),
  cover_asset_id: uuidSchema.nullable().optional(),
  download_policy: downloadPolicySchema.optional(),
  password_protected: z.boolean().optional(),
  pin_protected: z.boolean().optional(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
  asset_count: z.number().int().nonnegative().optional(),
  pinned: z.boolean().optional(),
});

export type Gallery = z.infer<typeof gallerySchema>;

/**
 * Gallery list response schema with pagination.
 */
export const galleryListResponseSchema = z.object({
  data: z.array(gallerySchema),
  meta: paginationMetaSchema,
});

export type GalleryListResponse = z.infer<typeof galleryListResponseSchema>;

// ============================================================================
// Asset Schemas
// ============================================================================

/**
 * Asset type enum schema.
 */
export const assetTypeSchema = z.enum(['image', 'video', 'raw', 'document']);

export type AssetType = z.infer<typeof assetTypeSchema>;

/**
 * Asset schema.
 */
export const assetSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  gallery_id: uuidSchema.nullable().optional(),
  sub_gallery_id: uuidSchema.nullable().optional(),
  filename: z.string(),
  original_filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  asset_type: assetTypeSchema,
  sha256: z.string(),
  storage_key: z.string(),
  thumbnail_key: z.string().nullable().optional(),
  preview_key: z.string().nullable().optional(),
  is_favorited: z.boolean().optional(),
  is_selected: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

export type Asset = z.infer<typeof assetSchema>;

/**
 * Asset list response schema with pagination.
 */
export const assetListResponseSchema = z.object({
  data: z.array(assetSchema),
  meta: paginationMetaSchema,
});

export type AssetListResponse = z.infer<typeof assetListResponseSchema>;

// ============================================================================
// User Schemas
// ============================================================================

/**
 * User role enum schema.
 */
export const userRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);

export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * User schema.
 */
export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean(),
  email_verified: z.boolean(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

export type User = z.infer<typeof userSchema>;

// ============================================================================
// Workspace Schemas
// ============================================================================

/**
 * Workspace schema.
 */
export const workspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  owner_id: uuidSchema,
  logo_url: z.string().url().nullable().optional(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

export type Workspace = z.infer<typeof workspaceSchema>;

// ============================================================================
// Webhook Schemas
// ============================================================================

/**
 * Webhook event type schema.
 */
export const webhookEventTypeSchema = z.enum([
  'gallery.created',
  'gallery.updated',
  'gallery.published',
  'gallery.deleted',
  'asset.uploaded',
  'asset.processed',
  'asset.deleted',
  'client.registered',
  'client.selection.submitted',
  'payment.completed',
  'subscription.created',
  'subscription.cancelled',
]);

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

/**
 * Webhook subscription schema.
 */
export const webhookSubscriptionSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  url: z.string().url(),
  secret: z.string(),
  events: z.array(webhookEventTypeSchema),
  is_active: z.boolean(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

export type WebhookSubscription = z.infer<typeof webhookSubscriptionSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Result type for validation operations.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/**
 * Validate data against a Zod schema.
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Validation result with typed data or error
 */
export function validateApiResponse<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate data and throw on failure.
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Validated data
 * @throws ZodError if validation fails
 */
export function assertValidResponse<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): T {
  return schema.parse(data);
}

/**
 * Create a validated API response handler.
 *
 * @param schema - Zod schema for the response
 * @returns Function that validates and transforms response data
 *
 * @example
 * ```typescript
 * const validateGalleries = createResponseValidator(galleryListResponseSchema);
 *
 * // In API call
 * const response = await apiClient.get('/galleries');
 * const validated = validateGalleries(response.data);
 * ```
 */
export function createResponseValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => schema.parse(data);
}
