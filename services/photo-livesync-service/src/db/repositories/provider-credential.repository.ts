/**
 * Provider Credential Repository.
 *
 * Provides CRUD operations for provider_credentials table with support for:
 * - Creating and updating OAuth credentials with encryption
 * - Token refresh management
 * - Finding credentials by user/provider
 * - Status management (active, expired, revoked, etc.)
 * - Secure credential handling with AES-256-GCM encryption
 *
 * SECURITY NOTE: Access tokens and refresh tokens are encrypted at rest.
 * The encryption key is loaded from environment variables.
 *
 * @module db/repositories/provider-credential.repository
 */

import type { PoolClient } from 'pg';
import { query, queryOne, queryAll, transaction } from '../connection.js';
import type { PaginatedResponse, PaginationParams } from '../../types.js';
import { Provider } from '../../types.js';
import {
  encrypt,
  decrypt,
  ENCRYPTION_ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from '../../utils/encryption.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Credential status enum matching database type.
 */
export enum CredentialStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  REFRESH_FAILED = 'refresh_failed',
  DISCONNECTED = 'disconnected',
}

/**
 * Database row type for provider_credentials table.
 */
interface ProviderCredentialRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string;
  provider_account_email: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_type: string;
  scope: string | null;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date | null;
  status: string;
  last_used_at: Date | null;
  last_error: CredentialError | null;
  sync_cursor: string | null;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Decrypted provider credential (domain object).
 */
export interface ProviderCredential {
  id: string;
  userId: string;
  provider: Provider;
  providerAccountId: string;
  providerAccountEmail?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope?: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
  status: CredentialStatus;
  lastUsedAt?: Date;
  lastError?: CredentialError;
  syncCursor?: string;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Error information stored with credentials.
 */
export interface CredentialError {
  code: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Input for creating new provider credentials.
 */
export interface CreateProviderCredentialInput {
  userId: string;
  provider: Provider;
  providerAccountId: string;
  providerAccountEmail?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
}

/**
 * Input for updating OAuth tokens.
 */
export interface UpdateTokensInput {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
  scope?: string;
}

/**
 * Input for updating credential status.
 */
export interface UpdateCredentialStatusInput {
  status: CredentialStatus;
  lastError?: CredentialError;
}

/**
 * Filters for querying credentials.
 */
export interface ProviderCredentialFilters {
  userId?: string;
  provider?: Provider;
  status?: CredentialStatus | CredentialStatus[];
  expiringBefore?: Date;
  notUsedSince?: Date;
}

/**
 * Sort options for credential queries.
 */
export interface ProviderCredentialSortOptions {
  field: 'created_at' | 'updated_at' | 'last_used_at' | 'last_sync_at' | 'access_token_expires_at';
  direction: 'asc' | 'desc';
}

// ============================================================================
// Row Mapping
// ============================================================================

/**
 * Map database row to ProviderCredential domain object with decryption.
 *
 * @param row - Database row
 * @returns Decrypted ProviderCredential
 */
function mapRowToCredential(row: ProviderCredentialRow): ProviderCredential {
  const credential: ProviderCredential = {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as Provider,
    providerAccountId: row.provider_account_id,
    accessToken: decrypt(row.access_token_encrypted),
    tokenType: row.token_type,
    accessTokenExpiresAt: row.access_token_expires_at,
    status: row.status as CredentialStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Only add optional properties if they have values
  if (row.provider_account_email !== null) {
    credential.providerAccountEmail = row.provider_account_email;
  }
  if (row.refresh_token_encrypted !== null) {
    credential.refreshToken = decrypt(row.refresh_token_encrypted);
  }
  if (row.scope !== null) {
    credential.scope = row.scope;
  }
  if (row.refresh_token_expires_at !== null) {
    credential.refreshTokenExpiresAt = row.refresh_token_expires_at;
  }
  if (row.last_used_at !== null) {
    credential.lastUsedAt = row.last_used_at;
  }
  if (row.last_error !== null) {
    credential.lastError = row.last_error;
  }
  if (row.sync_cursor !== null) {
    credential.syncCursor = row.sync_cursor;
  }
  if (row.last_sync_at !== null) {
    credential.lastSyncAt = row.last_sync_at;
  }

  return credential;
}

/**
 * Map database row to a summary without decrypting tokens.
 * Use this for listing credentials where tokens aren't needed.
 */
export interface ProviderCredentialSummary {
  id: string;
  userId: string;
  provider: Provider;
  providerAccountId: string;
  providerAccountEmail?: string;
  tokenType: string;
  scope?: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
  status: CredentialStatus;
  lastUsedAt?: Date;
  lastError?: CredentialError;
  syncCursor?: string;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToSummary(row: ProviderCredentialRow): ProviderCredentialSummary {
  const summary: ProviderCredentialSummary = {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as Provider,
    providerAccountId: row.provider_account_id,
    tokenType: row.token_type,
    accessTokenExpiresAt: row.access_token_expires_at,
    status: row.status as CredentialStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.provider_account_email !== null) {
    summary.providerAccountEmail = row.provider_account_email;
  }
  if (row.scope !== null) {
    summary.scope = row.scope;
  }
  if (row.refresh_token_expires_at !== null) {
    summary.refreshTokenExpiresAt = row.refresh_token_expires_at;
  }
  if (row.last_used_at !== null) {
    summary.lastUsedAt = row.last_used_at;
  }
  if (row.last_error !== null) {
    summary.lastError = row.last_error;
  }
  if (row.sync_cursor !== null) {
    summary.syncCursor = row.sync_cursor;
  }
  if (row.last_sync_at !== null) {
    summary.lastSyncAt = row.last_sync_at;
  }

  return summary;
}

// ============================================================================
// Create Operations
// ============================================================================

/**
 * Create or update provider credentials.
 *
 * Uses UPSERT to handle reconnection scenarios where user already has
 * credentials for a provider.
 *
 * @param input - Credential creation parameters
 * @returns The created/updated credential
 *
 * @example
 * ```ts
 * const credential = await upsertProviderCredential({
 *   userId: 'user-123',
 *   provider: Provider.GOOGLE_PHOTOS,
 *   providerAccountId: 'google-account-456',
 *   providerAccountEmail: 'user@gmail.com',
 *   accessToken: 'ya29.xxx',
 *   refreshToken: '1//xxx',
 *   accessTokenExpiresAt: new Date(Date.now() + 3600000),
 * });
 * ```
 */
export async function upsertProviderCredential(
  input: CreateProviderCredentialInput
): Promise<ProviderCredential> {
  const {
    userId,
    provider,
    providerAccountId,
    providerAccountEmail,
    accessToken,
    refreshToken,
    tokenType = 'Bearer',
    scope,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  } = input;

  // Encrypt tokens before storage
  const accessTokenEncrypted = encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;

  const result = await queryOne<ProviderCredentialRow>(
    `INSERT INTO provider_credentials (
       user_id, provider, provider_account_id, provider_account_email,
       access_token_encrypted, refresh_token_encrypted,
       token_type, scope, access_token_expires_at, refresh_token_expires_at,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       provider_account_email = EXCLUDED.provider_account_email,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_type = EXCLUDED.token_type,
       scope = EXCLUDED.scope,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       status = 'active',
       last_error = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      provider,
      providerAccountId,
      providerAccountEmail ?? null,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenType,
      scope ?? null,
      accessTokenExpiresAt,
      refreshTokenExpiresAt ?? null,
      CredentialStatus.ACTIVE,
    ]
  );

  if (!result) {
    throw new Error('Failed to upsert provider credential');
  }

  return mapRowToCredential(result);
}

/**
 * Create provider credentials within an existing transaction.
 *
 * @param client - PostgreSQL client from transaction
 * @param input - Credential creation parameters
 * @returns The created credential
 */
export async function upsertProviderCredentialWithClient(
  client: PoolClient,
  input: CreateProviderCredentialInput
): Promise<ProviderCredential> {
  const {
    userId,
    provider,
    providerAccountId,
    providerAccountEmail,
    accessToken,
    refreshToken,
    tokenType = 'Bearer',
    scope,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  } = input;

  const accessTokenEncrypted = encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;

  const result = await client.query<ProviderCredentialRow>(
    `INSERT INTO provider_credentials (
       user_id, provider, provider_account_id, provider_account_email,
       access_token_encrypted, refresh_token_encrypted,
       token_type, scope, access_token_expires_at, refresh_token_expires_at,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       provider_account_email = EXCLUDED.provider_account_email,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_type = EXCLUDED.token_type,
       scope = EXCLUDED.scope,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       status = 'active',
       last_error = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      provider,
      providerAccountId,
      providerAccountEmail ?? null,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenType,
      scope ?? null,
      accessTokenExpiresAt,
      refreshTokenExpiresAt ?? null,
      CredentialStatus.ACTIVE,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to upsert provider credential');
  }

  return mapRowToCredential(result.rows[0]);
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find credential by ID (with token decryption).
 *
 * @param id - Credential UUID
 * @returns The credential or null if not found
 */
export async function findCredentialById(id: string): Promise<ProviderCredential | null> {
  const row = await queryOne<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE id = $1',
    [id]
  );

  return row ? mapRowToCredential(row) : null;
}

/**
 * Find credential by ID with row locking for updates.
 *
 * @param client - PostgreSQL client from transaction
 * @param id - Credential UUID
 * @returns The credential or null if not found
 */
export async function findCredentialByIdForUpdate(
  client: PoolClient,
  id: string
): Promise<ProviderCredential | null> {
  const result = await client.query<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE id = $1 FOR UPDATE',
    [id]
  );

  return result.rows.length > 0 ? mapRowToCredential(result.rows[0]) : null;
}

/**
 * Find credential by user ID and provider.
 *
 * This is the most common lookup pattern for getting credentials
 * before making API calls.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns The credential or null if not found
 */
export async function findCredentialByUserAndProvider(
  userId: string,
  provider: Provider
): Promise<ProviderCredential | null> {
  const row = await queryOne<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );

  return row ? mapRowToCredential(row) : null;
}

/**
 * Find active credential by user and provider.
 *
 * Returns null if credential doesn't exist or isn't active.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns Active credential or null
 */
export async function findActiveCredential(
  userId: string,
  provider: Provider
): Promise<ProviderCredential | null> {
  const row = await queryOne<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials
     WHERE user_id = $1 AND provider = $2 AND status = $3`,
    [userId, provider, CredentialStatus.ACTIVE]
  );

  return row ? mapRowToCredential(row) : null;
}

/**
 * Find all credentials for a user (summary only, no token decryption).
 *
 * @param userId - User UUID
 * @returns List of credential summaries
 */
export async function findCredentialsByUserId(userId: string): Promise<ProviderCredentialSummary[]> {
  const rows = await queryAll<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials
     WHERE user_id = $1
     ORDER BY provider`,
    [userId]
  );

  return rows.map(mapRowToSummary);
}

/**
 * Find credentials with flexible filters (summary only).
 *
 * @param filters - Query filters
 * @param pagination - Pagination parameters
 * @param sort - Sort options
 * @returns Paginated credential summaries
 */
export async function findCredentials(
  filters: ProviderCredentialFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20 },
  sort: ProviderCredentialSortOptions = { field: 'created_at', direction: 'desc' }
): Promise<PaginatedResponse<ProviderCredentialSummary>> {
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

  if (filters.expiringBefore) {
    conditions.push(`access_token_expires_at < $${paramIndex++}`);
    params.push(filters.expiringBefore);
  }

  if (filters.notUsedSince) {
    conditions.push(`(last_used_at IS NULL OR last_used_at < $${paramIndex++})`);
    params.push(filters.notUsedSince);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM provider_credentials ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get paginated results
  const paginationParams = [...params, limit, offset];
  const rows = await queryAll<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials ${whereClause}
     ORDER BY ${sort.field} ${sort.direction}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    paginationParams
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapRowToSummary),
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
 * Find credentials that need token refresh.
 *
 * Returns active credentials where access token expires within the
 * specified threshold (default: 5 minutes).
 *
 * @param thresholdMinutes - Minutes before expiry to consider for refresh
 * @param limit - Maximum number to return
 * @returns Credentials needing refresh
 */
export async function findCredentialsNeedingRefresh(
  thresholdMinutes = 5,
  limit = 100
): Promise<ProviderCredential[]> {
  const rows = await queryAll<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials
     WHERE status = $1
       AND refresh_token_encrypted IS NOT NULL
       AND access_token_expires_at < NOW() + INTERVAL '${thresholdMinutes} minutes'
     ORDER BY access_token_expires_at ASC
     LIMIT $2`,
    [CredentialStatus.ACTIVE, limit]
  );

  return rows.map(mapRowToCredential);
}

/**
 * Find credentials with expired access tokens.
 *
 * @param limit - Maximum number to return
 * @returns Expired credentials
 */
export async function findExpiredCredentials(limit = 100): Promise<ProviderCredentialSummary[]> {
  const rows = await queryAll<ProviderCredentialRow>(
    `SELECT * FROM provider_credentials
     WHERE status = $1
       AND access_token_expires_at < NOW()
     ORDER BY access_token_expires_at ASC
     LIMIT $2`,
    [CredentialStatus.ACTIVE, limit]
  );

  return rows.map(mapRowToSummary);
}

/**
 * Check if a user has an active credential for a provider.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns True if active credential exists
 */
export async function hasActiveCredential(userId: string, provider: Provider): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM provider_credentials
       WHERE user_id = $1 AND provider = $2 AND status = $3
     ) as exists`,
    [userId, provider, CredentialStatus.ACTIVE]
  );

  return result?.exists ?? false;
}

/**
 * Get all connected providers for a user.
 *
 * @param userId - User UUID
 * @returns List of providers with active credentials
 */
export async function getConnectedProviders(userId: string): Promise<Provider[]> {
  const rows = await queryAll<{ provider: string }>(
    `SELECT provider FROM provider_credentials
     WHERE user_id = $1 AND status = $2
     ORDER BY provider`,
    [userId, CredentialStatus.ACTIVE]
  );

  return rows.map((row) => row.provider as Provider);
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update OAuth tokens after a refresh.
 *
 * @param id - Credential UUID
 * @param input - New token values
 * @returns Updated credential or null if not found
 */
export async function updateTokens(
  id: string,
  input: UpdateTokensInput
): Promise<ProviderCredential | null> {
  const { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope } = input;

  const accessTokenEncrypted = encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;

  const setClauses: string[] = [
    'access_token_encrypted = $2',
    'access_token_expires_at = $3',
    "status = 'active'",
    'last_error = NULL',
  ];
  const params: unknown[] = [id, accessTokenEncrypted, accessTokenExpiresAt];
  let paramIndex = 4;

  if (refreshTokenEncrypted !== null) {
    setClauses.push(`refresh_token_encrypted = $${paramIndex++}`);
    params.push(refreshTokenEncrypted);
  }

  if (refreshTokenExpiresAt !== undefined) {
    setClauses.push(`refresh_token_expires_at = $${paramIndex++}`);
    params.push(refreshTokenExpiresAt);
  }

  if (scope !== undefined) {
    setClauses.push(`scope = $${paramIndex++}`);
    params.push(scope);
  }

  const row = await queryOne<ProviderCredentialRow>(
    `UPDATE provider_credentials
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToCredential(row) : null;
}

/**
 * Update tokens within a transaction.
 *
 * @param client - PostgreSQL client from transaction
 * @param id - Credential UUID
 * @param input - New token values
 * @returns Updated credential or null if not found
 */
export async function updateTokensWithClient(
  client: PoolClient,
  id: string,
  input: UpdateTokensInput
): Promise<ProviderCredential | null> {
  const { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope } = input;

  const accessTokenEncrypted = encrypt(accessToken);
  const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;

  const setClauses: string[] = [
    'access_token_encrypted = $2',
    'access_token_expires_at = $3',
    "status = 'active'",
    'last_error = NULL',
  ];
  const params: unknown[] = [id, accessTokenEncrypted, accessTokenExpiresAt];
  let paramIndex = 4;

  if (refreshTokenEncrypted !== null) {
    setClauses.push(`refresh_token_encrypted = $${paramIndex++}`);
    params.push(refreshTokenEncrypted);
  }

  if (refreshTokenExpiresAt !== undefined) {
    setClauses.push(`refresh_token_expires_at = $${paramIndex++}`);
    params.push(refreshTokenExpiresAt);
  }

  if (scope !== undefined) {
    setClauses.push(`scope = $${paramIndex++}`);
    params.push(scope);
  }

  const result = await client.query<ProviderCredentialRow>(
    `UPDATE provider_credentials
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return result.rows.length > 0 ? mapRowToCredential(result.rows[0]) : null;
}

/**
 * Update credential status.
 *
 * @param id - Credential UUID
 * @param input - Status update parameters
 * @returns Updated credential summary or null if not found
 */
export async function updateCredentialStatus(
  id: string,
  input: UpdateCredentialStatusInput
): Promise<ProviderCredentialSummary | null> {
  const { status, lastError } = input;

  const setClauses: string[] = ['status = $2'];
  const params: unknown[] = [id, status];
  let paramIndex = 3;

  if (lastError !== undefined) {
    setClauses.push(`last_error = $${paramIndex++}`);
    params.push(JSON.stringify(lastError));
  }

  const row = await queryOne<ProviderCredentialRow>(
    `UPDATE provider_credentials
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToSummary(row) : null;
}

/**
 * Mark credential as used (update last_used_at timestamp).
 *
 * @param id - Credential UUID
 * @returns True if updated
 */
export async function markCredentialUsed(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE provider_credentials
     SET last_used_at = NOW()
     WHERE id = $1`,
    [id]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Update sync cursor after successful sync.
 *
 * @param id - Credential UUID
 * @param syncCursor - Provider-specific cursor/delta token
 * @returns True if updated
 */
export async function updateSyncCursor(id: string, syncCursor: string | null): Promise<boolean> {
  const result = await query(
    `UPDATE provider_credentials
     SET sync_cursor = $2, last_sync_at = NOW()
     WHERE id = $1`,
    [id, syncCursor]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark credential status as expired.
 *
 * @param id - Credential UUID
 * @returns Updated summary or null
 */
export async function markCredentialExpired(id: string): Promise<ProviderCredentialSummary | null> {
  return updateCredentialStatus(id, { status: CredentialStatus.EXPIRED });
}

/**
 * Mark credential status as revoked.
 *
 * @param id - Credential UUID
 * @param error - Optional error details
 * @returns Updated summary or null
 */
export async function markCredentialRevoked(
  id: string,
  error?: CredentialError
): Promise<ProviderCredentialSummary | null> {
  const input: UpdateCredentialStatusInput = {
    status: CredentialStatus.REVOKED,
  };

  if (error !== undefined) {
    input.lastError = error;
  }

  return updateCredentialStatus(id, input);
}

/**
 * Mark credential as refresh failed.
 *
 * @param id - Credential UUID
 * @param error - Error details
 * @returns Updated summary or null
 */
export async function markRefreshFailed(
  id: string,
  error: CredentialError
): Promise<ProviderCredentialSummary | null> {
  return updateCredentialStatus(id, {
    status: CredentialStatus.REFRESH_FAILED,
    lastError: error,
  });
}

/**
 * Disconnect a provider (mark as disconnected).
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns True if disconnected
 */
export async function disconnectProvider(userId: string, provider: Provider): Promise<boolean> {
  const result = await query(
    `UPDATE provider_credentials
     SET status = $3
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider, CredentialStatus.DISCONNECTED]
  );

  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a credential by ID.
 *
 * @param id - Credential UUID
 * @returns True if deleted
 */
export async function deleteCredential(id: string): Promise<boolean> {
  const result = await query('DELETE FROM provider_credentials WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete credential by user and provider.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @returns True if deleted
 */
export async function deleteCredentialByUserAndProvider(
  userId: string,
  provider: Provider
): Promise<boolean> {
  const result = await query(
    'DELETE FROM provider_credentials WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all credentials for a user.
 *
 * @param userId - User UUID
 * @returns Number of deleted credentials
 */
export async function deleteCredentialsByUserId(userId: string): Promise<number> {
  const result = await query('DELETE FROM provider_credentials WHERE user_id = $1', [userId]);
  return result.rowCount ?? 0;
}

/**
 * Delete credentials that have been disconnected for a long time.
 *
 * @param olderThan - Delete credentials disconnected before this date
 * @returns Number of deleted credentials
 */
export async function deleteOldDisconnectedCredentials(olderThan: Date): Promise<number> {
  const result = await query(
    `DELETE FROM provider_credentials
     WHERE status = $1 AND updated_at < $2`,
    [CredentialStatus.DISCONNECTED, olderThan]
  );
  return result.rowCount ?? 0;
}

// ============================================================================
// Aggregate Operations
// ============================================================================

/**
 * Get credential statistics for a user.
 *
 * @param userId - User UUID
 * @returns Credential statistics
 */
export async function getCredentialStats(userId: string): Promise<{
  total: number;
  active: number;
  expired: number;
  revoked: number;
  refreshFailed: number;
  disconnected: number;
}> {
  const result = await queryOne<{
    total: string;
    active: string;
    expired: string;
    revoked: string;
    refresh_failed: string;
    disconnected: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'active') as active,
       COUNT(*) FILTER (WHERE status = 'expired') as expired,
       COUNT(*) FILTER (WHERE status = 'revoked') as revoked,
       COUNT(*) FILTER (WHERE status = 'refresh_failed') as refresh_failed,
       COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected
     FROM provider_credentials
     WHERE user_id = $1`,
    [userId]
  );

  return {
    total: parseInt(result?.total ?? '0', 10),
    active: parseInt(result?.active ?? '0', 10),
    expired: parseInt(result?.expired ?? '0', 10),
    revoked: parseInt(result?.revoked ?? '0', 10),
    refreshFailed: parseInt(result?.refresh_failed ?? '0', 10),
    disconnected: parseInt(result?.disconnected ?? '0', 10),
  };
}

/**
 * Get provider-level statistics.
 *
 * @returns Statistics grouped by provider
 */
export async function getProviderStats(): Promise<
  Map<Provider, { total: number; active: number; expired: number }>
> {
  const rows = await queryAll<{
    provider: string;
    total: string;
    active: string;
    expired: string;
  }>(
    `SELECT
       provider,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'active') as active,
       COUNT(*) FILTER (WHERE status = 'expired') as expired
     FROM provider_credentials
     GROUP BY provider`
  );

  const stats = new Map<Provider, { total: number; active: number; expired: number }>();

  for (const row of rows) {
    stats.set(row.provider as Provider, {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      expired: parseInt(row.expired, 10),
    });
  }

  return stats;
}

// ============================================================================
// Transaction-Based Operations
// ============================================================================

/**
 * Refresh tokens atomically with optimistic locking.
 *
 * Prevents race conditions when multiple processes try to refresh
 * the same credential simultaneously.
 *
 * @param id - Credential UUID
 * @param refreshFn - Function that performs the actual OAuth refresh
 * @returns Refreshed credential or null if already refreshed/failed
 */
export async function refreshTokensAtomically(
  id: string,
  refreshFn: (credential: ProviderCredential) => Promise<UpdateTokensInput>
): Promise<ProviderCredential | null> {
  return transaction(async (client) => {
    // Lock the row and check if it still needs refresh
    const credential = await findCredentialByIdForUpdate(client, id);

    if (!credential) {
      return null;
    }

    // Check if already refreshed by another process
    if (credential.accessTokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      // Token is valid for more than 5 minutes, skip refresh
      return credential;
    }

    // Check if credential is in a state that allows refresh
    if (
      credential.status !== CredentialStatus.ACTIVE &&
      credential.status !== CredentialStatus.EXPIRED
    ) {
      return null;
    }

    // Perform the refresh
    const newTokens = await refreshFn(credential);

    // Update with new tokens
    return updateTokensWithClient(client, id, newTokens);
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Create
  upsertProviderCredential,
  upsertProviderCredentialWithClient,

  // Read
  findCredentialById,
  findCredentialByIdForUpdate,
  findCredentialByUserAndProvider,
  findActiveCredential,
  findCredentialsByUserId,
  findCredentials,
  findCredentialsNeedingRefresh,
  findExpiredCredentials,
  hasActiveCredential,
  getConnectedProviders,

  // Update
  updateTokens,
  updateTokensWithClient,
  updateCredentialStatus,
  markCredentialUsed,
  updateSyncCursor,
  markCredentialExpired,
  markCredentialRevoked,
  markRefreshFailed,
  disconnectProvider,

  // Delete
  deleteCredential,
  deleteCredentialByUserAndProvider,
  deleteCredentialsByUserId,
  deleteOldDisconnectedCredentials,

  // Aggregate
  getCredentialStats,
  getProviderStats,

  // Transaction-based
  refreshTokensAtomically,
};
