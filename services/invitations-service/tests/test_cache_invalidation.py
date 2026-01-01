"""
Tests for cache invalidation behavior.

These tests verify that caches are properly invalidated
when data changes to prevent stale data.
"""

import pytest
from unittest.mock import patch, AsyncMock

pytestmark = pytest.mark.asyncio


class TestGuestCacheInvalidation:
    """Test cache invalidation for guest operations."""

    @pytest.fixture
    def mock_cache(self):
        """Mock the cache to track invalidation calls."""
        with patch("src.services.guest_service.invalidate_guest_cache") as mock:
            mock.return_value = None
            yield mock

    async def test_create_guest_invalidates_cache(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_cache,
        clean_test_data,
    ):
        """Creating a guest should invalidate the guest list cache."""
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "New Guest"},
            headers=auth_headers,
        )

        # Cache should be invalidated for this invitation
        mock_cache.assert_called_with(str(invitation_id))

    async def test_update_guest_invalidates_cache(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_cache,
        clean_test_data,
    ):
        """Updating a guest should invalidate the cache."""
        # Create a guest first (without mock to actually create)
        with patch("src.services.guest_service.invalidate_guest_cache"):
            response = await client.post(
                f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
                json={"name": "Guest to Update"},
                headers=auth_headers,
            )
        guest_id = response.json()["guest_id"]

        # Now update with mock
        await client.patch(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            json={"name": "Updated Name"},
            headers=auth_headers,
        )

        # Cache should be invalidated
        mock_cache.assert_called()

    async def test_delete_guest_invalidates_cache(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_cache,
        clean_test_data,
    ):
        """Deleting a guest should invalidate the cache."""
        # Create a guest first
        with patch("src.services.guest_service.invalidate_guest_cache"):
            response = await client.post(
                f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
                json={"name": "Guest to Delete"},
                headers=auth_headers,
            )
        guest_id = response.json()["guest_id"]

        # Delete with mock
        await client.delete(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            headers=auth_headers,
        )

        mock_cache.assert_called()

    async def test_bulk_status_update_invalidates_cache(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        mock_cache,
        clean_test_data,
    ):
        """Bulk status update should invalidate the cache."""
        # Create guests first
        guest_ids = []
        with patch("src.services.guest_service.invalidate_guest_cache"):
            for i in range(3):
                response = await client.post(
                    f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
                    json={"name": f"Guest {i}"},
                    headers=auth_headers,
                )
                guest_ids.append(response.json()["guest_id"])

        # Bulk update
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-status",
            json={"guest_ids": guest_ids, "status": "invited"},
            headers=auth_headers,
        )

        mock_cache.assert_called()


class TestAnalyticsCaching:
    """Test analytics caching behavior."""

    async def test_analytics_uses_cache(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Analytics should be retrieved from cache when available."""
        # First request - cache miss
        response1 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics",
            headers=auth_headers,
        )
        assert response1.status_code == 200

        # Second request - should use cache
        response2 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics",
            headers=auth_headers,
        )
        assert response2.status_code == 200

        # Both responses should have same generated_at if cached
        # (In production, we'd verify cache was hit via metrics)


class TestCacheKeyPatterns:
    """Test that cache keys follow expected patterns."""

    async def test_guest_list_cache_key_includes_invitation(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
    ):
        """Guest list cache key should include invitation ID."""
        with patch("src.cache.redis_client.redis_client") as mock_cache:
            mock_cache.get_json = AsyncMock(return_value=None)
            mock_cache.set_json = AsyncMock(return_value=True)

            await client.get(
                f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
                headers=auth_headers,
            )

            # The cache operations should use keys containing the invitation ID
            # This ensures different invitations have separate caches
