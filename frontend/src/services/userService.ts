/**
 * User Service
 * 
 * Handles user profile operations including language preference updates.
 */

import apiClient from './api';

export interface UserProfile {
    user_id: string;
    email: string;
    display_name: string | null;
    email_verified: boolean;
    preferred_language: string;
    created_at: string;
    workspace_id: string | null;
}

export interface UpdateProfileRequest {
    display_name?: string;
    preferred_language?: string;
}

class UserService {
    /**
     * Get current user profile
     */
    async getProfile(): Promise<UserProfile> {
        const response = await apiClient.get<UserProfile>('/api/v1/users/me');
        if (response.error) {
            throw new Error(response.error.message);
        }
        return response.data!;
    }

    /**
     * Update current user profile
     */
    async updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
        const response = await apiClient.patch<UserProfile>('/api/v1/users/me', data);
        if (response.error) {
            throw new Error(response.error.message);
        }
        return response.data!;
    }
}

export const userService = new UserService();
export default userService;
