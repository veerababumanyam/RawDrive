/**
 * Personal Profile API Service
 *
 * Handles all API interactions for Personal Profile Digital Visiting Cards.
 */

import apiClient from './api';
import {
  PersonalProfile,
  CreatePersonalProfileRequest,
  UpdatePersonalProfileRequest,
  PublicPersonalProfile,
  SlugAvailabilityResponse,
  AvatarUploadResponse,
  ProfileExistsResponse,
  ProfilePrefillData,
  AvatarSize,
} from '../types/personalProfile';
import { WORKSPACE_PATHS, PUBLIC_PATHS } from '../constants/api';

const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : 'http://localhost:8000';
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || 'https://rawdrive.ai';

/**
 * Avatar crop data for upload.
 */
export interface AvatarCropData {
  crop_x: number;
  crop_y: number;
  crop_scale: number;
}

class PersonalProfileService {
  /**
   * Get current user's personal profile.
   */
  async getProfile(workspaceId: string): Promise<PersonalProfile> {
    const response = await apiClient.get<PersonalProfile>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me`
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to fetch personal profile');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Check if current user has a personal profile.
   */
  async checkProfileExists(workspaceId: string): Promise<ProfileExistsResponse> {
    const response = await apiClient.get<ProfileExistsResponse>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me/exists`
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to check profile existence');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Get prefill data for new profile creation.
   */
  async getPrefillData(workspaceId: string): Promise<ProfilePrefillData> {
    const response = await apiClient.get<ProfilePrefillData>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me/prefill`
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to fetch prefill data');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Create a new personal profile.
   */
  async createProfile(
    workspaceId: string,
    data: CreatePersonalProfileRequest
  ): Promise<PersonalProfile> {
    const response = await apiClient.post<PersonalProfile>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/`,
      data
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to create personal profile');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Update current user's personal profile.
   */
  async updateProfile(
    workspaceId: string,
    data: UpdatePersonalProfileRequest
  ): Promise<PersonalProfile> {
    const response = await apiClient.patch<PersonalProfile>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me`,
      data
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to update personal profile');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Get public personal profile by slug.
   */
  async getPublicProfile(slug: string): Promise<PublicPersonalProfile> {
    const response = await apiClient.get<PublicPersonalProfile>(PUBLIC_PATHS.personalProfile(slug));
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to fetch public profile');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Check if a slug is available.
   */
  async checkSlugAvailability(
    workspaceId: string,
    slug: string
  ): Promise<SlugAvailabilityResponse> {
    const response = await apiClient.get<SlugAvailabilityResponse>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/check-slug?slug=${encodeURIComponent(slug)}`
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to check slug availability');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Upload avatar image.
   */
  async uploadAvatar(
    workspaceId: string,
    file: File,
    cropData?: AvatarCropData
  ): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    // Build query params for crop data
    const params = new URLSearchParams();
    if (cropData) {
      params.append('crop_x', cropData.crop_x.toString());
      params.append('crop_y', cropData.crop_y.toString());
      params.append('crop_scale', cropData.crop_scale.toString());
    }

    const queryString = params.toString();
    const url = `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me/avatar${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.request<AvatarUploadResponse>(url, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });

    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to upload avatar');
      error.response = { status: response.error.status };
      throw error;
    }
    return response.data!;
  }

  /**
   * Upload cropped avatar blob directly (for use with AvatarCropModal).
   */
  async uploadCroppedAvatar(
    workspaceId: string,
    croppedBlob: Blob,
    cropData: AvatarCropData
  ): Promise<AvatarUploadResponse> {
    const file = new File([croppedBlob], 'avatar.webp', { type: 'image/webp' });
    return this.uploadAvatar(workspaceId, file, cropData);
  }

  /**
   * Delete avatar image.
   */
  async deleteAvatar(workspaceId: string): Promise<void> {
    const response = await apiClient.delete<void>(
      `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me/avatar`
    );
    if (response.error) {
      const error: any = new Error(response.error.message || 'Failed to delete avatar');
      error.response = { status: response.error.status };
      throw error;
    }
  }

  /**
   * Get avatar blob URL (authenticated).
   */
  async getAvatarBlobUrl(workspaceId: string, size: AvatarSize = 256): Promise<string | null> {
    try {
      const cacheBuster = Date.now();
      const response = await apiClient.fetchRaw(
        `${WORKSPACE_PATHS.personalProfile(workspaceId)}/me/avatar/${size}?_t=${cacheBuster}`
      );

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  /**
   * Get vCard download URL (public).
   */
  getVCardUrl(slug: string): string {
    return `${API_BASE_URL}${PUBLIC_PATHS.personalVcard(slug)}`;
  }

  /**
   * Get QR code image URL (public).
   */
  getQrCodeUrl(slug: string): string {
    return `${API_BASE_URL}${PUBLIC_PATHS.personalQrCode(slug)}`;
  }

  /**
   * Get public avatar URL by slug (no authentication required).
   */
  getPublicAvatarUrl(slug: string, size: AvatarSize = 256): string {
    return `${API_BASE_URL}${PUBLIC_PATHS.personalAvatar(slug, size)}`;
  }

  /**
   * Get the public profile URL for a given slug.
   * Personal profiles use /u/{slug} (different from company /p/{slug}).
   */
  getPublicProfileUrl(slug: string): string {
    const baseUrl = PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/u/${slug}`;
  }

  /**
   * Get the public URL base domain (e.g., "rawdrive.ai").
   */
  getPublicUrlDomain(): string {
    try {
      const url = new URL(PUBLIC_URL);
      return url.host;
    } catch {
      return 'rawdrive.ai';
    }
  }

  /**
   * Get the public URL path prefix (e.g., "rawdrive.ai/u/").
   */
  getPublicUrlPrefix(): string {
    return `${this.getPublicUrlDomain()}/u/`;
  }

  /**
   * Generate a slug from display name.
   */
  generateSlugFromName(displayName: string): string {
    return displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }
}

export const personalProfileService = new PersonalProfileService();
