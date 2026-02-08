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
    person_name?: string;
    face_count: number;
    representative_face_id?: string;
    representative_thumbnail_url?: string;
    created_at: string;
    updated_at: string;
}

// Face group with gallery-specific statistics
export interface FaceGroupWithGalleryStats extends FaceGroup {
    gallery_photo_count: number;  // Number of photos in this gallery containing this person
    gallery_face_count: number;   // Number of face instances in this gallery
}

// Summary version for merge suggestions (lightweight)
export interface FaceGroupSummary {
    id: string;
    name?: string;
    person_name?: string;
    face_count: number;
    representative_thumbnail_url?: string;
}

// Merge suggestion pair
export interface MergeSuggestion {
    group1: FaceGroupSummary;
    group2: FaceGroupSummary;
    similarity: number;
}

// Multi-merge result
export interface MergeResult {
    merged_group: FaceGroup;
    source_group_ids: string[];
    faces_merged: number;
}

// Similar group with similarity score
export interface SimilarGroup {
    group: FaceGroupSummary;
    similarity: number;
}

// Face response for primary face selection
export interface FaceInGroup {
    id: string;
    photo_id: string;
    bounding_box?: BoundingBox;
    confidence?: number;
    thumbnail_url?: string;
    created_at: string;
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

// Error with status for UI (e.g. toast with 403/422 hint)
export class FaceApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly code?: string
    ) {
        super(message);
        this.name = 'FaceApiError';
    }
}

// Helper to extract data from API response
function extractData<T>(response: ApiResponse<T>): T {
    if (response.error) {
        const err = response.error as { message?: string; status?: number; code?: string };
        throw new FaceApiError(err.message || 'API request failed', err.status, err.code);
    }
    if (!response.data) {
        throw new FaceApiError('No data in response');
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
     * Get face groups for a specific gallery (gallery-scoped)
     * Only returns people who appear in photos within this gallery
     */
    async getGalleryFaceGroups(
        workspaceId: string,
        galleryId: string,
        options?: {
            search?: string;
            limit?: number;
            page?: number;
        }
    ): Promise<{ groups: FaceGroupWithGalleryStats[]; total: number }> {
        const params = new URLSearchParams();
        if (options?.search) params.set('search', options.search);
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.page) params.set('page', String(options.page));

        const response = await apiClient.get<{ data: FaceGroupWithGalleryStats[]; meta: { total: number } }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/gallery/${galleryId}?${params}`,
            { headers: { 'X-Workspace-ID': workspaceId } }
        );
        const result = extractData(response);

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
     * Name a person (assign or create person for a face group)
     * This links the face group to a person entity with a display name
     */
    async namePerson(
        workspaceId: string,
        groupId: string,
        personName: string,
        personId?: string
    ): Promise<{ person_id: string; person_name: string }> {
        const response = await apiClient.put<{ person_id: string; person_name: string }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/name`,
            { person_name: personName, person_id: personId }
        );
        return extractData(response);
    }

    /**
     * Unassign person from a face group
     */
    async unassignPerson(workspaceId: string, groupId: string): Promise<void> {
        const response = await apiClient.delete(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/person`
        );
        if (response.error) {
            throw new Error(response.error.message || 'Failed to unassign person');
        }
    }

    /**
     * Delete a face group
     * Note: Backend route is /face-groups/{group_id} (not workspace-scoped)
     */
    async deleteFaceGroup(workspaceId: string, groupId: string): Promise<void> {
        const response = await apiClient.delete(
            `${this.baseUrl}/face-groups/${groupId}`
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
    // MULTI-MERGE & PRIMARY FACE
    // =========================================================================

    /**
     * Merge multiple face groups into a single target group
     *
     * @param workspaceId - Workspace ID
     * @param sourceGroupIds - IDs of groups to merge from (will be deleted)
     * @param targetGroupId - ID of group to merge into (will be preserved)
     * @param options - Optional representative face ID and name for merged group
     */
    async multiMergeFaceGroups(
        workspaceId: string,
        sourceGroupIds: string[],
        targetGroupId: string,
        options?: {
            representativeFaceId?: string;
            name?: string;
        }
    ): Promise<MergeResult> {
        const response = await apiClient.post<MergeResult>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/multi-merge`,
            {
                source_group_ids: sourceGroupIds,
                target_group_id: targetGroupId,
                representative_face_id: options?.representativeFaceId,
                name: options?.name,
            }
        );
        return extractData(response);
    }

    /**
     * Set the representative (primary) face for a group
     *
     * The representative face is used for:
     * - Display thumbnail in People panel
     * - 2x weight in centroid calculations for better matching
     *
     * @param workspaceId - Workspace ID
     * @param groupId - Face group ID
     * @param faceId - Face ID to set as representative
     * @param recalculateCentroid - Whether to recalculate centroid (default: true)
     */
    async setRepresentativeFace(
        workspaceId: string,
        groupId: string,
        faceId: string,
        recalculateCentroid: boolean = true
    ): Promise<FaceGroup> {
        const response = await apiClient.put<FaceGroup>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/representative`,
            {
                face_id: faceId,
                recalculate_centroid: recalculateCentroid,
            }
        );
        return extractData(response);
    }

    /**
     * Get merge suggestions - pairs of face groups with high similarity
     *
     * Returns groups that likely represent the same person and should be merged.
     *
     * @param workspaceId - Workspace ID
     * @param options - Threshold (0.5-0.99, default 0.75) and limit (1-100, default 50)
     */
    async getMergeSuggestions(
        workspaceId: string,
        options?: {
            threshold?: number;
            limit?: number;
        }
    ): Promise<{ suggestions: MergeSuggestion[]; total: number }> {
        const params = new URLSearchParams();
        if (options?.threshold !== undefined) {
            params.set('threshold', String(options.threshold));
        }
        if (options?.limit !== undefined) {
            params.set('limit', String(options.limit));
        }

        const response = await apiClient.get<{ suggestions: MergeSuggestion[]; total: number }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/suggestions?${params}`
        );
        return extractData(response);
    }

    /**
     * Get face groups similar to a specific group
     *
     * Useful for showing "similar people" suggestions when viewing a group.
     *
     * @param workspaceId - Workspace ID
     * @param groupId - Face group to find similar groups for
     * @param options - Threshold and limit
     */
    async getSimilarGroups(
        workspaceId: string,
        groupId: string,
        options?: {
            threshold?: number;
            limit?: number;
        }
    ): Promise<{ group: FaceGroup; similar_groups: SimilarGroup[] }> {
        const params = new URLSearchParams();
        if (options?.threshold !== undefined) {
            params.set('threshold', String(options.threshold));
        }
        if (options?.limit !== undefined) {
            params.set('limit', String(options.limit));
        }

        const response = await apiClient.get<{ group: FaceGroup; similar_groups: SimilarGroup[] }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/similar?${params}`
        );
        return extractData(response);
    }

    /**
     * Get all faces in a group with thumbnails
     *
     * Used for browsing faces before merge and for selecting primary face.
     *
     * @param workspaceId - Workspace ID
     * @param groupId - Face group ID
     * @param options - Pagination options
     */
    async getFacesInGroup(
        workspaceId: string,
        groupId: string,
        options?: {
            limit?: number;
            offset?: number;
        }
    ): Promise<{
        faces: FaceInGroup[];
        total: number;
        representative_face_id?: string;
    }> {
        const params = new URLSearchParams();
        if (options?.limit !== undefined) {
            params.set('limit', String(options.limit));
        }
        if (options?.offset !== undefined) {
            params.set('offset', String(options.offset));
        }

        const response = await apiClient.get<{
            faces: FaceInGroup[];
            total: number;
            representative_face_id?: string;
        }>(
            `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/faces?${params}`
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
     * Trigger face detection for all photos in a gallery
     * Smart incremental scan - only scans new/unprocessed photos
     */
    async scanGalleryFaces(
        workspaceId: string,
        galleryId: string
    ): Promise<{
        jobs_queued: number;
        already_processed: number;
        pending?: number;
        total_photos?: number;
        message: string;
    }> {
        const response = await apiClient.post<{
            jobs_queued: number;
            already_processed: number;
            pending?: number;
            total_photos?: number;
            message: string;
        }>(`${this.baseUrl}/workspaces/${workspaceId}/galleries/${galleryId}/scan-faces`);
        return extractData(response);
    }

    /**
     * Cluster all ungrouped faces in a workspace
     * This triggers clustering for faces that were detected but not automatically grouped
     */
    async clusterUngroupedFaces(
        workspaceId: string
    ): Promise<{
        assigned_to_existing_groups: number;
        new_groups_created: number;
        message: string;
    }> {
        const response = await apiClient.post<{
            assigned_to_existing_groups: number;
            new_groups_created: number;
            message: string;
        }>(`${this.baseUrl}/workspaces/${workspaceId}/face-groups/cluster-ungrouped`);
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
