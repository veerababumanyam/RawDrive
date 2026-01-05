// Hashtag Service
// Feature: AI-powered hashtag generation

import { apiClient } from './api';
import type {
  HashtagResult,
  GenerateHashtagsRequest,
} from '../types/aiFeatures';

const API_BASE = '/api/v1';

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
      `${API_BASE}/workspaces/${workspaceId}/smart-tagging/assets/${assetId}/hashtags`,
      request
    );
    if (!response.data) {
      throw new Error('No data returned from hashtag generation');
    }
    return response.data;
  }
}

export const getHashtagService = () => HashtagService;