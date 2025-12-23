/**
 * Face API Service
 * Client-side integration with backend face detection APIs
 */

import { apiClient, ApiResponse } from './api';

// Types
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ThumbnailUrls {
    small?: string;
    medium?: string;
    large?: string;
}

export interface Face {
    id: string;
    photo_id: string;
    workspace_id: string;
    bounding_box: BoundingBox;
    confidence: number;
    thumbnail_urls?: ThumbnailUrls;
    face_group_id?: string;
    created_at: string;
}

export interface FaceGroup {
    id: string;
    workspace_id: string;
    name?: string;
    person_id?: string;
    face_count: number;
    representative_face_id?: string;
    representative_thumbnail_url?: string;
    created_at: string;
    updated_at: string;
}

export interface FaceGroupWithFaces extends FaceGroup {
    faces: Face[];
}

export interface DetectionStatus {
    job_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    faces_detected: number;
    started_at?: string;
    completed_at?: string;
    error_message?: string;
}

export interface SimilarFace {
    face_id: string;
    photo_id: string;
    similarity: number;
    thumbnail_url?: string;
}

export interface WorkspaceDetectionStats {
    total_photos: number;
    photos_processed: number;
    photos_pending: number;
    total_faces: number;
    total_groups: number;
}

// Helper to extract data from API response
function extractData<T>(response: ApiResponse<T>): T {
    if (response.error) {
        throw new Error(response.error.message || 'API request failed');
    }
    if (!response.data) {
        throw new Error('No data in response');
    }
    return response.data;
}

class FaceApiService {
    private baseUrl = '/api/v1';

    // =========================================================================
    // FACE GROUPS
    // =========================================================================

    /**
     * Get all face groups (people) in a workspace
     */
    async getFaceGroups(
        workspaceId: string,
        options?: {
            hasName?: boolean;
            minFaces?: number;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ groups: FaceGroup[]; total: number }> {
        const params = new URLSearchParams();
        if (options?.hasName !== undefined) params.set('has_name', String(options.hasName));
        if (options?.minFaces) params.set('min_faces', String(options.minFaces));
        if (options?.limit) params.set('limit', String(options.limit));
        // Backend uses page-based pagination, not offset
        const page = options?.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : 1;
        params.set('page', String(page));

        const response = await apiClient.get<{ data: FaceGroup[]; meta: { total: number } }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups?${params}`
        );
        const result = extractData(response);

        // Map backend format (data/meta) to frontend format (groups/total)
        return {
            groups: result.data || [],
            total: result.meta?.total || 0,
        };
    }

    /**
     * Get a specific face group with its faces
     */
    async getFaceGroup(workspaceId: string, groupId: string): Promise<FaceGroupWithFaces> {
        const response = await apiClient.get<FaceGroupWithFaces>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}`
        );
        return extractData(response);
    }

    /**
     * Create a new face group
     */
    async createFaceGroup(
        workspaceId: string,
        data: { name?: string; person_id?: string }
    ): Promise<FaceGroup> {
        const response = await apiClient.post<FaceGroup>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups`,
            data
        );
        return extractData(response);
    }

    /**
     * Update a face group (e.g., set name)
     */
    async updateFaceGroup(
        workspaceId: string,
        groupId: string,
        data: { name?: string; person_id?: string }
    ): Promise<FaceGroup> {
        const response = await apiClient.patch<FaceGroup>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}`,
            data
        );
        return extractData(response);
    }

    /**
     * Delete a face group
     */
    async deleteFaceGroup(workspaceId: string, groupId: string): Promise<void> {
        const response = await apiClient.delete(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}`
        );
        if (response.error) {
            throw new Error(response.error.message || 'Failed to delete face group');
        }
    }

    /**
     * Merge two face groups
     */
    async mergeFaceGroups(
        workspaceId: string,
        sourceGroupId: string,
        targetGroupId: string
    ): Promise<FaceGroup> {
        const response = await apiClient.post<FaceGroup>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${sourceGroupId}/merge`,
            { target_group_id: targetGroupId }
        );
        return extractData(response);
    }

    /**
     * Split faces from a group to a new group
     */
    async splitFaceGroup(
        workspaceId: string,
        groupId: string,
        faceIds: string[],
        newGroupName?: string
    ): Promise<FaceGroup> {
        const response = await apiClient.post<FaceGroup>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/split`,
            { face_ids: faceIds, new_group_name: newGroupName }
        );
        return extractData(response);
    }

    // =========================================================================
    // FACES
    // =========================================================================

    /**
     * Get faces in a gallery
     */
    async getGalleryFaces(
        workspaceId: string,
        galleryId: string,
        options?: { groupId?: string; limit?: number; offset?: number }
    ): Promise<{ faces: Face[]; total: number }> {
        const params = new URLSearchParams();
        if (options?.groupId) params.set('group_id', options.groupId);
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.offset) params.set('offset', String(options.offset));

        const response = await apiClient.get<{ faces: Face[]; total: number }>(
            `${this.baseUrl}/workspaces/${workspaceId}/galleries/${galleryId}/faces?${params}`
        );
        return extractData(response);
    }

    /**
     * Get faces in a photo
     */
    async getPhotoFaces(workspaceId: string, photoId: string): Promise<Face[]> {
        const response = await apiClient.get<{ faces: Face[] }>(
            `${this.baseUrl}/workspaces/${workspaceId}/photos/${photoId}/faces`
        );
        return extractData(response).faces;
    }

    /**
     * Assign a face to a person/group
     */
    async assignFaceToGroup(
        workspaceId: string,
        faceId: string,
        groupId: string
    ): Promise<void> {
        const response = await apiClient.post(
            `${this.baseUrl}/workspaces/${workspaceId}/faces/${faceId}/assign`,
            { group_id: groupId }
        );
        if (response.error) {
            throw new Error(response.error.message || 'Failed to assign face');
        }
    }

    /**
     * Bulk assign faces to a group
     */
    async bulkAssignFaces(
        workspaceId: string,
        faceIds: string[],
        groupId: string
    ): Promise<void> {
        const response = await apiClient.post(
            `${this.baseUrl}/workspaces/${workspaceId}/faces/bulk-assign`,
            { face_ids: faceIds, group_id: groupId }
        );
        if (response.error) {
            throw new Error(response.error.message || 'Failed to assign faces');
        }
    }

    /**
     * Find similar faces
     */
    async findSimilarFaces(
        workspaceId: string,
        faceId: string,
        options?: { threshold?: number; limit?: number }
    ): Promise<SimilarFace[]> {
        const params = new URLSearchParams();
        if (options?.threshold) params.set('threshold', String(options.threshold));
        if (options?.limit) params.set('limit', String(options.limit));

        const response = await apiClient.get<{ similar_faces: SimilarFace[] }>(
            `${this.baseUrl}/workspaces/${workspaceId}/faces/${faceId}/similar?${params}`
        );
        return extractData(response).similar_faces;
    }

    // =========================================================================
    // DETECTION
    // =========================================================================

    /**
     * Trigger face detection on a photo
     */
    async triggerDetection(
        workspaceId: string,
        photoId: string
    ): Promise<{ job_id: string }> {
        const response = await apiClient.post<{ job_id: string }>(
            `${this.baseUrl}/workspaces/${workspaceId}/photos/${photoId}/detect-faces`
        );
        return extractData(response);
    }

    /**
     * Get detection status for a photo
     */
    async getDetectionStatus(
        workspaceId: string,
        photoId: string
    ): Promise<DetectionStatus | null> {
        try {
            const response = await apiClient.get<DetectionStatus>(
                `${this.baseUrl}/workspaces/${workspaceId}/photos/${photoId}/detection-status`
            );
            return response.data || null;
        } catch {
            return null;
        }
    }

    /**
     * Get workspace-wide detection stats
     */
    async getWorkspaceStats(workspaceId: string): Promise<WorkspaceDetectionStats> {
        const response = await apiClient.get<WorkspaceDetectionStats>(
            `${this.baseUrl}/workspaces/${workspaceId}/faces/stats`
        );
        return extractData(response);
    }

    // =========================================================================
    // PHOTOS BY PERSON
    // =========================================================================

    /**
     * Get all photos containing a specific person/group
     */
    async getPhotosByPerson(
        workspaceId: string,
        groupId: string,
        galleryId?: string
    ): Promise<string[]> {
        const params = new URLSearchParams();
        if (galleryId) params.set('gallery_id', galleryId);

        const response = await apiClient.get<{ photo_ids: string[] }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/photos?${params}`
        );
        return extractData(response).photo_ids;
    }
}

export const faceApiService = new FaceApiService();
