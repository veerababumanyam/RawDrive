/**
 * Sync Job Repository.
 *
 * Provides CRUD operations for sync_jobs table with support for:
 * - Creating new sync jobs
 * - Updating job status and progress
 * - Finding jobs by various criteria
 * - Paginated queries for job listing
 * - Concurrency control for active jobs
 *
 * @module db/repositories/sync-job.repository
 */

import type { PoolClient } from 'pg';
import { query, queryOne, queryAll, transaction } from '../connection.js';
import type {
  SyncJob,
  SyncProgress,
  SyncError,
  PaginatedResponse,
  PaginationParams,
} from '../../types.js';
import {
  SyncJobStatus,
  SyncType,
  Provider,
} from '../../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Database row type for sync_jobs table.
 */
interface SyncJobRow {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: string;
  type: string;
  status: string;
  progress: SyncProgress;
  error: SyncError | null;
  started_at: Date | null;
  completed_at: Date | null;
  last_checkpoint: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new sync job.
 */
export interface CreateSyncJobInput {
  userId: string;
  workspaceId: string;
  provider: Provider;
  type: SyncType;
}

/**
 * Input for updating sync job status.
 */
export interface UpdateSyncJobStatusInput {
  status: SyncJobStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: SyncError;
}

/**
 * Input for updating sync job progress.
 */
export interface UpdateSyncJobProgressInput {
  progress: Partial<SyncProgress>;
  lastCheckpoint?: string;
}

/**
 * Filters for querying sync jobs.
 */
export interface SyncJobFilters {
  userId?: string;
  workspaceId?: string;
  provider?: Provider;
  status?: SyncJobStatus | SyncJobStatus[];
  type?: SyncType;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Sort options for sync job queries.
 */
export interface SyncJobSortOptions {
  field: 'created_at' | 'updated_at' | 'started_at' | 'completed_at';
  direction: 'asc' | 'desc';
}

// ============================================================================
// Row Mapping
// ============================================================================

/**
 * Map database row to SyncJob domain object.
 */
function mapRowToSyncJob(row: SyncJobRow): SyncJob {
  const job: SyncJob = {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    provider: row.provider as Provider,
    type: row.type as SyncType,
    status: row.status as SyncJobStatus,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Only add optional properties if they have values
  // This ensures compatibility with exactOptionalPropertyTypes
  if (row.error !== null) {
    job.error = row.error;
  }
  if (row.started_at !== null) {
    job.startedAt = row.started_at;
  }
  if (row.completed_at !== null) {
    job.completedAt = row.completed_at;
  }
  if (row.last_checkpoint !== null) {
    job.lastCheckpoint = row.last_checkpoint;
  }

  return job;
}

// ============================================================================
// Create Operations
// ============================================================================

/**
 * Create a new sync job.
 *
 * @param input - Job creation parameters
 * @returns The created sync job
 *
 * @example
 * ```ts
 * const job = await createSyncJob({
 *   userId: 'user-123',
 *   workspaceId: 'workspace-456',
 *   provider: Provider.GOOGLE_PHOTOS,
 *   type: SyncType.FULL,
 * });
 * ```
 */
export async function createSyncJob(input: CreateSyncJobInput): Promise<SyncJob> {
  const { userId, workspaceId, provider, type } = input;

  const defaultProgress: SyncProgress = {
    totalPhotos: 0,
    processedPhotos: 0,
    skippedPhotos: 0,
    bytesDownloaded: 0,
    currentBatch: 0,
    totalBatches: 0,
  };

  const result = await queryOne<SyncJobRow>(
    `INSERT INTO sync_jobs (user_id, workspace_id, provider, type, status, progress)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, workspaceId, provider, type, SyncJobStatus.PENDING, JSON.stringify(defaultProgress)]
  );

  if (!result) {
    throw new Error('Failed to create sync job');
  }

  return mapRowToSyncJob(result);
}

/**
 * Create a sync job within an existing transaction.
 *
 * @param client - PostgreSQL client from transaction
 * @param input - Job creation parameters
 * @returns The created sync job
 */
export async function createSyncJobWithClient(
  client: PoolClient,
  input: CreateSyncJobInput
): Promise<SyncJob> {
  const { userId, workspaceId, provider, type } = input;

  const defaultProgress: SyncProgress = {
    totalPhotos: 0,
    processedPhotos: 0,
    skippedPhotos: 0,
    bytesDownloaded: 0,
    currentBatch: 0,
    totalBatches: 0,
  };

  const result = await client.query<SyncJobRow>(
    `INSERT INTO sync_jobs (user_id, workspace_id, provider, type, status, progress)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, workspaceId, provider, type, SyncJobStatus.PENDING, JSON.stringify(defaultProgress)]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create sync job');
  }

  return mapRowToSyncJob(result.rows[0]);
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find a sync job by ID.
 *
 * @param id - Sync job UUID
 * @returns The sync job or null if not found
 */
export async function findSyncJobById(id: string): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>('SELECT * FROM sync_jobs WHERE id = $1', [id]);

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Find a sync job by ID with row locking for updates.
 *
 * @param client - PostgreSQL client from transaction
 * @param id - Sync job UUID
 * @returns The sync job or null if not found
 */
export async function findSyncJobByIdForUpdate(
  client: PoolClient,
  id: string
): Promise<SyncJob | null> {
  const result = await client.query<SyncJobRow>(
    'SELECT * FROM sync_jobs WHERE id = $1 FOR UPDATE',
    [id]
  );

  return result.rows.length > 0 ? mapRowToSyncJob(result.rows[0]) : null;
}

/**
 * Find all sync jobs for a user.
 *
 * @param userId - User UUID
 * @param pagination - Pagination parameters
 * @param sort - Sort options (default: created_at desc)
 * @returns Paginated sync jobs
 */
export async function findSyncJobsByUserId(
  userId: string,
  pagination: PaginationParams = { page: 1, limit: 20 },
  sort: SyncJobSortOptions = { field: 'created_at', direction: 'desc' }
): Promise<PaginatedResponse<SyncJob>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM sync_jobs WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get paginated results
  const rows = await queryAll<SyncJobRow>(
    `SELECT * FROM sync_jobs
     WHERE user_id = $1
     ORDER BY ${sort.field} ${sort.direction}
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapRowToSyncJob),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Find sync jobs with flexible filters.
 *
 * @param filters - Query filters
 * @param pagination - Pagination parameters
 * @param sort - Sort options
 * @returns Paginated sync jobs matching filters
 */
export async function findSyncJobs(
  filters: SyncJobFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20 },
  sort: SyncJobSortOptions = { field: 'created_at', direction: 'desc' }
): Promise<PaginatedResponse<SyncJob>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Build WHERE clause dynamically
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }

  if (filters.workspaceId) {
    conditions.push(`workspace_id = $${paramIndex++}`);
    params.push(filters.workspaceId);
  }

  if (filters.provider) {
    conditions.push(`provider = $${paramIndex++}`);
    params.push(filters.provider);
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      const placeholders = filters.status.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`status IN (${placeholders})`);
      params.push(...filters.status);
    } else {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }
  }

  if (filters.type) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(filters.type);
  }

  if (filters.createdAfter) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.createdAfter);
  }

  if (filters.createdBefore) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.createdBefore);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM sync_jobs ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get paginated results
  const paginationParams = [...params, limit, offset];
  const rows = await queryAll<SyncJobRow>(
    `SELECT * FROM sync_jobs ${whereClause}
     ORDER BY ${sort.field} ${sort.direction}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    paginationParams
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapRowToSyncJob),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Find active sync jobs for a user and provider.
 *
 * Active jobs are those in pending, queued, running, or paused status.
 * Used for concurrency control to prevent multiple simultaneous syncs.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns Active sync jobs
 */
export async function findActiveSyncJobs(userId: string, provider: Provider): Promise<SyncJob[]> {
  const activeStatuses = [
    SyncJobStatus.PENDING,
    SyncJobStatus.QUEUED,
    SyncJobStatus.RUNNING,
    SyncJobStatus.PAUSED,
  ];

  const rows = await queryAll<SyncJobRow>(
    `SELECT * FROM sync_jobs
     WHERE user_id = $1 AND provider = $2 AND status = ANY($3::sync_job_status[])
     ORDER BY created_at DESC`,
    [userId, provider, activeStatuses]
  );

  return rows.map(mapRowToSyncJob);
}

/**
 * Check if user has an active sync job for a provider.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns True if an active job exists
 */
export async function hasActiveSyncJob(userId: string, provider: Provider): Promise<boolean> {
  const activeJobs = await findActiveSyncJobs(userId, provider);
  return activeJobs.length > 0;
}

/**
 * Find the most recent completed sync job for a user and provider.
 *
 * Used to get the checkpoint for incremental syncs.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns The most recent completed job or null
 */
export async function findLastCompletedSyncJob(
  userId: string,
  provider: Provider
): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `SELECT * FROM sync_jobs
     WHERE user_id = $1 AND provider = $2 AND status = $3
     ORDER BY completed_at DESC
     LIMIT 1`,
    [userId, provider, SyncJobStatus.COMPLETED]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Find pending jobs that need to be queued.
 *
 * @param limit - Maximum number of jobs to return
 * @returns Pending sync jobs
 */
export async function findPendingJobs(limit = 100): Promise<SyncJob[]> {
  const rows = await queryAll<SyncJobRow>(
    `SELECT * FROM sync_jobs
     WHERE status = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [SyncJobStatus.PENDING, limit]
  );

  return rows.map(mapRowToSyncJob);
}

/**
 * Find stale running jobs that may need recovery.
 *
 * Jobs are considered stale if they've been running without updates
 * for longer than the specified threshold.
 *
 * @param staleThresholdMinutes - Minutes without update to consider stale
 * @returns Stale running jobs
 */
export async function findStaleRunningJobs(staleThresholdMinutes = 30): Promise<SyncJob[]> {
  const rows = await queryAll<SyncJobRow>(
    `SELECT * FROM sync_jobs
     WHERE status = $1
     AND updated_at < NOW() - INTERVAL '${staleThresholdMinutes} minutes'
     ORDER BY updated_at ASC`,
    [SyncJobStatus.RUNNING]
  );

  return rows.map(mapRowToSyncJob);
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update sync job status.
 *
 * @param id - Sync job UUID
 * @param input - Status update parameters
 * @returns Updated sync job or null if not found
 */
export async function updateSyncJobStatus(
  id: string,
  input: UpdateSyncJobStatusInput
): Promise<SyncJob | null> {
  const { status, startedAt, completedAt, error } = input;

  const setClauses: string[] = ['status = $2'];
  const params: unknown[] = [id, status];
  let paramIndex = 3;

  if (startedAt !== undefined) {
    setClauses.push(`started_at = $${paramIndex++}`);
    params.push(startedAt);
  }

  if (completedAt !== undefined) {
    setClauses.push(`completed_at = $${paramIndex++}`);
    params.push(completedAt);
  }

  if (error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    params.push(JSON.stringify(error));
  }

  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Update sync job progress.
 *
 * @param id - Sync job UUID
 * @param input - Progress update parameters
 * @returns Updated sync job or null if not found
 */
export async function updateSyncJobProgress(
  id: string,
  input: UpdateSyncJobProgressInput
): Promise<SyncJob | null> {
  const { progress, lastCheckpoint } = input;

  // Build JSONB update for progress fields
  const progressUpdates = Object.entries(progress)
    .map(([key, value]) => {
      // Convert camelCase to JSON key format
      return `'${key}', ${typeof value === 'number' ? value : `'${value}'`}`;
    })
    .join(', ');

  const setClauses: string[] = [`progress = progress || jsonb_build_object(${progressUpdates})`];
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (lastCheckpoint !== undefined) {
    setClauses.push(`last_checkpoint = $${paramIndex++}`);
    params.push(lastCheckpoint);
  }

  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Increment progress counters atomically.
 *
 * @param id - Sync job UUID
 * @param increments - Counter increments
 * @returns Updated sync job or null if not found
 */
export async function incrementSyncJobProgress(
  id: string,
  increments: {
    processedPhotos?: number;
    skippedPhotos?: number;
    bytesDownloaded?: number;
  }
): Promise<SyncJob | null> {
  const { processedPhotos = 0, skippedPhotos = 0, bytesDownloaded = 0 } = increments;

  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET progress = jsonb_set(
       jsonb_set(
         jsonb_set(
           progress,
           '{processedPhotos}',
           to_jsonb((progress->>'processedPhotos')::int + $2)
         ),
         '{skippedPhotos}',
         to_jsonb((progress->>'skippedPhotos')::int + $3)
       ),
       '{bytesDownloaded}',
       to_jsonb((progress->>'bytesDownloaded')::bigint + $4)
     )
     WHERE id = $1
     RETURNING *`,
    [id, processedPhotos, skippedPhotos, bytesDownloaded]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Set total photos count when enumeration completes.
 *
 * @param id - Sync job UUID
 * @param totalPhotos - Total number of photos to sync
 * @param totalBatches - Total number of batches
 * @returns Updated sync job or null if not found
 */
export async function setSyncJobTotals(
  id: string,
  totalPhotos: number,
  totalBatches: number
): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET progress = progress || jsonb_build_object('totalPhotos', $2, 'totalBatches', $3)
     WHERE id = $1
     RETURNING *`,
    [id, totalPhotos, totalBatches]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Update current batch number.
 *
 * @param id - Sync job UUID
 * @param currentBatch - Current batch number
 * @returns Updated sync job or null if not found
 */
export async function updateCurrentBatch(
  id: string,
  currentBatch: number
): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET progress = progress || jsonb_build_object('currentBatch', $2)
     WHERE id = $1
     RETURNING *`,
    [id, currentBatch]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Mark a sync job as started.
 *
 * @param id - Sync job UUID
 * @returns Updated sync job or null if not found
 */
export async function markSyncJobStarted(id: string): Promise<SyncJob | null> {
  return updateSyncJobStatus(id, {
    status: SyncJobStatus.RUNNING,
    startedAt: new Date(),
  });
}

/**
 * Mark a sync job as completed.
 *
 * @param id - Sync job UUID
 * @returns Updated sync job or null if not found
 */
export async function markSyncJobCompleted(id: string): Promise<SyncJob | null> {
  return updateSyncJobStatus(id, {
    status: SyncJobStatus.COMPLETED,
    completedAt: new Date(),
  });
}

/**
 * Mark a sync job as failed.
 *
 * @param id - Sync job UUID
 * @param error - Error details
 * @returns Updated sync job or null if not found
 */
export async function markSyncJobFailed(id: string, error: SyncError): Promise<SyncJob | null> {
  return updateSyncJobStatus(id, {
    status: SyncJobStatus.FAILED,
    completedAt: new Date(),
    error,
  });
}

/**
 * Mark a sync job as cancelled.
 *
 * @param id - Sync job UUID
 * @returns Updated sync job or null if not found
 */
export async function markSyncJobCancelled(id: string): Promise<SyncJob | null> {
  return updateSyncJobStatus(id, {
    status: SyncJobStatus.CANCELLED,
    completedAt: new Date(),
  });
}

/**
 * Mark a sync job as paused.
 *
 * @param id - Sync job UUID
 * @param checkpoint - Current checkpoint for resumption
 * @returns Updated sync job or null if not found
 */
export async function markSyncJobPaused(
  id: string,
  checkpoint?: string
): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET status = $2, last_checkpoint = COALESCE($3, last_checkpoint)
     WHERE id = $1
     RETURNING *`,
    [id, SyncJobStatus.PAUSED, checkpoint ?? null]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Resume a paused sync job.
 *
 * @param id - Sync job UUID
 * @returns Updated sync job or null if not found
 */
export async function resumeSyncJob(id: string): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET status = $2
     WHERE id = $1 AND status = $3
     RETURNING *`,
    [id, SyncJobStatus.RUNNING, SyncJobStatus.PAUSED]
  );

  return row ? mapRowToSyncJob(row) : null;
}

/**
 * Transition job from pending to queued.
 *
 * @param id - Sync job UUID
 * @returns Updated sync job or null if not found/already queued
 */
export async function markSyncJobQueued(id: string): Promise<SyncJob | null> {
  const row = await queryOne<SyncJobRow>(
    `UPDATE sync_jobs
     SET status = $2
     WHERE id = $1 AND status = $3
     RETURNING *`,
    [id, SyncJobStatus.QUEUED, SyncJobStatus.PENDING]
  );

  return row ? mapRowToSyncJob(row) : null;
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a sync job by ID.
 *
 * @param id - Sync job UUID
 * @returns True if deleted, false if not found
 */
export async function deleteSyncJob(id: string): Promise<boolean> {
  const result = await query('DELETE FROM sync_jobs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all sync jobs for a user.
 *
 * @param userId - User UUID
 * @returns Number of deleted jobs
 */
export async function deleteSyncJobsByUserId(userId: string): Promise<number> {
  const result = await query('DELETE FROM sync_jobs WHERE user_id = $1', [userId]);
  return result.rowCount ?? 0;
}

/**
 * Delete completed jobs older than a certain date.
 *
 * Used for cleanup/archival of old job records.
 *
 * @param olderThan - Delete jobs completed before this date
 * @returns Number of deleted jobs
 */
export async function deleteOldCompletedJobs(olderThan: Date): Promise<number> {
  const result = await query(
    `DELETE FROM sync_jobs
     WHERE status IN ($1, $2, $3)
     AND completed_at < $4`,
    [SyncJobStatus.COMPLETED, SyncJobStatus.FAILED, SyncJobStatus.CANCELLED, olderThan]
  );
  return result.rowCount ?? 0;
}

// ============================================================================
// Aggregate Operations
// ============================================================================

/**
 * Get sync job statistics for a user.
 *
 * @param userId - User UUID
 * @returns Job statistics
 */
export async function getSyncJobStats(userId: string): Promise<{
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalPhotosProcessed: number;
  totalBytesDownloaded: number;
}> {
  const result = await queryOne<{
    total: string;
    pending: string;
    running: string;
    completed: string;
    failed: string;
    total_photos: string;
    total_bytes: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'running') as running,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COALESCE(SUM((progress->>'processedPhotos')::int), 0) as total_photos,
       COALESCE(SUM((progress->>'bytesDownloaded')::bigint), 0) as total_bytes
     FROM sync_jobs
     WHERE user_id = $1`,
    [userId]
  );

  return {
    total: parseInt(result?.total ?? '0', 10),
    pending: parseInt(result?.pending ?? '0', 10),
    running: parseInt(result?.running ?? '0', 10),
    completed: parseInt(result?.completed ?? '0', 10),
    failed: parseInt(result?.failed ?? '0', 10),
    totalPhotosProcessed: parseInt(result?.total_photos ?? '0', 10),
    totalBytesDownloaded: parseInt(result?.total_bytes ?? '0', 10),
  };
}

/**
 * Get statistics by provider for a user.
 *
 * @param userId - User UUID
 * @returns Statistics grouped by provider
 */
export async function getSyncJobStatsByProvider(
  userId: string
): Promise<Map<Provider, { jobCount: number; photosProcessed: number; lastSyncAt: Date | null }>> {
  const rows = await queryAll<{
    provider: string;
    job_count: string;
    photos_processed: string;
    last_sync_at: Date | null;
  }>(
    `SELECT
       provider,
       COUNT(*) as job_count,
       COALESCE(SUM((progress->>'processedPhotos')::int), 0) as photos_processed,
       MAX(completed_at) as last_sync_at
     FROM sync_jobs
     WHERE user_id = $1
     GROUP BY provider`,
    [userId]
  );

  const stats = new Map<
    Provider,
    { jobCount: number; photosProcessed: number; lastSyncAt: Date | null }
  >();

  for (const row of rows) {
    stats.set(row.provider as Provider, {
      jobCount: parseInt(row.job_count, 10),
      photosProcessed: parseInt(row.photos_processed, 10),
      lastSyncAt: row.last_sync_at,
    });
  }

  return stats;
}

// ============================================================================
// Transaction-Based Operations
// ============================================================================

/**
 * Create a sync job if no active job exists for the user/provider.
 *
 * Uses a transaction with row locking to prevent race conditions.
 *
 * @param input - Job creation parameters
 * @returns Created job or null if active job exists
 */
export async function createSyncJobIfNoActive(
  input: CreateSyncJobInput
): Promise<SyncJob | null> {
  return transaction(async (client) => {
    // Check for existing active jobs with row locking
    const activeCheck = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sync_jobs
       WHERE user_id = $1 AND provider = $2
       AND status IN ($3, $4, $5, $6)
       FOR UPDATE`,
      [
        input.userId,
        input.provider,
        SyncJobStatus.PENDING,
        SyncJobStatus.QUEUED,
        SyncJobStatus.RUNNING,
        SyncJobStatus.PAUSED,
      ]
    );

    if (parseInt(activeCheck.rows[0].count, 10) > 0) {
      return null;
    }

    // Create new job
    return createSyncJobWithClient(client, input);
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Create
  createSyncJob,
  createSyncJobWithClient,
  createSyncJobIfNoActive,

  // Read
  findSyncJobById,
  findSyncJobByIdForUpdate,
  findSyncJobsByUserId,
  findSyncJobs,
  findActiveSyncJobs,
  hasActiveSyncJob,
  findLastCompletedSyncJob,
  findPendingJobs,
  findStaleRunningJobs,

  // Update
  updateSyncJobStatus,
  updateSyncJobProgress,
  incrementSyncJobProgress,
  setSyncJobTotals,
  updateCurrentBatch,
  markSyncJobStarted,
  markSyncJobCompleted,
  markSyncJobFailed,
  markSyncJobCancelled,
  markSyncJobPaused,
  resumeSyncJob,
  markSyncJobQueued,

  // Delete
  deleteSyncJob,
  deleteSyncJobsByUserId,
  deleteOldCompletedJobs,

  // Aggregate
  getSyncJobStats,
  getSyncJobStatsByProvider,
};
