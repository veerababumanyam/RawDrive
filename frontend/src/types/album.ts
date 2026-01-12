/**
 * Album Preview & Proofing Types
 * Feature: 026-album-proofing
 *
 * Interfaces for album design proofing workflow including
 * viewer, comments, versions, and renders.
 */

// ============================================
// ENUMS
// ============================================

export enum AlbumStatus {
  DRAFT = 'draft',
  PROOF_SENT = 'proof_sent',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved',
  EXPORTED = 'exported',
}

export enum CommentStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export enum ElementType {
  PHOTO = 'photo',
  TEXT = 'text',
  SHAPE = 'shape',
}

export enum RenderType {
  PREVIEW_PDF = 'preview_pdf',
  PRINT_PDF = 'print_pdf',
  SPREAD_IMAGES = 'spread_images',
}

export enum RenderStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  READY = 'ready',
  FAILED = 'failed',
}

// ============================================
// ELEMENT STYLING
// ============================================

export interface ElementBorder {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
}

export interface ElementShadow {
  offset_x: number;
  offset_y: number;
  blur: number;
  color: string;
}

export interface TextFont {
  family: string;
  size: number;
  weight: 'normal' | 'bold' | 'light';
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
}

export interface ElementStyling {
  border?: ElementBorder;
  shadow?: ElementShadow;
  font?: TextFont;
  fill?: string;
  radius?: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================
// ALBUM ELEMENT
// ============================================

export interface AlbumElement {
  element_id: string;
  spread_id: string;
  workspace_id: string;
  type: ElementType;
  asset_id: string | null;
  text_content: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  z_index: number;
  crop: CropRect | null;
  styling: ElementStyling | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// ALBUM SPREAD
// ============================================

export interface PageConfig {
  [key: string]: unknown;
}

export interface AlbumSpread {
  spread_id: string;
  album_id: string;
  workspace_id: string;
  page_number: number;
  template_id: string | null;
  background_color: string | null;
  background_image_asset_id: string | null;
  left_page_config: PageConfig | null;
  right_page_config: PageConfig | null;
  elements: AlbumElement[];
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

export interface AlbumSpreadPublic {
  spread_id: string;
  page_number: number;
  image_url: string;
  thumbnail_url: string;
  comments: AlbumCommentPublic[];
}

// ============================================
// ALBUM COMMENT
// ============================================

export interface AlbumComment {
  comment_id: string;
  album_id: string;
  spread_id: string;
  workspace_id: string;
  author_user_id: string | null;
  author_name: string;
  author_email: string | null;
  body: string;
  position_x: number; // Percentage 0-100
  position_y: number; // Percentage 0-100
  status: CommentStatus;
  parent_comment_id: string | null;
  replies: AlbumComment[];
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlbumCommentPublic {
  comment_id: string;
  author_name: string;
  body: string;
  position_x: number;
  position_y: number;
  status: CommentStatus;
  replies: AlbumCommentPublic[];
  created_at: string;
}

export interface CommentSummary {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
}

// ============================================
// ALBUM VERSION
// ============================================

export interface AlbumVersionSnapshot {
  album: Partial<Album>;
  spreads: Array<{
    spread_id: string;
    page_number: number;
    elements: AlbumElement[];
  }>;
  metadata: {
    total_photos: number;
    total_spreads: number;
  };
}

export interface AlbumVersion {
  version_id: string;
  album_id: string;
  workspace_id: string;
  version_number: number;
  label: string | null;
  snapshot_data: AlbumVersionSnapshot;
  created_by_user_id: string;
  created_at: string;
}

export interface AlbumVersionSummary {
  version_id: string;
  version_number: number;
  label: string | null;
  spread_count: number;
  thumbnail_url: string | null;
  created_by_name: string;
  created_at: string;
}

export interface VersionDifference {
  type:
    | 'spread_added'
    | 'spread_removed'
    | 'spread_modified'
    | 'element_added'
    | 'element_removed'
    | 'element_modified';
  page_number: number;
  description: string;
}

export interface VersionComparison {
  version_a: AlbumVersionSummary;
  version_b: AlbumVersionSummary;
  differences: VersionDifference[];
}

// ============================================
// ALBUM RENDER
// ============================================

export interface AlbumRender {
  render_id: string;
  album_id: string;
  workspace_id: string;
  render_type: RenderType;
  status: RenderStatus;
  storage_path: string | null;
  download_url: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  resolution_dpi: number | null;
  watermarked: boolean;
  error_message: string | null;
  requested_by_user_id: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

// ============================================
// ALBUM
// ============================================

export interface Album {
  album_id: string;
  workspace_id: string;
  gallery_id: string | null;
  title: string;
  description: string | null;
  status: AlbumStatus;
  page_size: string | null;
  width_mm: number | null;
  height_mm: number | null;
  bleed_mm: number;
  safe_margin_mm: number;
  lab_preset_id: string | null;
  cover_spread_id: string | null;
  cover_thumbnail_url: string | null;
  spread_count: number;
  created_by_user_id: string;
  approved_by_email: string | null;
  approved_at: string | null;
  proof_sent_at: string | null;
  version_number: number;
  created_at: string;
  updated_at: string;
}

export interface AlbumSummary {
  album_id: string;
  title: string;
  status: AlbumStatus;
  spread_count: number;
  cover_thumbnail_url: string | null;
  unresolved_comments: number;
  updated_at: string;
}

export interface AlbumDetail extends Album {
  spreads: AlbumSpread[];
  comment_summary: CommentSummary;
}

// ============================================
// PUBLIC ALBUM PROOF
// ============================================

export interface Branding {
  photographer_name: string;
  logo_url: string | null;
  primary_color: string;
  theme: 'light' | 'dark' | 'system';
}

export interface AlbumProofPermissions {
  can_comment: boolean;
  can_approve: boolean;
  can_download: boolean;
}

export interface AlbumProof {
  album_id: string;
  title: string;
  status: AlbumStatus;
  spreads: AlbumSpreadPublic[];
  branding: Branding;
  permissions: AlbumProofPermissions;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface CreateAlbumRequest {
  title: string;
  description?: string;
  gallery_id?: string;
  page_size?: string;
  lab_preset_id?: string;
}

export interface UpdateAlbumRequest {
  title?: string;
  description?: string;
  page_size?: string;
}

export interface CreateAlbumCommentRequest {
  spread_id: string;
  body: string;
  position_x: number;
  position_y: number;
  author_name: string;
  author_email?: string;
  parent_comment_id?: string;
}

export interface UpdateCommentRequest {
  body?: string;
  status?: CommentStatus;
}

export interface ApproveAlbumRequest {
  client_name: string;
  client_email: string;
  acknowledge_unresolved?: boolean;
}

export interface SendProofRequest {
  client_email: string;
  client_name?: string;
  message?: string;
  expires_in_days?: number;
  allow_download?: boolean;
}

export interface SendProofResponse {
  share_link: string;
  expires_at: string;
  notification_sent: boolean;
}

export interface CreateVersionRequest {
  label?: string;
}

export interface CreateRenderRequest {
  render_type: RenderType;
  options?: {
    watermark?: boolean;
    resolution_dpi?: 72 | 150 | 300;
  };
}

export interface DownloadResponse {
  download_url: string;
  expires_at: string;
}

export interface DownloadGeneratingResponse {
  status: 'generating';
  estimated_seconds: number;
}

// ============================================
// LIST RESPONSE TYPES
// ============================================

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AlbumListResponse {
  data: AlbumSummary[];
  pagination: Pagination;
}

export interface AlbumCommentListResponse {
  data: AlbumComment[];
  summary: CommentSummary;
}

export interface AlbumVersionListResponse {
  data: AlbumVersionSummary[];
}

export interface AlbumRenderListResponse {
  data: AlbumRender[];
}

// ============================================
// TYPE ALIASES (for import compatibility)
// ============================================

// Request type aliases
export type AlbumCreateRequest = CreateAlbumRequest;
export type AlbumUpdateRequest = UpdateAlbumRequest;
export type AlbumCommentCreateRequest = CreateAlbumCommentRequest;
export type AlbumCommentUpdateRequest = UpdateCommentRequest;
export type AlbumVersionCreateRequest = CreateVersionRequest;
export type AlbumRenderCreateRequest = CreateRenderRequest;

// Response type aliases
export type AlbumDetailResponse = AlbumDetail;
export type AlbumProofResponse = AlbumProof;

// Rollback types
export interface RollbackRequest {
  target_version_id: string;
  preserve_current_as_version?: boolean;
}

export interface RollbackResponse {
  album: Album;
  new_version_number: number;
  rolled_back_from_version: number;
}

// Approval response
export interface ApproveAlbumResponse {
  album_id: string;
  status: AlbumStatus;
  approved_at: string;
  approved_by_email: string;
}

// Public comment create request
export interface PublicCommentCreateRequest {
  spread_id: string;
  body: string;
  position_x: number;
  position_y: number;
  author_name: string;
  author_email?: string;
  parent_comment_id?: string;
}
