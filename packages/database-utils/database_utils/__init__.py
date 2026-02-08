"""
@rawdrive/database-utils - Python Database Utilities

Shared PostgreSQL database utilities for RawDrive microservices.
Provides consistent patterns for:
- Connection pooling with PgBouncer support
- Workspace isolation query builders
- Pagination helpers
- LIKE pattern escaping
- Soft delete query patterns
- Transaction management

Usage:
    from database_utils import (
        # Connection pooling
        DatabasePool,
        PoolConfig,
        PoolStats,

        # Query builders
        WorkspaceQueryBuilder,
        PaginationQueryBuilder,
        SoftDeleteQueryBuilder,

        # Utilities
        escape_like_pattern,
        build_pgbouncer_dsn,

        # Context managers
        get_transaction,
        get_connection,

        # Constants
        IsolationLevel,
        POOL_DEFAULTS,
        RETRY_DEFAULTS,
    )
"""

from .pool import (
    DatabasePool,
    PoolConfig,
    PoolStats,
    IsolationLevel,
    get_connection,
    get_transaction,
    readonly_transaction,
    serializable_transaction,
    savepoint,
)
from .query_builders import (
    WorkspaceQueryBuilder,
    PaginationQueryBuilder,
    SoftDeleteQueryBuilder,
    escape_like_pattern,
)
from .dsn import (
    build_pgbouncer_dsn,
    normalize_database_url,
)
from .retry import (
    RetryConfig,
    with_retry,
    execute_with_retry,
    fetch_with_retry,
    fetchval_with_retry,
    RETRY_DEFAULTS,
)
from .constants import (
    POOL_DEFAULTS,
    SOFT_DELETE_FILTER,
)

__all__ = [
    # Connection pooling
    "DatabasePool",
    "PoolConfig",
    "PoolStats",
    "IsolationLevel",
    "get_connection",
    "get_transaction",
    "readonly_transaction",
    "serializable_transaction",
    "savepoint",
    # Query builders
    "WorkspaceQueryBuilder",
    "PaginationQueryBuilder",
    "SoftDeleteQueryBuilder",
    "escape_like_pattern",
    # DSN utilities
    "build_pgbouncer_dsn",
    "normalize_database_url",
    # Retry logic
    "RetryConfig",
    "with_retry",
    "execute_with_retry",
    "fetch_with_retry",
    "fetchval_with_retry",
    "RETRY_DEFAULTS",
    # Constants
    "POOL_DEFAULTS",
    "SOFT_DELETE_FILTER",
]
