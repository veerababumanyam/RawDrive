"""
Pytest configuration and fixtures for integration tests.
"""

import asyncio
import os
from typing import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing app
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/rawdrive_test"
)
os.environ["REDIS_URL"] = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")
os.environ["JWT_SECRET"] = "test-secret-key-for-testing"
os.environ["RATE_LIMIT_ENABLED"] = "false"  # Disable for most tests

from src.main import app
from src.database import get_pool, close_pool
from src.cache.redis_client import redis_client


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def db_pool():
    """Get database connection pool."""
    pool = await get_pool()
    yield pool
    await close_pool()


@pytest_asyncio.fixture(scope="session")
async def redis():
    """Get Redis client."""
    await redis_client.connect()
    yield redis_client
    await redis_client.disconnect()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def workspace_id():
    """Generate a test workspace ID."""
    return uuid4()


@pytest.fixture
def invitation_id():
    """Generate a test invitation ID."""
    return uuid4()


@pytest.fixture
def user_id():
    """Generate a test user ID."""
    return uuid4()


@pytest.fixture
def auth_headers(user_id, workspace_id):
    """
    Generate authentication headers for testing.

    Uses internal service headers (trusted by API gateway).
    """
    return {
        "X-User-ID": str(user_id),
        "X-Workspace-ID": str(workspace_id),
        "X-User-Email": "test@example.com",
        "X-User-Role": "owner",
    }


@pytest.fixture
def other_workspace_headers():
    """Headers for a different workspace (for isolation tests)."""
    return {
        "X-User-ID": str(uuid4()),
        "X-Workspace-ID": str(uuid4()),
        "X-User-Email": "other@example.com",
        "X-User-Role": "owner",
    }


@pytest_asyncio.fixture
async def clean_test_data(db_pool, workspace_id):
    """Clean up test data after each test."""
    yield
    # Cleanup after test
    async with db_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM invitation_guests WHERE workspace_id = $1",
            workspace_id,
        )


@pytest.fixture
def sample_csv_content():
    """Sample CSV content for import tests."""
    return """Name,Email,Phone,Plus Ones,Dietary,Group
John Doe,john@example.com,555-1234,2,Vegetarian,Family
Jane Smith,jane@example.com,555-5678,1,,Friends
Bob Wilson,bob@example.com,555-9999,0,Gluten-free,Colleagues
"""


@pytest.fixture
def malformed_csv_content():
    """Malformed CSV for error handling tests."""
    return """Name,Email
,missing-name@example.com
Valid Name,valid@example.com
,another-missing@example.com
"""
