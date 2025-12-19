export interface RecycleBinItem {
    id: string;
    type: 'gallery' | 'photo';
    name: string;
    deletedAt: string;
    daysUntilPermanentDelete: number;
    photoCount?: number;
    thumbnailUrl?: string;
    originalBytes?: number;
    parentGalleryId?: string;
    deleted: boolean;
    deleteStatus?: string;
}

export interface RecycleBinApiResponse {
    items: RecycleBinItem[];
    meta: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}

export interface RestoreResponse {
    success: boolean;
    message: string;
    entity_id: string;
    entity_type: string;
    new_name?: string;
}

export interface PermanentDeleteResponse {
    success: boolean;
    message: string;
    files_deleted: number;
    storage_freed: number;
    storage_freed_formatted: string;
}

export interface BulkOperationResult {
    item_id: string;
    item_type: string;
    success: boolean;
    error?: string;
}

export interface BulkRestoreResponse {
    success: boolean;
    results: BulkOperationResult[];
    success_count: number;
    failure_count: number;
}

export interface BulkPermanentDeleteResponse {
    success: boolean;
    results: BulkOperationResult[];
    success_count: number;
    failure_count: number;
    total_storage_freed?: number;
}

export interface DeletionInfoResponse {
    photo_count: number;
    requires_name_confirmation: boolean;
    name_confirmation_threshold: number;
}
