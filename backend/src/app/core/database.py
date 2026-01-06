"""Database initialization and extension verification.

This module provides database utilities including:
- Connection pool access via get_postgres_pool
- Extension verification for pgvector and pgvectorscale

pgvectorscale provides enhanced vector search capabilities:
- StreamingDiskANN index type for improved performance at scale
- Better memory efficiency compared to HNSW indexes
- Optimized for large embedding datasets (millions+ vectors)

Usage:
    from app.core.database import get_postgres_pool, verify_vector_extensions

    # During startup or health checks
    extensions = await verify_vector_extensions()
    if extensions["vectorscale"]:
        logger.info("pgvectorscale available for advanced indexing")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from app.db.postgres import get_postgres_pool as get_pool
from app.db.postgres import get_postgres_pool, get_connection

logger = logging.getLogger(__name__)


@dataclass
class VectorExtensionStatus:
    """Status of vector-related PostgreSQL extensions."""

    pgvector_available: bool
    pgvector_enabled: bool
    pgvectorscale_available: bool
    pgvectorscale_enabled: bool
    pgvector_version: Optional[str] = None
    pgvectorscale_version: Optional[str] = None

    @property
    def can_use_diskann(self) -> bool:
        """Check if StreamingDiskANN indexes can be used."""
        return self.pgvectorscale_enabled

    @property
    def can_use_vector_search(self) -> bool:
        """Check if basic vector search is available."""
        return self.pgvector_enabled


async def verify_vector_extensions() -> VectorExtensionStatus:
    """Verify the availability and status of vector extensions in PostgreSQL.

    Checks for both pgvector (required for vector operations) and pgvectorscale
    (optional, provides enhanced indexing with StreamingDiskANN).

    Returns:
        VectorExtensionStatus: Dataclass containing extension availability info.

    Example:
        status = await verify_vector_extensions()
        if status.can_use_diskann:
            logger.info("StreamingDiskANN indexes available")
        elif status.can_use_vector_search:
            logger.info("Using standard pgvector indexes (HNSW/IVFFlat)")
        else:
            logger.warning("Vector search not available")
    """
    status = VectorExtensionStatus(
        pgvector_available=False,
        pgvector_enabled=False,
        pgvectorscale_available=False,
        pgvectorscale_enabled=False,
    )

    try:
        async with get_connection() as conn:
            # Check available extensions (installed in PostgreSQL but not necessarily enabled)
            available_extensions = await conn.fetch(
                """
                SELECT name, default_version
                FROM pg_available_extensions
                WHERE name IN ('vector', 'vectorscale')
                """
            )

            for row in available_extensions:
                if row["name"] == "vector":
                    status.pgvector_available = True
                elif row["name"] == "vectorscale":
                    status.pgvectorscale_available = True

            # Check enabled extensions (actually enabled in the current database)
            enabled_extensions = await conn.fetch(
                """
                SELECT extname, extversion
                FROM pg_extension
                WHERE extname IN ('vector', 'vectorscale')
                """
            )

            for row in enabled_extensions:
                if row["extname"] == "vector":
                    status.pgvector_enabled = True
                    status.pgvector_version = row["extversion"]
                elif row["extname"] == "vectorscale":
                    status.pgvectorscale_enabled = True
                    status.pgvectorscale_version = row["extversion"]

            # Log the status
            _log_extension_status(status)

    except Exception as e:
        logger.warning(
            "Failed to verify vector extensions",
            extra={"error": str(e)},
        )

    return status


def _log_extension_status(status: VectorExtensionStatus) -> None:
    """Log the vector extension status with appropriate log levels."""
    if status.pgvectorscale_enabled:
        logger.info(
            "pgvectorscale extension enabled - StreamingDiskANN indexes available",
            extra={
                "pgvector_version": status.pgvector_version,
                "pgvectorscale_version": status.pgvectorscale_version,
            },
        )
    elif status.pgvectorscale_available:
        logger.info(
            "pgvectorscale available but not enabled - run migrations to enable",
            extra={"pgvector_version": status.pgvector_version},
        )
    elif status.pgvector_enabled:
        logger.info(
            "Using standard pgvector (pgvectorscale not available)",
            extra={"pgvector_version": status.pgvector_version},
        )
    else:
        logger.warning(
            "No vector extensions enabled - vector search will not be available"
        )


async def check_pgvectorscale_ready() -> bool:
    """Quick check if pgvectorscale is ready for use.

    This is a lightweight check suitable for health checks or startup verification.

    Returns:
        bool: True if pgvectorscale is enabled and ready.

    Example:
        if await check_pgvectorscale_ready():
            # Use StreamingDiskANN index
            await conn.execute(
                "CREATE INDEX ... USING diskann ..."
            )
    """
    try:
        async with get_connection() as conn:
            result = await conn.fetchval(
                """
                SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'
                """
            )
            return result == 1
    except Exception as e:
        logger.debug(
            "pgvectorscale readiness check failed",
            extra={"error": str(e)},
        )
        return False


# Re-export commonly used functions for convenience
__all__ = [
    "get_pool",
    "get_postgres_pool",
    "verify_vector_extensions",
    "check_pgvectorscale_ready",
    "VectorExtensionStatus",
]
