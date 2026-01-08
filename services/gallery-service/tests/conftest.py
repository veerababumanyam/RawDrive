"""
Pytest configuration and fixtures for Gallery Service tests.
"""

import asyncio
from typing import AsyncGenerator, Generator
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch

# Override settings before importing app
import os
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["JWT_SECRET"] = "test-secret-key"
os.environ["DEBUG"] = "true"

from src.main import app
from src.config import settings


# =============================================================================
# Async Event Loop
# =============================================================================


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# =============================================================================
# HTTP Client Fixtures
# =============================================================================


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client for API testing."""
    # Mock Redis client
    with patch("src.cache.redis_client.redis_client") as mock_redis:
        mock_redis.connect = AsyncMock()
        mock_redis.disconnect = AsyncMock()
        mock_redis.ping = AsyncMock(return_value=True)
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.set = AsyncMock(return_value=True)
        mock_redis.get_json = AsyncMock(return_value=None)
        mock_redis.set_json = AsyncMock(return_value=True)
        mock_redis.delete = AsyncMock(return_value=True)
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.publish = AsyncMock(return_value=True)

        # Mock database pool
        pool_instance = MagicMock()
        
        # Setup acquire() to return an async context manager
        connection_mock = AsyncMock()
        connection_mock.fetchrow = AsyncMock(return_value=None)
        connection_mock.fetch = AsyncMock(return_value=[])
        connection_mock.fetchval = AsyncMock(return_value=None)
        connection_mock.execute = AsyncMock(return_value=None)
        
        acquire_context = MagicMock()
        acquire_context.__aenter__ = AsyncMock(return_value=connection_mock)
        acquire_context.__aexit__ = AsyncMock(return_value=None)
        
        pool_instance.acquire.return_value = acquire_context

        # Use dependencies overrides for get_pool instead of patch if possible, 
        # but patch works if get_pool is called directly.
        # Since get_pool is an async function, we mock it with AsyncMock returning pool_instance.
        with patch("src.database.get_pool", new=AsyncMock(return_value=pool_instance)):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client




@pytest.fixture
def auth_headers() -> dict:
    """Authentication headers for protected endpoints."""
    import jwt
    import datetime
    
    payload = {
        "sub": "550e8400-e29b-41d4-a716-446655440001",
        "wids": ["550e8400-e29b-41d4-a716-446655440000"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }
    token = jwt.encode(payload, "test-secret-key", algorithm="HS256")
    
    return {
        "Authorization": f"Bearer {token}",
        "X-Workspace-Id": "550e8400-e29b-41d4-a716-446655440000",
        "X-User-ID": "550e8400-e29b-41d4-a716-446655440001",
    }


@pytest.fixture
def magic_link_headers() -> dict:
    """Headers for public endpoints with magic link."""
    return {
        "X-Magic-Link-Token": "test-magic-link-token",
    }


# =============================================================================
# Mock Data Fixtures
# =============================================================================


@pytest.fixture
def sample_gallery() -> dict:
    """Sample gallery data."""
    return {
        "gallery_id": "550e8400-e29b-41d4-a716-446655440000",
        "workspace_id": "test-workspace-id",
        "title": "Test Gallery",
        "description": "A test gallery description",
        "client_name": "Test Client",
        "client_id": "550e8400-e29b-41d4-a716-446655440001",
        "shoot_date": "2024-01-15",
        "status": "published",
        "photo_count": 100,
        "created_at": "2024-01-01T00:00:00Z",
        "published_at": "2024-01-10T00:00:00Z",
    }


@pytest.fixture
def sample_gallery_asset() -> dict:
    """Sample gallery asset data."""
    return {
        "gallery_asset_id": "550e8400-e29b-41d4-a716-446655440010",
        "asset_id": "550e8400-e29b-41d4-a716-446655440011",
        "sort_order": 1,
        "visible": True,
        "is_private": False,
        "sub_gallery_id": None,
        "is_favorited": False,
        "is_selected": False,
        "favorites_count": 0,
        "asset": {
            "type": "photo",
            "status": "available",
            "mime_type": "image/jpeg",
            "filename": "IMG_001.jpg",
            "width": 4000,
            "height": 6000,
        },
    }


@pytest.fixture
def sample_magic_link() -> dict:
    """Sample magic link data."""
    return {
        "magic_link_id": "550e8400-e29b-41d4-a716-446655440020",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440000",
        "token": "test-magic-link-token",
        "url": "/g/test-magic-link-token",
        "expires_at": "2024-12-31T23:59:59Z",
        "pin_protected": False,
        "password_protected": False,
        "max_views": None,
        "current_views": 0,
        "created_at": "2024-01-01T00:00:00Z",
        "is_active": True,
    }


# =============================================================================
# Database Mock Fixtures
# =============================================================================


@pytest.fixture
def mock_db_connection():
    """Mock database connection."""
    mock = AsyncMock()
    mock.fetchrow = AsyncMock()
    mock.fetch = AsyncMock()
    mock.fetchval = AsyncMock()
    mock.execute = AsyncMock()
    return mock


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    mock = MagicMock()
    mock.connect = AsyncMock()
    mock.disconnect = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock(return_value=True)
    mock.get_json = AsyncMock(return_value=None)
    mock.set_json = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=True)
    mock.delete_pattern = AsyncMock(return_value=0)
    mock.incr = AsyncMock(return_value=1)
    mock.publish = AsyncMock(return_value=True)
    mock.subscribe = AsyncMock(return_value=None)
    mock.get_circuit_state = MagicMock(return_value={"state": "closed", "failure_count": 0})
    return mock
