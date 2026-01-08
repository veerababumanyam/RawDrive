/**
 * Migration 001: Create sync_jobs table
 *
 * This table stores photo sync job metadata including status, progress,
 * and error information. Supports pause/resume through checkpoints.
 *
 * @see src/types.ts for TypeScript interface definitions
 */

import type { Pool } from 'pg';

export const name = '001_create_sync_jobs';
export const timestamp = '2024-01-01T00:00:01.000Z';

/**
 * Run the migration (up)
 */
export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create enum types for provider, sync type, and job status
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sync_provider AS ENUM (
          'google_photos',
          'dropbox',
          'onedrive',
          'amazon_photos',
          'icloud'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sync_type AS ENUM (
          'full',
          'incremental'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sync_job_status AS ENUM (
          'pending',
          'queued',
          'running',
          'paused',
          'completed',
          'failed',
          'cancelled'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create the sync_jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_jobs (
        -- Primary key (UUID v4)
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- User and workspace identification
        user_id UUID NOT NULL,
        workspace_id UUID NOT NULL,

        -- Job configuration
        provider sync_provider NOT NULL,
        type sync_type NOT NULL,
        status sync_job_status NOT NULL DEFAULT 'pending',

        -- Progress tracking (stored as JSONB for flexibility)
        progress JSONB NOT NULL DEFAULT '{
          "totalPhotos": 0,
          "processedPhotos": 0,
          "skippedPhotos": 0,
          "bytesDownloaded": 0,
          "currentBatch": 0,
          "totalBatches": 0
        }'::jsonb,

        -- Error information (null if no error)
        error JSONB DEFAULT NULL,

        -- Timestamps for job lifecycle
        started_at TIMESTAMPTZ DEFAULT NULL,
        completed_at TIMESTAMPTZ DEFAULT NULL,

        -- Checkpoint for resumable syncs (provider-specific cursor/token)
        last_checkpoint TEXT DEFAULT NULL,

        -- Record timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Constraints
        CONSTRAINT sync_jobs_progress_valid CHECK (
          jsonb_typeof(progress) = 'object'
          AND (progress->>'totalPhotos')::int >= 0
          AND (progress->>'processedPhotos')::int >= 0
          AND (progress->>'skippedPhotos')::int >= 0
          AND (progress->>'bytesDownloaded')::bigint >= 0
        ),
        CONSTRAINT sync_jobs_error_valid CHECK (
          error IS NULL OR (
            jsonb_typeof(error) = 'object'
            AND error ? 'code'
            AND error ? 'message'
            AND error ? 'retryable'
          )
        ),
        CONSTRAINT sync_jobs_completed_after_started CHECK (
          completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
        )
      );
    `);

    // Create indexes for common queries

    // Index for user's jobs (most common query pattern)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_id
        ON sync_jobs (user_id);
    `);

    // Index for workspace jobs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_workspace_id
        ON sync_jobs (workspace_id);
    `);

    // Composite index for user + provider queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_provider
        ON sync_jobs (user_id, provider);
    `);

    // Index for status-based queries (finding running/pending jobs)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
        ON sync_jobs (status)
        WHERE status IN ('pending', 'queued', 'running', 'paused');
    `);

    // Index for finding active jobs per user/provider (for concurrency control)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_active_user_provider
        ON sync_jobs (user_id, provider, status)
        WHERE status IN ('pending', 'queued', 'running', 'paused');
    `);

    // Index for cleanup/archival queries (by creation date)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at
        ON sync_jobs (created_at);
    `);

    // Index for finding recent completed jobs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_completed_at
        ON sync_jobs (completed_at)
        WHERE completed_at IS NOT NULL;
    `);

    // Create trigger function for updating updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_sync_jobs_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-update updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_sync_jobs_updated_at ON sync_jobs;
      CREATE TRIGGER trigger_sync_jobs_updated_at
        BEFORE UPDATE ON sync_jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_sync_jobs_updated_at();
    `);

    // Add table comment for documentation
    await client.query(`
      COMMENT ON TABLE sync_jobs IS 'Stores photo sync job metadata for cloud provider imports. Each job tracks the progress of importing photos from a connected provider.';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.id IS 'Unique identifier for the sync job (UUID v4)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.user_id IS 'Reference to the user who initiated the sync';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.workspace_id IS 'Reference to the workspace where photos will be imported';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.provider IS 'Cloud storage provider (google_photos, dropbox, etc.)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.type IS 'Type of sync: full (all photos) or incremental (changes only)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.status IS 'Current status of the sync job';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.progress IS 'JSONB object tracking sync progress (totalPhotos, processedPhotos, etc.)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.error IS 'JSONB object with error details if job failed (code, message, retryable)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.started_at IS 'Timestamp when job processing began';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.completed_at IS 'Timestamp when job finished (success or failure)';
    `);

    await client.query(`
      COMMENT ON COLUMN sync_jobs.last_checkpoint IS 'Provider-specific cursor/token for resumable syncs';
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rollback the migration (down)
 */
export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop trigger first
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_sync_jobs_updated_at ON sync_jobs;
    `);

    // Drop trigger function
    await client.query(`
      DROP FUNCTION IF EXISTS update_sync_jobs_updated_at();
    `);

    // Drop the table (cascades to indexes)
    await client.query(`
      DROP TABLE IF EXISTS sync_jobs CASCADE;
    `);

    // Note: We don't drop the enum types here because they may be used by other tables
    // (photo_metadata, provider_credentials). They will be dropped in the last migration rollback.

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Migration metadata
 */
export const metadata = {
  name,
  timestamp,
  description: 'Create sync_jobs table for storing photo sync job metadata',
  dependencies: [], // No dependencies for the first migration
};
