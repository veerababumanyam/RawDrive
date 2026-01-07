"""
Pytest configuration and fixtures for Notifications Service tests.
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
os.environ["SENDGRID_API_KEY"] = "test-sendgrid-key"


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
    # Import app here to ensure env vars are set
    from src.main import app

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
        with patch("src.database.get_pool") as mock_pool:
            mock_pool.return_value = AsyncMock()

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


@pytest.fixture
def auth_headers() -> dict:
    """Authentication headers for protected endpoints."""
    return {
        "Authorization": "Bearer test-token",
        "X-Workspace-ID": "test-workspace-id",
        "X-User-ID": "test-user-id",
    }


# =============================================================================
# Mock Data Fixtures
# =============================================================================


@pytest.fixture
def sample_notification() -> dict:
    """Sample notification data."""
    return {
        "notification_id": "550e8400-e29b-41d4-a716-446655440000",
        "workspace_id": "test-workspace-id",
        "user_id": "test-user-id",
        "type": "gallery_published",
        "channel": "email",
        "subject": "Your gallery is ready",
        "body": "Your gallery has been published and is ready for viewing.",
        "status": "pending",
        "created_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def sample_preference() -> dict:
    """Sample notification preference data."""
    return {
        "preference_id": "550e8400-e29b-41d4-a716-446655440010",
        "user_id": "test-user-id",
        "workspace_id": "test-workspace-id",
        "notification_type": "gallery_published",
        "email_enabled": True,
        "sms_enabled": False,
        "in_app_enabled": True,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def sample_template() -> dict:
    """Sample notification template data."""
    return {
        "template_id": "550e8400-e29b-41d4-a716-446655440020",
        "workspace_id": "test-workspace-id",
        "name": "gallery_published",
        "subject": "Your gallery {{ gallery_name }} is ready!",
        "body_html": "<h1>Gallery Published</h1><p>{{ gallery_name }} is ready for viewing.</p>",
        "body_text": "Gallery Published\n\n{{ gallery_name }} is ready for viewing.",
        "channel": "email",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
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
    return mock


# =============================================================================
# SendGrid Mock Fixtures
# =============================================================================


@pytest.fixture
def mock_sendgrid():
    """Mock SendGrid client."""
    mock = MagicMock()
    mock.send = AsyncMock(return_value={"status_code": 202, "message_id": "test-message-id"})
    return mock
