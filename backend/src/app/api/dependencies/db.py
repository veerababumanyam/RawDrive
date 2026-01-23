"""Database connection dependencies for FastAPI.

Provides FastAPI-compatible dependency injection for database connections
using the asyncpg-based connection pool.
"""

from __future__ import annotations

from typing import AsyncGenerator

from asyncpg import Connection

from app.db.postgres import get_connection


async def get_db() -> AsyncGenerator[Connection, None]:
    """FastAPI dependency that provides a database connection.

    This dependency acquires a connection from the asyncpg pool and
    automatically releases it when the request completes.

    Usage:
        @router.get("/users")
        async def get_users(db: Connection = Depends(get_db)):
            rows = await db.fetch("SELECT * FROM users")
            return rows

    Yields:
        asyncpg.Connection: A connection from the pool.
    """
    async with get_connection() as conn:
        yield conn
