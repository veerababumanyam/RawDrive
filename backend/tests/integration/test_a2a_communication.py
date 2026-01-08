"""Integration Tests for A2A Communication System.

Tests all components of the A2A (Agent-to-Agent) communication infrastructure:
- Service Registry (Redis-based discovery)
- A2A Client (service-to-service calls with circuit breaker)
- A2A Authentication Middleware (JWT and API key validation)
- Agent API Keys Management (CRUD operations)

Phase 4: Google A2A ADKS Integration
"""

import pytest
import asyncio
import hashlib
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import status

import jwt


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def workspace_id():
    """Return a test workspace ID."""
    return uuid4()


@pytest.fixture
def user_id():
    """Return a test user ID."""
    return uuid4()


@pytest.fixture
def service_name():
    """Return a test service name."""
    return "test-service"


@pytest.fixture
def service_id():
    """Return a test service ID."""
    return str(uuid4())


@pytest.fixture
def redis_mock():
    """Mock Redis client."""
    with patch("app.services.service_registry.get_redis") as mock:
        redis = AsyncMock()
        mock.return_value = redis
        yield redis


# ---------------------------------------------------------------------------
# Test Service Registry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_registration(redis_mock, service_name, service_id):
    """Test service registration in Redis."""
    from app.services.service_registry import (
        ServiceRegistry,
        ServiceRegistration,
        ServiceCapability,
    )

    registry = ServiceRegistry()

    # Create service registration
    registration = ServiceRegistration(
        service_name=service_name,
        service_id=service_id,
        base_url="http://test-service:8000",
        capabilities=[
            ServiceCapability(
                name="gallery:read",
                version="1.0",
                endpoint="/api/v1/galleries",
            ),
            ServiceCapability(
                name="photo:search",
                version="1.0",
                endpoint="/api/v1/search",
            ),
        ],
        health_check_endpoint="/health",
    )

    # Register service
    registered_id = await registry.register(registration)

    # Verify Redis calls
    assert registered_id == service_id
    redis_mock.setex.assert_called_once()
    # Verify capabilities indexed
    assert redis_mock.sadd.call_count == 2  # One per capability


@pytest.mark.asyncio
async def test_service_discovery_by_capability(redis_mock, service_name, service_id):
    """Test discovering services by capability."""
    from app.services.service_registry import ServiceRegistry

    registry = ServiceRegistry()

    # Mock capability discovery
    service_key = f"service:{service_name}:{service_id}"
    redis_mock.smembers.return_value = {service_key}
    redis_mock.get.return_value = '{"service_name": "test-service", "service_id": "' + service_id + '", "base_url": "http://test:8000", "capabilities": [{"name": "gallery:read", "version": "1.0", "endpoint": "/api/v1/galleries"}], "is_healthy": true}'

    # Discover services
    services = await registry.discover("gallery:read")

    # Verify results
    assert len(services) == 1
    assert services[0].service_name == service_name
    assert services[0].is_healthy is True


@pytest.mark.asyncio
async def test_service_heartbeat(redis_mock, service_name, service_id):
    """Test service heartbeat renewal."""
    from app.services.service_registry import ServiceRegistry

    registry = ServiceRegistry()

    # Send heartbeat
    await registry.heartbeat(service_name, service_id)

    # Verify TTL renewed
    redis_mock.expire.assert_called_once()


@pytest.mark.asyncio
async def test_service_mark_unhealthy(redis_mock, service_name, service_id):
    """Test marking service as unhealthy."""
    from app.services.service_registry import ServiceRegistry

    registry = ServiceRegistry()

    # Mock service data
    service_key = f"service:{service_name}:{service_id}"
    redis_mock.get.return_value = '{"service_name": "test-service", "service_id": "' + service_id + '", "is_healthy": true}'

    # Mark unhealthy
    await registry.mark_unhealthy(service_name, service_id, "Connection timeout")

    # Verify updated
    redis_mock.setex.assert_called_once()


# ---------------------------------------------------------------------------
# Test A2A Client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a2a_client_call_service_success(workspace_id, user_id):
    """Test successful service-to-service call via A2A client."""
    from app.services.a2a_client import A2AClient

    client = A2AClient()

    # Mock service discovery
    with patch.object(client.registry, "discover") as mock_discover:
        from app.services.service_registry import ServiceInfo, ServiceCapability

        mock_discover.return_value = [
            ServiceInfo(
                service_name="gallery-service",
                service_id=str(uuid4()),
                base_url="http://gallery-service:8004",
                capabilities=[
                    ServiceCapability(
                        name="gallery:read",
                        version="1.0",
                        endpoint="/api/v1/galleries",
                    )
                ],
                is_healthy=True,
                last_heartbeat=datetime.now(timezone.utc),
            )
        ]

        # Mock HTTP call
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"galleries": []}
            mock_response.raise_for_status = MagicMock()

            mock_client.get.return_value = mock_response
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None

            mock_client_class.return_value = mock_client

            # Call service
            result = await client.call_service(
                capability="gallery:read",
                method="GET /galleries",
                params={"page": 1},
                headers={"Authorization": "Bearer test-token"},
            )

            # Verify result
            assert "galleries" in result


@pytest.mark.asyncio
async def test_a2a_client_circuit_breaker_opens_on_failures():
    """Test circuit breaker opens after repeated failures."""
    from app.services.a2a_client import CircuitBreaker, CircuitBreakerConfig

    config = CircuitBreakerConfig(failure_threshold=3, timeout_seconds=10)
    breaker = CircuitBreaker(config)

    # Record failures
    for _ in range(3):
        breaker.record_failure()

    # Circuit should be open
    assert not breaker.can_attempt()


@pytest.mark.asyncio
async def test_a2a_client_circuit_breaker_half_open():
    """Test circuit breaker transitions to half-open after timeout."""
    from app.services.a2a_client import CircuitBreaker, CircuitBreakerConfig
    from datetime import timedelta

    config = CircuitBreakerConfig(failure_threshold=3, timeout_seconds=0.1)
    breaker = CircuitBreaker(config)

    # Open circuit
    for _ in range(3):
        breaker.record_failure()

    # Wait for timeout
    await asyncio.sleep(0.2)

    # Should allow attempt (half-open)
    assert breaker.can_attempt()


@pytest.mark.asyncio
async def test_a2a_client_retry_with_exponential_backoff(workspace_id):
    """Test retry logic with exponential backoff."""
    from app.services.a2a_client import A2AClient

    client = A2AClient(max_retries=2)

    # Mock service discovery
    with patch.object(client.registry, "discover") as mock_discover:
        from app.services.service_registry import ServiceInfo, ServiceCapability

        mock_discover.return_value = [
            ServiceInfo(
                service_name="test-service",
                service_id=str(uuid4()),
                base_url="http://test:8000",
                capabilities=[
                    ServiceCapability(
                        name="test:read",
                        version="1.0",
                        endpoint="/test",
                    )
                ],
                is_healthy=True,
                last_heartbeat=datetime.now(timezone.utc),
            )
        ]

        # Mock HTTP client to fail twice, then succeed
        call_count = 0

        async def mock_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Simulated failure")
            mock_response = AsyncMock()
            mock_response.json.return_value = {"success": True}
            return mock_response

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = mock_call
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_class.return_value = mock_client

            # Should succeed after retries
            result = await client.call_with_retry(
                capability="test:read",
                method="GET /test",
            )

            assert result["success"] is True
            assert call_count == 3  # 1 initial + 2 retries


# ---------------------------------------------------------------------------
# Test A2A Authentication Middleware
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a2a_auth_jwt_validation_success(workspace_id, user_id):
    """Test successful JWT token validation for A2A calls."""
    from app.middleware.a2a_auth import validate_service_jwt
    from app.utils.security import create_access_token

    # Create valid JWT token
    token = create_access_token(
        user_id=user_id,
        workspace_id=workspace_id,
        permissions=["galleries:read", "photos:read"],
        extra_claims={
            "service_name": "gallery-service",
            "service_id": str(uuid4()),
        },
    )

    # Validate token
    context = await validate_service_jwt(token)

    # Verify context
    assert context.user_id == user_id
    assert context.workspace_id == workspace_id
    assert "galleries:read" in context.permissions
    assert context.service_name == "gallery-service"


@pytest.mark.asyncio
async def test_a2a_auth_jwt_validation_expired():
    """Test JWT validation fails for expired token."""
    from app.middleware.a2a_auth import validate_service_jwt, A2AAuthError

    # Create expired token (manually)
    payload = {
        "sub": str(uuid4()),
        "workspace_id": str(uuid4()),
        "permissions": [],
        "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp()),
        "service_name": "test",
        "service_id": str(uuid4()),
    }

    # This will fail during actual validation with the secret
    with pytest.raises((A2AAuthError, jwt.exceptions.ExpiredSignatureError)):
        # Use the actual JWT library to create an expired token for testing
        from app.config.settings import get_settings
        settings = get_settings()
        from app.utils.security import _load_key

        private_key = _load_key(str(settings.jwt_private_key_path))
        token = jwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)

        await validate_service_jwt(token)


@pytest.mark.asyncio
async def test_a2a_auth_api_key_validation(workspace_id, user_id):
    """Test API key validation for external agents."""
    from app.middleware.a2a_auth import validate_api_key

    # Create test API key
    api_key = f"rawdrive_sk_{workspace_id}_test123456789012345678901234"

    # Mock database
    with patch("app.middleware.a2a_auth.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {
            "key_id": uuid4(),
            "workspace_id": workspace_id,
            "scopes": ["galleries:read", "photos:read"],
            "rate_limit_rpm": 100,
            "expires_at": None,
            "last_used_at": None,
            "is_active": True,
        }
        pool.execute.return_value = None
        mock_pool.return_value = pool

        # Validate API key
        context = await validate_api_key(api_key)

        # Verify context
        assert context.workspace_id == workspace_id
        assert context.is_agent_call is True
        assert "galleries:read" in context.api_key_scopes


@pytest.mark.asyncio
async def test_a2a_auth_api_key_inactive():
    """Test API key validation fails for inactive key."""
    from app.middleware.a2a_auth import validate_api_key, A2AAuthError

    workspace_id = uuid4()
    api_key = f"rawdrive_sk_{workspace_id}_test123456789012345678901234"

    # Mock database with inactive key
    with patch("app.middleware.a2a_auth.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {
            "key_id": uuid4(),
            "workspace_id": workspace_id,
            "scopes": ["galleries:read"],
            "rate_limit_rpm": 100,
            "expires_at": None,
            "last_used_at": None,
            "is_active": False,  # Inactive
        }
        mock_pool.return_value = pool

        # Should raise auth error
        with pytest.raises(A2AAuthError, match="inactive"):
            await validate_api_key(api_key)


@pytest.mark.asyncio
async def test_a2a_auth_api_key_expired():
    """Test API key validation fails for expired key."""
    from app.middleware.a2a_auth import validate_api_key, A2AAuthError

    workspace_id = uuid4()
    api_key = f"rawdrive_sk_{workspace_id}_test123456789012345678901234"

    # Mock database with expired key
    with patch("app.middleware.a2a_auth.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {
            "key_id": uuid4(),
            "workspace_id": workspace_id,
            "scopes": ["galleries:read"],
            "rate_limit_rpm": 100,
            "expires_at": datetime.now(timezone.utc) - timedelta(days=1),  # Expired
            "last_used_at": None,
            "is_active": True,
        }
        mock_pool.return_value = pool

        # Should raise auth error
        with pytest.raises(A2AAuthError, match="expired"):
            await validate_api_key(api_key)


@pytest.mark.asyncio
async def test_a2a_auth_permission_check():
    """Test A2A permission checking."""
    from app.middleware.a2a_auth import require_a2a_permissions, A2AContext

    # Create context with permissions
    context = A2AContext(
        service_name="test-service",
        service_id=str(uuid4()),
        user_id=uuid4(),
        workspace_id=uuid4(),
        permissions=["galleries:read", "photos:read"],
    )

    # Create permission checker
    checker = require_a2a_permissions("galleries:read")

    # Should pass
    result = await checker(context)
    assert result == context


@pytest.mark.asyncio
async def test_a2a_auth_permission_check_missing():
    """Test A2A permission check fails for missing permission."""
    from app.middleware.a2a_auth import (
        require_a2a_permissions,
        A2AContext,
        A2APermissionError,
    )

    # Create context without required permission
    context = A2AContext(
        service_name="test-service",
        service_id=str(uuid4()),
        user_id=uuid4(),
        workspace_id=uuid4(),
        permissions=["galleries:read"],  # Missing photos:write
    )

    # Create permission checker
    checker = require_a2a_permissions("photos:write")

    # Should raise permission error
    with pytest.raises(A2APermissionError):
        await checker(context)


# ---------------------------------------------------------------------------
# Test Agent API Keys Management
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_agent_api_key(client, workspace_id, user_id, auth_headers):
    """Test creating an agent API key."""
    # Mock workspace membership check
    with patch("app.api.v1.agent_api_keys.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {"membership_id": uuid4()}
        pool.execute.return_value = None
        mock_pool.return_value = pool

        # Create API key
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/agent-api-keys",
            json={
                "key_name": "Test Key",
                "scopes": ["galleries:read", "photos:read"],
                "rate_limit_rpm": 100,
                "description": "Test API key",
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()

        # Verify response
        assert "api_key" in data  # Key only returned on creation
        assert data["api_key"].startswith(f"rawdrive_sk_{workspace_id}")
        assert data["key_name"] == "Test Key"
        assert "galleries:read" in data["scopes"]


@pytest.mark.asyncio
async def test_list_agent_api_keys(client, workspace_id, user_id, auth_headers):
    """Test listing agent API keys."""
    # Mock workspace membership and keys
    with patch("app.api.v1.agent_api_keys.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {"membership_id": uuid4()}
        pool.fetch.return_value = [
            {
                "key_id": uuid4(),
                "workspace_id": workspace_id,
                "key_name": "Test Key 1",
                "scopes": ["galleries:read"],
                "rate_limit_rpm": 100,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "expires_at": None,
                "last_used_at": None,
                "description": "Test",
            }
        ]
        mock_pool.return_value = pool

        # List keys
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/agent-api-keys",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify response
        assert "keys" in data
        assert "total" in data
        assert data["total"] == 1
        assert data["keys"][0]["key_name"] == "Test Key 1"


@pytest.mark.asyncio
async def test_delete_agent_api_key(client, workspace_id, user_id, auth_headers):
    """Test deleting (revoking) an agent API key."""
    key_id = uuid4()

    # Mock workspace membership and deletion
    with patch("app.api.v1.agent_api_keys.get_postgres_pool") as mock_pool:
        pool = AsyncMock()
        pool.fetchrow.return_value = {"membership_id": uuid4()}
        pool.execute.return_value = "UPDATE 1"
        mock_pool.return_value = pool

        # Delete key
        response = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/agent-api-keys/{key_id}",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_create_agent_api_key_invalid_scope(client, workspace_id, auth_headers):
    """Test creating API key with invalid scope fails."""
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/agent-api-keys",
        json={
            "key_name": "Test Key",
            "scopes": ["invalid:scope"],  # Invalid scope
            "rate_limit_rpm": 100,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_get_available_scopes(client):
    """Test getting list of available scopes."""
    response = await client.get("/api/v1/workspaces/{workspace_id}/agent-api-keys/scopes/available")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Verify standard scopes are included
    assert "galleries:read" in data
    assert "photos:write" in data
    assert "ai:duplicate" in data


# ---------------------------------------------------------------------------
# Test Event Schema Registry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_event_schema_validation_success():
    """Test event schema validation with valid payload."""
    from app.events.schema_registry import EventSchemaRegistry, EventType

    # Valid payload
    payload = {
        "asset_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "file_name": "photo.jpg",
        "file_size": 1024000,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    # Should validate successfully
    is_valid = EventSchemaRegistry.validate_event(EventType.PHOTO_UPLOADED, payload)
    assert is_valid is True


@pytest.mark.asyncio
async def test_event_schema_validation_failure():
    """Test event schema validation with invalid payload."""
    from app.events.schema_registry import EventSchemaRegistry, EventType
    from jsonschema.exceptions import ValidationError

    # Invalid payload (missing required field)
    payload = {
        "asset_id": str(uuid4()),
        # Missing workspace_id
        "file_name": "photo.jpg",
        "file_size": 1024000,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    # Should raise validation error
    with pytest.raises(ValidationError):
        EventSchemaRegistry.validate_event(EventType.PHOTO_UPLOADED, payload)


@pytest.mark.asyncio
async def test_create_validated_event():
    """Test creating validated event helper."""
    from app.events.schema_registry import create_validated_event, EventType

    # Create event
    event = create_validated_event(
        EventType.PHOTO_UPLOADED,
        asset_id=str(uuid4()),
        workspace_id=str(uuid4()),
        file_name="test.jpg",
        file_size=1024,
        uploaded_at=datetime.now(timezone.utc).isoformat(),
    )

    # Verify event structure
    assert "asset_id" in event
    assert "workspace_id" in event
    assert event["file_name"] == "test.jpg"
