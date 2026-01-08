"""
Pytest configuration and fixtures for Sync Service tests.
"""

import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient

from src.main import app


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create a synchronous test client."""
    with TestClient(app) as test_client:
        yield test_client


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Create an asynchronous test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_redis(mocker):
    """Mock Redis client for tests."""
    mock = mocker.patch("src.cache.redis_client.redis_client")
    mock.ping.return_value = True
    mock.get.return_value = None
    mock.set.return_value = True
    mock.delete.return_value = True
    return mock


@pytest.fixture
def mock_db_pool(mocker):
    """Mock database pool for tests."""
    mock_pool = mocker.AsyncMock()
    mock_conn = mocker.AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mocker.patch("src.database.get_pool", return_value=mock_pool)
    return mock_pool
