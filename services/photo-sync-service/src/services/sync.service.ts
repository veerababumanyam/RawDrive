/**
 * Sync Service.
 *
 * Orchestrates the photo synchronization process:
 * - Full sync (enumerate all photos)
 * - Incremental sync (fetch changes since last sync)
 * - Photo downloading and storage
 * - Progress reporting
 *
 * @module services/sync.service
 */

import { Provider, SyncType, SyncJobStatus } from '../types.js';
import type { SyncJob } from '../types.js';
import { getJobService, type JobService } from './job.service.js';
import { getCredentialService, type CredentialService } from './credential.service.js';
import {
  ProviderFactory,
  type IPhotoProvider,
  type PhotoListResult,
  type ProviderPhoto,
} from '../providers/index.js';
import {
  createPhotoMetadata,
  findPhotoByProviderPhotoId,
  updatePhotoMetadata,
  type CreatePhotoMetadataInput,
} from '../db/repositories/photo-metadata.repository.js';
import { generateFileHash, createBloomFilter, addToBloomFilter, checkBloomFilter } from '../utils/duplicate-detector.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Sync operation options.
 */
export interface SyncOptions {
  /** Job ID for progress tracking */
  jobId: string;
  /** User ID */
  userId: string;
  /** Provider to sync from */
  provider: Provider;
  /** Type of sync (full or incremental) */
  syncType: SyncType;
  /** Previous sync token for incremental sync */
  syncToken?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Sync operation result.
 */
export interface SyncResult {
  success: boolean;
  photosProcessed: number;
  photosAdded: number;
  photosSkipped: number;
  errors: number;
  syncToken?: string;
  error?: string;
}

/**
 * Photo processing result.
 */
interface PhotoProcessResult {
  success: boolean;
  added: boolean;
  skipped: boolean;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Batch size for processing photos */
const BATCH_SIZE = 50;

/** Progress update interval (every N photos) */
const PROGRESS_UPDATE_INTERVAL = 10;

// ============================================================================
// Sync Service
// ============================================================================

/**
 * Sync service class.
 */
export class SyncService {
  private jobService: JobService;
  private credentialService: CredentialService;

  constructor() {
    this.jobService = getJobService();
    this.credentialService = getCredentialService();
  }

  /**
   * Execute a sync operation.
   */
  async executeSync(options: SyncOptions): Promise<SyncResult> {
    const { jobId, userId, provider, syncType, syncToken, abortSignal } = options;

    const result: SyncResult = {
      success: false,
      photosProcessed: 0,
      photosAdded: 0,
      photosSkipped: 0,
      errors: 0,
    };

    try {
      // Get credential
      const credential = await this.credentialService.getActiveCredential(userId, provider);

      if (!credential) {
        result.error = 'No active credential found';
        await this.jobService.failJob(jobId, result.error);
        return result;
      }

      // Create provider instance
      const providerInstance = ProviderFactory.create(provider, {
        userId,
        onTokenRefresh: async (tokens) => {
          await this.credentialService.saveTokens({
            userId,
            provider,
            tokens,
          });
        },
      });

      // Set tokens on provider
      providerInstance.setTokens(
        credential.accessToken,
        credential.refreshToken,
        credential.accessTokenExpiresAt
      );

      // Start the job
      await this.jobService.startJob(jobId);

      // Initialize bloom filter for duplicate detection
      const bloomFilter = createBloomFilter(100000); // Capacity for 100k photos

      // Execute sync based on type
      if (syncType === SyncType.FULL) {
        await this.executeFullSync(
          providerInstance,
          credential.accessToken,
          options,
          result,
          bloomFilter,
          abortSignal
        );
      } else {
        await this.executeIncrementalSync(
          providerInstance,
          credential.accessToken,
          options,
          result,
          bloomFilter,
          syncToken,
          abortSignal
        );
      }

      // Mark job as completed
      if (result.success) {
        await this.jobService.completeJob(jobId, result.syncToken);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;

      await this.jobService.failJob(jobId, result.error);

      console.error('[SyncService] Sync failed', {
        jobId,
        userId,
        provider,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Execute a full sync (enumerate all photos).
   */
  private async executeFullSync(
    provider: IPhotoProvider,
    accessToken: string,
    options: SyncOptions,
    result: SyncResult,
    bloomFilter: ReturnType<typeof createBloomFilter>,
    abortSignal?: AbortSignal
  ): Promise<void> {
    let pageToken: string | undefined;
    let totalEstimate = 0;

    do {
      // Check for cancellation
      if (abortSignal?.aborted) {
        result.error = 'Sync cancelled';
        return;
      }

      // Fetch photos page
      const listResult: PhotoListResult = await provider.listPhotos(accessToken, {
        pageToken,
        pageSize: BATCH_SIZE,
      });

      // Update total estimate on first page
      if (totalEstimate === 0 && listResult.totalCount) {
        totalEstimate = listResult.totalCount;
        await this.jobService.updateProgress(options.jobId, { total: totalEstimate });
      }

      // Process photos in batch
      for (const photo of listResult.photos) {
        const processResult = await this.processPhoto(
          photo,
          options.userId,
          options.provider,
          bloomFilter
        );

        result.photosProcessed++;

        if (processResult.added) {
          result.photosAdded++;
        } else if (processResult.skipped) {
          result.photosSkipped++;
        }

        if (!processResult.success) {
          result.errors++;
          await this.jobService.incrementErrors(options.jobId, processResult.error || 'Unknown error');
        }

        // Update progress periodically
        if (result.photosProcessed % PROGRESS_UPDATE_INTERVAL === 0) {
          await this.jobService.updateProgress(options.jobId, {
            processed: result.photosProcessed,
            currentItem: photo.filename,
          });
        }
      }

      pageToken = listResult.nextPageToken;
    } while (pageToken);

    result.success = true;

    console.log('[SyncService] Full sync completed', {
      jobId: options.jobId,
      processed: result.photosProcessed,
      added: result.photosAdded,
      skipped: result.photosSkipped,
      errors: result.errors,
    });
  }

  /**
   * Execute an incremental sync (fetch changes).
   */
  private async executeIncrementalSync(
    provider: IPhotoProvider,
    accessToken: string,
    options: SyncOptions,
    result: SyncResult,
    bloomFilter: ReturnType<typeof createBloomFilter>,
    syncToken?: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // Check if provider supports incremental sync
    if (!provider.getChanges) {
      // Fall back to full sync
      console.log('[SyncService] Provider does not support incremental sync, falling back to full sync', {
        jobId: options.jobId,
        provider: options.provider,
      });

      await this.executeFullSync(provider, accessToken, options, result, bloomFilter, abortSignal);
      return;
    }

    let hasMore = true;
    let currentToken = syncToken;

    while (hasMore) {
      // Check for cancellation
      if (abortSignal?.aborted) {
        result.error = 'Sync cancelled';
        return;
      }

      // Fetch changes
      const changes = await provider.getChanges(accessToken, {
        syncToken: currentToken,
        maxResults: BATCH_SIZE,
      });

      // Process added/modified photos
      for (const photo of [...changes.added, ...changes.modified]) {
        const processResult = await this.processPhoto(
          photo,
          options.userId,
          options.provider,
          bloomFilter
        );

        result.photosProcessed++;

        if (processResult.added) {
          result.photosAdded++;
        } else if (processResult.skipped) {
          result.photosSkipped++;
        }

        if (!processResult.success) {
          result.errors++;
        }

        // Update progress periodically
        if (result.photosProcessed % PROGRESS_UPDATE_INTERVAL === 0) {
          await this.jobService.updateProgress(options.jobId, {
            processed: result.photosProcessed,
            currentItem: photo.filename,
          });
        }
      }

      // Handle deleted photos (mark as deleted in our DB)
      // TODO: Implement soft delete for photos

      currentToken = changes.syncToken;
      hasMore = changes.hasMore;
    }

    result.syncToken = currentToken;
    result.success = true;

    console.log('[SyncService] Incremental sync completed', {
      jobId: options.jobId,
      processed: result.photosProcessed,
      added: result.photosAdded,
      syncToken: currentToken,
    });
  }

  /**
   * Process a single photo.
   */
  private async processPhoto(
    photo: ProviderPhoto,
    userId: string,
    provider: Provider,
    bloomFilter: ReturnType<typeof createBloomFilter>
  ): Promise<PhotoProcessResult> {
    try {
      // Check bloom filter for quick duplicate detection
      const photoKey = `${provider}:${photo.id}`;

      if (checkBloomFilter(bloomFilter, photoKey)) {
        // Might be duplicate, check database
        const existing = await findPhotoByProviderPhotoId(userId, provider, photo.id);

        if (existing) {
          return { success: true, added: false, skipped: true };
        }
      }

      // Check if photo already exists in database
      const existing = await findPhotoByProviderPhotoId(userId, provider, photo.id);

      if (existing) {
        // Photo exists, check if it needs update
        if (photo.modifiedAt > existing.modifiedAt) {
          await updatePhotoMetadata(existing.id, {
            filename: photo.filename,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            width: photo.width,
            height: photo.height,
            takenAt: photo.takenAt,
            modifiedAt: photo.modifiedAt,
            downloadUrl: photo.downloadUrl,
            thumbnailUrl: photo.thumbnailUrl,
          });
        }

        addToBloomFilter(bloomFilter, photoKey);
        return { success: true, added: false, skipped: true };
      }

      // Create new photo metadata entry
      const input: CreatePhotoMetadataInput = {
        userId,
        provider,
        providerPhotoId: photo.id,
        filename: photo.filename,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        width: photo.width,
        height: photo.height,
        takenAt: photo.takenAt,
        createdAt: photo.createdAt,
        modifiedAt: photo.modifiedAt,
        downloadUrl: photo.downloadUrl,
        thumbnailUrl: photo.thumbnailUrl,
        metadata: photo.metadata,
        albumIds: photo.albumIds,
        description: photo.description,
        isVideo: photo.isVideo,
      };

      await createPhotoMetadata(input);

      // Add to bloom filter
      addToBloomFilter(bloomFilter, photoKey);

      return { success: true, added: true, skipped: false };
    } catch (error) {
      return {
        success: false,
        added: false,
        skipped: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get estimated photo count for a user's provider.
   */
  async getEstimatedPhotoCount(
    userId: string,
    provider: Provider
  ): Promise<number | null> {
    const credential = await this.credentialService.getActiveCredential(userId, provider);

    if (!credential) {
      return null;
    }

    const providerInstance = ProviderFactory.create(provider, { userId });
    providerInstance.setTokens(credential.accessToken, credential.refreshToken);

    // Try to get total count if provider supports it
    if (providerInstance.getTotalPhotoCount) {
      return providerInstance.getTotalPhotoCount(credential.accessToken);
    }

    return null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let syncServiceInstance: SyncService | null = null;

/**
 * Get the sync service instance.
 */
export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

export default SyncService;
