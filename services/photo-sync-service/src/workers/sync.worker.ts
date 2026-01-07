/**
 * Sync Worker Module.
 *
 * Consumes sync job messages from RabbitMQ and executes sync operations.
 * Handles job retry, progress reporting, and completion notifications.
 *
 * @module workers/sync.worker
 */

import { ConsumeMessage } from 'amqplib';
import {
  consume,
  publish,
  ack,
  nack,
  cancelConsumer,
  type MessageHandler,
} from '../queue/rabbitmq-client.js';
import {
  QUEUES,
  type SyncJobMessage,
  createSyncCompleteMessage,
} from '../queue/queues.js';
import { getSyncService, type SyncResult } from '../services/index.js';
import { getJobService } from '../services/job.service.js';
import { SyncJobStatus } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Worker options.
 */
export interface SyncWorkerOptions {
  /** Concurrency level (number of concurrent jobs) */
  concurrency?: number;
  /** Consumer tag prefix */
  consumerTagPrefix?: string;
}

// ============================================================================
// State
// ============================================================================

let consumerTag: string | null = null;
let isRunning = false;
let activeJobs = 0;

const abortControllers = new Map<string, AbortController>();

// ============================================================================
// Worker Implementation
// ============================================================================

/**
 * Handle a sync job message.
 */
const handleSyncJob: MessageHandler<SyncJobMessage> = async (
  message: SyncJobMessage,
  rawMessage: ConsumeMessage
): Promise<void> => {
  const { jobId, userId, provider, syncType, syncToken, retryCount, maxRetries } = message;

  console.log('[SyncWorker] Processing job', {
    jobId,
    userId,
    provider,
    syncType,
    retryCount,
  });

  activeJobs++;

  // Create abort controller for this job
  const abortController = new AbortController();
  abortControllers.set(jobId, abortController);

  try {
    const syncService = getSyncService();
    const jobService = getJobService();

    // Check if job still exists and is pending
    const job = await jobService.getJob(jobId);

    if (!job) {
      console.warn('[SyncWorker] Job not found, skipping', { jobId });
      return;
    }

    if (job.status !== SyncJobStatus.PENDING && job.status !== SyncJobStatus.RUNNING) {
      console.warn('[SyncWorker] Job not in pending/running state, skipping', {
        jobId,
        status: job.status,
      });
      return;
    }

    // Execute the sync
    const result: SyncResult = await syncService.executeSync({
      jobId,
      userId,
      provider,
      syncType,
      syncToken,
      abortSignal: abortController.signal,
    });

    // Publish completion notification
    const completeMessage = createSyncCompleteMessage(jobId, userId, provider, {
      success: result.success,
      photosProcessed: result.photosProcessed,
      photosAdded: result.photosAdded,
      errors: result.errors,
      syncToken: result.syncToken,
    });

    await publish(QUEUES.SYNC_COMPLETE, completeMessage);

    console.log('[SyncWorker] Job completed', {
      jobId,
      success: result.success,
      photosProcessed: result.photosProcessed,
      photosAdded: result.photosAdded,
      errors: result.errors,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[SyncWorker] Job failed', {
      jobId,
      error: errorMessage,
      retryCount,
      maxRetries,
    });

    // Check if we should retry
    if (retryCount < maxRetries) {
      // Requeue with incremented retry count
      const retryMessage: SyncJobMessage = {
        ...message,
        retryCount: retryCount + 1,
      };

      // Calculate delay based on retry count (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, retryCount), 60000);

      console.log('[SyncWorker] Scheduling retry', {
        jobId,
        retryCount: retryMessage.retryCount,
        delayMs,
      });

      // Publish with delay using message TTL + dead letter exchange
      await publish(QUEUES.SYNC_JOBS, retryMessage, {
        expiration: delayMs,
      });
    } else {
      // Max retries reached, fail the job
      const jobService = getJobService();
      await jobService.failJob(jobId, `Max retries (${maxRetries}) exceeded: ${errorMessage}`);

      // Publish failure notification
      const completeMessage = createSyncCompleteMessage(jobId, userId, provider, {
        success: false,
        photosProcessed: 0,
        photosAdded: 0,
        errors: 1,
      });

      await publish(QUEUES.SYNC_COMPLETE, completeMessage);
    }
  } finally {
    activeJobs--;
    abortControllers.delete(jobId);
  }
};

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Start the sync worker.
 */
export async function startSyncWorker(options: SyncWorkerOptions = {}): Promise<void> {
  if (isRunning) {
    console.warn('[SyncWorker] Worker already running');
    return;
  }

  const { concurrency = 5, consumerTagPrefix = 'sync-worker' } = options;

  console.log('[SyncWorker] Starting worker', {
    concurrency,
    queue: QUEUES.SYNC_JOBS.name,
  });

  isRunning = true;

  consumerTag = await consume<SyncJobMessage>(
    QUEUES.SYNC_JOBS,
    handleSyncJob,
    {
      prefetch: concurrency,
      consumerTag: `${consumerTagPrefix}-${Date.now()}`,
    }
  );

  console.log('[SyncWorker] Worker started', { consumerTag });
}

/**
 * Stop the sync worker gracefully.
 */
export async function stopSyncWorker(): Promise<void> {
  if (!isRunning) {
    console.warn('[SyncWorker] Worker not running');
    return;
  }

  console.log('[SyncWorker] Stopping worker...');

  isRunning = false;

  // Cancel all active jobs
  for (const [jobId, controller] of abortControllers) {
    console.log('[SyncWorker] Aborting active job', { jobId });
    controller.abort();
  }

  // Cancel consumer
  if (consumerTag) {
    await cancelConsumer(consumerTag);
    consumerTag = null;
  }

  // Wait for active jobs to finish (with timeout)
  const timeout = 30000;
  const startTime = Date.now();

  while (activeJobs > 0 && Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('[SyncWorker] Waiting for active jobs', { activeJobs });
  }

  if (activeJobs > 0) {
    console.warn('[SyncWorker] Force stopping with active jobs', { activeJobs });
  }

  console.log('[SyncWorker] Worker stopped');
}

/**
 * Get worker status.
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  activeJobs: number;
  consumerTag: string | null;
} {
  return {
    isRunning,
    activeJobs,
    consumerTag,
  };
}

/**
 * Cancel a specific job.
 */
export function cancelJob(jobId: string): boolean {
  const controller = abortControllers.get(jobId);

  if (controller) {
    controller.abort();
    return true;
  }

  return false;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  startSyncWorker,
  stopSyncWorker,
  getWorkerStatus,
  cancelJob,
};
