// Photo Analysis Service
// Feature: AI-powered photo analysis

import { apiClient } from './api';
import type {
  PhotoAnalysisResult,
  AnalyzePhotoRequest,
} from '../types/aiFeatures';

const API_BASE = '/api/v1';

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
      `${API_BASE}/workspaces/${workspaceId}/smart-tagging/assets/${assetId}/analyze`,
      request
    );
    if (!response.data) {
      throw new Error('No data returned from analysis');
    }
    return response.data;
  }
}

export const getPhotoAnalysisService = () => PhotoAnalysisService;