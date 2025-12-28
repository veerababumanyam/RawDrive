// AI Features Types
// Feature: AI-powered photo features

export interface PhotoAnalysisResult {
  description: string;
  tags: string[];
  hashtags: string[];
  quality_score: number;
  sharpness: number;
  exposure: number;
  composition: number;
  dominant_colors: string[];
  lighting: 'natural' | 'artificial' | 'mixed' | 'studio' | 'dramatic';
  mood: string;
  improvements: string[];
  best_for: string[];
}

export interface CaptionResult {
  captions: string[];
  style: string;
}

export interface HashtagResult {
  hashtags: string[];
  categories: {
    trending: string[];
    niche: string[];
    general: string[];
    branded: string[];
  };
}

export interface StoryResult {
  story: string;
  length: 'short' | 'medium' | 'long';
  tone: 'professional' | 'casual' | 'poetic' | 'journalistic';
}

export interface CurationResult {
  asset_ids: string[];
  criteria: {
    quality_threshold: number;
    diversity_weight: number;
  };
  total_assets: number;
  selected_count: number;
}

// API Request Types
export interface AnalyzePhotoRequest {
  photo_url: string;
}

export interface GenerateCaptionsRequest {
  style: 'professional' | 'casual' | 'poetic';
  count: number;
}

export interface GenerateHashtagsRequest {
  count: number;
}

export interface GenerateStoryRequest {
  length: 'short' | 'medium' | 'long';
  tone: 'professional' | 'casual' | 'poetic' | 'journalistic';
}

export interface SmartCurationRequest {
  criteria?: {
    quality_threshold?: number;
    diversity_weight?: number;
  };
}

// Job Response for async operations
export interface JobResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
}