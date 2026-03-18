"""Tests for database healthcheck and pgvector fallback (AIS-02).

Verifies:
- database_healthcheck returns True when pool is connected
- database_healthcheck returns False when pool is None
- find_similar_by_clip uses pgvector path when MILVUS_ENABLED=false
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_pool_mock(fetchval_return=1):
    """Create a mock asyncpg pool with proper async context manager for acquire()."""
    mock_conn = AsyncMock()
    mock_conn.fetchval = AsyncMock(return_value=fetchval_return)

    pool = MagicMock()

    @asynccontextmanager
    async def mock_acquire():
        yield mock_conn

    pool.acquire = mock_acquire
    return pool, mock_conn


@pytest.mark.asyncio
async def test_database_healthcheck_success():
    """database_healthcheck returns True when pool is connected."""
    from core.database import Database, database_healthcheck

    db = Database.__new__(Database)
    pool, mock_conn = _make_pool_mock(fetchval_return=1)
    db.pool = pool
    db._initialized = True
    db.settings = MagicMock()

    with patch("core.database._database", db):
        result = await database_healthcheck(timeout=2.0)
    assert result is True
    mock_conn.fetchval.assert_awaited_once_with("SELECT 1")


@pytest.mark.asyncio
async def test_database_healthcheck_failure():
    """database_healthcheck returns False when pool is None."""
    from core.database import database_healthcheck

    with patch("core.database._database", None):
        result = await database_healthcheck(timeout=2.0)
    assert result is False


@pytest.mark.asyncio
async def test_pgvector_fallback():
    """When MILVUS_ENABLED=false, find_similar_by_clip uses pgvector path (not milvus)."""
    from core.database import Database

    db = Database.__new__(Database)
    db.pool = MagicMock()
    db._initialized = True
    db.settings = MagicMock()
    db.settings.MILVUS_ENABLED = False

    # Patch fetch_all to return empty results
    db.fetch_all = AsyncMock(return_value=[])

    # Call find_similar_by_clip -- should NOT attempt milvus import
    with patch("core.database.get_settings", return_value=db.settings):
        result = await db.find_similar_by_clip(
            workspace_id="test-ws",
            clip_embedding=[0.1] * 512,
            threshold=0.95,
        )

    assert result == []
    # Verify fetch_all was called (pgvector path)
    db.fetch_all.assert_called_once()
