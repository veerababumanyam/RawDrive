/**
 * @rawdrive/database-utils
 *
 * Shared PostgreSQL database utilities for RawDrive microservices.
 * Provides consistent patterns for:
 * - Connection pooling with PgBouncer support
 * - Workspace isolation query builders
 * - Pagination helpers
 * - LIKE pattern escaping
 * - Soft delete query patterns
 * - Transaction management
 *
 * Note: This package primarily exports TypeScript types and constants.
 * The actual database operations are implemented in the Python module
 * for use in Python-based microservices.
 */

// Export types for TypeScript services
export * from './types';
export * from './constants';
