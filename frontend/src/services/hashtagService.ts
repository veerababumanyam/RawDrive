// Hashtag Service
// Feature: AI-powered hashtag generation

import { apiClient } from './api';
import type {
  HashtagResult,
  GenerateHashtagsRequest,
} from '../types/aiFeatures';

const API_BASE = '/smart-tagging';

export class HashtagService {
  /**
   * Generate hashtags for a photo
   */
  static async generateHashtags(
    workspaceId: string,
    assetId: string,
    request: GenerateHashtagsRequest
  ): Promise<HashtagResult> {
    const response = await apiClient.post<HashtagResult>(
      `/workspaces/${workspaceId}${API_BASE}/assets/${assetId}/hashtags`,
      request
    );
    return response.data;
  }
}

export const getHashtagService = () => HashtagService;