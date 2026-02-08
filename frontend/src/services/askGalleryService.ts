import apiClient from './api';

export interface AskGalleryResponse {
    answer: string;
    cited_photos: string[];
    analyzed_count: number;
}

export const askGallery = async (
    workspaceId: string,
    galleryId: string,
    query: string
): Promise<AskGalleryResponse> => {
    const { data, error } = await apiClient.post<AskGalleryResponse>(
        `/api/v1/workspaces/${workspaceId}/ai/tools/ask_gallery`,
        {
            gallery_id: galleryId,
            query: query,
        }
    );

    if (error) {
        throw new Error(error.message || 'Failed to ask gallery');
    }

    return data as AskGalleryResponse;
};
