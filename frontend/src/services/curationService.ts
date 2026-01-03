// Curation Service
// Feature: AI-powered photo curation

import { apiClient } from './api';
import type {
  CurationResult,
  SmartCurationRequest,
} from '../types/aiFeatures';

const API_BASE = '/smart-tagging';

export class CurationService {
  /**
   * Run smart curation on a gallery
   */
  static async curateGallery(
    workspaceId: string,
    galleryId: string,
    request?: SmartCurationRequest
  ): Promise<CurationResult> {
    const response = await apiClient.post<CurationResult>(
      `/workspaces/${workspaceId}${API_BASE}/galleries/${galleryId}/curate`,
      request || {}
    );
    if (!response.data) {
      throw new Error('No data returned from curation request');
    }
    return response.data;
  }
}

export const getCurationService = () => CurationService;