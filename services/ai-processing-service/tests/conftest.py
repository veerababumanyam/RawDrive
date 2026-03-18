"""Test configuration and shared fixtures for ai-processing-service."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure MILVUS_ENABLED=false and ENVIRONMENT=test before any app imports
os.environ.setdefault("MILVUS_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(autouse=True)
def _env_defaults(monkeypatch):
    """Set environment defaults for all tests."""
    monkeypatch.setenv("MILVUS_ENABLED", "false")
    monkeypatch.setenv("ENVIRONMENT", "test")


@pytest.fixture()
def mock_database_healthcheck():
    """Mock database_healthcheck to return True."""
    with patch("core.database.database_healthcheck", new_callable=AsyncMock) as mock:
        mock.return_value = True
        yield mock


@pytest.fixture()
def mock_database_healthcheck_fail():
    """Mock database_healthcheck to return False."""
    with patch("core.database.database_healthcheck", new_callable=AsyncMock) as mock:
        mock.return_value = False
        yield mock


@pytest.fixture()
def mock_redis_healthcheck():
    """Mock redis_healthcheck to return True."""
    with patch("core.redis.redis_healthcheck", new_callable=AsyncMock) as mock:
        mock.return_value = True
        yield mock


@pytest.fixture()
def mock_redis_healthcheck_fail():
    """Mock redis_healthcheck to return False."""
    with patch("core.redis.redis_healthcheck", new_callable=AsyncMock) as mock:
        mock.return_value = False
        yield mock


@pytest.fixture()
def mock_db_pool():
    """Mock asyncpg pool for database tests."""
    pool = AsyncMock()
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=1)
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool


@pytest.fixture()
def mock_redis_client():
    """Mock Redis client for redis tests."""
    client = AsyncMock()
    client.ping = AsyncMock(return_value=True)
    return client
