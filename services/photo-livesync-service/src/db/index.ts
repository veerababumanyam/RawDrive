/**
 * Database Module Exports.
 *
 * Re-exports all database functionality for convenient importing.
 *
 * @module db
 *
 * @example
 * ```ts
 * import { query, transaction, initialize, close } from './db/index.js';
 *
 * // Initialize on startup
 * await initialize();
 *
 * // Use in your code
 * const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
 *
 * // Close on shutdown
 * await close();
 * ```
 */

export {
  // Pool access
  getPool,

  // Query functions
  query,
  queryOne,
  queryAll,

  // Transaction support
  transaction,
  serializableTransaction,

  // Health checks
  checkHealth,
  isHealthy,

  // Lifecycle
  initialize,
  close,

  // Utilities
  getPoolStats,
  escapeIdentifier,
  buildInsert,
  buildUpdate,

  // Types
  type QueryOptions,
  type DatabaseHealthCheck,
  type TransactionCallback,
} from './connection.js';

// Default export for convenience
export { default as db } from './connection.js';

// ============================================================================
// Repositories
// ============================================================================

export * from './repositories/sync-job.repository.js';
export { default as SyncJobRepository } from './repositories/sync-job.repository.js';

export * from './repositories/photo-metadata.repository.js';
export { default as PhotoMetadataRepository } from './repositories/photo-metadata.repository.js';
