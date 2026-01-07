/**
 * Photo Metadata Repository.
 *
 * Provides CRUD operations for photo_metadata table with support for:
 * - Creating and updating photo metadata records
 * - Duplicate detection via SHA-256 hash and perceptual hash (pHash)
 * - Batch operations for efficient bulk inserts
 * - Finding photos by various criteria
 * - Progress tracking for sync jobs
 *
 * @module db/repositories/photo-metadata.repository
 */

import type { PoolClient } from 'pg';
import { query, queryOne, queryAll, transaction } from '../connection.js';
import type {
  PhotoMetadata,
  ExifData,
  SyncError,
  PaginatedResponse,
  PaginationParams,
} from '../../types.js';
import { PhotoStatus, Provider } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Database row type for photo_metadata table.
 */
interface PhotoMetadataRow {
  id: string;
  sync_job_id: string;
  user_id: string;
  workspace_id: string;
  provider: string;
  source_id: string;
  source_url: string;
  filename: string;
  mime_type: string;
  size_bytes: string; // BIGINT comes as string from pg
  width: number | null;
  height: number | null;
  taken_at: Date | null;
  hash: string;
  p_hash: string | null;
  exif_data: ExifData | null;
  storage_path: string | null;
  status: string;
  error: SyncError | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new photo metadata record.
 */
export interface CreatePhotoMetadataInput {
  syncJobId: string;
  userId: string;
  workspaceId: string;
  provider: Provider;
  sourceId: string;
  sourceUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  width?: number;
  height?: number;
  takenAt?: Date;
  pHash?: string;
  exifData?: ExifData;
}

/**
 * Input for updating photo metadata status.
 */
export interface UpdatePhotoStatusInput {
  status: PhotoStatus;
  storagePath?: string;
  error?: SyncError;
}

/**
 * Input for updating photo metadata details.
 */
export interface UpdatePhotoMetadataInput {
  width?: number;
  height?: number;
  takenAt?: Date;
  pHash?: string;
  exifData?: ExifData;
  storagePath?: string;
}

/**
 * Filters for querying photo metadata.
 */
export interface PhotoMetadataFilters {
  syncJobId?: string;
  userId?: string;
  workspaceId?: string;
  provider?: Provider;
  status?: PhotoStatus | PhotoStatus[];
  hash?: string;
  pHash?: string;
  takenAfter?: Date;
  takenBefore?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Sort options for photo metadata queries.
 */
export interface PhotoMetadataSortOptions {
  field: 'created_at' | 'updated_at' | 'taken_at' | 'filename' | 'size_bytes';
  direction: 'asc' | 'desc';
}

/**
 * Result of a duplicate check.
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingPhotoId?: string;
  matchType?: 'exact_hash' | 'source_id' | 'perceptual';
}

/**
 * Batch insert result.
 */
export interface BatchInsertResult {
  inserted: number;
  skipped: number;
  duplicateIds: string[];
}

// ============================================================================
// Row Mapping
// ============================================================================

/**
 * Map database row to PhotoMetadata domain object.
 */
function mapRowToPhotoMetadata(row: PhotoMetadataRow): PhotoMetadata {
  const photo: PhotoMetadata = {
    id: row.id,
    syncJobId: row.sync_job_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    provider: row.provider as Provider,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: parseInt(row.size_bytes, 10),
    hash: row.hash,
    storagePath: row.storage_path ?? '',
    status: row.status as PhotoStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Only add optional properties if they have values
  if (row.width !== null) {
    photo.width = row.width;
  }
  if (row.height !== null) {
    photo.height = row.height;
  }
  if (row.taken_at !== null) {
    photo.takenAt = row.taken_at;
  }
  if (row.p_hash !== null) {
    photo.pHash = row.p_hash;
  }
  if (row.exif_data !== null) {
    photo.exifData = row.exif_data;
  }

  return photo;
}

// ============================================================================
// Create Operations
// ============================================================================

/**
 * Create a new photo metadata record.
 *
 * @param input - Photo metadata creation parameters
 * @returns The created photo metadata
 *
 * @example
 * ```ts
 * const photo = await createPhotoMetadata({
 *   syncJobId: 'job-123',
 *   userId: 'user-456',
 *   workspaceId: 'workspace-789',
 *   provider: Provider.GOOGLE_PHOTOS,
 *   sourceId: 'google-photo-abc',
 *   sourceUrl: 'https://...',
 *   filename: 'IMG_1234.jpg',
 *   mimeType: 'image/jpeg',
 *   sizeBytes: 1024000,
 *   hash: 'sha256-hash',
 * });
 * ```
 */
export async function createPhotoMetadata(
  input: CreatePhotoMetadataInput
): Promise<PhotoMetadata> {
  const {
    syncJobId,
    userId,
    workspaceId,
    provider,
    sourceId,
    sourceUrl,
    filename,
    mimeType,
    sizeBytes,
    hash,
    width,
    height,
    takenAt,
    pHash,
    exifData,
  } = input;

  const result = await queryOne<PhotoMetadataRow>(
    `INSERT INTO photo_metadata (
       sync_job_id, user_id, workspace_id, provider, source_id, source_url,
       filename, mime_type, size_bytes, hash, width, height, taken_at, p_hash, exif_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      syncJobId,
      userId,
      workspaceId,
      provider,
      sourceId,
      sourceUrl,
      filename,
      mimeType,
      sizeBytes,
      hash,
      width ?? null,
      height ?? null,
      takenAt ?? null,
      pHash ?? null,
      exifData ? JSON.stringify(exifData) : null,
    ]
  );

  if (!result) {
    throw new Error('Failed to create photo metadata');
  }

  return mapRowToPhotoMetadata(result);
}

/**
 * Create a photo metadata record within an existing transaction.
 *
 * @param client - PostgreSQL client from transaction
 * @param input - Photo metadata creation parameters
 * @returns The created photo metadata
 */
export async function createPhotoMetadataWithClient(
  client: PoolClient,
  input: CreatePhotoMetadataInput
): Promise<PhotoMetadata> {
  const {
    syncJobId,
    userId,
    workspaceId,
    provider,
    sourceId,
    sourceUrl,
    filename,
    mimeType,
    sizeBytes,
    hash,
    width,
    height,
    takenAt,
    pHash,
    exifData,
  } = input;

  const result = await client.query<PhotoMetadataRow>(
    `INSERT INTO photo_metadata (
       sync_job_id, user_id, workspace_id, provider, source_id, source_url,
       filename, mime_type, size_bytes, hash, width, height, taken_at, p_hash, exif_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      syncJobId,
      userId,
      workspaceId,
      provider,
      sourceId,
      sourceUrl,
      filename,
      mimeType,
      sizeBytes,
      hash,
      width ?? null,
      height ?? null,
      takenAt ?? null,
      pHash ?? null,
      exifData ? JSON.stringify(exifData) : null,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create photo metadata');
  }

  return mapRowToPhotoMetadata(result.rows[0]);
}

/**
 * Create photo metadata only if it doesn't already exist (dedup check).
 *
 * Checks for duplicates by:
 * 1. Same user + provider + source_id (already imported from same source)
 * 2. Same user + exact hash (same content from any source)
 *
 * @param input - Photo metadata creation parameters
 * @returns Created photo or null if duplicate exists
 */
export async function createPhotoMetadataIfNotDuplicate(
  input: CreatePhotoMetadataInput
): Promise<{ photo: PhotoMetadata | null; duplicateInfo: DuplicateCheckResult }> {
  return transaction(async (client) => {
    // Check for existing photo by source ID (provider-specific duplicate)
    const sourceIdCheck = await client.query<{ id: string }>(
      `SELECT id FROM photo_metadata
       WHERE user_id = $1 AND provider = $2 AND source_id = $3
       LIMIT 1`,
      [input.userId, input.provider, input.sourceId]
    );

    if (sourceIdCheck.rows.length > 0) {
      return {
        photo: null,
        duplicateInfo: {
          isDuplicate: true,
          existingPhotoId: sourceIdCheck.rows[0].id,
          matchType: 'source_id',
        },
      };
    }

    // Check for existing photo by exact hash (content-based duplicate)
    const hashCheck = await client.query<{ id: string }>(
      `SELECT id FROM photo_metadata
       WHERE user_id = $1 AND hash = $2
       LIMIT 1`,
      [input.userId, input.hash]
    );

    if (hashCheck.rows.length > 0) {
      return {
        photo: null,
        duplicateInfo: {
          isDuplicate: true,
          existingPhotoId: hashCheck.rows[0].id,
          matchType: 'exact_hash',
        },
      };
    }

    // No duplicate found, create the photo
    const photo = await createPhotoMetadataWithClient(client, input);

    return {
      photo,
      duplicateInfo: {
        isDuplicate: false,
      },
    };
  });
}

/**
 * Batch insert photo metadata with duplicate detection.
 *
 * Uses ON CONFLICT to skip duplicates efficiently.
 *
 * @param photos - Array of photo metadata to insert
 * @returns Result with counts of inserted and skipped photos
 */
export async function batchCreatePhotoMetadata(
  photos: CreatePhotoMetadataInput[]
): Promise<BatchInsertResult> {
  if (photos.length === 0) {
    return { inserted: 0, skipped: 0, duplicateIds: [] };
  }

  return transaction(async (client) => {
    const duplicateIds: string[] = [];
    let inserted = 0;

    for (const photo of photos) {
      try {
        // Try to insert, skip if duplicate (based on unique constraint)
        const result = await client.query<PhotoMetadataRow>(
          `INSERT INTO photo_metadata (
             sync_job_id, user_id, workspace_id, provider, source_id, source_url,
             filename, mime_type, size_bytes, hash, width, height, taken_at, p_hash, exif_data
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (user_id, provider, source_id) DO NOTHING
           RETURNING id`,
          [
            photo.syncJobId,
            photo.userId,
            photo.workspaceId,
            photo.provider,
            photo.sourceId,
            photo.sourceUrl,
            photo.filename,
            photo.mimeType,
            photo.sizeBytes,
            photo.hash,
            photo.width ?? null,
            photo.height ?? null,
            photo.takenAt ?? null,
            photo.pHash ?? null,
            photo.exifData ? JSON.stringify(photo.exifData) : null,
          ]
        );

        if (result.rows.length > 0) {
          inserted++;
        } else {
          // Duplicate by source_id - fetch the existing ID
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM photo_metadata
             WHERE user_id = $1 AND provider = $2 AND source_id = $3`,
            [photo.userId, photo.provider, photo.sourceId]
          );
          if (existing.rows.length > 0) {
            duplicateIds.push(existing.rows[0].id);
          }
        }
      } catch {
        // If error due to other constraint, just skip
        duplicateIds.push('unknown');
      }
    }

    return {
      inserted,
      skipped: photos.length - inserted,
      duplicateIds,
    };
  });
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find a photo by ID.
 *
 * @param id - Photo metadata UUID
 * @returns The photo metadata or null if not found
 */
export async function findPhotoById(id: string): Promise<PhotoMetadata | null> {
  const row = await queryOne<PhotoMetadataRow>(
    'SELECT * FROM photo_metadata WHERE id = $1',
    [id]
  );

  return row ? mapRowToPhotoMetadata(row) : null;
}

/**
 * Find a photo by ID with row locking for updates.
 *
 * @param client - PostgreSQL client from transaction
 * @param id - Photo metadata UUID
 * @returns The photo metadata or null if not found
 */
export async function findPhotoByIdForUpdate(
  client: PoolClient,
  id: string
): Promise<PhotoMetadata | null> {
  const result = await client.query<PhotoMetadataRow>(
    'SELECT * FROM photo_metadata WHERE id = $1 FOR UPDATE',
    [id]
  );

  return result.rows.length > 0 ? mapRowToPhotoMetadata(result.rows[0]) : null;
}

/**
 * Find a photo by user, provider, and source ID.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @param sourceId - Source photo ID
 * @returns The photo metadata or null if not found
 */
export async function findPhotoBySourceId(
  userId: string,
  provider: Provider,
  sourceId: string
): Promise<PhotoMetadata | null> {
  const row = await queryOne<PhotoMetadataRow>(
    `SELECT * FROM photo_metadata
     WHERE user_id = $1 AND provider = $2 AND source_id = $3`,
    [userId, provider, sourceId]
  );

  return row ? mapRowToPhotoMetadata(row) : null;
}

/**
 * Find all photos for a sync job.
 *
 * @param syncJobId - Sync job UUID
 * @param pagination - Pagination parameters
 * @param sort - Sort options
 * @returns Paginated photos
 */
export async function findPhotosBySyncJobId(
  syncJobId: string,
  pagination: PaginationParams = { page: 1, limit: 100 },
  sort: PhotoMetadataSortOptions = { field: 'created_at', direction: 'asc' }
): Promise<PaginatedResponse<PhotoMetadata>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM photo_metadata WHERE sync_job_id = $1',
    [syncJobId]
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get paginated results
  const rows = await queryAll<PhotoMetadataRow>(
    `SELECT * FROM photo_metadata
     WHERE sync_job_id = $1
     ORDER BY ${sort.field} ${sort.direction}
     LIMIT $2 OFFSET $3`,
    [syncJobId, limit, offset]
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapRowToPhotoMetadata),
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
 * Find photos with flexible filters.
 *
 * @param filters - Query filters
 * @param pagination - Pagination parameters
 * @param sort - Sort options
 * @returns Paginated photos matching filters
 */
export async function findPhotos(
  filters: PhotoMetadataFilters = {},
  pagination: PaginationParams = { page: 1, limit: 100 },
  sort: PhotoMetadataSortOptions = { field: 'created_at', direction: 'desc' }
): Promise<PaginatedResponse<PhotoMetadata>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Build WHERE clause dynamically
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.syncJobId) {
    conditions.push(`sync_job_id = $${paramIndex++}`);
    params.push(filters.syncJobId);
  }

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

  if (filters.hash) {
    conditions.push(`hash = $${paramIndex++}`);
    params.push(filters.hash);
  }

  if (filters.pHash) {
    conditions.push(`p_hash = $${paramIndex++}`);
    params.push(filters.pHash);
  }

  if (filters.takenAfter) {
    conditions.push(`taken_at >= $${paramIndex++}`);
    params.push(filters.takenAfter);
  }

  if (filters.takenBefore) {
    conditions.push(`taken_at <= $${paramIndex++}`);
    params.push(filters.takenBefore);
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
    `SELECT COUNT(*) as count FROM photo_metadata ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  // Get paginated results
  const paginationParams = [...params, limit, offset];
  const rows = await queryAll<PhotoMetadataRow>(
    `SELECT * FROM photo_metadata ${whereClause}
     ORDER BY ${sort.field} ${sort.direction}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    paginationParams
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapRowToPhotoMetadata),
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
 * Find photos by status for a sync job.
 *
 * @param syncJobId - Sync job UUID
 * @param status - Photo status or array of statuses
 * @param limit - Maximum number of photos to return
 * @returns Photos matching the status filter
 */
export async function findPhotosByStatus(
  syncJobId: string,
  status: PhotoStatus | PhotoStatus[],
  limit = 100
): Promise<PhotoMetadata[]> {
  const statuses = Array.isArray(status) ? status : [status];

  const rows = await queryAll<PhotoMetadataRow>(
    `SELECT * FROM photo_metadata
     WHERE sync_job_id = $1 AND status = ANY($2::photo_status[])
     ORDER BY created_at ASC
     LIMIT $3`,
    [syncJobId, statuses, limit]
  );

  return rows.map(mapRowToPhotoMetadata);
}

/**
 * Find pending photos for processing.
 *
 * @param limit - Maximum number of photos to return
 * @returns Pending photos
 */
export async function findPendingPhotos(limit = 100): Promise<PhotoMetadata[]> {
  const rows = await queryAll<PhotoMetadataRow>(
    `SELECT * FROM photo_metadata
     WHERE status = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [PhotoStatus.PENDING, limit]
  );

  return rows.map(mapRowToPhotoMetadata);
}

// ============================================================================
// Duplicate Detection Queries
// ============================================================================

/**
 * Check if a photo is a duplicate by SHA-256 hash.
 *
 * @param userId - User UUID
 * @param hash - SHA-256 hash of the photo
 * @returns Duplicate check result
 */
export async function checkDuplicateByHash(
  userId: string,
  hash: string
): Promise<DuplicateCheckResult> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM photo_metadata
     WHERE user_id = $1 AND hash = $2
     LIMIT 1`,
    [userId, hash]
  );

  if (row) {
    return {
      isDuplicate: true,
      existingPhotoId: row.id,
      matchType: 'exact_hash',
    };
  }

  return { isDuplicate: false };
}

/**
 * Check if a photo already exists from the same source.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @param sourceId - Source photo ID
 * @returns Duplicate check result
 */
export async function checkDuplicateBySourceId(
  userId: string,
  provider: Provider,
  sourceId: string
): Promise<DuplicateCheckResult> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM photo_metadata
     WHERE user_id = $1 AND provider = $2 AND source_id = $3
     LIMIT 1`,
    [userId, provider, sourceId]
  );

  if (row) {
    return {
      isDuplicate: true,
      existingPhotoId: row.id,
      matchType: 'source_id',
    };
  }

  return { isDuplicate: false };
}

/**
 * Find photos with similar perceptual hash.
 *
 * Uses hamming distance for similarity comparison.
 * Note: For production, consider using pg_similarity or a specialized index.
 *
 * @param userId - User UUID
 * @param pHash - Perceptual hash to compare
 * @param maxDistance - Maximum hamming distance (default: 10 for ~84% similarity)
 * @param limit - Maximum results to return
 * @returns Similar photos
 */
export async function findSimilarByPHash(
  userId: string,
  pHash: string,
  maxDistance = 10,
  limit = 10
): Promise<PhotoMetadata[]> {
  // PostgreSQL function to calculate hamming distance between two hex strings
  // This is a simple approach - for production, use specialized extensions
  const rows = await queryAll<PhotoMetadataRow>(
    `SELECT *,
       (
         SELECT COUNT(*)
         FROM generate_series(1, LENGTH($2))
         WHERE SUBSTRING($2::text, generate_series, 1) !=
               SUBSTRING(p_hash::text, generate_series, 1)
       ) as distance
     FROM photo_metadata
     WHERE user_id = $1
       AND p_hash IS NOT NULL
       AND LENGTH(p_hash) = LENGTH($2)
     HAVING (
       SELECT COUNT(*)
       FROM generate_series(1, LENGTH($2))
       WHERE SUBSTRING($2::text, generate_series, 1) !=
             SUBSTRING(p_hash::text, generate_series, 1)
     ) <= $3
     ORDER BY distance ASC
     LIMIT $4`,
    [userId, pHash, maxDistance, limit]
  );

  return rows.map(mapRowToPhotoMetadata);
}

/**
 * Check for any type of duplicate.
 *
 * Performs multiple checks in order of priority:
 * 1. Source ID match (same photo from same provider)
 * 2. Exact hash match (identical content)
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @param sourceId - Source photo ID
 * @param hash - SHA-256 hash
 * @returns Duplicate check result
 */
export async function checkDuplicate(
  userId: string,
  provider: Provider,
  sourceId: string,
  hash: string
): Promise<DuplicateCheckResult> {
  // First check by source ID (fastest, most specific)
  const sourceCheck = await checkDuplicateBySourceId(userId, provider, sourceId);
  if (sourceCheck.isDuplicate) {
    return sourceCheck;
  }

  // Then check by hash (content-based)
  const hashCheck = await checkDuplicateByHash(userId, hash);
  if (hashCheck.isDuplicate) {
    return hashCheck;
  }

  return { isDuplicate: false };
}

/**
 * Batch check for duplicates by hashes.
 *
 * Efficiently checks multiple hashes at once.
 *
 * @param userId - User UUID
 * @param hashes - Array of SHA-256 hashes to check
 * @returns Map of hash to existing photo ID (only for duplicates)
 */
export async function batchCheckDuplicatesByHash(
  userId: string,
  hashes: string[]
): Promise<Map<string, string>> {
  if (hashes.length === 0) {
    return new Map();
  }

  const rows = await queryAll<{ hash: string; id: string }>(
    `SELECT hash, id FROM photo_metadata
     WHERE user_id = $1 AND hash = ANY($2)`,
    [userId, hashes]
  );

  const duplicateMap = new Map<string, string>();
  for (const row of rows) {
    duplicateMap.set(row.hash, row.id);
  }

  return duplicateMap;
}

/**
 * Batch check for duplicates by source IDs.
 *
 * @param userId - User UUID
 * @param provider - Cloud provider
 * @param sourceIds - Array of source IDs to check
 * @returns Map of source ID to existing photo ID (only for duplicates)
 */
export async function batchCheckDuplicatesBySourceId(
  userId: string,
  provider: Provider,
  sourceIds: string[]
): Promise<Map<string, string>> {
  if (sourceIds.length === 0) {
    return new Map();
  }

  const rows = await queryAll<{ source_id: string; id: string }>(
    `SELECT source_id, id FROM photo_metadata
     WHERE user_id = $1 AND provider = $2 AND source_id = ANY($3)`,
    [userId, provider, sourceIds]
  );

  const duplicateMap = new Map<string, string>();
  for (const row of rows) {
    duplicateMap.set(row.source_id, row.id);
  }

  return duplicateMap;
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update photo status.
 *
 * @param id - Photo metadata UUID
 * @param input - Status update parameters
 * @returns Updated photo or null if not found
 */
export async function updatePhotoStatus(
  id: string,
  input: UpdatePhotoStatusInput
): Promise<PhotoMetadata | null> {
  const { status, storagePath, error } = input;

  const setClauses: string[] = ['status = $2'];
  const params: unknown[] = [id, status];
  let paramIndex = 3;

  if (storagePath !== undefined) {
    setClauses.push(`storage_path = $${paramIndex++}`);
    params.push(storagePath);
  }

  if (error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    params.push(JSON.stringify(error));
  }

  const row = await queryOne<PhotoMetadataRow>(
    `UPDATE photo_metadata
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToPhotoMetadata(row) : null;
}

/**
 * Update photo metadata details.
 *
 * @param id - Photo metadata UUID
 * @param input - Metadata update parameters
 * @returns Updated photo or null if not found
 */
export async function updatePhotoMetadata(
  id: string,
  input: UpdatePhotoMetadataInput
): Promise<PhotoMetadata | null> {
  const { width, height, takenAt, pHash, exifData, storagePath } = input;

  const setClauses: string[] = [];
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (width !== undefined) {
    setClauses.push(`width = $${paramIndex++}`);
    params.push(width);
  }

  if (height !== undefined) {
    setClauses.push(`height = $${paramIndex++}`);
    params.push(height);
  }

  if (takenAt !== undefined) {
    setClauses.push(`taken_at = $${paramIndex++}`);
    params.push(takenAt);
  }

  if (pHash !== undefined) {
    setClauses.push(`p_hash = $${paramIndex++}`);
    params.push(pHash);
  }

  if (exifData !== undefined) {
    setClauses.push(`exif_data = $${paramIndex++}`);
    params.push(JSON.stringify(exifData));
  }

  if (storagePath !== undefined) {
    setClauses.push(`storage_path = $${paramIndex++}`);
    params.push(storagePath);
  }

  if (setClauses.length === 0) {
    return findPhotoById(id);
  }

  const row = await queryOne<PhotoMetadataRow>(
    `UPDATE photo_metadata
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return row ? mapRowToPhotoMetadata(row) : null;
}

/**
 * Mark a photo as uploaded successfully.
 *
 * @param id - Photo metadata UUID
 * @param storagePath - Path in R2/S3 storage
 * @returns Updated photo or null if not found
 */
export async function markPhotoUploaded(
  id: string,
  storagePath: string
): Promise<PhotoMetadata | null> {
  return updatePhotoStatus(id, {
    status: PhotoStatus.UPLOADED,
    storagePath,
  });
}

/**
 * Mark a photo as failed.
 *
 * @param id - Photo metadata UUID
 * @param error - Error details
 * @returns Updated photo or null if not found
 */
export async function markPhotoFailed(
  id: string,
  error: SyncError
): Promise<PhotoMetadata | null> {
  return updatePhotoStatus(id, {
    status: PhotoStatus.FAILED,
    error,
  });
}

/**
 * Mark a photo as duplicate.
 *
 * @param id - Photo metadata UUID
 * @returns Updated photo or null if not found
 */
export async function markPhotoDuplicate(id: string): Promise<PhotoMetadata | null> {
  return updatePhotoStatus(id, {
    status: PhotoStatus.DUPLICATE,
  });
}

/**
 * Batch update photo statuses.
 *
 * @param ids - Array of photo metadata UUIDs
 * @param status - New status
 * @returns Number of updated photos
 */
export async function batchUpdatePhotoStatus(
  ids: string[],
  status: PhotoStatus
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const result = await query(
    `UPDATE photo_metadata
     SET status = $1
     WHERE id = ANY($2)`,
    [status, ids]
  );

  return result.rowCount ?? 0;
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a photo by ID.
 *
 * @param id - Photo metadata UUID
 * @returns True if deleted, false if not found
 */
export async function deletePhoto(id: string): Promise<boolean> {
  const result = await query('DELETE FROM photo_metadata WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all photos for a sync job.
 *
 * @param syncJobId - Sync job UUID
 * @returns Number of deleted photos
 */
export async function deletePhotosBySyncJobId(syncJobId: string): Promise<number> {
  const result = await query('DELETE FROM photo_metadata WHERE sync_job_id = $1', [
    syncJobId,
  ]);
  return result.rowCount ?? 0;
}

/**
 * Delete all photos for a user.
 *
 * @param userId - User UUID
 * @returns Number of deleted photos
 */
export async function deletePhotosByUserId(userId: string): Promise<number> {
  const result = await query('DELETE FROM photo_metadata WHERE user_id = $1', [userId]);
  return result.rowCount ?? 0;
}

/**
 * Delete failed photos older than a certain date.
 *
 * @param olderThan - Delete photos created before this date
 * @returns Number of deleted photos
 */
export async function deleteOldFailedPhotos(olderThan: Date): Promise<number> {
  const result = await query(
    `DELETE FROM photo_metadata
     WHERE status = $1 AND created_at < $2`,
    [PhotoStatus.FAILED, olderThan]
  );
  return result.rowCount ?? 0;
}

// ============================================================================
// Aggregate Operations
// ============================================================================

/**
 * Get photo statistics for a sync job.
 *
 * @param syncJobId - Sync job UUID
 * @returns Photo statistics
 */
export async function getPhotoStatsBySyncJob(syncJobId: string): Promise<{
  total: number;
  pending: number;
  downloading: number;
  processing: number;
  uploaded: number;
  failed: number;
  duplicate: number;
  totalBytes: number;
}> {
  const result = await queryOne<{
    total: string;
    pending: string;
    downloading: string;
    processing: string;
    uploaded: string;
    failed: string;
    duplicate: string;
    total_bytes: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'downloading') as downloading,
       COUNT(*) FILTER (WHERE status = 'processing') as processing,
       COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status = 'duplicate') as duplicate,
       COALESCE(SUM(size_bytes), 0) as total_bytes
     FROM photo_metadata
     WHERE sync_job_id = $1`,
    [syncJobId]
  );

  return {
    total: parseInt(result?.total ?? '0', 10),
    pending: parseInt(result?.pending ?? '0', 10),
    downloading: parseInt(result?.downloading ?? '0', 10),
    processing: parseInt(result?.processing ?? '0', 10),
    uploaded: parseInt(result?.uploaded ?? '0', 10),
    failed: parseInt(result?.failed ?? '0', 10),
    duplicate: parseInt(result?.duplicate ?? '0', 10),
    totalBytes: parseInt(result?.total_bytes ?? '0', 10),
  };
}

/**
 * Get photo statistics for a user.
 *
 * @param userId - User UUID
 * @returns Photo statistics
 */
export async function getPhotoStatsByUser(userId: string): Promise<{
  total: number;
  totalBytes: number;
  byProvider: Map<Provider, { count: number; bytes: number }>;
}> {
  // Overall stats
  const overallResult = await queryOne<{
    total: string;
    total_bytes: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COALESCE(SUM(size_bytes), 0) as total_bytes
     FROM photo_metadata
     WHERE user_id = $1 AND status = $2`,
    [userId, PhotoStatus.UPLOADED]
  );

  // Stats by provider
  const providerRows = await queryAll<{
    provider: string;
    count: string;
    bytes: string;
  }>(
    `SELECT
       provider,
       COUNT(*) as count,
       COALESCE(SUM(size_bytes), 0) as bytes
     FROM photo_metadata
     WHERE user_id = $1 AND status = $2
     GROUP BY provider`,
    [userId, PhotoStatus.UPLOADED]
  );

  const byProvider = new Map<Provider, { count: number; bytes: number }>();
  for (const row of providerRows) {
    byProvider.set(row.provider as Provider, {
      count: parseInt(row.count, 10),
      bytes: parseInt(row.bytes, 10),
    });
  }

  return {
    total: parseInt(overallResult?.total ?? '0', 10),
    totalBytes: parseInt(overallResult?.total_bytes ?? '0', 10),
    byProvider,
  };
}

/**
 * Count photos by status for a sync job.
 *
 * @param syncJobId - Sync job UUID
 * @returns Map of status to count
 */
export async function countPhotosByStatus(
  syncJobId: string
): Promise<Map<PhotoStatus, number>> {
  const rows = await queryAll<{
    status: string;
    count: string;
  }>(
    `SELECT status, COUNT(*) as count
     FROM photo_metadata
     WHERE sync_job_id = $1
     GROUP BY status`,
    [syncJobId]
  );

  const counts = new Map<PhotoStatus, number>();
  for (const row of rows) {
    counts.set(row.status as PhotoStatus, parseInt(row.count, 10));
  }

  return counts;
}

/**
 * Get total duplicate count for a user.
 *
 * @param userId - User UUID
 * @returns Number of duplicate photos
 */
export async function getDuplicateCount(userId: string): Promise<number> {
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM photo_metadata
     WHERE user_id = $1 AND status = $2`,
    [userId, PhotoStatus.DUPLICATE]
  );

  return parseInt(result?.count ?? '0', 10);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Create
  createPhotoMetadata,
  createPhotoMetadataWithClient,
  createPhotoMetadataIfNotDuplicate,
  batchCreatePhotoMetadata,

  // Read
  findPhotoById,
  findPhotoByIdForUpdate,
  findPhotoBySourceId,
  findPhotosBySyncJobId,
  findPhotos,
  findPhotosByStatus,
  findPendingPhotos,

  // Duplicate Detection
  checkDuplicateByHash,
  checkDuplicateBySourceId,
  findSimilarByPHash,
  checkDuplicate,
  batchCheckDuplicatesByHash,
  batchCheckDuplicatesBySourceId,

  // Update
  updatePhotoStatus,
  updatePhotoMetadata,
  markPhotoUploaded,
  markPhotoFailed,
  markPhotoDuplicate,
  batchUpdatePhotoStatus,

  // Delete
  deletePhoto,
  deletePhotosBySyncJobId,
  deletePhotosByUserId,
  deleteOldFailedPhotos,

  // Aggregate
  getPhotoStatsBySyncJob,
  getPhotoStatsByUser,
  countPhotosByStatus,
  getDuplicateCount,
};
