"""
PostgreSQL database adapter.

Re-exports database functions for backward compatibility.
"""

from src.database import (
    get_pool,
    get_connection,
    fetch,
    fetchrow,
    fetchval,
)

# Alias for backward compatibility
get_postgres_pool = get_pool

__all__ = [
    "get_postgres_pool",
    "get_pool",
    "get_connection",
    "fetch",
    "fetchrow",
    "fetchval",
]
