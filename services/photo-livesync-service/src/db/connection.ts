/**
 * Database Connection Module with Connection Pooling.
 *
 * Provides a PostgreSQL connection pool for the Photo Sync Service.
 * Features:
 * - Connection pooling with configurable min/max connections
 * - Health check functionality for readiness probes
 * - Graceful shutdown handling
 * - Query timing and error logging
 * - Automatic reconnection on connection failures
 *
 * @module db/connection
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Database query options.
 */
export interface QueryOptions {
  /** Query timeout in milliseconds (overrides default) */
  timeout?: number;
  /** Name for prepared statement caching */
  name?: string;
}

/**
 * Database health check result.
 */
export interface DatabaseHealthCheck {
  healthy: boolean;
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Transaction callback function type.
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

// ============================================================================
// Pool Configuration
// ============================================================================

/**
 * Parse database URL and create pool configuration.
 * Supports both URL format and individual parameters.
 */
function createPoolConfig(): PoolConfig {
  const poolConfig: PoolConfig = {
    connectionString: config.DATABASE_URL,
    min: config.DB_POOL_MIN_SIZE,
    max: config.DB_POOL_MAX_SIZE,
    // Connection timeout (how long to wait for a connection from the pool)
    connectionTimeoutMillis: 10000,
    // Idle timeout (how long a client can remain idle before being closed)
    idleTimeoutMillis: 30000,
    // Statement timeout (default for queries)
    statement_timeout: config.DB_COMMAND_TIMEOUT,
    // Application name for monitoring
    application_name: config.SERVICE_NAME,
    // SSL configuration for production
    ssl: config.isProduction
      ? {
          rejectUnauthorized: true,
        }
      : undefined,
  };

  return poolConfig;
}

// ============================================================================
// Pool Instance
// ============================================================================

let pool: Pool | null = null;
let isShuttingDown = false;

/**
 * Get or create the database connection pool.
 * This is a singleton that returns the same pool instance.
 */
export function getPool(): Pool {
  if (isShuttingDown) {
    throw new Error('Database pool is shutting down');
  }

  if (!pool) {
    pool = new Pool(createPoolConfig());

    // Set up event handlers
    pool.on('connect', (client) => {
      // Set session-level configurations
      client.query(`SET statement_timeout = ${config.DB_COMMAND_TIMEOUT}`);

      if (config.isDevelopment) {
        console.log('[DB] New client connected to database');
      }
    });

    pool.on('acquire', () => {
      if (config.isDevelopment) {
        console.log('[DB] Client acquired from pool');
      }
    });

    pool.on('release', () => {
      if (config.isDevelopment) {
        console.log('[DB] Client released to pool');
      }
    });

    pool.on('remove', () => {
      if (config.isDevelopment) {
        console.log('[DB] Client removed from pool');
      }
    });

    pool.on('error', (err, _client) => {
      console.error('[DB] Unexpected error on idle client', {
        error: err.message,
        stack: err.stack,
      });
      // Don't throw - pool handles reconnection automatically
    });
  }

  return pool;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Execute a parameterized query.
 *
 * @param text - SQL query text with $1, $2, etc. placeholders
 * @param params - Array of parameter values
 * @param options - Optional query configuration
 * @returns Query result
 *
 * @example
 * ```ts
 * const result = await query<User>(
 *   'SELECT * FROM users WHERE id = $1',
 *   [userId]
 * );
 * ```
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  options?: QueryOptions
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>({
      text,
      values: params,
      name: options?.name,
    });

    const duration = Date.now() - start;

    if (config.isDevelopment) {
      console.log('[DB] Query executed', {
        text: text.substring(0, 100),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('[DB] Query failed', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Execute a query and return the first row, or null if no rows.
 *
 * @param text - SQL query text
 * @param params - Query parameters
 * @returns First row or null
 *
 * @example
 * ```ts
 * const user = await queryOne<User>(
 *   'SELECT * FROM users WHERE id = $1',
 *   [userId]
 * );
 * ```
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Execute a query and return all rows.
 *
 * @param text - SQL query text
 * @param params - Query parameters
 * @returns Array of rows
 *
 * @example
 * ```ts
 * const users = await queryAll<User>(
 *   'SELECT * FROM users WHERE status = $1',
 *   ['active']
 * );
 * ```
 */
export async function queryAll<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

// ============================================================================
// Transaction Support
// ============================================================================

/**
 * Execute a function within a database transaction.
 *
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 * If the callback throws an error, the transaction is rolled back.
 *
 * @param callback - Function to execute within the transaction
 * @returns Result of the callback function
 *
 * @example
 * ```ts
 * const result = await transaction(async (client) => {
 *   await client.query('INSERT INTO users ...', [...]);
 *   await client.query('INSERT INTO profiles ...', [...]);
 *   return { success: true };
 * });
 * ```
 */
export async function transaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a function within a SERIALIZABLE transaction.
 *
 * Provides the highest isolation level, preventing all concurrency anomalies.
 * May throw serialization errors that should be retried.
 *
 * @param callback - Function to execute within the transaction
 * @param maxRetries - Maximum retry attempts for serialization failures (default: 3)
 * @returns Result of the callback function
 */
export async function serializableTransaction<T>(
  callback: TransactionCallback<T>,
  maxRetries = 3
): Promise<T> {
  const pool = getPool();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');

      // Check if it's a serialization failure that should be retried
      const isSerializationError =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === '40001';

      if (isSerializationError && attempt < maxRetries) {
        // Exponential backoff before retry
        const backoffMs = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  // This should never be reached due to the throw in the loop
  throw new Error('Transaction failed after maximum retries');
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check database health and return pool statistics.
 *
 * Executes a simple query to verify connectivity.
 * Used for readiness probes and monitoring.
 *
 * @returns Health check result with pool statistics
 */
export async function checkHealth(): Promise<DatabaseHealthCheck> {
  const pool = getPool();

  const result: DatabaseHealthCheck = {
    healthy: false,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
  };

  const start = Date.now();

  try {
    // Execute a simple query to verify connectivity
    await pool.query('SELECT 1 AS health_check');

    result.healthy = true;
    result.latencyMs = Date.now() - start;
  } catch (error) {
    result.healthy = false;
    result.latencyMs = Date.now() - start;
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * Check if the database is healthy (simple boolean check).
 *
 * @returns True if database is reachable
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const health = await checkHealth();
    return health.healthy;
  } catch {
    return false;
  }
}

// ============================================================================
// Connection Lifecycle
// ============================================================================

/**
 * Initialize the database connection pool.
 *
 * Call this during application startup to verify database connectivity
 * before accepting requests.
 *
 * @throws Error if database connection fails
 */
export async function initialize(): Promise<void> {
  const pool = getPool();

  console.log('[DB] Initializing database connection pool...');
  console.log('[DB] Configuration:', {
    host: config.DATABASE_URL.replace(/\/\/[^@]+@/, '//***:***@'),
    minConnections: config.DB_POOL_MIN_SIZE,
    maxConnections: config.DB_POOL_MAX_SIZE,
    commandTimeout: `${config.DB_COMMAND_TIMEOUT}ms`,
  });

  try {
    // Verify connectivity
    const client = await pool.connect();

    // Get database version for logging
    const versionResult = await client.query('SELECT version()');
    const version = versionResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ') ?? 'unknown';

    client.release();

    console.log('[DB] Database connection established', {
      version,
      totalConnections: pool.totalCount,
    });
  } catch (error) {
    console.error('[DB] Failed to initialize database connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Close the database connection pool.
 *
 * Call this during application shutdown to gracefully close all connections.
 * After calling this, no new queries can be executed.
 */
export async function close(): Promise<void> {
  if (!pool) {
    console.log('[DB] No pool to close');
    return;
  }

  isShuttingDown = true;

  console.log('[DB] Closing database connection pool...', {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
  });

  try {
    await pool.end();
    pool = null;
    console.log('[DB] Database connection pool closed');
  } catch (error) {
    console.error('[DB] Error closing database pool', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    isShuttingDown = false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get pool statistics for monitoring.
 *
 * @returns Current pool statistics
 */
export function getPoolStats(): {
  total: number;
  idle: number;
  waiting: number;
} {
  const pool = getPool();
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/**
 * Escape an identifier (table name, column name) for use in queries.
 *
 * Use this when you need to dynamically include identifiers in queries.
 * NEVER use this for user input - use parameterized queries instead.
 *
 * @param identifier - The identifier to escape
 * @returns Escaped identifier safe for use in queries
 *
 * @example
 * ```ts
 * const tableName = escapeIdentifier('sync_jobs');
 * await query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
 * ```
 */
export function escapeIdentifier(identifier: string): string {
  // Double any existing double quotes and wrap in double quotes
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Build a parameterized INSERT statement.
 *
 * @param table - Table name
 * @param columns - Column names
 * @param values - Values to insert
 * @returns Object with query text and parameters
 *
 * @example
 * ```ts
 * const { text, params } = buildInsert('users', ['name', 'email'], ['John', 'john@example.com']);
 * await query(text, params);
 * ```
 */
export function buildInsert(
  table: string,
  columns: string[],
  values: unknown[]
): { text: string; params: unknown[] } {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const columnList = columns.map((c) => escapeIdentifier(c)).join(', ');

  return {
    text: `INSERT INTO ${escapeIdentifier(table)} (${columnList}) VALUES (${placeholders})`,
    params: values,
  };
}

/**
 * Build a parameterized UPDATE statement.
 *
 * @param table - Table name
 * @param updates - Object with column names and values
 * @param whereColumn - Column for WHERE clause
 * @param whereValue - Value for WHERE clause
 * @returns Object with query text and parameters
 *
 * @example
 * ```ts
 * const { text, params } = buildUpdate('users', { name: 'Jane' }, 'id', userId);
 * await query(text, params);
 * ```
 */
export function buildUpdate(
  table: string,
  updates: Record<string, unknown>,
  whereColumn: string,
  whereValue: unknown
): { text: string; params: unknown[] } {
  const columns = Object.keys(updates);
  const values = Object.values(updates);

  const setClauses = columns.map((col, i) => `${escapeIdentifier(col)} = $${i + 1}`).join(', ');
  const whereClause = `${escapeIdentifier(whereColumn)} = $${columns.length + 1}`;

  return {
    text: `UPDATE ${escapeIdentifier(table)} SET ${setClauses} WHERE ${whereClause}`,
    params: [...values, whereValue],
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  getPool,
  query,
  queryOne,
  queryAll,
  transaction,
  serializableTransaction,
  checkHealth,
  isHealthy,
  initialize,
  close,
  getPoolStats,
  escapeIdentifier,
  buildInsert,
  buildUpdate,
};
