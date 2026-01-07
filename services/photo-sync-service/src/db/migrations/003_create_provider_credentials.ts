/**
 * Migration 003: Create provider_credentials table
 *
 * This table stores OAuth credentials for cloud storage providers.
 * Access tokens and refresh tokens are encrypted at rest using AES-256-GCM.
 *
 * @see src/types.ts for TypeScript interface definitions
 * @see src/utils/encryption.ts for credential encryption utilities
 */

import type { Pool } from 'pg';

export const name = '003_create_provider_credentials';
export const timestamp = '2024-01-01T00:00:03.000Z';

/**
 * Run the migration (up)
 */
export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create enum type for credential status
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE credential_status AS ENUM (
          'active',
          'expired',
          'revoked',
          'refresh_failed',
          'disconnected'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create the provider_credentials table
    await client.query(`
      CREATE TABLE IF NOT EXISTS provider_credentials (
        -- Primary key (UUID v4)
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- User identification
        user_id UUID NOT NULL,

        -- Provider information (uses sync_provider enum from migration 001)
        provider sync_provider NOT NULL,

        -- Provider account identifier (email or unique ID from provider)
        provider_account_id VARCHAR(512) NOT NULL,
        provider_account_email VARCHAR(320) DEFAULT NULL,

        -- Encrypted OAuth tokens (AES-256-GCM encrypted)
        -- These are stored as base64-encoded encrypted data with IV prefix
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT DEFAULT NULL,

        -- Token metadata
        token_type VARCHAR(64) NOT NULL DEFAULT 'Bearer',
        scope TEXT DEFAULT NULL,

        -- Token expiration
        access_token_expires_at TIMESTAMPTZ NOT NULL,
        refresh_token_expires_at TIMESTAMPTZ DEFAULT NULL,

        -- Credential status
        status credential_status NOT NULL DEFAULT 'active',

        -- Last successful API call (for health monitoring)
        last_used_at TIMESTAMPTZ DEFAULT NULL,
        last_error JSONB DEFAULT NULL,

        -- Sync state for incremental syncs (provider-specific cursor/delta token)
        sync_cursor TEXT DEFAULT NULL,
        last_sync_at TIMESTAMPTZ DEFAULT NULL,

        -- Record timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Constraints
        CONSTRAINT provider_credentials_token_type_valid CHECK (
          token_type IN ('Bearer', 'bearer', 'MAC', 'mac')
        ),
        CONSTRAINT provider_credentials_access_token_expires_valid CHECK (
          access_token_expires_at > '1970-01-01'::timestamptz
        ),
        CONSTRAINT provider_credentials_last_error_valid CHECK (
          last_error IS NULL OR (
            jsonb_typeof(last_error) = 'object'
            AND last_error ? 'code'
            AND last_error ? 'message'
            AND last_error ? 'timestamp'
          )
        ),
        CONSTRAINT provider_credentials_email_format CHECK (
          provider_account_email IS NULL OR
          provider_account_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        )
      );
    `);

    // Create indexes for common queries

    // Index for user's credentials (most common query pattern)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_user_id
        ON provider_credentials (user_id);
    `);

    // Unique index for user + provider (one connection per provider per user)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_credentials_user_provider
        ON provider_credentials (user_id, provider);
    `);

    // Index for provider-based queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider
        ON provider_credentials (provider);
    `);

    // Index for status-based queries (finding expired/revoked credentials)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_status
        ON provider_credentials (status)
        WHERE status != 'active';
    `);

    // Index for finding active credentials that need token refresh
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_expiring
        ON provider_credentials (access_token_expires_at)
        WHERE status = 'active';
    `);

    // Index for finding credentials by provider account
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_account
        ON provider_credentials (provider, provider_account_id);
    `);

    // Index for credentials needing sync (active credentials sorted by last sync)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_last_sync
        ON provider_credentials (last_sync_at NULLS FIRST)
        WHERE status = 'active';
    `);

    // Index for cleanup/archival queries (by creation date)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_credentials_created_at
        ON provider_credentials (created_at);
    `);

    // Create trigger function for updating updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_provider_credentials_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-update updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_provider_credentials_updated_at ON provider_credentials;
      CREATE TRIGGER trigger_provider_credentials_updated_at
        BEFORE UPDATE ON provider_credentials
        FOR EACH ROW
        EXECUTE FUNCTION update_provider_credentials_updated_at();
    `);

    // Add table comment for documentation
    await client.query(`
      COMMENT ON TABLE provider_credentials IS 'Stores encrypted OAuth credentials for cloud storage providers. Tokens are encrypted at rest using AES-256-GCM.';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.id IS 'Unique identifier for the credential record (UUID v4)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.user_id IS 'Reference to the user who owns these credentials';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.provider IS 'Cloud storage provider (google_photos, dropbox, etc.)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.provider_account_id IS 'Unique identifier of the account in the provider system';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.provider_account_email IS 'Email associated with the provider account (for display)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.access_token_encrypted IS 'AES-256-GCM encrypted access token (base64 encoded with IV prefix)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.refresh_token_encrypted IS 'AES-256-GCM encrypted refresh token (base64 encoded with IV prefix)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.token_type IS 'OAuth token type (typically Bearer)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.scope IS 'OAuth scopes granted by the provider';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.access_token_expires_at IS 'Expiration timestamp for the access token';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.refresh_token_expires_at IS 'Expiration timestamp for the refresh token (if applicable)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.status IS 'Current status of the credentials (active, expired, revoked, etc.)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.last_used_at IS 'Timestamp of the last successful API call using these credentials';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.last_error IS 'JSONB object with details of the last error (code, message, timestamp)';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.sync_cursor IS 'Provider-specific cursor/delta token for incremental syncs';
    `);

    await client.query(`
      COMMENT ON COLUMN provider_credentials.last_sync_at IS 'Timestamp of the last successful sync operation';
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
      DROP TRIGGER IF EXISTS trigger_provider_credentials_updated_at ON provider_credentials;
    `);

    // Drop trigger function
    await client.query(`
      DROP FUNCTION IF EXISTS update_provider_credentials_updated_at();
    `);

    // Drop the table (cascades to indexes)
    await client.query(`
      DROP TABLE IF EXISTS provider_credentials CASCADE;
    `);

    // Drop the enum type
    await client.query(`
      DROP TYPE IF EXISTS credential_status;
    `);

    // Note: We don't drop sync_provider enum here as it's defined in migration 001
    // and may be used by other tables (sync_jobs, photo_metadata)

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
  description: 'Create provider_credentials table for storing encrypted OAuth credentials',
  dependencies: ['001_create_sync_jobs'], // Depends on sync_provider enum from migration 001
};
