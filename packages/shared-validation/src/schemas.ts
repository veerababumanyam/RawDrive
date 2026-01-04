import { z } from 'zod';
import { PATTERNS } from './patterns';

/**
 * Hex color schema
 */
export const hexColorSchema = z.string().regex(PATTERNS.HEX_COLOR, 'Invalid hex color format');

/**
 * UUID v4 schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Email schema
 */
export const emailSchema = z.string().email('Invalid email format');

/**
 * Color stop schema for gradients
 */
export const colorStopSchema = z.object({
  color: hexColorSchema,
  position: z.number().min(0).max(100),
});

/**
 * Gradient configuration schema
 */
export const gradientConfigSchema = z.object({
  type: z.literal('linear'),
  preset_id: z.string().nullable(),
  direction: z.number().min(0).max(360),
  colors: z.array(colorStopSchema).min(2).max(10),
});

/**
 * Pagination query schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
