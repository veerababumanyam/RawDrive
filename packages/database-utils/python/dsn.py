"""
Database DSN (connection string) utilities.

Provides functions to normalize and transform database URLs,
especially for PgBouncer routing.
"""

import logging
from typing import Optional
from urllib.parse import urlparse, urlunparse

from .constants import POOL_DEFAULTS

logger = logging.getLogger(__name__)


def normalize_database_url(database_url: str) -> str:
    """
    Normalize a database URL to standard PostgreSQL format.

    Converts SQLAlchemy-style DSNs (postgresql+asyncpg://) to
    standard PostgreSQL format (postgresql://).

    Args:
        database_url: The database URL to normalize

    Returns:
        Normalized database URL in standard PostgreSQL format

    Example:
        >>> normalize_database_url("postgresql+asyncpg://user:pass@localhost/db")
        'postgresql://user:pass@localhost/db'
    """
    url = database_url

    # Normalize SQLAlchemy DSN to standard PostgreSQL format
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)

    return url


def build_pgbouncer_dsn(
    database_url: str,
    pgbouncer_host: Optional[str] = None,
    pgbouncer_port: Optional[int] = None,
    enabled: bool = True,
) -> str:
    """
    Build a PgBouncer-routed database connection DSN.

    When PgBouncer is enabled, this function transforms the database URL
    to route connections through PgBouncer instead of directly to PostgreSQL.

    PgBouncer handles connection pooling at the server level, allowing
    hundreds of application pods to share a smaller pool of actual
    PostgreSQL connections (critical for scaling to 5000+ concurrent users).

    Args:
        database_url: Original database connection URL
        pgbouncer_host: PgBouncer hostname (default: 'pgbouncer')
        pgbouncer_port: PgBouncer port (default: 6432)
        enabled: Whether PgBouncer routing is enabled

    Returns:
        Database URL (potentially transformed for PgBouncer routing)

    Example:
        >>> build_pgbouncer_dsn(
        ...     "postgresql://user:pass@postgres:5432/rawdrive",
        ...     pgbouncer_host="pgbouncer",
        ...     pgbouncer_port=6432,
        ...     enabled=True
        ... )
        'postgresql://user:pass@pgbouncer:6432/rawdrive'
    """
    # Normalize the URL first
    dsn = normalize_database_url(database_url)

    # If PgBouncer is disabled, return normalized URL
    if not enabled:
        return dsn

    # Set defaults
    host = pgbouncer_host or POOL_DEFAULTS.PGBOUNCER_HOST
    port = pgbouncer_port or POOL_DEFAULTS.PGBOUNCER_PORT

    try:
        parsed = urlparse(dsn)

        # Build new netloc with PgBouncer host/port
        # Keep original username, password, database, and query params
        if parsed.username and parsed.password:
            netloc = f"{parsed.username}:{parsed.password}@{host}:{port}"
        elif parsed.username:
            netloc = f"{parsed.username}@{host}:{port}"
        else:
            netloc = f"{host}:{port}"

        pgbouncer_dsn = urlunparse((
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))

        logger.info(
            "PgBouncer enabled - routing connections through connection pooler",
            extra={
                "pgbouncer_host": host,
                "pgbouncer_port": port,
            },
        )
        return pgbouncer_dsn

    except Exception as e:
        logger.warning(
            "Failed to construct PgBouncer DSN, falling back to direct connection",
            extra={"error": str(e)},
        )
        return dsn
