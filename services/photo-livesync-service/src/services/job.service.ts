/**
 * Job Service.
 *
 * Manages sync job lifecycle:
 * - Job creation, status updates, progress tracking
 * - Job cancellation and resumption
 * - Job queueing for background processing
 *
 * @module services/job.service
 */

import { Provider, SyncJobStatus, SyncType } from '../types.js';
import type { SyncJob, SyncProgress } from '../types.js';
import {
  createSyncJob,
  findSyncJobById,
  findSyncJobsByUserId,
  findPendingJobs,
  updateSyncJobStatus,
  updateSyncJobProgress,
  incrementSyncJobProgress,
  markSyncJobCompleted,
  markSyncJobFailed,
  markSyncJobCancelled,
  hasActiveSyncJob,
  getSyncJobStats,
  type CreateSyncJobInput,
} from '../db/repositories/sync-job.repository.js';
import { acquireLock, releaseLock, cacheGet, cacheSet } from '../cache/redis-client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a new sync job.
 */
export interface CreateJobOptions {
  userId: string;
  provider: Provider;
  syncType: SyncType;
  priority?: number;
}

/**
 * Job creation result.
 */
export interface CreateJobResult {
  success: boolean;
  job?: SyncJob;
  error?: string;
}

/**
 * Progress update options.
 */
export interface UpdateProgressOptions {
  processed?: number;
  total?: number;
  currentItem?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Cache key prefix for job status */
const JOB_STATUS_CACHE_PREFIX = 'job-status:';

/** Cache TTL for job status (30 seconds) */
const JOB_STATUS_CACHE_TTL = 30;

// ============================================================================
// Job Service
// ============================================================================

/**
 * Job service class.
 */
export class JobService {
  /**
   * Create a new sync job.
   *
   * Validates that no active job exists for the same provider.
   */
  async createJob(options: CreateJobOptions): Promise<CreateJobResult> {
    const { userId, provider, syncType, priority = 5 } = options;

    // Check for existing active job
    const hasActive = await hasActiveSyncJob(userId, provider);

    if (hasActive) {
      return {
        success: false,
        error: `Active sync job already exists for provider: ${provider}`,
      };
    }

    // Create the job
    const input: CreateSyncJobInput = {
      userId,
      provider,
    };

    try {
      const job = await createSyncJob(input);

      console.log('[JobService] Sync job created', {
        jobId: job.id,
        userId,
        provider,
        syncType,
      });

      return {
        success: true,
        job,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create job',
      };
    }
  }

  /**
   * Get a job by ID.
   */
  async getJob(jobId: string): Promise<SyncJob | null> {
    return findSyncJobById(jobId);
  }

  /**
   * Get a job with cached status (for frequent polling).
   */
  async getJobStatus(jobId: string): Promise<SyncJob | null> {
    // Try cache first
    const cacheKey = `${JOB_STATUS_CACHE_PREFIX}${jobId}`;
    const cached = await cacheGet<SyncJob>(cacheKey);

    if (cached) {
      return cached;
    }

    // Get from database
    const job = await findSyncJobById(jobId);

    if (job) {
      // Cache active jobs for a short time
      if (
        job.status === SyncJobStatus.PENDING ||
        job.status === SyncJobStatus.RUNNING
      ) {
        await cacheSet(cacheKey, job, { ttlSeconds: JOB_STATUS_CACHE_TTL });
      }
    }

    return job;
  }

  /**
   * Get all jobs for a user.
   */
  async getUserJobs(
    userId: string
  ): Promise<SyncJob[]> {
    return findSyncJobsByUserId(userId);
  }

  /**
   * Get all pending jobs (for worker processing).
   */
  async getPendingJobs(limit = 100): Promise<SyncJob[]> {
    return findPendingJobs(limit);
  }

  /**
   * Start a pending job.
   *
   * Acquires a lock to prevent race conditions.
   */
  async startJob(jobId: string): Promise<boolean> {
    const lockKey = `job-start:${jobId}`;
    const lock = await acquireLock(lockKey, { ttlMs: 10000 });

    if (!lock.acquired) {
      return false;
    }

    try {
      const job = await findSyncJobById(jobId);

      if (!job || job.status !== SyncJobStatus.PENDING) {
        return false;
      }

      await updateSyncJobStatus(jobId, SyncJobStatus.RUNNING);

      // Invalidate cache
      await this.invalidateJobCache(jobId);

      console.log('[JobService] Job started', { jobId });

      return true;
    } finally {
      await releaseLock(lock.key, lock.lockId);
    }
  }

  /**
   * Update job progress.
   */
  async updateProgress(
    jobId: string,
    options: UpdateProgressOptions
  ): Promise<boolean> {
    const { processed, total, currentItem } = options;

    const progress: Partial<SyncProgress> = {};

    if (processed !== undefined) {
      progress.processed = processed;
    }
    if (total !== undefined) {
      progress.total = total;
    }
    if (currentItem !== undefined) {
      progress.currentItem = currentItem;
    }

    const updated = await updateSyncJobProgress(jobId, progress);

    if (updated) {
      // Invalidate cache
      await this.invalidateJobCache(jobId);
    }

    return !!updated;
  }

  /**
   * Increment error count for a job.
   */
  async incrementErrors(jobId: string, errorMessage: string): Promise<void> {
    // Increment via updateSyncJobProgress with errorCount increment
    await incrementSyncJobProgress(jobId, { errorCount: 1 });

    // Log the error for debugging
    console.warn('[JobService] Job error', { jobId, error: errorMessage });
  }

  /**
   * Mark job as completed.
   */
  async completeJob(jobId: string, _syncToken?: string): Promise<boolean> {
    const result = await markSyncJobCompleted(jobId);

    if (result) {
      await this.invalidateJobCache(jobId);

      console.log('[JobService] Job completed', {
        jobId,
        syncToken: syncToken ? 'present' : 'none',
      });
    }

    return !!result;
  }

  /**
   * Mark job as failed.
   */
  async failJob(jobId: string, error: string): Promise<boolean> {
    const result = await markSyncJobFailed(jobId, { code: 'SYNC_ERROR', message: error });

    if (result) {
      await this.invalidateJobCache(jobId);

      console.error('[JobService] Job failed', { jobId, error });
    }

    return !!result;
  }

  /**
   * Cancel a job.
   */
  async cancelJob(jobId: string, _reason?: string): Promise<boolean> {
    const job = await findSyncJobById(jobId);

    if (!job) {
      return false;
    }

    // Can only cancel pending or running jobs
    if (
      job.status !== SyncJobStatus.PENDING &&
      job.status !== SyncJobStatus.RUNNING
    ) {
      return false;
    }

    const result = await markSyncJobCancelled(jobId);

    if (result) {
      await this.invalidateJobCache(jobId);

      console.log('[JobService] Job cancelled', { jobId, reason });
    }

    return !!result;
  }

  /**
   * Get job statistics for a user.
   */
  async getStats(userId: string) {
    return getSyncJobStats(userId);
  }

  /**
   * Check if a provider has an active job.
   */
  async hasActiveJob(userId: string, provider: Provider): Promise<boolean> {
    return hasActiveSyncJob(userId, provider);
  }

  /**
   * Invalidate cached job status.
   */
  private async invalidateJobCache(jobId: string): Promise<void> {
    const cacheKey = `${JOB_STATUS_CACHE_PREFIX}${jobId}`;
    // Setting with 1 second TTL effectively invalidates
    const job = await findSyncJobById(jobId);
    if (job) {
      await cacheSet(cacheKey, job, { ttlSeconds: 1 });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let jobServiceInstance: JobService | null = null;

/**
 * Get the job service instance.
 */
export function getJobService(): JobService {
  if (!jobServiceInstance) {
    jobServiceInstance = new JobService();
  }
  return jobServiceInstance;
}

export default JobService;
