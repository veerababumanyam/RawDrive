/**
 * Migration 002: Create photo_metadata table
 *
 * This table stores metadata for photos imported from cloud providers.
 * Supports duplicate detection via SHA-256 hash and perceptual hash (pHash).
 *
 * @see src/types.ts for TypeScript interface definitions
 */

import type { Pool } from 'pg';

export const name = '002_create_photo_metadata';
export const timestamp = '2024-01-01T00:00:02.000Z';

/**
 * Run the migration (up)
 */
export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create enum type for photo status
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE photo_status AS ENUM (
          'pending',
          'downloading',
          'processing',
          'uploaded',
          'failed',
          'duplicate'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create the photo_metadata table
    await client.query(`
      CREATE TABLE IF NOT EXISTS photo_metadata (
        -- Primary key (UUID v4)
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Job reference (foreign key to sync_jobs)
        sync_job_id UUID NOT NULL,

        -- User and workspace identification
        user_id UUID NOT NULL,
        workspace_id UUID NOT NULL,

        -- Provider information
        provider sync_provider NOT NULL,
        source_id VARCHAR(512) NOT NULL,
        source_url TEXT NOT NULL,

        -- File information
        filename VARCHAR(512) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size_bytes BIGINT NOT NULL,
        width INTEGER DEFAULT NULL,
        height INTEGER DEFAULT NULL,

        -- Timestamp when photo was taken (from EXIF or provider metadata)
        taken_at TIMESTAMPTZ DEFAULT NULL,

        -- Deduplication hashes
        hash VARCHAR(64) NOT NULL,
        p_hash VARCHAR(64) DEFAULT NULL,

        -- EXIF metadata (stored as JSONB for flexibility)
        exif_data JSONB DEFAULT NULL,

        -- Storage location in R2/S3
        storage_path TEXT DEFAULT NULL,

        -- Processing status
        status photo_status NOT NULL DEFAULT 'pending',

        -- Error information for failed photos
        error JSONB DEFAULT NULL,

        -- Record timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Foreign key constraint
        CONSTRAINT fk_photo_metadata_sync_job
          FOREIGN KEY (sync_job_id)
          REFERENCES sync_jobs (id)
          ON DELETE CASCADE,

        -- Constraints
        CONSTRAINT photo_metadata_size_positive CHECK (size_bytes >= 0),
        CONSTRAINT photo_metadata_dimensions_positive CHECK (
          (width IS NULL OR width > 0) AND
          (height IS NULL OR height > 0)
        ),
        CONSTRAINT photo_metadata_hash_format CHECK (
          hash ~ '^[a-f0-9]{64}$'
        ),
        CONSTRAINT photo_metadata_p_hash_format CHECK (
          p_hash IS NULL OR p_hash ~ '^[a-f0-9]{16,64}$'
        ),
        CONSTRAINT photo_metadata_exif_valid CHECK (
          exif_data IS NULL OR jsonb_typeof(exif_data) = 'object'
        ),
        CONSTRAINT photo_metadata_error_valid CHECK (
          error IS NULL OR (
            jsonb_typeof(error) = 'object'
            AND error ? 'code'
            AND error ? 'message'
          )
        )
      );
    `);

    // Create indexes for common queries

    // Index for sync job's photos (most common query during sync)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_sync_job_id
        ON photo_metadata (sync_job_id);
    `);

    // Index for user's photos
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_user_id
        ON photo_metadata (user_id);
    `);

    // Index for workspace photos
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_workspace_id
        ON photo_metadata (workspace_id);
    `);

    // Index for hash-based duplicate detection (exact match)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_hash
        ON photo_metadata (hash);
    `);

    // Composite unique index for provider source deduplication
    // Prevents importing the same photo twice from the same provider
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_metadata_user_provider_source
        ON photo_metadata (user_id, provider, source_id);
    `);

    // Index for hash-based duplicate detection within user's library
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_user_hash
        ON photo_metadata (user_id, hash);
    `);

    // Index for perceptual hash similarity lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_p_hash
        ON photo_metadata (p_hash)
        WHERE p_hash IS NOT NULL;
    `);

    // Index for status-based queries (finding pending/processing photos)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_status
        ON photo_metadata (status)
        WHERE status IN ('pending', 'downloading', 'processing');
    `);

    // Index for photos by sync job and status (for progress tracking)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_job_status
        ON photo_metadata (sync_job_id, status);
    `);

    // Index for timeline queries (photos by taken_at date)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_taken_at
        ON photo_metadata (taken_at DESC)
        WHERE taken_at IS NOT NULL;
    `);

    // Index for user timeline queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_user_taken_at
        ON photo_metadata (user_id, taken_at DESC)
        WHERE taken_at IS NOT NULL;
    `);

    // Index for cleanup/archival queries (by creation date)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photo_metadata_created_at
        ON photo_metadata (created_at);
    `);

    // Create trigger function for updating updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_photo_metadata_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-update updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_photo_metadata_updated_at ON photo_metadata;
      CREATE TRIGGER trigger_photo_metadata_updated_at
        BEFORE UPDATE ON photo_metadata
        FOR EACH ROW
        EXECUTE FUNCTION update_photo_metadata_updated_at();
    `);

    // Add table comment for documentation
    await client.query(`
      COMMENT ON TABLE photo_metadata IS 'Stores metadata for photos imported from cloud providers. Includes EXIF data, hashes for deduplication, and storage location references.';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.id IS 'Unique identifier for the photo metadata record (UUID v4)';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.sync_job_id IS 'Reference to the sync job that imported this photo';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.user_id IS 'Reference to the user who owns this photo';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.workspace_id IS 'Reference to the workspace where the photo is stored';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.provider IS 'Cloud storage provider the photo was imported from';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.source_id IS 'Unique identifier of the photo in the source provider';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.source_url IS 'Original URL of the photo in the source provider';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.filename IS 'Original filename of the photo';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.mime_type IS 'MIME type of the photo (e.g., image/jpeg, image/png)';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.size_bytes IS 'File size in bytes';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.width IS 'Image width in pixels';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.height IS 'Image height in pixels';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.taken_at IS 'Timestamp when the photo was taken (from EXIF or provider metadata)';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.hash IS 'SHA-256 hash of the photo content for exact duplicate detection';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.p_hash IS 'Perceptual hash (pHash) for similarity detection';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.exif_data IS 'JSONB object containing extracted EXIF metadata';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.storage_path IS 'Path to the photo in R2/S3 storage';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.status IS 'Current processing status of the photo';
    `);

    await client.query(`
      COMMENT ON COLUMN photo_metadata.error IS 'JSONB object with error details if photo processing failed';
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
      DROP TRIGGER IF EXISTS trigger_photo_metadata_updated_at ON photo_metadata;
    `);

    // Drop trigger function
    await client.query(`
      DROP FUNCTION IF EXISTS update_photo_metadata_updated_at();
    `);

    // Drop the table (cascades to indexes)
    await client.query(`
      DROP TABLE IF EXISTS photo_metadata CASCADE;
    `);

    // Drop the enum type (only if no other tables use it)
    await client.query(`
      DROP TYPE IF EXISTS photo_status;
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
 * Migration metadata
 */
export const metadata = {
  name,
  timestamp,
  description: 'Create photo_metadata table for storing imported photo metadata with deduplication support',
  dependencies: ['001_create_sync_jobs'], // Depends on sync_jobs table for foreign key
};
