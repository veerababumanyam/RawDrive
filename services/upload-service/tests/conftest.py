"""
Pytest configuration and fixtures for Upload Service tests.
"""

import asyncio
from typing import AsyncGenerator, Generator
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import jwt
import datetime

# Override settings before importing app
import os
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["JWT_SECRET"] = "test-secret-key-must-be-at-least-32-chars-for-hs256"
os.environ["DEBUG"] = "true"
os.environ["R2_ENDPOINT_URL"] = "https://test.r2.cloudflarestorage.com"
os.environ["R2_ACCESS_KEY_ID"] = "test-key"
os.environ["R2_SECRET_ACCESS_KEY"] = "test-secret"
os.environ["R2_BUCKET_NAME"] = "test-bucket"

from app.main import app


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
    """Async HTTP client for API testing with mocked dependencies."""
    # Redis auto-detects test mode via PYTEST_CURRENT_TEST and uses InMemoryRedis
    # Database operations - mock at service level for upload service tests

    # Mock database fetch/execute operations
    with patch("app.core.database.fetch_one") as mock_fetch_one, \
         patch("app.core.database.fetch_all") as mock_fetch_all, \
         patch("app.core.database.fetch_val") as mock_fetch_val, \
         patch("app.core.database.execute") as mock_execute:

        # Configure async mocks - these functions are already patched as MagicMock
        # We need to make them return async functions
        async def mock_return_none(*args, **kwargs):
            return None

        async def mock_return_empty_list(*args, **kwargs):
            return []

        mock_fetch_one.side_effect = mock_return_none
        mock_fetch_all.side_effect = mock_return_empty_list
        mock_fetch_val.side_effect = mock_return_none
        mock_execute.side_effect = mock_return_none

        # Mock R2 storage service
        with patch("app.services.r2_storage_service.get_r2_storage_service") as mock_storage:
            mock_storage_instance = MagicMock()
            mock_storage_instance.generate_presigned_url = MagicMock(
                return_value="https://test.r2.cloudflarestorage.com/test-upload-url"
            )
            mock_storage_instance.create_multipart_upload = AsyncMock(
                return_value={"upload_id": "test-multipart-upload-id"}
            )
            mock_storage.return_value = mock_storage_instance

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


@pytest.fixture
def workspace_id() -> str:
    """Test workspace ID."""
    return "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def user_id() -> str:
    """Test user ID."""
    return "550e8400-e29b-41d4-a716-446655440001"


@pytest.fixture
def gallery_id() -> str:
    """Test gallery ID."""
    return "550e8400-e29b-41d4-a716-446655440002"


@pytest.fixture
def auth_headers(workspace_id: str, user_id: str) -> dict:
    """Authentication headers for protected endpoints."""
    payload = {
        "sub": user_id,
        "wids": [workspace_id],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }
    token = jwt.encode(
        payload,
        "test-secret-key-must-be-at-least-32-chars-for-hs256",
        algorithm="HS256"
    )

    return {
        "Authorization": f"Bearer {token}",
        "X-Workspace-ID": workspace_id,
    }


@pytest.fixture
def invalid_auth_headers() -> dict:
    """Invalid authentication headers for testing auth failures."""
    return {
        "Authorization": "Bearer invalid-token",
        "X-Workspace-ID": "550e8400-e29b-41d4-a716-446655440000",
    }


# =============================================================================
# Mock Data Fixtures
# =============================================================================


@pytest.fixture
def sample_upload_session(workspace_id: str, user_id: str, gallery_id: str) -> dict:
    """Sample upload session data."""
    upload_id = str(uuid4())
    return {
        "upload_id": upload_id,
        "workspace_id": workspace_id,
        "user_id": user_id,
        "gallery_id": gallery_id,
        "filename": "test-photo.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 5_000_000,  # 5MB
        "sha256": "a" * 64,  # Mock SHA256
        "status": "pending",
        "chunks_uploaded": 0,
        "total_chunks": 5,
        "upload_url": "https://test.r2.cloudflarestorage.com/test-upload-url",
        "provider": "r2",
        "created_at": "2024-01-01T00:00:00Z",
        "expires_at": "2024-01-02T00:00:00Z",
    }


@pytest.fixture
def sample_chunk_data() -> bytes:
    """Sample chunk data (1MB)."""
    return b"x" * 1_048_576  # 1MB of data


@pytest.fixture
def sample_small_file() -> bytes:
    """Sample small file (100KB - single chunk)."""
    return b"x" * 102_400  # 100KB


@pytest.fixture
def sample_large_file() -> bytes:
    """Sample large file (10MB - multiple chunks)."""
    return b"x" * 10_485_760  # 10MB


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
    mock.setex = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=True)
    mock.delete_pattern = AsyncMock(return_value=0)
    mock.incr = AsyncMock(return_value=1)
    return mock


# =============================================================================
# Storage Mock Fixtures
# =============================================================================


@pytest.fixture
def mock_r2_client():
    """Mock R2 storage client."""
    mock = MagicMock()
    mock.generate_presigned_url = MagicMock(
        return_value="https://test.r2.cloudflarestorage.com/test-url"
    )
    mock.create_multipart_upload = AsyncMock(
        return_value={"upload_id": "test-multipart-id"}
    )
    mock.upload_part = AsyncMock(return_value={"ETag": "test-etag"})
    mock.complete_multipart_upload = AsyncMock(return_value={"Location": "test-location"})
    mock.abort_multipart_upload = AsyncMock(return_value=None)
    return mock
