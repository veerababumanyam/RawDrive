/**
 * Review Mode Service
 * API client for Pro Review Mode operations (rating, flag, color_label)
 * Feature: 029-pro-review-xmp-sync
 */

import apiClient from './api';
import type {
  AssetMetadataUpdateRequest,
  AssetMetadataResponse,
  BatchAssetMetadataUpdateRequest,
  BatchAssetMetadataUpdateResponse,
  AssetFilterParams,
  FilteredAssetsResponse,
  ReviewStats,
} from '../types/reviewMode';
import type { HistogramData } from '../components/features/gallery/review/HistogramDisplay';

// Gallery service base URL (routes through Traefik to gallery-service on port 8004)
const GALLERY_SERVICE_BASE = '/api/v1/galleries';

export class ReviewModeService {
  /**
   * Get metadata for a single asset
   */
  async getAssetMetadata(
    workspaceId: string,
    galleryId: string,
    assetId: string
  ): Promise<AssetMetadataResponse> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/assets/${assetId}/metadata`;
    const response = await apiClient.get<AssetMetadataResponse>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get asset metadata');
    }
    return response.data!;
  }

  /**
   * Update metadata for a single asset (rating, flag, color_label)
   */
  async updateAssetMetadata(
    workspaceId: string,
    galleryId: string,
    assetId: string,
    data: AssetMetadataUpdateRequest
  ): Promise<AssetMetadataResponse> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/assets/${assetId}/metadata`;
    const response = await apiClient.patch<AssetMetadataResponse>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update asset metadata');
    }
    return response.data!;
  }

  /**
   * Batch update metadata for multiple assets
   * Maximum 100 assets per request
   */
  async batchUpdateAssetMetadata(
    workspaceId: string,
    galleryId: string,
    request: BatchAssetMetadataUpdateRequest
  ): Promise<BatchAssetMetadataUpdateResponse> {
    if (request.items.length > 100) {
      throw new Error('Maximum 100 assets per batch update');
    }

    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/assets/metadata/batch`;
    const response = await apiClient.patch<BatchAssetMetadataUpdateResponse>(endpoint, request, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to batch update asset metadata');
    }
    return response.data!;
  }

  /**
   * Filter assets by review metadata
   */
  async filterAssets(
    workspaceId: string,
    galleryId: string,
    params: AssetFilterParams
  ): Promise<FilteredAssetsResponse> {
    const queryParams = new URLSearchParams();

    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.rating !== undefined) queryParams.append('rating', params.rating.toString());
    if (params.rating_min !== undefined) queryParams.append('rating_min', params.rating_min.toString());
    if (params.rating_max !== undefined) queryParams.append('rating_max', params.rating_max.toString());
    if (params.flag) queryParams.append('flag', params.flag);
    if (params.color_label) queryParams.append('color_label', params.color_label);
    if (params.color_labels?.length) queryParams.append('color_labels', params.color_labels.join(','));
    if (params.unrated) queryParams.append('unrated', 'true');
    if (params.has_rating) queryParams.append('has_rating', 'true');
    if (params.sub_gallery_id) queryParams.append('sub_gallery_id', params.sub_gallery_id);
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    if (params.sort_direction) queryParams.append('sort_direction', params.sort_direction);

    const query = queryParams.toString();
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/assets/filter${query ? `?${query}` : ''}`;

    const response = await apiClient.get<FilteredAssetsResponse>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to filter assets');
    }
    return response.data!;
  }

  /**
   * Get review statistics for a gallery
   */
  async getReviewStats(
    workspaceId: string,
    galleryId: string,
    subGalleryId?: string
  ): Promise<ReviewStats> {
    const params = new URLSearchParams();
    if (subGalleryId) params.append('sub_gallery_id', subGalleryId);

    const query = params.toString();
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/review/stats${query ? `?${query}` : ''}`;

    const response = await apiClient.get<ReviewStats>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get review stats');
    }
    return response.data!;
  }

  /**
   * Quick action: Set rating for an asset
   */
  async setRating(
    workspaceId: string,
    galleryId: string,
    assetId: string,
    rating: 0 | 1 | 2 | 3 | 4 | 5 | null
  ): Promise<AssetMetadataResponse> {
    return this.updateAssetMetadata(workspaceId, galleryId, assetId, { rating });
  }

  /**
   * Quick action: Set flag for an asset
   */
  async setFlag(
    workspaceId: string,
    galleryId: string,
    assetId: string,
    flag: 'pick' | 'unflagged' | 'reject'
  ): Promise<AssetMetadataResponse> {
    return this.updateAssetMetadata(workspaceId, galleryId, assetId, { flag });
  }

  /**
   * Quick action: Set color label for an asset
   */
  async setColorLabel(
    workspaceId: string,
    galleryId: string,
    assetId: string,
    colorLabel: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple'
  ): Promise<AssetMetadataResponse> {
    return this.updateAssetMetadata(workspaceId, galleryId, assetId, { color_label: colorLabel });
  }

  /**
   * Batch set rating for multiple assets
   */
  async batchSetRating(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    rating: 0 | 1 | 2 | 3 | 4 | 5 | null
  ): Promise<BatchAssetMetadataUpdateResponse> {
    return this.batchUpdateAssetMetadata(workspaceId, galleryId, {
      items: assetIds.map((asset_id) => ({ asset_id, rating })),
    });
  }

  /**
   * Batch set flag for multiple assets
   */
  async batchSetFlag(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    flag: 'pick' | 'unflagged' | 'reject'
  ): Promise<BatchAssetMetadataUpdateResponse> {
    return this.batchUpdateAssetMetadata(workspaceId, galleryId, {
      items: assetIds.map((asset_id) => ({ asset_id, flag })),
    });
  }

  /**
   * Batch set color label for multiple assets
   */
  async batchSetColorLabel(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    colorLabel: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple'
  ): Promise<BatchAssetMetadataUpdateResponse> {
    return this.batchUpdateAssetMetadata(workspaceId, galleryId, {
      items: assetIds.map((asset_id) => ({ asset_id, color_label: colorLabel })),
    });
  }

  /**
   * Get histogram data for an asset (T057)
   * Computes luminance and optional RGB histograms from the image
   */
  async getHistogram(
    workspaceId: string,
    galleryId: string,
    assetId: string
  ): Promise<HistogramData> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/assets/${assetId}/histogram`;
    const response = await apiClient.get<HistogramData>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get histogram');
    }
    return response.data!;
  }

  /**
   * Generate histogram data client-side from an image URL (fallback)
   * Used when backend histogram endpoint is not available
   */
  async generateClientSideHistogram(imageUrl: string): Promise<HistogramData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          // Create canvas and draw image
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to create canvas context'));
            return;
          }

          // Scale down for performance (max 512px)
          const maxSize = 512;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          canvas.width = Math.floor(img.width * scale);
          canvas.height = Math.floor(img.height * scale);

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Get pixel data
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Initialize histogram arrays
          const luminance = new Array(256).fill(0);
          const red = new Array(256).fill(0);
          const green = new Array(256).fill(0);
          const blue = new Array(256).fill(0);

          // Count pixels for each channel
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Calculate luminance using BT.709 coefficients
            const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

            luminance[lum]++;
            red[r]++;
            green[g]++;
            blue[b]++;
          }

          resolve({ luminance, red, green, blue });
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageUrl;
    });
  }
}

// Export singleton instance
export const reviewModeService = new ReviewModeService();
export default reviewModeService;
