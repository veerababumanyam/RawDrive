import apiClient from './api';
import {
    CompanyProfile,
    CreateCompanyProfileRequest,
    UpdateCompanyProfileRequest,
    PublicCompanyProfile
} from '../types/companyProfile';
import { WORKSPACE_PATHS, PUBLIC_PATHS } from '../constants/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

    getVCardUrl(slug: string): string {
        return `${API_BASE_URL}${PUBLIC_PATHS.vcard(slug)}`;
    }

    getQrCodeUrl(slug: string): string {
        return `${API_BASE_URL}${PUBLIC_PATHS.qrCode(slug)}`;
    }
}

export const companyProfileService = new CompanyProfileService();
