/**
 * Database constants shared across services.
 */

/**
 * Default connection pool settings.
 */
export const POOL_DEFAULTS = {
  /** Minimum connections in pool */
  MIN_SIZE: 2,
  /** Maximum connections in pool */
  MAX_SIZE: 20,
  /** Command timeout in seconds */
  COMMAND_TIMEOUT: 60,
  /** Maximum connection lifetime in seconds */
  MAX_INACTIVE_CONNECTION_LIFETIME: 1800,
  /** PgBouncer default port */
  PGBOUNCER_PORT: 6432,
  /** PgBouncer default host */
  PGBOUNCER_HOST: 'pgbouncer',
} as const;

/**
 * Default retry configuration.
 */
export const RETRY_DEFAULTS = {
  /** Maximum retry attempts */
  MAX_ATTEMPTS: 3,
  /** Initial delay in seconds */
  BASE_DELAY: 0.1,
  /** Maximum delay in seconds */
  MAX_DELAY: 5.0,
  /** Exponential backoff base */
  EXPONENTIAL_BASE: 2.0,
} as const;

/**
 * Transaction isolation levels.
 */
export const ISOLATION_LEVELS = {
  READ_COMMITTED: 'read_committed',
  REPEATABLE_READ: 'repeatable_read',
  SERIALIZABLE: 'serializable',
} as const;

/**
 * Soft delete filter options.
 */
export const SOFT_DELETE_FILTERS = {
  /** Only active (non-deleted) records */
  ACTIVE: 'active',
  /** Only deleted records */
  DELETED: 'deleted',
  /** All records regardless of deletion status */
  ALL: 'all',
} as const;
