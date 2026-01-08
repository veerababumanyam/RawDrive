/**
 * Core type definitions for Photo Sync Service.
 *
 * These types are used across the service for providers, jobs, and metadata.
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported cloud storage providers for photo import.
 */
export enum Provider {
  GOOGLE_PHOTOS = 'google_photos',
  DROPBOX = 'dropbox',
  ONEDRIVE = 'onedrive',
  AMAZON_PHOTOS = 'amazon_photos',
  ICLOUD = 'icloud',
}

/**
 * Status of a provider connection.
 */
export enum ProviderStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
  EXPIRED = 'expired',
  ERROR = 'error',
}

/**
 * OAuth credentials for a provider.
 */
export interface ProviderCredential {
  id: string;
  userId: string;
  provider: Provider;
  accessToken: string; // Encrypted at rest
  refreshToken: string; // Encrypted at rest
  expiresAt: Date;
  scope: string[];
  status: ProviderStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Sync Job Types
// ============================================================================

/**
 * Type of sync operation.
 */
export enum SyncType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
}

/**
 * Status of a sync job.
 */
export enum SyncJobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * A sync job represents a photo import operation.
 */
export interface SyncJob {
  id: string;
  userId: string;
  workspaceId: string;
  provider: Provider;
  type: SyncType;
  status: SyncJobStatus;
  progress: SyncProgress;
  error?: SyncError;
  startedAt?: Date;
  completedAt?: Date;
  lastCheckpoint?: string; // For resumable syncs
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Progress information for a sync job.
 */
export interface SyncProgress {
  totalPhotos: number;
  processedPhotos: number;
  skippedPhotos: number; // Duplicates or errors
  bytesDownloaded: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * Error information for a failed sync job.
 */
export interface SyncError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  occurredAt: Date;
}

// ============================================================================
// Photo Metadata Types
// ============================================================================

/**
 * Photo metadata extracted during import.
 */
export interface PhotoMetadata {
  id: string;
  syncJobId: string;
  userId: string;
  workspaceId: string;
  provider: Provider;
  sourceId: string; // ID in the source provider
  sourceUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  takenAt?: Date;
  hash: string; // SHA-256 for deduplication
  pHash?: string; // Perceptual hash for similarity detection
  exifData?: ExifData;
  storagePath: string; // Path in R2/S3
  status: PhotoStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Status of an imported photo.
 */
export enum PhotoStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PROCESSING = 'processing',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
  DUPLICATE = 'duplicate',
}

/**
 * EXIF metadata extracted from photos.
 */
export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: Date;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  orientation?: number;
  colorSpace?: string;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request to initiate an OAuth connection.
 */
export interface OAuthConnectRequest {
  provider: Provider;
  redirectUrl: string;
}

/**
 * OAuth callback parameters.
 */
export interface OAuthCallbackParams {
  provider: Provider;
  code: string;
  state: string;
}

/**
 * Request to start a sync job.
 */
export interface StartSyncRequest {
  provider: Provider;
  type: SyncType;
}

/**
 * Response for sync job status.
 */
export interface SyncJobResponse {
  id: string;
  provider: Provider;
  type: SyncType;
  status: SyncJobStatus;
  progress: SyncProgress;
  error?: SyncError;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

/**
 * Provider status response.
 */
export interface ProviderStatusResponse {
  provider: Provider;
  status: ProviderStatus;
  connectedAt?: string;
  lastSyncAt?: string;
  photoCount?: number;
}

// ============================================================================
// Queue Message Types
// ============================================================================

/**
 * Message for sync job queue.
 */
export interface SyncJobMessage {
  jobId: string;
  userId: string;
  workspaceId: string;
  provider: Provider;
  type: SyncType;
  checkpoint?: string;
  correlationId: string;
}

/**
 * Message for photo download queue.
 */
export interface PhotoDownloadMessage {
  jobId: string;
  photoId: string;
  sourceUrl: string;
  sourceId: string;
  provider: Provider;
  correlationId: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Pagination parameters.
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Health check response.
 */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'unavailable';
  service: string;
  version?: string;
  checks?: Record<string, boolean>;
}
