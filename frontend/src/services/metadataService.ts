/**
 * Tag, Comment, People, and Search Service
 * API calls for managing tags, comments, people tagging, and search functionality
 */

import { apiClient } from './api';

const api = {
    get: async <T>(url: string) => {
        const response = await apiClient.get(url);
        if (response.error) throw response.error;
        return response.data as T;
    },
    post: async <T>(url: string, data?: any) => {
        const response = await apiClient.post(url, data);
        if (response.error) throw response.error;
        return response.data as T;
    },
    patch: async <T>(url: string, data?: any) => {
        const response = await apiClient.patch(url, data);
        if (response.error) throw response.error;
        return response.data as T;
    },
    delete: async <T>(url: string, data?: any) => {
        const response = await apiClient.delete(url, data);
        if (response.error) throw response.error;
        return response.data as T;
    },
    put: async <T>(url: string, data?: any) => {
        // ApiClient doesn't have put, use post or patch? Or add put to ApiClient?
        // Usually PUT is supported. Let's check ApiClient again.
        // It has get, post, patch, delete.
        // I should probably add PUT to ApiClient or use POST. 
        // But for now let's assume I can use request directly or just map to POST if backend supports it.
        // Actually, let's fix ApiClient to support PUT if needed, or use request with method PUT.
        const response = await apiClient.request(url, { method: 'PUT', body: JSON.stringify(data) });
        if (response.error) throw response.error;
        return response.data as T;
    }
};

// ============================================================================
// Types
// ============================================================================

export interface Tag {
    tag_id: string;
    name: string;
    type: string;
    color?: string;
    usage_count?: number;
    created_at: string;
}

export interface AssetTag {
    tag_id: string;
    name: string;
    type: string;
    color?: string;
}

export interface Comment {
    comment_id: string;
    workspace_id: string;
    gallery_id: string;
    asset_id?: string;
    author: {
        user_id?: string;
        name: string;
        email?: string;
    };
    body: string;
    annotations?: object;
    is_internal: boolean;
    status: 'open' | 'resolved';
    resolved_by_user_id?: string;
    resolved_at?: string;
    moderation_state: string;
    created_at: string;
    updated_at?: string;
}

export interface Person {
    person_id: string;
    display_name?: string;
    cover_face_id?: string;
    cover_asset_id?: string;
    status: 'active' | 'hidden' | 'deleted';
    face_count: number;
    created_at: string;
}

export interface FaceDetection {
    face_id: string;
    asset_id: string;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    person_id?: string;
    person_name?: string;
    confidence?: number;
    tagged_by_user_id?: string;
    detected_at: string;
    tagged_at?: string;
}

export interface SearchResults {
    query: string;
    results: {
        galleries?: Array<{
            gallery_id: string;
            title: string;
            description?: string;
            client_name?: string;
            status: string;
            created_at: string;
            match_type: string;
        }>;
        assets?: Array<{
            asset_id: string;
            file_name: string;
            mime_type: string;
            size_bytes: number;
            gallery_id?: string;
            created_at: string;
            match_type: string;
        }>;
        tags?: Array<Tag & { match_type: string }>;
        people?: Array<Person & { match_type: string }>;
        comments?: Array<{
            comment_id: string;
            gallery_id: string;
            asset_id?: string;
            body: string;
            author_name: string;
            created_at: string;
            match_type: string;
        }>;
    };
    total: number;
}

interface ListMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// ============================================================================
// Tag Service
// ============================================================================

export const tagService = {
    /**
     * List all tags in a workspace
     */
    async listTags(
        workspaceId: string,
        options?: { type?: string; search?: string; page?: number; limit?: number }
    ): Promise<{ data: Tag[]; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.type) params.append('type', options.type);
        if (options?.search) params.append('search', options.search);
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        const response = await api.get<{ data: Tag[]; meta: ListMeta }>(
            `/api/v1/workspaces/${workspaceId}/tags?${params.toString()}`
        );
        return response;
    },

    /**
     * Create a new tag
     */
    async createTag(
        workspaceId: string,
        data: { name: string; type?: string; color?: string }
    ): Promise<Tag> {
        return api.post(`/api/v1/workspaces/${workspaceId}/tags`, data);
    },

    /**
     * Update a tag
     */
    async updateTag(
        workspaceId: string,
        tagId: string,
        data: { name?: string; type?: string; color?: string }
    ): Promise<Tag> {
        return api.patch(`/api/v1/workspaces/${workspaceId}/tags/${tagId}`, data);
    },

    /**
     * Delete a tag
     */
    async deleteTag(workspaceId: string, tagId: string): Promise<void> {
        await api.delete(`/api/v1/workspaces/${workspaceId}/tags/${tagId}`);
    },

    /**
     * Get tags for an asset
     */
    async getAssetTags(workspaceId: string, assetId: string): Promise<AssetTag[]> {
        return api.get(`/api/v1/workspaces/${workspaceId}/tags/assets/${assetId}`);
    },

    /**
     * Add a tag to an asset
     */
    async addTagToAsset(workspaceId: string, assetId: string, tagId: string): Promise<void> {
        await api.post(`/api/v1/workspaces/${workspaceId}/tags/assets/${assetId}`, { tag_id: tagId });
    },

    /**
     * Create and add a new tag to an asset
     */
    async createAndAddTag(
        workspaceId: string,
        assetId: string,
        data: { name: string; type?: string; color?: string }
    ): Promise<AssetTag> {
        return api.post(`/api/v1/workspaces/${workspaceId}/tags/assets/${assetId}/create`, data);
    },

    /**
     * Remove a tag from an asset
     */
    async removeTagFromAsset(workspaceId: string, assetId: string, tagId: string): Promise<void> {
        await api.delete(`/api/v1/workspaces/${workspaceId}/tags/assets/${assetId}/${tagId}`);
    },

    /**
     * Set all tags on an asset
     */
    async setAssetTags(workspaceId: string, assetId: string, tagIds: string[]): Promise<AssetTag[]> {
        return api.put(`/api/v1/workspaces/${workspaceId}/tags/assets/${assetId}`, { tag_ids: tagIds });
    },
};

// ============================================================================
// Comment Service
// ============================================================================

export const commentService = {
    /**
     * List comments
     */
    async listComments(
        workspaceId: string,
        options?: {
            galleryId?: string;
            assetId?: string;
            status?: string;
            includeInternal?: boolean;
            page?: number;
            limit?: number;
        }
    ): Promise<{ data: Comment[]; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.galleryId) params.append('gallery_id', options.galleryId);
        if (options?.assetId) params.append('asset_id', options.assetId);
        if (options?.status) params.append('status', options.status);
        if (options?.includeInternal !== undefined)
            params.append('include_internal', options.includeInternal.toString());
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/comments?${params.toString()}`);
    },

    /**
     * Create a comment
     */
    async createComment(
        workspaceId: string,
        data: {
            gallery_id: string;
            body: string;
            asset_id?: string;
            annotations?: object;
            is_internal?: boolean;
        }
    ): Promise<Comment> {
        return api.post(`/api/v1/workspaces/${workspaceId}/comments`, data);
    },

    /**
     * Update a comment
     */
    async updateComment(
        workspaceId: string,
        commentId: string,
        data: { body?: string; annotations?: object }
    ): Promise<Comment> {
        return api.patch(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`, data);
    },

    /**
     * Delete a comment
     */
    async deleteComment(workspaceId: string, commentId: string): Promise<void> {
        await api.delete(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`);
    },

    /**
     * Resolve/reopen a comment
     */
    async resolveComment(
        workspaceId: string,
        commentId: string,
        resolved: boolean
    ): Promise<Comment> {
        return api.post(`/api/v1/workspaces/${workspaceId}/comments/${commentId}/resolve`, {
            resolved,
        });
    },

    /**
     * Get comments for an asset
     */
    async getAssetComments(
        workspaceId: string,
        assetId: string,
        options?: { includeInternal?: boolean; page?: number; limit?: number }
    ): Promise<{ data: Comment[]; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.includeInternal !== undefined)
            params.append('include_internal', options.includeInternal.toString());
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/comments/assets/${assetId}?${params.toString()}`);
    },

    /**
     * Get comments for a gallery
     */
    async getGalleryComments(
        workspaceId: string,
        galleryId: string,
        options?: { includeInternal?: boolean; page?: number; limit?: number }
    ): Promise<{ data: Comment[]; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.includeInternal !== undefined)
            params.append('include_internal', options.includeInternal.toString());
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(
            `/api/v1/workspaces/${workspaceId}/comments/galleries/${galleryId}?${params.toString()}`
        );
    },
};

// ============================================================================
// People Service
// ============================================================================

export const peopleService = {
    /**
     * List people in a workspace
     */
    async listPeople(
        workspaceId: string,
        options?: { search?: string; status?: string; page?: number; limit?: number }
    ): Promise<{ data: Person[]; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.search) params.append('search', options.search);
        if (options?.status) params.append('status', options.status);
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/people?${params.toString()}`);
    },

    /**
     * Create a person
     */
    async createPerson(workspaceId: string, displayName?: string): Promise<Person> {
        return api.post(`/api/v1/workspaces/${workspaceId}/people`, { display_name: displayName });
    },

    /**
     * Get a person
     */
    async getPerson(workspaceId: string, personId: string): Promise<Person> {
        return api.get(`/api/v1/workspaces/${workspaceId}/people/${personId}`);
    },

    /**
     * Update a person
     */
    async updatePerson(
        workspaceId: string,
        personId: string,
        data: { display_name?: string; cover_face_id?: string; status?: string }
    ): Promise<Person> {
        return api.patch(`/api/v1/workspaces/${workspaceId}/people/${personId}`, data);
    },

    /**
     * Delete a person
     */
    async deletePerson(workspaceId: string, personId: string): Promise<void> {
        await api.delete(`/api/v1/workspaces/${workspaceId}/people/${personId}`);
    },

    /**
     * Merge two people
     */
    async mergePeople(
        workspaceId: string,
        sourcePersonId: string,
        targetPersonId: string
    ): Promise<Person> {
        return api.post(`/api/v1/workspaces/${workspaceId}/people/merge`, {
            source_person_id: sourcePersonId,
            target_person_id: targetPersonId,
        });
    },

    /**
     * Get assets for a person
     */
    async getPersonAssets(
        workspaceId: string,
        personId: string,
        options?: { page?: number; limit?: number }
    ): Promise<{ data: Array<{ asset_id: string }>; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/people/${personId}/assets?${params.toString()}`);
    },

    /**
     * Create a face detection
     */
    async createFaceDetection(
        workspaceId: string,
        data: {
            asset_id: string;
            bbox: { x: number; y: number; width: number; height: number };
            person_id?: string;
            confidence?: number;
        }
    ): Promise<FaceDetection> {
        return api.post(`/api/v1/workspaces/${workspaceId}/people/faces`, data);
    },

    /**
     * Get faces for an asset
     */
    async getAssetFaces(workspaceId: string, assetId: string): Promise<FaceDetection[]> {
        return api.get(`/api/v1/workspaces/${workspaceId}/people/faces/asset/${assetId}`);
    },

    /**
     * Tag a face with a person
     */
    async tagFace(workspaceId: string, faceId: string, personId: string): Promise<FaceDetection> {
        return api.post(`/api/v1/workspaces/${workspaceId}/people/faces/${faceId}/tag`, {
            person_id: personId,
        });
    },

    /**
     * Remove person from a face
     */
    async untagFace(workspaceId: string, faceId: string): Promise<FaceDetection> {
        return api.delete(`/api/v1/workspaces/${workspaceId}/people/faces/${faceId}/tag`);
    },

    /**
     * Delete a face detection
     */
    async deleteFaceDetection(workspaceId: string, faceId: string): Promise<void> {
        await api.delete(`/api/v1/workspaces/${workspaceId}/people/faces/${faceId}`);
    },
};

// ============================================================================
// Search Service
// ============================================================================

export const searchService = {
    /**
     * Unified search
     */
    async search(
        workspaceId: string,
        query: string,
        options?: {
            entityTypes?: string[];
            galleryId?: string;
        }
    ): Promise<SearchResults> {
        return api.post(`/api/v1/workspaces/${workspaceId}/search`, {
            query,
            entity_types: options?.entityTypes,
            gallery_id: options?.galleryId,
        });
    },

    /**
     * Quick search (GET)
     */
    async quickSearch(
        workspaceId: string,
        query: string,
        options?: {
            types?: string;
            galleryId?: string;
        }
    ): Promise<SearchResults> {
        const params = new URLSearchParams();
        params.append('q', query);
        if (options?.types) params.append('types', options.types);
        if (options?.galleryId) params.append('gallery_id', options.galleryId);

        return api.get(`/api/v1/workspaces/${workspaceId}/search?${params.toString()}`);
    },

    /**
     * Search assets by tag
     */
    async searchByTag(
        workspaceId: string,
        tagId: string,
        options?: { galleryId?: string; page?: number; limit?: number }
    ): Promise<{ data: Array<{ asset_id: string; file_name: string; gallery_id?: string }>; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.galleryId) params.append('gallery_id', options.galleryId);
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/search/by-tag/${tagId}?${params.toString()}`);
    },

    /**
     * Search assets by person
     */
    async searchByPerson(
        workspaceId: string,
        personId: string,
        options?: { galleryId?: string; page?: number; limit?: number }
    ): Promise<{ data: Array<{ asset_id: string; file_name: string; gallery_id?: string }>; meta: ListMeta }> {
        const params = new URLSearchParams();
        if (options?.galleryId) params.append('gallery_id', options.galleryId);
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());

        return api.get(`/api/v1/workspaces/${workspaceId}/search/by-person/${personId}?${params.toString()}`);
    },
};
