/**
 * Gallery Types
 * Based on design document: .kiro/specs/gallery-crud/design.md
 */

import { CompanyProfile } from './companyProfile';

// Gallery Status
export type GalleryStatus = 'draft' | 'published' | 'archived';
export type LayoutStyle = 'tabs' | 'continuous';
export type ThemeMode = 'light' | 'dark' | 'system';
export type DownloadPolicy = 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';
export type ViewMode = 'grid' | 'masonry' | 'list';
export type FilterType = 'all' | 'picks' | 'favorites' | 'selections';
export type BulkAction = 'move' | 'delete' | 'download';

// Gallery Entity
export interface GalleryEntity {
  gallery_id: string;
  workspace_id: string;
  title: string;
  description?: string;
  client_name?: string;
  client_id?: string;
  shoot_date?: string;
  status: GalleryStatus;
  branding_profile_id?: string;
  company_profile?: CompanyProfile;
  portal_language?: string;
  layout_style?: LayoutStyle;
  theme?: ThemeMode;
  download_policy?: DownloadPolicy;
  exif_visible?: boolean;
  password_hash?: string;
  email_registration_required?: boolean;
  expires_at?: string;
  custom_domain?: string;
  cover_asset_id?: string;
  created_by_user_id: string;
  published_at?: string;
  created_at: string;
  updated_at?: string;
}

// Sub-Gallery Entity
export interface SubGalleryEntity {
  sub_gallery_id: string;
  workspace_id: string;
  gallery_id: string;
  name: string;
  sort_order: number;
  visible: boolean;
  cover_asset_id?: string;
  created_at: string;
}

// Gallery List Item (API Response)
export interface GalleryListItem {
  gallery_id: string;
  title: string;
  status: GalleryStatus;
  photo_count: number;
  created_at: string;
  description?: string;
  client_name?: string;
  client_id?: string;
  shoot_date?: string;
  cover_image_url?: string;  // Legacy - will be replaced with signed URL
  cover_asset_id?: string;   // Asset ID for fetching signed URL
  published_at?: string;
}

// Gallery List Response
export interface GalleryListResponse {
  data: GalleryListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Sub-Gallery Item (API Response)
export interface SubGalleryItem {
  sub_gallery_id: string;
  name: string;
  sort_order: number;
  visible: boolean;
  photo_count: number;
  cover_asset_id?: string;
  cover_image_url?: string;
}

// Gallery Stats
export interface GalleryStats {
  total_items: number;
  total_photos: number;
  total_videos: number;
  favorites_count: number;
  selections_count: number;
}

// Gallery Detail Response (matches backend GalleryDetailResponse schema)
// Backend returns flat structure, API client wraps it in { data: GalleryDetailResponse }
export interface GalleryDetailData {
  gallery_id: string;
  workspace_id: string;
  title: string;
  status: GalleryStatus;
  created_by_user_id: string;
  created_at: string;
  description?: string;
  client_name?: string;
  client_id?: string;
  shoot_date?: string;
  branding_profile_id?: string;
  company_profile?: CompanyProfile;
  portal_language?: string;
  layout_style?: LayoutStyle;
  theme?: ThemeMode;
  download_policy?: DownloadPolicy;
  exif_visible?: boolean;
  password_protected: boolean;
  email_registration_required?: boolean;
  expires_at?: string;
  published_at?: string;
  cover_asset_id?: string;
  sub_galleries: SubGalleryItem[];
  stats: GalleryStats;
}

// Wrapper for API client response
export interface GalleryDetailResponse {
  data: GalleryDetailData;
}

// Signed URL Response
export interface SignedUrlResponse {
  url: string;
  expires_at: number;
  ttl: number;
}

// Public Gallery Asset (API Response)
export interface PublicGalleryAsset {
  asset_id: string;
  gallery_id: string;
  sub_gallery_id?: string;
  type: 'photo' | 'video';
  filename: string;
  width?: number;
  height?: number;
  duration?: number;
  size_bytes: number;
  metadata?: Record<string, any>;
  sort_order: number;
  created_at: string;
}

// Asset Info (nested in GalleryAssetItem)
export interface AssetInfo {
  type: 'photo' | 'video';
  status: 'uploading' | 'available' | 'processing' | 'failed' | 'deleted';
  mime_type: string;
  thumbnail_url?: string;  // Optional - will be fetched via signed URL
  preview_url?: string;    // Optional - will be fetched via signed URL
  filename?: string;
  original_url?: string;   // Optional - will be fetched via signed URL if allowed
  width?: number;
  height?: number;
  duration_ms?: number;
  date_taken?: string;
  file_size?: number;       // File size in bytes
  created_at?: string;     // Upload timestamp
  exif?: AssetExif;
  // Signed URL metadata (for refresh)
  _signed_urls?: {
    thumbnail?: SignedUrlResponse;
    preview?: SignedUrlResponse;
    original?: SignedUrlResponse;
  };
}

// Asset EXIF Metadata
export interface AssetExif {
  make?: string;
  model?: string;
  lens?: string;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  focal_length?: number;
  flash?: boolean;
  width?: number;
  height?: number;
  orientation?: number;
  date_taken?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

// Gallery Asset Item
export interface GalleryAssetItem {
  gallery_asset_id: string;
  asset_id: string;
  sort_order: number;
  visible: boolean;
  is_private: boolean;
  sub_gallery_id?: string;
  is_favorited: boolean;
  is_selected: boolean;
  favorites_count: number;
  title?: string;
  description?: string;
  tags?: string[];
  asset: AssetInfo;
}

// Gallery Assets Response
export interface GalleryAssetsResponse {
  data: GalleryAssetItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// Gallery Create Request
export interface GalleryCreateRequest {
  title: string;
  description?: string;
  client_name?: string;
  client_id?: string;
  shoot_date?: string;
}

// Gallery Update Request
export interface GalleryUpdateRequest {
  title?: string;
  description?: string;
  client_name?: string;
  client_id?: string | null;
  shoot_date?: string | null;
  layout_style?: LayoutStyle;
  theme?: ThemeMode;
  download_policy?: DownloadPolicy;
  exif_visible?: boolean;
  password?: string;
  remove_password?: boolean;
  email_registration_required?: boolean;
  expires_at?: string | null;
  branding_profile_id?: string | null;
  cover_asset_id?: string | null;
}

// Upload Session Request
export interface UploadSessionRequest {
  gallery_id: string;
  sub_gallery_id?: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256?: string;
  relative_path?: string;
}

// Upload Session Response
export interface UploadSessionResponse {
  upload_id: string;
  provider: 'r2' | 'byos';
  upload_url: string;
  headers: Record<string, string>;
  expires_at: string;
}

// Upload Commit Request
export interface UploadCommitRequest {
  sha256: string;
  etag?: string;
  client_metadata?: Record<string, any>;
}

// Upload Commit Response
export interface UploadCommitResponse {
  asset_id: string;
  status: 'available' | 'processing';
}

// Duplicate Detection types
export interface DuplicateAssetResponse {
  asset_id: string;
  workspace_id: string;
  gallery_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  thumbnail_url: string | null;
}

export interface CheckDuplicateRequest {
  sha256: string;
  gallery_id?: string;
}

export interface CheckDuplicateResponse {
  is_duplicate: boolean;
  duplicates: DuplicateAssetResponse[];
}

// Signed URL Response
export interface SignedUrlResponse {
  url: string;
  expires_at: number;
  ttl: number;
}

// Branding Profile
export interface BrandingProfile {
  branding_profile_id: string;
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

