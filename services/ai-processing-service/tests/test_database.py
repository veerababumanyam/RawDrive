"""Tests for database healthcheck and pgvector fallback (AIS-02).

Verifies:
- database_healthcheck returns True when pool is connected
- database_healthcheck returns False when pool is None
- find_similar_by_clip uses pgvector path when MILVUS_ENABLED=false
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_database_healthcheck_success():
    """database_healthcheck returns True when pool is connected."""
    from core.database import Database, database_healthcheck

    # Create a database instance with a mock pool
    db = Database.__new__(Database)
    db.pool = AsyncMock()
    db._initialized = True
    db.settings = MagicMock()

    # Mock the pool.acquire context manager
    mock_conn = AsyncMock()
    mock_conn.fetchval = AsyncMock(return_value=1)
    db.pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    db.pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    # Patch the global _database
    with patch("core.database._database", db):
        result = await database_healthcheck(timeout=2.0)
    assert result is True


@pytest.mark.asyncio
async def test_database_healthcheck_failure():
    """database_healthcheck returns False when pool is None."""
    from core.database import database_healthcheck

    # Patch the global _database to None (no connection)
    with patch("core.database._database", None):
        result = await database_healthcheck(timeout=2.0)
    assert result is False


@pytest.mark.asyncio
async def test_pgvector_fallback():
    """When MILVUS_ENABLED=false, find_similar_by_clip uses pgvector path (not milvus)."""
    from core.database import Database

    db = Database.__new__(Database)
    db.pool = AsyncMock()
    db._initialized = True
    db.settings = MagicMock()
    db.settings.MILVUS_ENABLED = False

    # Mock fetch_all to return empty results
    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    db.pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    db.pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    # Patch fetch_all
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
