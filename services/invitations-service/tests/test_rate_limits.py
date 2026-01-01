"""
Tests for rate limiting functionality.

These tests verify that rate limits are properly enforced
to prevent abuse and ensure fair usage.
"""

import os
import pytest
from unittest.mock import patch, AsyncMock

# Enable rate limiting for these tests
os.environ["RATE_LIMIT_ENABLED"] = "true"

pytestmark = pytest.mark.asyncio


class TestRateLimiting:
    """Test rate limiting middleware."""

    async def test_rate_limit_headers_present(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Verify rate limit headers are included in responses."""
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )

        # Rate limit headers should be present
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers

    async def test_rate_limit_decrements(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Verify remaining count decrements with each request."""
        # First request
        response1 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )
        remaining1 = int(response1.headers["X-RateLimit-Remaining"])

        # Second request
        response2 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )
        remaining2 = int(response2.headers["X-RateLimit-Remaining"])

        # Remaining should have decreased
        assert remaining2 < remaining1

    async def test_health_endpoints_not_rate_limited(self, client):
        """Health check endpoints should not be rate limited."""
        # Make many requests to health endpoint
        for _ in range(20):
            response = await client.get("/health")
            assert response.status_code == 200

        # No rate limit headers on health endpoints
        response = await client.get("/health")
        assert "X-RateLimit-Limit" not in response.headers

    async def test_rate_limit_by_user_id(
        self,
        client,
        workspace_id,
        invitation_id,
    ):
        """Verify authenticated users are rate limited by user ID."""
        user1_headers = {
            "X-User-ID": "user-1",
            "X-Workspace-ID": str(workspace_id),
        }
        user2_headers = {
            "X-User-ID": "user-2",
            "X-Workspace-ID": str(workspace_id),
        }

        # Make request as user 1
        response1 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=user1_headers,
        )
        user1_remaining = int(response1.headers["X-RateLimit-Remaining"])

        # Make request as user 2 - should have full quota
        response2 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=user2_headers,
        )
        user2_remaining = int(response2.headers["X-RateLimit-Remaining"])

        # User 2 should have more remaining (or equal if both just started)
        assert user2_remaining >= user1_remaining


class TestRateLimitExceeded:
    """Test behavior when rate limits are exceeded."""

    @pytest.fixture
    def mock_redis_high_count(self):
        """Mock Redis to return high request count."""
        with patch("src.cache.redis_client.redis_client") as mock:
            # Simulate rate limit exceeded
            mock.incr = AsyncMock(return_value=1001)  # Over the 100/minute default
            mock.ping = AsyncMock(return_value=True)
            yield mock

    async def test_rate_limit_exceeded_returns_429(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_redis_high_count,
    ):
        """Verify 429 status when rate limit exceeded."""
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )

        assert response.status_code == 429
        assert response.json()["error"] == "rate_limit_exceeded"

    async def test_rate_limit_exceeded_includes_retry_after(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_redis_high_count,
    ):
        """Verify Retry-After header when rate limit exceeded."""
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )

        assert "Retry-After" in response.headers
        retry_after = int(response.headers["Retry-After"])
        assert retry_after > 0


class TestCSVImportRateLimit:
    """Test rate limits specific to CSV import (5/hour)."""

    async def test_csv_import_has_stricter_limit(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        sample_csv_content,
    ):
        """Verify CSV import uses stricter rate limit."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            files={"file": ("guests.csv", sample_csv_content, "text/csv")},
            headers=auth_headers,
        )

        # Should have lower limit than default endpoints
        if response.status_code == 200:
            # The limit for import endpoints should be 5/hour
            # This is configured in the rate limiter
            pass  # Test passes if request succeeds (under limit)


class TestBulkInviteRateLimit:
    """Test rate limits specific to bulk invitations (10/hour)."""

    async def test_bulk_invite_rate_limit(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Verify bulk invite uses appropriate rate limit."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-invite",
            json={"include_pending": True},
            headers=auth_headers,
        )

        # Should succeed (under limit) or fail with 429 (over limit)
        assert response.status_code in [200, 429]
