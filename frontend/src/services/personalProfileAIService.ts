/**
 * Personal Profile AI Service
 *
 * API service for AI-powered personal profile content generation.
 */

import api from './api';

// Request types
export interface GenerateBioRequest {
  profile_title?: string;
  categories?: string[];
  style?: 'professional' | 'casual' | 'creative';
  language?: string;
  current_bio?: string;
  additional_context?: string;
}

export interface GenerateTaglineRequest {
  display_name?: string;
  profile_title?: string;
  categories?: string[];
  style?: 'professional' | 'casual' | 'creative';
  language?: string;
}

export interface AnalyzeCompletenessRequest {
  profile_data: Record<string, unknown>;
}

export interface OptimizeSEORequest {
  profile_data: Record<string, unknown>;
}

export interface SuggestCategoriesRequest {
  bio?: string;
  profile_title?: string;
  gallery_names?: string[];
}

// Response types
export interface GenerateBioResponse {
  bio: string;
}

export interface GenerateTaglineResponse {
  tagline: string;
}

export interface AnalyzeCompletenessResponse {
  score: number;
  missing_fields: string[];
  suggestions: string[];
}

export interface OptimizeSEOResponse {
  meta_title: string;
  meta_description: string;
  keywords: string[];
}

export interface SuggestCategoriesResponse {
  categories: string[];
}

// Error response type
export interface AIErrorResponse {
  code: string;
  message: string;
  hint?: string;
}

/**
 * Personal Profile AI Service
 */
class PersonalProfileAIService {
  private getBasePath(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/personal-profiles`;
  }

  /**
   * Generate or improve a professional bio
   */
  async generateBio(
    workspaceId: string,
    request: GenerateBioRequest
  ): Promise<GenerateBioResponse> {
    const response = await api.post<GenerateBioResponse>(
      `${this.getBasePath(workspaceId)}/ai/generate-bio`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to generate bio');
    }
    if (!response.data) {
      throw new Error('No data returned from AI service');
    }
    return response.data;
  }

  /**
   * Generate a catchy tagline
   */
  async generateTagline(
    workspaceId: string,
    request: GenerateTaglineRequest
  ): Promise<GenerateTaglineResponse> {
    const response = await api.post<GenerateTaglineResponse>(
      `${this.getBasePath(workspaceId)}/ai/generate-tagline`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to generate tagline');
    }
    if (!response.data) {
      throw new Error('No data returned from AI service');
    }
    return response.data;
  }

  /**
   * Analyze profile completeness and get suggestions
   */
  async analyzeCompleteness(
    workspaceId: string,
    request: AnalyzeCompletenessRequest
  ): Promise<AnalyzeCompletenessResponse> {
    const response = await api.post<AnalyzeCompletenessResponse>(
      `${this.getBasePath(workspaceId)}/ai/analyze-completeness`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to analyze completeness');
    }
    if (!response.data) {
      throw new Error('No data returned from AI service');
    }
    return response.data;
  }

  /**
   * Optimize SEO metadata
   */
  async optimizeSEO(
    workspaceId: string,
    request: OptimizeSEORequest
  ): Promise<OptimizeSEOResponse> {
    const response = await api.post<OptimizeSEOResponse>(
      `${this.getBasePath(workspaceId)}/ai/optimize-seo`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to optimize SEO');
    }
    if (!response.data) {
      throw new Error('No data returned from AI service');
    }
    return response.data;
  }

  /**
   * Get category suggestions
   */
  async suggestCategories(
    workspaceId: string,
    request: SuggestCategoriesRequest
  ): Promise<SuggestCategoriesResponse> {
    const response = await api.post<SuggestCategoriesResponse>(
      `${this.getBasePath(workspaceId)}/ai/suggest-categories`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to suggest categories');
    }
    if (!response.data) {
      throw new Error('No data returned from AI service');
    }
    return response.data;
  }
}

export const personalProfileAIService = new PersonalProfileAIService();
export default personalProfileAIService;
