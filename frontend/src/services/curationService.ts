// Curation Service
// Feature: AI-powered photo curation

import { apiClient } from './api';
import type {
  CurationResult,
  SmartCurationRequest,
  JobResponse,
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
  ): Promise<JobResponse> {
    const response = await apiClient.post<JobResponse>(
      `/workspaces/${workspaceId}${API_BASE}/galleries/${galleryId}/curate`,
      request || {}
    );
    return response.data;
  }

  /**
   * Get curation job status
   */
  static async getCurationJobStatus(
    workspaceId: string,
    jobId: string
  ): Promise<JobResponse & { result?: CurationResult }> {
    const response = await apiClient.get<JobResponse & { result?: CurationResult }>(
      `/workspaces/${workspaceId}${API_BASE}/jobs/${jobId}`
    );
    return response.data;
  }
}

export const getCurationService = () => CurationService;