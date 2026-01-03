/**
 * TypeScript types for Per-User Gemini LLM Settings
 * Feature: 003-user-gemini-settings
 */

// ---------------------------------------------------------------------------
// Gemini Model Types
// ---------------------------------------------------------------------------

/**
 * Public Gemini model information
 */
export interface GeminiModel {
  model_id: string;
  identifier: string;
  display_name: string;
  is_default: boolean;
}

/**
 * Admin view of Gemini model with additional fields
 */
export interface GeminiModelAdmin extends GeminiModel {
  description: string | null;
  capabilities: string[] | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

// ---------------------------------------------------------------------------
// User Settings Types
// ---------------------------------------------------------------------------

/**
 * User's Gemini configuration status
 */
export type GeminiSettingsStatus = 'not_configured' | 'connected' | 'validation_failed' | 'unknown';

/**
 * User's Gemini settings response
 */
export interface UserGeminiSettings {
  status: GeminiSettingsStatus;
  has_api_key: boolean;
  api_key_masked: string | null;
  selected_model: GeminiModel | null;
  effective_model: GeminiModel | null;
  last_validated_at: string | null;
  validation_error: string | null;
}

/**
 * Request to update Gemini settings
 */
export interface UpdateGeminiSettingsRequest {
  api_key?: string;
  selected_model_id?: string | null;
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

/**
 * Gemini validation error codes
 */
export type GeminiErrorCode =
  | 'INVALID_KEY'
  | 'KEY_UNAUTHORIZED'
  | 'KEY_FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR';

/**
 * Gemini API key validation error details
 */
export interface GeminiValidationError {
  error: GeminiErrorCode;
  message: string;
  hint?: string;
}

/**
 * Result of API key validation
 */
export interface KeyValidationResult {
  valid: boolean;
  error?: GeminiValidationError;
  available_models?: string[];
}

/**
 * Request to validate a Gemini API key
 */
export interface ValidateGeminiKeyRequest {
  api_key: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * Response for listing available Gemini models
 */
export interface GeminiModelsListResponse {
  models: GeminiModel[];
  default_model_id: string | null;
}

// ---------------------------------------------------------------------------
// Admin Types
// ---------------------------------------------------------------------------

/**
 * Request to create a new Gemini model
 */
export interface CreateGeminiModelRequest {
  identifier: string;
  display_name: string;
  description?: string;
  capabilities?: string[];
  sort_order?: number;
  is_active?: boolean;
  is_default?: boolean;
}

/**
 * Request to update a Gemini model
 */
export interface UpdateGeminiModelRequest {
  display_name?: string;
  description?: string;
  capabilities?: string[];
  sort_order?: number;
  is_active?: boolean;
  is_default?: boolean;
}

/**
 * Request to reorder Gemini models
 */
export interface ReorderGeminiModelsRequest {
  model_ids: string[];
}

/**
 * Model usage distribution for admin stats
 */
export interface ModelDistribution {
  model_identifier: string;
  display_name: string;
  user_count: number;
}

/**
 * Aggregate Gemini configuration statistics for admin
 */
export interface GeminiAdminStats {
  total_users: number;
  users_with_key: number;
  users_connected: number;
  users_failed: number;
  model_distribution: ModelDistribution[];
  recent_ai_calls: number;
  ai_success_rate: number;
}

// ---------------------------------------------------------------------------
// AI Feature Toggles Types (T080)
// ---------------------------------------------------------------------------

/**
 * AI feature toggle settings
 */
export interface AIFeatureToggles {
  photo_analysis: boolean;
  captions: boolean;
  hashtags: boolean;
  gallery_story: boolean;
  smart_curation: boolean;
}

/**
 * Request to update AI feature toggles
 */
export interface UpdateAIFeatureTogglesRequest {
  photo_analysis?: boolean;
  captions?: boolean;
  hashtags?: boolean;
  gallery_story?: boolean;
  smart_curation?: boolean;
}

/**
 * Response with AI feature toggles and status
 */
export interface AIFeatureTogglesResponse {
  toggles: AIFeatureToggles;
  has_api_key: boolean;
  api_status: GeminiSettingsStatus;
}

/**
 * AI feature metadata for UI display
 */
export interface AIFeatureInfo {
  key: keyof AIFeatureToggles;
  name: string;
  description: string;
  icon: string;
}

/**
 * Available AI features with metadata
 */
export const AI_FEATURES: AIFeatureInfo[] = [
  {
    key: 'photo_analysis',
    name: 'Photo Analysis',
    description: 'AI-powered quality assessment, tags, colors, lighting, and suggestions',
    icon: 'Camera',
  },
  {
    key: 'captions',
    name: 'Caption Generation',
    description: 'Generate professional, casual, or poetic captions for photos',
    icon: 'FileText',
  },
  {
    key: 'hashtags',
    name: 'Hashtag Generation',
    description: 'Generate categorized hashtags for social media optimization',
    icon: 'Hash',
  },
  {
    key: 'gallery_story',
    name: 'Gallery Stories',
    description: 'AI-written narratives and descriptions for photo galleries',
    icon: 'BookOpen',
  },
  {
    key: 'smart_curation',
    name: 'Smart Curation',
    description: 'AI-powered selection of best photos based on quality and diversity',
    icon: 'Wand2',
  },
];

// ---------------------------------------------------------------------------
// UI Helper Types
// ---------------------------------------------------------------------------

/**
 * Error messages mapped from error codes
 */
export const GEMINI_ERROR_MESSAGES: Record<GeminiErrorCode, { message: string; hint: string }> = {
  INVALID_KEY: {
    message: 'The API key format appears invalid.',
    hint: 'Please check that you copied the entire key from Google AI Studio.',
  },
  KEY_UNAUTHORIZED: {
    message: 'This API key is not authorized.',
    hint: 'Please verify your key is active in Google AI Studio.',
  },
  KEY_FORBIDDEN: {
    message: "This API key doesn't have permission to access Gemini.",
    hint: 'Check your Google Cloud project settings and API access.',
  },
  RATE_LIMITED: {
    message: "You've reached your Gemini usage limit.",
    hint: 'Please wait a few minutes or check your Google account quota.',
  },
  SERVICE_UNAVAILABLE: {
    message: 'Gemini is temporarily unavailable.',
    hint: 'Please try again in a few minutes.',
  },
  NETWORK_ERROR: {
    message: 'Unable to connect to Gemini.',
    hint: 'Please check your internet connection and try again.',
  },
};
