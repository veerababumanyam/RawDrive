/**
 * Type definitions for database utilities.
 */

/**
 * PostgreSQL transaction isolation levels.
 */
export type IsolationLevel = 'read_committed' | 'repeatable_read' | 'serializable';

/**
 * Connection pool statistics.
 */
export interface PoolStats {
  /** Total connections in the pool */
  size: number;
  /** Available connections */
  free_size: number;
  /** Connections currently in use */
  used_size: number;
  /** Minimum pool size */
  min_size: number;
  /** Maximum pool size */
  max_size: number;
  /** Pool utilization percentage */
  utilization_percent: number;
}

/**
 * Configuration for database connection pooling.
 */
export interface PoolConfig {
  /** Database connection URL */
  database_url: string;
  /** Minimum number of connections */
  min_size?: number;
  /** Maximum number of connections */
  max_size?: number;
  /** Command timeout in seconds */
  command_timeout?: number;
  /** Maximum connection lifetime in seconds */
  max_inactive_connection_lifetime?: number;
  /** Enable PgBouncer routing */
  pgbouncer_enabled?: boolean;
  /** PgBouncer host */
  pgbouncer_host?: string;
  /** PgBouncer port */
  pgbouncer_port?: number;
  /** Disable statement caching (required for PgBouncer transaction mode) */
  statement_cache_size?: number;
}

/**
 * Configuration for retry logic.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  max_attempts: number;
  /** Initial delay between retries in seconds */
  base_delay: number;
  /** Maximum delay between retries in seconds */
  max_delay: number;
  /** Base for exponential backoff calculation */
  exponential_base: number;
}

/**
 * Soft delete filter options.
 */
export type SoftDeleteFilter = 'active' | 'deleted' | 'all';

/**
 * Workspace-scoped query parameters.
 */
export interface WorkspaceQueryParams {
  /** Workspace ID for multi-tenant isolation */
  workspace_id: string;
  /** Soft delete filter */
  soft_delete_filter?: SoftDeleteFilter;
  /** Additional WHERE conditions */
  additional_conditions?: string[];
}

/**
 * Pagination query parameters.
 */
export interface PaginationQueryParams {
  /** Page number (1-based) */
  page: number;
  /** Items per page */
  limit: number;
  /** Order by column */
  order_by?: string;
  /** Sort direction */
  order_direction?: 'ASC' | 'DESC';
}
