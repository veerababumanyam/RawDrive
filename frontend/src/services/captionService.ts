// Caption Service
// Feature: AI-powered caption generation

import { apiClient } from './api';
import type {
  CaptionResult,
  GenerateCaptionsRequest,
} from '../types/aiFeatures';

const API_BASE = '/api/v1';

export class CaptionService {
  /**
   * Generate captions for a photo
   */
  static async generateCaptions(
    workspaceId: string,
    assetId: string,
    request: GenerateCaptionsRequest
  ): Promise<CaptionResult> {
    const response = await apiClient.post<CaptionResult>(
      `${API_BASE}/workspaces/${workspaceId}/smart-tagging/assets/${assetId}/captions`,
      request
    );
    if (!response.data) {
      throw new Error('No data returned from caption generation');
    }
    return response.data;
  }
}

export const getCaptionService = () => CaptionService;