// Story Service
// Feature: AI-powered gallery story generation

import { apiClient } from './api';
import type {
  StoryResult,
  GenerateStoryRequest,
} from '../types/aiFeatures';

const API_BASE = '/smart-tagging';

export class StoryService {
  /**
   * Generate a story for a gallery
   */
  static async generateStory(
    workspaceId: string,
    galleryId: string,
    request: GenerateStoryRequest
  ): Promise<StoryResult> {
    const response = await apiClient.post<StoryResult>(
      `/workspaces/${workspaceId}${API_BASE}/galleries/${galleryId}/story`,
      request
    );
    if (!response.data) {
      throw new Error('No data returned from story request');
    }
    return response.data;
  }
}

export const getStoryService = () => StoryService;