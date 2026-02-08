"""
Database constants shared across all RawDrive microservices.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Final


class IsolationLevel(str, Enum):
    """PostgreSQL transaction isolation levels."""

    READ_COMMITTED = "read_committed"
    REPEATABLE_READ = "repeatable_read"
    SERIALIZABLE = "serializable"


class SoftDeleteFilter(str, Enum):
    """Soft delete filter options for queries."""

    ACTIVE = "active"  # Only non-deleted records (is_deleted = false)
    DELETED = "deleted"  # Only deleted records (is_deleted = true)
    ALL = "all"  # All records regardless of deletion status


@dataclass(frozen=True)
class PoolDefaults:
    """Default connection pool settings."""

    MIN_SIZE: int = 2
    MAX_SIZE: int = 20
    COMMAND_TIMEOUT: int = 60
    MAX_INACTIVE_CONNECTION_LIFETIME: int = 1800
    PGBOUNCER_PORT: int = 6432
    PGBOUNCER_HOST: str = "pgbouncer"


@dataclass(frozen=True)
class RetryDefaults:
    """Default retry configuration."""

    MAX_ATTEMPTS: int = 3
    BASE_DELAY: float = 0.1
    MAX_DELAY: float = 5.0
    EXPONENTIAL_BASE: float = 2.0


# Singleton instances
POOL_DEFAULTS: Final[PoolDefaults] = PoolDefaults()
RETRY_DEFAULTS: Final[RetryDefaults] = RetryDefaults()
SOFT_DELETE_FILTER: Final[type[SoftDeleteFilter]] = SoftDeleteFilter
