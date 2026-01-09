"""
Integration tests for Webhooks Service API endpoints.
Tests the full request/response cycle.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

# Import app after mocking
pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_db_pool():
    """Mock database pool."""
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)
    mock_conn.fetchval = AsyncMock(return_value=1)
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_conn.execute = AsyncMock(return_value="INSERT 0 1")

    mock_pool = AsyncMock()
    mock_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_conn),
        __aexit__=AsyncMock(return_value=None)
    ))

    return mock_pool, mock_conn


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock(return_value=True)
    mock.setex = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=1)
    return mock


@pytest.fixture
def auth_headers():
    """Generate mock JWT auth headers."""
    return {
        "Authorization": "Bearer test_token",
        "X-Workspace-ID": str(uuid4()),
    }


@pytest.fixture
async def app_client(mock_db_pool, mock_redis):
    """Create test client with mocked dependencies."""
    with patch('src.database.get_pool', return_value=mock_db_pool[0]):
        with patch('src.cache.redis_client.redis_client', mock_redis):
            with patch('src.middleware.auth.verify_jwt', return_value={
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "role": "admin"
            }):
                from src.main import app
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    yield client


class TestHealthEndpoints:
    """Test health check endpoints."""

    async def test_health_endpoint(self, app_client):
        """Test /health returns healthy status."""
        response = await app_client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
        assert "version" in data

    async def test_metrics_endpoint(self, app_client):
        """Test /metrics returns prometheus metrics."""
        response = await app_client.get("/metrics")

        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")


class TestSubscriptionEndpoints:
    """Test webhook subscription CRUD endpoints."""

    async def test_create_subscription(self, app_client, auth_headers, mock_db_pool):
        """Test creating a webhook subscription."""
        mock_db_pool[1].fetchrow.return_value = {
            "subscription_id": str(uuid4()),
            "workspace_id": auth_headers["X-Workspace-ID"],
            "name": "Test Webhook",
            "endpoint_url": "https://example.com/webhook",
            "event_types": ["asset.uploaded"],
            "is_active": True,
            "secret_key": "test_secret",
            "created_at": "2024-01-01T00:00:00Z",
        }

        response = await app_client.post(
            "/api/v1/subscriptions",
            headers=auth_headers,
            json={
                "name": "Test Webhook",
                "endpoint_url": "https://example.com/webhook",
                "event_types": ["asset.uploaded"],
            },
        )

        assert response.status_code in [200, 201]

    async def test_create_subscription_validation(self, app_client, auth_headers):
        """Test subscription creation validation."""
        response = await app_client.post(
            "/api/v1/subscriptions",
            headers=auth_headers,
            json={
                "name": "",  # Invalid: empty name
                "endpoint_url": "not-a-url",  # Invalid URL
                "event_types": [],  # Invalid: empty
            },
        )

        assert response.status_code == 422

    async def test_list_subscriptions(self, app_client, auth_headers, mock_db_pool):
        """Test listing webhook subscriptions."""
        mock_db_pool[1].fetch.return_value = []
        mock_db_pool[1].fetchval.return_value = 0

        response = await app_client.get(
            "/api/v1/subscriptions",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)

    async def test_get_subscription(self, app_client, auth_headers, mock_db_pool):
        """Test getting a specific subscription."""
        subscription_id = str(uuid4())
        mock_db_pool[1].fetchrow.return_value = {
            "subscription_id": subscription_id,
            "workspace_id": auth_headers["X-Workspace-ID"],
            "name": "Test Webhook",
            "endpoint_url": "https://example.com/webhook",
            "event_types": ["asset.uploaded"],
            "is_active": True,
            "created_at": "2024-01-01T00:00:00Z",
        }

        response = await app_client.get(
            f"/api/v1/subscriptions/{subscription_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_get_subscription_not_found(self, app_client, auth_headers, mock_db_pool):
        """Test getting non-existent subscription."""
        mock_db_pool[1].fetchrow.return_value = None

        response = await app_client.get(
            f"/api/v1/subscriptions/{uuid4()}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_delete_subscription(self, app_client, auth_headers, mock_db_pool):
        """Test deleting a subscription."""
        subscription_id = str(uuid4())
        mock_db_pool[1].fetchrow.return_value = {
            "subscription_id": subscription_id,
            "workspace_id": auth_headers["X-Workspace-ID"],
        }
        mock_db_pool[1].execute.return_value = "DELETE 1"

        response = await app_client.delete(
            f"/api/v1/subscriptions/{subscription_id}",
            headers=auth_headers,
        )

        assert response.status_code in [200, 204]


class TestEventTypesEndpoints:
    """Test event types catalog endpoints."""

    async def test_list_event_types(self, app_client, auth_headers):
        """Test listing all event types."""
        response = await app_client.get(
            "/api/v1/event-types",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    async def test_list_event_types_by_category(self, app_client, auth_headers):
        """Test filtering event types by category."""
        response = await app_client.get(
            "/api/v1/event-types?category=gallery",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert all(e["category"] == "gallery" for e in data)

    async def test_get_event_type(self, app_client, auth_headers):
        """Test getting specific event type details."""
        response = await app_client.get(
            "/api/v1/event-types/asset.uploaded",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["event_type"] == "asset.uploaded"


class TestEventEndpoints:
    """Test event listing endpoints."""

    async def test_list_events(self, app_client, auth_headers, mock_db_pool):
        """Test listing webhook events."""
        mock_db_pool[1].fetch.return_value = []
        mock_db_pool[1].fetchval.return_value = 0

        response = await app_client.get(
            "/api/v1/events",
            headers=auth_headers,
        )

        assert response.status_code == 200


class TestAuthenticationRequired:
    """Test authentication requirements."""

    async def test_endpoints_require_auth(self, app_client):
        """Test that protected endpoints require authentication."""
        endpoints = [
            ("/api/v1/subscriptions", "GET"),
            ("/api/v1/subscriptions", "POST"),
            ("/api/v1/events", "GET"),
        ]

        for path, method in endpoints:
            if method == "GET":
                response = await app_client.get(path)
            else:
                response = await app_client.post(path, json={})

            assert response.status_code in [401, 403], f"Expected auth error for {method} {path}"
