"""
Shared pytest fixtures for webhooks-service tests.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


@pytest.fixture
def test_workspace_id():
    """Generate a test workspace ID."""
    return str(uuid4())


@pytest.fixture
def test_user_id():
    """Generate a test user ID."""
    return str(uuid4())


@pytest.fixture
def test_subscription_id():
    """Generate a test subscription ID."""
    return str(uuid4())


@pytest.fixture
def test_event_id():
    """Generate a test event ID."""
    return str(uuid4())


@pytest.fixture
def test_delivery_id():
    """Generate a test delivery ID."""
    return str(uuid4())


@pytest.fixture
def mock_subscription_data(test_workspace_id, test_subscription_id):
    """Create mock subscription data."""
    return {
        "subscription_id": test_subscription_id,
        "workspace_id": test_workspace_id,
        "name": "Test Webhook",
        "description": "Test webhook subscription",
        "endpoint_url": "https://webhook.site/test",
        "http_method": "POST",
        "secret_key": "test_secret_key_" + "a" * 48,
        "secret_version": 1,
        "event_types": ["asset.uploaded", "gallery.published"],
        "event_filters": {},
        "is_active": True,
        "payload_version": "v1",
        "custom_headers": {},
        "max_retries": 5,
        "created_by_user_id": str(uuid4()),
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def mock_event_data(test_workspace_id, test_event_id):
    """Create mock event data."""
    return {
        "event_id": test_event_id,
        "workspace_id": test_workspace_id,
        "event_type": "asset.uploaded",
        "event_version": "v1",
        "payload": {
            "asset_id": str(uuid4()),
            "filename": "test.jpg",
            "size": 1024,
        },
        "source_service": "backend",
        "status": "delivered",
        "idempotency_key": f"asset-{uuid4()}",
        "correlation_id": str(uuid4()),
        "occurred_at": "2024-01-01T00:00:00Z",
        "created_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def mock_delivery_data(test_event_id, test_subscription_id, test_workspace_id, test_delivery_id):
    """Create mock delivery data."""
    return {
        "delivery_id": test_delivery_id,
        "event_id": test_event_id,
        "subscription_id": test_subscription_id,
        "workspace_id": test_workspace_id,
        "status": "succeeded",
        "request_url": "https://webhook.site/test",
        "request_headers": {"Content-Type": "application/json"},
        "request_body": {"event": "test"},
        "response_status_code": 200,
        "response_body": '{"success": true}',
        "response_duration_ms": 150,
        "attempt_number": 1,
        "max_attempts": 5,
        "next_retry_at": None,
        "error_message": None,
        "created_at": "2024-01-01T00:00:00Z",
        "completed_at": "2024-01-01T00:00:01Z",
    }


@pytest.fixture
def mock_jwt_payload(test_user_id, test_workspace_id):
    """Create mock JWT payload."""
    return {
        "sub": test_user_id,
        "user_id": test_user_id,
        "workspace_id": test_workspace_id,
        "role": "admin",
        "email": "test@example.com",
        "exp": 9999999999,
        "iat": 1700000000,
    }
