import { z } from 'zod';

/**
 * Schema for starting analysis request
 */
export const StartAnalysisRequestSchema = z.object({
  reanalyzeAll: z.boolean().optional(),
});

export type StartAnalysisRequest = z.infer<typeof StartAnalysisRequestSchema>;

/**
 * Schema for analysis progress
 * Matches backend QualityAnalysisProgressSchema
 */
export const AnalysisProgressSchema = z.object({
  session_id: z.string().uuid(),
  status: z.string(), // 'pending', 'analyzing', 'grouping', 'curating', 'completed', 'failed'
  progress_percent: z.number().min(0).max(100),
  stage: z.string().optional().nullable(),
  photos_total: z.number(),
  photos_analyzed: z.number(),
  estimated_remaining_seconds: z.number().optional().nullable(),
  error_message: z.string().optional().nullable(),
});

export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>;

/**
 * Schema for analysis summary
 * Matches backend AnalysisSummaryResponse
 */
export const AnalysisSummarySchema = z.object({
  total_analyzed: z.number(),
  total_photos: z.number(),
  failed_count: z.number(),
  excellent: z.number(),
  good: z.number(),
  fair: z.number(),
  poor: z.number(),
  blur_count: z.number(),
});

export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;

/**
 * Schema for retry failed analysis response
 */
export const RetryFailedAnalysisResponseSchema = z.object({
  queued_count: z.number(),
  message: z.string(),
});

export type RetryFailedAnalysisResponse = z.infer<typeof RetryFailedAnalysisResponseSchema>;

/**
 * Schema for AI Filter Request
 */
export const AIFilterRequestSchema = z.object({
  quality_tier: z.enum(['all', 'excellent', 'good', 'fair']).optional(),
  quality_min: z.number().min(0).max(100).optional(),
  blur_hide: z.boolean().optional(),
  blur_show_bokeh: z.boolean().optional(),
  min_sharpness: z.number().min(0).max(100).optional(),
  min_exposure: z.number().min(0).max(100).optional(),
  min_composition: z.number().min(0).max(100).optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(500).optional(),
});

export type AIFilterRequest = z.infer<typeof AIFilterRequestSchema>;
