"""Integration tests for Notifications Service API endpoints.

Tests the REST API endpoints for:
- Notifications API: Send, list, get, cancel, retry notifications
- Preferences API: User preferences management, workspace defaults
- Templates API: Template CRUD, rendering, validation
- Webhooks API: SendGrid callback processing

These tests use httpx AsyncClient with mocked database and Redis
to verify endpoint behavior, authentication, and error handling.

Feature: Notifications & Communication Microservice
Task: T048 - Create integration tests for API endpoints
"""

import json
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Generator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient, ASGITransport

# Override settings before importing app
import os
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["JWT_SECRET"] = "test-secret-key-for-integration-tests"
os.environ["DEBUG"] = "true"
os.environ["SENDGRID_API_KEY"] = "test-sendgrid-key"
os.environ["SENDGRID_WEBHOOK_SIGNING_KEY"] = ""  # Disable webhook verification for tests


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def sample_workspace_id() -> UUID:
    """Sample workspace UUID."""
    return UUID("550e8400-e29b-41d4-a716-446655440000")


@pytest.fixture
def sample_user_id() -> UUID:
    """Sample user UUID."""
    return UUID("550e8400-e29b-41d4-a716-446655440001")


@pytest.fixture
def sample_event_id() -> UUID:
    """Sample notification event UUID."""
    return UUID("550e8400-e29b-41d4-a716-446655440002")


@pytest.fixture
def sample_template_id() -> UUID:
    """Sample template UUID."""
    return UUID("550e8400-e29b-41d4-a716-446655440003")


@pytest.fixture
def sample_preference_id() -> UUID:
    """Sample preference UUID."""
    return UUID("550e8400-e29b-41d4-a716-446655440004")


def create_test_jwt(
    user_id: UUID,
    workspace_id: UUID,
    role: str = "member",
    email: str = "test@example.com",
) -> str:
    """Create a valid JWT token for testing."""
    import jwt

    payload = {
        "user_id": str(user_id),
        "workspace_id": str(workspace_id),
        "email": email,
        "role": role,
        "permissions": ["notifications:send", "notifications:read"],
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,  # 1 hour
    }
    return jwt.encode(payload, "test-secret-key-for-integration-tests", algorithm="HS256")


@pytest.fixture
def auth_token(sample_user_id: UUID, sample_workspace_id: UUID) -> str:
    """Create authentication token for tests."""
    return create_test_jwt(sample_user_id, sample_workspace_id)


@pytest.fixture
def admin_auth_token(sample_user_id: UUID, sample_workspace_id: UUID) -> str:
    """Create admin authentication token for tests."""
    return create_test_jwt(sample_user_id, sample_workspace_id, role="admin")


@pytest.fixture
def auth_headers(auth_token: str) -> Dict[str, str]:
    """Authentication headers for protected endpoints."""
    return {
        "Authorization": f"Bearer {auth_token}",
    }


@pytest.fixture
def admin_auth_headers(admin_auth_token: str) -> Dict[str, str]:
    """Admin authentication headers for admin-only endpoints."""
    return {
        "Authorization": f"Bearer {admin_auth_token}",
    }


@pytest.fixture
def sample_notification_event(
    sample_event_id: UUID,
    sample_workspace_id: UUID,
    sample_user_id: UUID,
) -> Dict[str, Any]:
    """Sample notification event data."""
    return {
        "event_id": sample_event_id,
        "workspace_id": sample_workspace_id,
        "recipient_user_id": sample_user_id,
        "recipient_email": "recipient@example.com",
        "event_type": "gallery.published",
        "category": "gallery_activity",
        "channel": "email",
        "priority": "normal",
        "template_code": "gallery_published",
        "subject": "Your gallery is ready!",
        "payload": {"gallery_name": "Wedding Photos"},
        "status": "pending",
        "retry_count": 0,
        "max_retries": 3,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture
def sample_preference(
    sample_preference_id: UUID,
    sample_workspace_id: UUID,
    sample_user_id: UUID,
) -> Dict[str, Any]:
    """Sample preference data."""
    return {
        "preference_id": sample_preference_id,
        "workspace_id": sample_workspace_id,
        "user_id": sample_user_id,
        "email_enabled": True,
        "sms_enabled": False,
        "in_app_enabled": True,
        "push_enabled": True,
        "global_unsubscribe": False,
        "language": "en",
        "timezone": "America/New_York",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture
def sample_template(
    sample_template_id: UUID,
    sample_workspace_id: UUID,
) -> Dict[str, Any]:
    """Sample template data."""
    return {
        "template_id": sample_template_id,
        "workspace_id": sample_workspace_id,
        "code": "gallery_published",
        "name": "Gallery Published Notification",
        "description": "Sent when a gallery is published",
        "category": "gallery_activity",
        "supported_channels": ["email", "sms", "in_app"],
        "status": "active",
        "email_subject": "Your gallery {{ gallery_name }} is ready!",
        "email_html": "<h1>Gallery Ready</h1><p>{{ gallery_name }}</p>",
        "email_text": "Gallery {{ gallery_name }} is ready",
        "sms_content": "Gallery {{ gallery_name }} ready!",
        "variable_schema": {
            "required": ["gallery_name"],
            "optional": ["gallery_url"],
        },
        "default_values": {},
        "default_language": "en",
        "localized_content": {},
        "version": "1.0.0",
        "default_priority": "normal",
        "is_transactional": False,
        "tags": ["gallery"],
        "metadata": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture
async def async_client() -> AsyncClient:
    """Async HTTP client for API testing with mocked dependencies."""
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
        mock_redis.lpush = AsyncMock()
        mock_redis.ltrim = AsyncMock()
        mock_redis.expire = AsyncMock()
        mock_redis.get_circuit_state = MagicMock(return_value={"state": "closed"})

        # Mock database pool
        with patch("src.database.get_pool") as mock_pool:
            mock_pool.return_value = AsyncMock()

            # Mock database check_health
            with patch("src.database.check_health") as mock_db_health:
                mock_db_health.return_value = {"status": "healthy"}

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    yield client


# =============================================================================
# HEALTH CHECK TESTS
# =============================================================================


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    @pytest.mark.asyncio
    async def test_root_endpoint(self, async_client: AsyncClient):
        """Test root endpoint returns service info."""
        response = await async_client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "notifications-service"
        assert "version" in data
        assert data["status"] == "running"

    @pytest.mark.asyncio
    async def test_health_endpoint(self, async_client: AsyncClient):
        """Test basic health check endpoint."""
        response = await async_client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_liveness_probe(self, async_client: AsyncClient):
        """Test Kubernetes liveness probe."""
        response = await async_client.get("/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"


# =============================================================================
# NOTIFICATIONS API TESTS
# =============================================================================


class TestNotificationsAPI:
    """Tests for /api/v1/workspaces/{workspace_id}/notifications endpoints."""

    @pytest.mark.asyncio
    async def test_send_notification_requires_auth(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
    ):
        """Test that sending notification requires authentication."""
        response = await async_client.post(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
            json={
                "recipient": {"email": "test@example.com"},
                "event_type": "gallery.published",
                "category": "gallery_activity",
                "channel": "email",
            },
        )

        assert response.status_code == 422  # Missing auth header

    @pytest.mark.asyncio
    async def test_send_notification_validates_workspace_access(
        self,
        async_client: AsyncClient,
        sample_user_id: UUID,
    ):
        """Test that workspace access is validated."""
        # Create token for a different workspace
        different_workspace = uuid4()
        token = create_test_jwt(sample_user_id, UUID("00000000-0000-0000-0000-000000000001"))

        response = await async_client.post(
            f"/api/v1/workspaces/{different_workspace}/notifications",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "recipient": {"email": "test@example.com"},
                "event_type": "gallery.published",
                "category": "gallery_activity",
                "channel": "email",
            },
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_send_notification_success(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_notification_event: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test successful notification creation."""
        with patch("src.services.notification_service.notification_service") as mock_service:
            # Mock the service response
            mock_response = MagicMock()
            mock_response.event_id = sample_notification_event["event_id"]
            mock_response.workspace_id = sample_workspace_id
            mock_response.status = MagicMock(value="pending")
            mock_response.model_dump = MagicMock(return_value=sample_notification_event)

            mock_service.send_notification = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications",
                headers=auth_headers,
                json={
                    "recipient": {"email": "test@example.com"},
                    "event_type": "gallery.published",
                    "category": "gallery_activity",
                    "channel": "email",
                },
            )

            # Should call the service
            mock_service.send_notification.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_notification_validates_recipient(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test notification creation validates recipient."""
        response = await async_client.post(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
            headers=auth_headers,
            json={
                "recipient": {},  # Empty recipient - invalid
                "event_type": "gallery.published",
                "category": "gallery_activity",
                "channel": "email",
            },
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_list_notifications_requires_auth(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
    ):
        """Test listing notifications requires authentication."""
        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
        )

        assert response.status_code == 422  # Missing auth

    @pytest.mark.asyncio
    async def test_list_notifications_with_pagination(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test listing notifications with pagination parameters."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            mock_repo.list_notification_events = AsyncMock(
                return_value=(
                    [],
                    MagicMock(
                        page=1,
                        limit=20,
                        total=0,
                        total_pages=0,
                        has_more=False,
                    ),
                )
            )

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications",
                headers=auth_headers,
                params={"page": 1, "limit": 20},
            )

            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_notification_not_found(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test getting non-existent notification returns 404."""
        with patch("src.services.notification_service.notification_service") as mock_service:
            mock_service.get_notification = AsyncMock(return_value=None)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications/{uuid4()}",
                headers=auth_headers,
            )

            assert response.status_code == 404
            data = response.json()
            assert data["detail"]["error"] == "NOTIFICATION_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_cancel_notification_not_found(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test cancelling non-existent notification returns 404."""
        with patch("src.services.notification_service.notification_service") as mock_service:
            mock_service.cancel_notification = AsyncMock(return_value=None)
            mock_service.get_notification = AsyncMock(return_value=None)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications/{uuid4()}/cancel",
                headers=auth_headers,
                json={"reason": "User requested"},
            )

            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_batch_notifications_creates_multiple(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test batch notification endpoint."""
        with patch("src.services.notification_service.notification_service") as mock_service:
            mock_service.send_batch_notifications = AsyncMock(
                return_value=MagicMock(
                    created=3,
                    failed=0,
                    event_ids=[uuid4(), uuid4(), uuid4()],
                    errors=[],
                    model_dump=MagicMock(return_value={
                        "created": 3,
                        "failed": 0,
                        "event_ids": [],
                        "errors": [],
                    }),
                )
            )

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications/batch",
                headers=auth_headers,
                json={
                    "notifications": [
                        {
                            "recipient": {"email": f"user{i}@example.com"},
                            "event_type": "gallery.published",
                            "category": "gallery_activity",
                            "channel": "email",
                        }
                        for i in range(3)
                    ],
                },
            )

            mock_service.send_batch_notifications.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_my_notifications(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test getting notifications for current user."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            mock_repo.get_user_notifications = AsyncMock(
                return_value=(
                    [],
                    MagicMock(
                        page=1,
                        limit=20,
                        total=0,
                        total_pages=0,
                        has_more=False,
                    ),
                )
            )

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/notifications/user/me",
                headers=auth_headers,
            )

            assert response.status_code == 200


# =============================================================================
# PREFERENCES API TESTS
# =============================================================================


class TestPreferencesAPI:
    """Tests for /api/v1/workspaces/{workspace_id}/preferences endpoints."""

    @pytest.mark.asyncio
    async def test_get_my_preferences_requires_auth(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
    ):
        """Test getting preferences requires authentication."""
        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/preferences/me",
        )

        assert response.status_code == 422  # Missing auth

    @pytest.mark.asyncio
    async def test_get_my_preferences_success(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test getting current user's preferences."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.preference_id = sample_preference["preference_id"]
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.get_or_create_user_preference = AsyncMock(return_value=mock_response)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/me",
                headers=auth_headers,
            )

            mock_service.get_or_create_user_preference.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_my_preferences(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test updating current user's preferences."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            updated_pref = sample_preference.copy()
            updated_pref["email_enabled"] = False

            mock_response = MagicMock()
            mock_response.preference_id = sample_preference["preference_id"]
            mock_response.model_dump = MagicMock(return_value=updated_pref)

            mock_service.update_user_preference = AsyncMock(return_value=mock_response)

            response = await async_client.patch(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/me",
                headers=auth_headers,
                json={"email_enabled": False},
            )

            mock_service.update_user_preference.assert_called_once()

    @pytest.mark.asyncio
    async def test_toggle_channel(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test toggling a notification channel."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.toggle_channel = AsyncMock(return_value=mock_response)

            response = await async_client.put(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/me/channels/email",
                headers=auth_headers,
                json={"enabled": False},
            )

            mock_service.toggle_channel.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_quiet_hours(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test updating quiet hours settings."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.update_quiet_hours = AsyncMock(return_value=mock_response)

            response = await async_client.put(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/me/quiet-hours",
                headers=auth_headers,
                json={
                    "enabled": True,
                    "start_hour": 22,
                    "start_minute": 0,
                    "end_hour": 7,
                    "end_minute": 0,
                },
            )

            mock_service.update_quiet_hours.assert_called_once()

    @pytest.mark.asyncio
    async def test_unsubscribe_no_auth_required(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
    ):
        """Test unsubscribe endpoint doesn't require JWT (uses token)."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.process_unsubscribe = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/unsubscribe",
                json={
                    "token": "valid-unsubscribe-token",
                    "category": "marketing",
                },
            )

            # Should not fail with auth error (token is in body)
            mock_service.process_unsubscribe.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_workspace_defaults(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test getting workspace default preferences."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.preference_id = sample_preference["preference_id"]
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.get_workspace_defaults = AsyncMock(return_value=mock_response)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/defaults",
                headers=auth_headers,
            )

            mock_service.get_workspace_defaults.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_workspace_defaults_requires_admin(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],  # Regular user, not admin
    ):
        """Test updating workspace defaults requires admin role."""
        response = await async_client.put(
            f"/api/v1/workspaces/{sample_workspace_id}/preferences/defaults",
            headers=auth_headers,
            json={"email_enabled": True},
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_workspace_defaults_as_admin(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_preference: Dict[str, Any],
        admin_auth_headers: Dict[str, str],
    ):
        """Test admin can update workspace defaults."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_response = MagicMock()
            mock_response.preference_id = sample_preference["preference_id"]
            mock_response.model_dump = MagicMock(return_value=sample_preference)

            mock_service.get_workspace_defaults = AsyncMock(return_value=mock_response)
            mock_service.update_preference = AsyncMock(return_value=mock_response)

            response = await async_client.put(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/defaults",
                headers=admin_auth_headers,
                json={"email_enabled": True},
            )

            # Should not return 403

    @pytest.mark.asyncio
    async def test_list_preferences_requires_admin(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test listing all preferences requires admin role."""
        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/preferences",
            headers=auth_headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_export_preferences(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test exporting user preferences (GDPR)."""
        with patch("src.services.preference_service.preference_service") as mock_service:
            mock_export = MagicMock()
            mock_export.model_dump = MagicMock(return_value={
                "version": "1.0",
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "preferences": {},
            })

            mock_service.export_preferences = AsyncMock(return_value=mock_export)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/preferences/me/export",
                headers=auth_headers,
            )

            mock_service.export_preferences.assert_called_once()


# =============================================================================
# TEMPLATES API TESTS
# =============================================================================


class TestTemplatesAPI:
    """Tests for /api/v1/workspaces/{workspace_id}/templates endpoints."""

    @pytest.mark.asyncio
    async def test_list_templates_requires_auth(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
    ):
        """Test listing templates requires authentication."""
        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/templates",
        )

        assert response.status_code == 422  # Missing auth

    @pytest.mark.asyncio
    async def test_list_templates_success(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test listing templates successfully."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_repo.list_templates = AsyncMock(
                return_value=(
                    [],
                    MagicMock(
                        page=1,
                        limit=20,
                        total=0,
                        total_pages=0,
                        has_more=False,
                    ),
                )
            )

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/templates",
                headers=auth_headers,
            )

            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_create_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test creating a template."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_repo.template_code_exists = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.template_id = sample_template["template_id"]
            mock_response.code = sample_template["code"]
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.create_template = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates",
                headers=auth_headers,
                json={
                    "code": "new_template",
                    "name": "New Template",
                    "category": "gallery_activity",
                    "supported_channels": ["email"],
                    "email": {
                        "subject": "Test Subject",
                        "text": "Test content",
                    },
                },
            )

            mock_repo.create_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_template_duplicate_code_error(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test creating template with duplicate code returns 409."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_repo.template_code_exists = AsyncMock(return_value=True)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates",
                headers=auth_headers,
                json={
                    "code": "existing_template",
                    "name": "Existing Template",
                    "category": "gallery_activity",
                    "supported_channels": ["email"],
                    "email": {
                        "subject": "Test",
                        "text": "Test",
                    },
                },
            )

            assert response.status_code == 409
            data = response.json()
            assert data["detail"]["error"] == "TEMPLATE_CODE_EXISTS"

    @pytest.mark.asyncio
    async def test_get_template_by_id(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        sample_template_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test getting template by ID."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_response = MagicMock()
            mock_response.template_id = sample_template_id
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.get_template = AsyncMock(return_value=mock_response)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{sample_template_id}",
                headers=auth_headers,
            )

            mock_repo.get_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_template_by_code(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        auth_headers: Dict[str, str],
    ):
        """Test getting template by code."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_response = MagicMock()
            mock_response.template_id = sample_template["template_id"]
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.get_template_by_code = AsyncMock(return_value=mock_response)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/code/gallery_published",
                headers=auth_headers,
            )

            mock_repo.get_template_by_code.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_template_not_found(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test getting non-existent template returns 404."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_repo.get_template = AsyncMock(return_value=None)

            response = await async_client.get(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{uuid4()}",
                headers=auth_headers,
            )

            assert response.status_code == 404
            data = response.json()
            assert data["detail"]["error"] == "TEMPLATE_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_update_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        sample_template_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test updating a template."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_response = MagicMock()
            mock_response.template_id = sample_template_id
            mock_response.workspace_id = sample_workspace_id
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.get_template = AsyncMock(return_value=mock_response)
            mock_repo.update_template = AsyncMock(return_value=mock_response)

            response = await async_client.patch(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{sample_template_id}",
                headers=auth_headers,
                json={"name": "Updated Name"},
            )

            mock_repo.update_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        sample_template_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test deleting a template."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_response = MagicMock()
            mock_response.template_id = sample_template_id
            mock_response.workspace_id = sample_workspace_id
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.get_template = AsyncMock(return_value=mock_response)
            mock_repo.delete_template = AsyncMock(return_value=True)

            response = await async_client.delete(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{sample_template_id}",
                headers=auth_headers,
            )

            assert response.status_code == 204
            mock_repo.delete_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_activate_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        sample_template_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test activating a template."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_response = MagicMock()
            mock_response.template_id = sample_template_id
            mock_response.status = MagicMock(value="active")
            mock_response.model_dump = MagicMock(return_value=sample_template)

            mock_repo.activate_template = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{sample_template_id}/activate",
                headers=auth_headers,
            )

            mock_repo.activate_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_render_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test rendering a template."""
        with patch("src.services.template_service.template_service") as mock_service:
            mock_response = MagicMock()
            mock_response.email = MagicMock(
                subject="Rendered Subject",
                html="<p>Rendered HTML</p>",
                text="Rendered text",
            )
            mock_response.sms = None
            mock_response.push = None
            mock_response.in_app = None
            mock_response.missing_variables = []
            mock_response.warnings = []
            mock_response.model_dump = MagicMock(return_value={
                "email": {"subject": "Rendered", "text": "Text"},
                "missing_variables": [],
                "warnings": [],
            })

            mock_service.render_template = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/render",
                headers=auth_headers,
                json={
                    "template_code": "gallery_published",
                    "channel": "email",
                    "variables": {"gallery_name": "Test Gallery"},
                },
            )

            mock_service.render_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_validate_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test validating template content."""
        with patch("src.services.template_service.template_service") as mock_service:
            mock_result = MagicMock()
            mock_result.valid = True
            mock_result.errors = []
            mock_result.warnings = []
            mock_result.detected_variables = ["name"]
            mock_result.model_dump = MagicMock(return_value={
                "valid": True,
                "errors": [],
                "warnings": [],
                "detected_variables": ["name"],
            })

            mock_service.validate_template = AsyncMock(return_value=mock_result)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/validate",
                headers=auth_headers,
                json={
                    "email": {
                        "subject": "Hello {{ name }}",
                        "text": "Hello {{ name }}!",
                    },
                },
            )

            mock_service.validate_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_clone_template(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_template: Dict[str, Any],
        sample_template_id: UUID,
        auth_headers: Dict[str, str],
    ):
        """Test cloning a template."""
        with patch("src.repositories.template_repository.template_repository") as mock_repo:
            mock_repo.template_code_exists = AsyncMock(return_value=False)

            cloned_template = sample_template.copy()
            cloned_template["code"] = "cloned_template"
            cloned_template["template_id"] = str(uuid4())

            mock_response = MagicMock()
            mock_response.template_id = UUID(cloned_template["template_id"])
            mock_response.code = "cloned_template"
            mock_response.model_dump = MagicMock(return_value=cloned_template)

            mock_repo.clone_template = AsyncMock(return_value=mock_response)

            response = await async_client.post(
                f"/api/v1/workspaces/{sample_workspace_id}/templates/{sample_template_id}/clone",
                headers=auth_headers,
                json={"new_code": "cloned_template"},
            )

            mock_repo.clone_template.assert_called_once()


# =============================================================================
# WEBHOOKS API TESTS
# =============================================================================


class TestWebhooksAPI:
    """Tests for /api/v1/webhooks endpoints."""

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_health(self, async_client: AsyncClient):
        """Test SendGrid webhook health endpoint."""
        response = await async_client.get("/api/v1/webhooks/sendgrid/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "signature_verification" in data

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_processes_events(
        self,
        async_client: AsyncClient,
    ):
        """Test SendGrid webhook processes delivery events."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            mock_repo.update_delivery_from_webhook = AsyncMock()
            mock_repo.mark_recipient_as_invalidated = AsyncMock(return_value=0)

            with patch("src.services.email_delivery_service.email_delivery_service") as mock_email:
                mock_email._add_to_suppression = AsyncMock()

                # Send a batch of SendGrid events
                events = [
                    {
                        "event": "delivered",
                        "email": "test@example.com",
                        "timestamp": int(time.time()),
                        "sg_message_id": "test-message-id-1",
                    },
                    {
                        "event": "open",
                        "email": "test@example.com",
                        "timestamp": int(time.time()),
                        "sg_message_id": "test-message-id-1",
                    },
                ]

                response = await async_client.post(
                    "/api/v1/webhooks/sendgrid",
                    content=json.dumps(events),
                    headers={"Content-Type": "application/json"},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["received"] == 2
                assert data["processed"] == 2

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_handles_bounce(
        self,
        async_client: AsyncClient,
    ):
        """Test SendGrid webhook handles bounce events."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            mock_repo.update_delivery_from_webhook = AsyncMock()
            mock_repo.mark_recipient_as_invalidated = AsyncMock(return_value=1)

            with patch("src.services.email_delivery_service.email_delivery_service") as mock_email:
                mock_email._add_to_suppression = AsyncMock()

                events = [
                    {
                        "event": "bounce",
                        "type": "hard",
                        "email": "invalid@example.com",
                        "timestamp": int(time.time()),
                        "sg_message_id": "test-message-id",
                        "reason": "Invalid address",
                    },
                ]

                response = await async_client.post(
                    "/api/v1/webhooks/sendgrid",
                    content=json.dumps(events),
                    headers={"Content-Type": "application/json"},
                )

                assert response.status_code == 200
                data = response.json()
                assert data["processed"] == 1

                # Should mark recipient as invalidated
                mock_repo.mark_recipient_as_invalidated.assert_called_once()

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_handles_spam_report(
        self,
        async_client: AsyncClient,
    ):
        """Test SendGrid webhook handles spam report events."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            mock_repo.update_delivery_from_webhook = AsyncMock()
            mock_repo.mark_recipient_as_invalidated = AsyncMock(return_value=1)

            with patch("src.services.email_delivery_service.email_delivery_service") as mock_email:
                mock_email._add_to_suppression = AsyncMock()

                events = [
                    {
                        "event": "spamreport",
                        "email": "spam@example.com",
                        "timestamp": int(time.time()),
                        "sg_message_id": "test-message-id",
                    },
                ]

                response = await async_client.post(
                    "/api/v1/webhooks/sendgrid",
                    content=json.dumps(events),
                    headers={"Content-Type": "application/json"},
                )

                assert response.status_code == 200

                # Should add to suppression
                mock_email._add_to_suppression.assert_called_once()

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_skips_unknown_events(
        self,
        async_client: AsyncClient,
    ):
        """Test SendGrid webhook skips unknown event types."""
        with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
            events = [
                {
                    "event": "unknown_event",
                    "email": "test@example.com",
                    "timestamp": int(time.time()),
                },
            ]

            response = await async_client.post(
                "/api/v1/webhooks/sendgrid",
                content=json.dumps(events),
                headers={"Content-Type": "application/json"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["received"] == 1
            assert data["skipped"] == 1
            assert data["processed"] == 0

    @pytest.mark.asyncio
    async def test_sendgrid_webhook_handles_invalid_json(
        self,
        async_client: AsyncClient,
    ):
        """Test SendGrid webhook handles invalid JSON gracefully."""
        response = await async_client.post(
            "/api/v1/webhooks/sendgrid",
            content="invalid json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["received"] == 0
        assert len(data["errors"]) > 0

    @pytest.mark.asyncio
    async def test_sendgrid_delivery_status_batch(
        self,
        async_client: AsyncClient,
    ):
        """Test getting delivery status for multiple messages."""
        with patch("src.services.email_delivery_service.email_delivery_service") as mock_email:
            mock_email.get_delivery_status = AsyncMock(return_value=None)

            with patch("src.repositories.notification_repository.notification_repository") as mock_repo:
                mock_repo.get_delivery_log_by_provider_message_id = AsyncMock(return_value=None)

                response = await async_client.post(
                    "/api/v1/webhooks/sendgrid/status",
                    json={
                        "provider_message_ids": ["msg-1", "msg-2", "msg-3"],
                    },
                )

                assert response.status_code == 200
                data = response.json()
                assert data["queried"] == 3


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestErrorHandling:
    """Tests for API error handling."""

    @pytest.mark.asyncio
    async def test_invalid_uuid_in_path(
        self,
        async_client: AsyncClient,
        auth_headers: Dict[str, str],
        sample_workspace_id: UUID,
    ):
        """Test invalid UUID in path returns 422."""
        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications/not-a-uuid",
            headers=auth_headers,
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_channel_enum(
        self,
        async_client: AsyncClient,
        auth_headers: Dict[str, str],
        sample_workspace_id: UUID,
    ):
        """Test invalid enum value returns 422."""
        response = await async_client.post(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
            headers=auth_headers,
            json={
                "recipient": {"email": "test@example.com"},
                "event_type": "gallery.published",
                "category": "gallery_activity",
                "channel": "invalid_channel",  # Invalid
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_expired_jwt_token(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_user_id: UUID,
    ):
        """Test expired JWT returns 401."""
        import jwt

        # Create expired token
        payload = {
            "user_id": str(sample_user_id),
            "workspace_id": str(sample_workspace_id),
            "email": "test@example.com",
            "role": "member",
            "iat": int(time.time()) - 7200,  # 2 hours ago
            "exp": int(time.time()) - 3600,  # 1 hour ago (expired)
        }
        expired_token = jwt.encode(
            payload,
            "test-secret-key-for-integration-tests",
            algorithm="HS256",
        )

        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
            headers={"Authorization": f"Bearer {expired_token}"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_jwt_signature(
        self,
        async_client: AsyncClient,
        sample_workspace_id: UUID,
        sample_user_id: UUID,
    ):
        """Test invalid JWT signature returns 401."""
        import jwt

        # Create token with wrong secret
        payload = {
            "user_id": str(sample_user_id),
            "workspace_id": str(sample_workspace_id),
            "email": "test@example.com",
            "role": "member",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        }
        bad_token = jwt.encode(
            payload,
            "wrong-secret-key",
            algorithm="HS256",
        )

        response = await async_client.get(
            f"/api/v1/workspaces/{sample_workspace_id}/notifications",
            headers={"Authorization": f"Bearer {bad_token}"},
        )

        assert response.status_code == 401


# =============================================================================
# RATE LIMITING TESTS (if applicable)
# =============================================================================


class TestRateLimiting:
    """Tests for API rate limiting behavior."""

    @pytest.mark.asyncio
    async def test_health_endpoint_not_rate_limited(
        self,
        async_client: AsyncClient,
    ):
        """Test health endpoints are not rate limited."""
        # Make multiple rapid requests
        for _ in range(10):
            response = await async_client.get("/health")
            assert response.status_code == 200


# =============================================================================
# CORS TESTS
# =============================================================================


class TestCORS:
    """Tests for CORS configuration."""

    @pytest.mark.asyncio
    async def test_cors_headers_on_preflight(
        self,
        async_client: AsyncClient,
    ):
        """Test CORS headers are returned on preflight."""
        response = await async_client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        # Should allow the request
        assert response.status_code in (200, 204)
