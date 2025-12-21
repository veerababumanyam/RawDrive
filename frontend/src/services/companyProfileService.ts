import apiClient from './api';
import {
    CompanyProfile,
    CreateCompanyProfileRequest,
    UpdateCompanyProfileRequest,
    PublicCompanyProfile
} from '../types/companyProfile';
import { WORKSPACE_PATHS, PUBLIC_PATHS } from '../constants/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface LogoCropData {
    crop_x: number;
    crop_y: number;
    crop_scale: number;
}

class CompanyProfileService {
    async getProfile(workspaceId: string): Promise<CompanyProfile> {
        const response = await apiClient.get<CompanyProfile>(WORKSPACE_PATHS.companyProfile(workspaceId));
        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to fetch company profile');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    async createProfile(workspaceId: string, data: CreateCompanyProfileRequest): Promise<CompanyProfile> {
        const response = await apiClient.post<CompanyProfile>(WORKSPACE_PATHS.companyProfile(workspaceId), data);
        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to create company profile');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    async updateProfile(workspaceId: string, data: UpdateCompanyProfileRequest): Promise<CompanyProfile> {
        const response = await apiClient.patch<CompanyProfile>(WORKSPACE_PATHS.companyProfile(workspaceId), data);
        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to update company profile');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    async getPublicProfile(slug: string): Promise<PublicCompanyProfile> {
        const response = await apiClient.get<PublicCompanyProfile>(PUBLIC_PATHS.profiles(slug));
        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to fetch public profile');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    async checkSlugAvailability(workspaceId: string, slug: string): Promise<{ available: boolean; slug: string }> {
        const response = await apiClient.get<{ available: boolean; slug: string }>(
            `${WORKSPACE_PATHS.companyProfile(workspaceId)}/check-slug?slug=${encodeURIComponent(slug)}`
        );
        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to check slug availability');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    async uploadLogo(
        workspaceId: string,
        file: File,
        cropData?: LogoCropData
    ): Promise<{ logo_url: string; logo_id: string }> {
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
        const url = `${WORKSPACE_PATHS.companyProfile(workspaceId)}/logo${queryString ? `?${queryString}` : ''}`;

        const response = await apiClient.request<{ logo_url: string; logo_id: string }>(
            url,
            {
                method: 'POST',
                body: formData,
                headers: {}, // Let browser set Content-Type for FormData
            }
        );

        if (response.error) {
            const error: any = new Error(response.error.message || 'Failed to upload logo');
            error.response = { status: response.error.status };
            throw error;
        }
        return response.data!;
    }

    /**
     * Upload logo with cropped blob directly (for use with AvatarCropModal)
     */
    async uploadCroppedLogo(
        workspaceId: string,
        croppedBlob: Blob,
        cropData: LogoCropData
    ): Promise<{ logo_url: string; logo_id: string }> {
        const file = new File([croppedBlob], 'logo.webp', { type: 'image/webp' });
        return this.uploadLogo(workspaceId, file, cropData);
    }

    /**
     * Fetch logo image as blob URL (with authentication)
     * Adds cache-busting parameter to ensure fresh images after updates
     */
    async getLogoBlobUrl(
        workspaceId: string,
        size: number = 256
    ): Promise<string | null> {
        try {
            const cacheBuster = Date.now();
            const response = await apiClient.fetchRaw(
                `${WORKSPACE_PATHS.companyProfile(workspaceId)}/logo/${size}?_t=${cacheBuster}`
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

    getVCardUrl(slug: string): string {
        return `${API_BASE_URL}${PUBLIC_PATHS.vcard(slug)}`;
    }

    getQrCodeUrl(slug: string): string {
        return `${API_BASE_URL}${PUBLIC_PATHS.qrCode(slug)}`;
    }

    /**
     * Get public logo URL by slug (no authentication required)
     */
    getPublicLogoUrl(slug: string, size: number = 256): string {
        return `${API_BASE_URL}${PUBLIC_PATHS.logo(slug, size)}`;
    }
}

export const companyProfileService = new CompanyProfileService();
