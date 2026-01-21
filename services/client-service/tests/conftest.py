"""
Pytest configuration for client-service tests.

Sets up test environment variables before any imports happen.
This is necessary because the Settings class validates required
environment variables at import time.
"""

import os

# =============================================================================
# Set environment variables BEFORE any imports
# These must be set at module level to be available during pytest collection
# =============================================================================

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-minimum-64-characters-for-testing-purposes-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("SERVICE_NAME", "client-service-test")
os.environ.setdefault("SERVICE_VERSION", "1.0.0-test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("LOG_LEVEL", "DEBUG")
os.environ.setdefault("PORT", "8099")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("METRICS_ENABLED", "false")
os.environ.setdefault("METRICS_CUSTOM_PREFIX", "test_client")

# Storage settings for tests
os.environ.setdefault("R2_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")

# Feature flags
os.environ.setdefault("ENABLE_SMART_LISTS", "true")
os.environ.setdefault("ENABLE_DUPLICATE_DETECTION", "true")
os.environ.setdefault("ENABLE_VISITOR_CONVERSION", "true")
os.environ.setdefault("ENABLE_ANALYTICS", "false")
os.environ.setdefault("ENABLE_GALLERY_LINKING", "true")
os.environ.setdefault("ENABLE_COMMUNICATION_TRACKING", "true")

# =============================================================================
# Pytest fixtures
# =============================================================================

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


@pytest.fixture
def workspace_id():
    """Generate a test workspace ID."""
    return str(uuid4())


@pytest.fixture
def user_id():
    """Generate a test user ID."""
    return str(uuid4())


@pytest.fixture
def client_id():
    """Generate a test client ID."""
    return str(uuid4())


@pytest.fixture
def mock_jwt_payload():
    """Create a mock JWT payload."""
    return MagicMock(
        user_id=str(uuid4()),
        workspace_id=str(uuid4()),
        role="admin",
        permissions=["clients:read", "clients:write", "clients:delete", "clients:bulk_delete", "clients:export", "clients:import"],
    )


@pytest.fixture
def mock_audit_service():
    """Create a mock audit service."""
    service = AsyncMock()
    service.log_change = AsyncMock(return_value={"audit_id": str(uuid4())})
    service.log_change_safe = AsyncMock(return_value={"audit_id": str(uuid4())})
    service.log_pii_access = AsyncMock(return_value={"audit_id": str(uuid4())})
    return service


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=True)
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock(return_value=True)
    return redis
