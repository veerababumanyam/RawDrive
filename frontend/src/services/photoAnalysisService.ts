// Photo Analysis Service
// Feature: AI-powered photo analysis

import { apiClient } from './api';
import type {
  PhotoAnalysisResult,
  AnalyzePhotoRequest,
} from '../types/aiFeatures';

const API_BASE = '/smart-tagging';

export class PhotoAnalysisService {
  /**
   * Analyze a photo with AI
   */
  static async analyzePhoto(
    workspaceId: string,
    assetId: string,
    request: AnalyzePhotoRequest
  ): Promise<PhotoAnalysisResult> {
    const response = await apiClient.post<PhotoAnalysisResult>(
      `/workspaces/${workspaceId}${API_BASE}/assets/${assetId}/analyze`,
      request
    );
    return response.data;
  }
}

export const getPhotoAnalysisService = () => PhotoAnalysisService;