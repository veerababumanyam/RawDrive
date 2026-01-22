/**
 * Gallery Design Service
 *
 * API client for Gallery Design Studio features:
 * - Asset picker (select from gallery)
 * - Design configuration management
 * - AI recommendations
 */

import { apiClient } from './api';

const BASE_PATH = '/api/v1/galleries';

interface Asset {
  asset_id: string;
  gallery_asset_id: string;
  visible: boolean;
  is_private: boolean;
  asset: {
    filename: string;
    type: string;
    width?: number;
    height?: number;
    thumbnail_url?: string;
    preview_url?: string;
    date_taken?: string;
  };
}

interface AssetListResponse {
  data: Asset[];
  meta: {
    page: number;
    limit: number;
    total: number;
    has_next: boolean;
  };
}

/**
 * Gallery Design API service.
 */
export const galleryDesignService = {
  /**
   * Get gallery assets for the asset picker.
   * Used to select existing photos as cover images.
   */
  async getGalleryAssets(
    galleryId: string,
    page: number = 1,
    limit: number = 24
  ): Promise<AssetListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const response = await apiClient.get<AssetListResponse>(
      `${BASE_PATH}/${galleryId}/assets?${params}`
    );

    if (!response.data) {
      throw new Error('Failed to get gallery assets');
    }

    return response.data;
  },

  /**
   * Get design configuration for a gallery.
   */
  async getDesignConfig(galleryId: string): Promise<any> {
    const response = await apiClient.get(
      `${BASE_PATH}/${galleryId}/design`
    );

    if (!response.data) {
      throw new Error('Failed to get design configuration');
    }

    return response.data;
  },

  /**
   * Update design configuration for a gallery.
   */
  async updateDesignConfig(galleryId: string, designConfig: any): Promise<any> {
    const response = await apiClient.patch(
      `${BASE_PATH}/${galleryId}/design`,
      { design_config: designConfig }
    );

    if (!response.data) {
      throw new Error('Failed to update design configuration');
    }

    return response.data;
  },

  /**
   * Publish design changes to make them live.
   */
  async publishDesign(galleryId: string): Promise<any> {
    const response = await apiClient.post(
      `${BASE_PATH}/${galleryId}/design/publish`,
      {}
    );

    if (!response.data) {
      throw new Error('Failed to publish design');
    }

    return response.data;
  },

  /**
   * List design templates with optional filtering.
   */
  async listTemplates(options?: {
    category?: string;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
    include_system?: boolean;
  }): Promise<any> {
    const params = new URLSearchParams();

    if (options?.category) {
      params.append('category', options.category);
    }
    if (options?.search) {
      params.append('search', options.search);
    }
    if (options?.tags?.length) {
      options.tags.forEach(tag => params.append('tags', tag));
    }
    if (options?.page) {
      params.append('page', String(options.page));
    }
    if (options?.limit) {
      params.append('limit', String(options.limit));
    }
    if (options?.include_system !== undefined) {
      params.append('include_system', String(options.include_system));
    }

    const response = await apiClient.get(
      `/api/v1/gallery-design-templates?${params}`
    );

    if (!response.data) {
      throw new Error('Failed to list templates');
    }

    return response.data;
  },

  /**
   * Get a specific template by ID.
   */
  async getTemplate(templateId: string): Promise<any> {
    const response = await apiClient.get(
      `/api/v1/gallery-design-templates/${templateId}`
    );

    if (!response.data) {
      throw new Error('Failed to get template');
    }

    return response.data;
  },

  /**
   * Create a new custom template.
   */
  async createTemplate(template: {
    name: string;
    design_config: any;
    category: string;
    description?: string;
    tags?: string[];
  }): Promise<any> {
    const response = await apiClient.post(
      '/api/v1/gallery-design-templates',
      template
    );

    if (!response.data) {
      throw new Error('Failed to create template');
    }

    return response.data;
  },

  /**
   * Apply a template by merging with current design config.
   */
  async applyTemplate(
    templateId: string,
    currentConfig: any,
    preserveCoverAsset: boolean = true
  ): Promise<any> {
    const response = await apiClient.post(
      `/api/v1/gallery-design-templates/${templateId}/apply`,
      {
        current_config: currentConfig,
        preserve_cover_asset: preserveCoverAsset,
      }
    );

    if (!response.data) {
      throw new Error('Failed to apply template');
    }

    return response.data;
  },

  /**
   * Delete a template.
   */
  async deleteTemplate(templateId: string, hardDelete: boolean = false): Promise<void> {
    await apiClient.delete(
      `/api/v1/gallery-design-templates/${templateId}${hardDelete ? '?hard_delete=true' : ''}`
    );
  },

  /**
   * Get AI-powered design recommendations for a gallery.
   * Analyzes gallery photos to recommend cover styles, themes, and fonts.
   */
  async getAIRecommendations(galleryId: string, useCache: boolean = true): Promise<any> {
    const params = new URLSearchParams({
      use_cache: String(useCache),
    });

    const response = await apiClient.post(
      `/api/v1/galleries/${galleryId}/design/recommendations?${params}`,
      {}
    );

    if (!response.data) {
      throw new Error('Failed to get AI recommendations');
    }

    return response.data;
  },
};

export default galleryDesignService;
