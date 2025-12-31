// Story Service
// Feature: AI-powered gallery story generation

import { apiClient } from './api';
import type {
  StoryResult,
  GenerateStoryRequest,
  JobResponse,
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
  ): Promise<JobResponse> {
    const response = await apiClient.post<JobResponse>(
      `/workspaces/${workspaceId}${API_BASE}/galleries/${galleryId}/story`,
      request
    );
    if (!response.data) {
      throw new Error('No data returned from story request');
    }
    return response.data;
  }

  /**
   * Get story generation job status
   */
  static async getStoryJobStatus(
    workspaceId: string,
    jobId: string
  ): Promise<JobResponse & { result?: StoryResult }> {
    const response = await apiClient.get<JobResponse & { result?: StoryResult }>(
      `/workspaces/${workspaceId}${API_BASE}/jobs/${jobId}`
    );
    if (!response.data) {
      throw new Error('No data returned from job status');
    }
    return response.data;
  }
}

export const getStoryService = () => StoryService;