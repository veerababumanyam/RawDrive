"""
Tests for workspace isolation in guest management.

These tests verify that guests from one workspace cannot be accessed
by users from another workspace - a critical security requirement.
"""

import pytest
from uuid import uuid4

pytestmark = pytest.mark.asyncio


class TestWorkspaceIsolation:
    """Test workspace-level data isolation."""

    async def test_guest_not_accessible_from_other_workspace(
        self,
        client,
        auth_headers,
        other_workspace_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """
        Verify that a guest created in workspace A cannot be accessed
        from workspace B. Should return 404 (not 403) to prevent
        information leakage about guest existence.
        """
        # Create a guest in workspace A
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Test Guest", "email": "test@example.com"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        guest_id = response.json()["guest_id"]

        # Try to access from workspace B - should get 403 (access denied)
        other_workspace_id = other_workspace_headers["X-Workspace-ID"]
        response = await client.get(
            f"/api/v1/workspaces/{other_workspace_id}/guests/{guest_id}",
            headers=other_workspace_headers,
        )
        # Should be 404 because guest doesn't exist in that workspace
        assert response.status_code == 404

    async def test_guest_list_only_shows_workspace_guests(
        self,
        client,
        auth_headers,
        other_workspace_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Verify that listing guests only returns guests from the current workspace."""
        # Create guests in workspace A
        for i in range(3):
            await client.post(
                f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
                json={"name": f"Guest {i}", "email": f"guest{i}@example.com"},
                headers=auth_headers,
            )

        # List guests from workspace A - should see 3 guests
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["total"] == 3

        # List guests from workspace B - should see 0 guests
        other_workspace_id = other_workspace_headers["X-Workspace-ID"]
        other_invitation_id = uuid4()
        response = await client.get(
            f"/api/v1/workspaces/{other_workspace_id}/invitations/{other_invitation_id}/guests",
            headers=other_workspace_headers,
        )
        assert response.status_code == 200
        assert response.json()["total"] == 0

    async def test_update_guest_requires_correct_workspace(
        self,
        client,
        auth_headers,
        other_workspace_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Verify that updating a guest requires the correct workspace."""
        # Create a guest
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Original Name"},
            headers=auth_headers,
        )
        guest_id = response.json()["guest_id"]

        # Try to update from wrong workspace
        other_workspace_id = other_workspace_headers["X-Workspace-ID"]
        response = await client.patch(
            f"/api/v1/workspaces/{other_workspace_id}/guests/{guest_id}",
            json={"name": "Hacked Name"},
            headers=other_workspace_headers,
        )
        assert response.status_code == 404

        # Verify original name is unchanged
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Original Name"

    async def test_delete_guest_requires_correct_workspace(
        self,
        client,
        auth_headers,
        other_workspace_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Verify that deleting a guest requires the correct workspace."""
        # Create a guest
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Guest to Not Delete"},
            headers=auth_headers,
        )
        guest_id = response.json()["guest_id"]

        # Try to delete from wrong workspace
        other_workspace_id = other_workspace_headers["X-Workspace-ID"]
        response = await client.delete(
            f"/api/v1/workspaces/{other_workspace_id}/guests/{guest_id}",
            headers=other_workspace_headers,
        )
        assert response.status_code == 404

        # Verify guest still exists
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_guest_stats_only_counts_workspace_guests(
        self,
        client,
        auth_headers,
        workspace_id,
        invitation_id,
        clean_test_data,
    ):
        """Verify that guest stats only include guests from the current workspace."""
        # Create guests
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Guest 1", "plus_ones": 2},
            headers=auth_headers,
        )
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Guest 2", "plus_ones": 1},
            headers=auth_headers,
        )

        # Get stats
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/stats",
            headers=auth_headers,
        )
        assert response.status_code == 200
        stats = response.json()
        assert stats["total_guests"] == 2
        assert stats["total_plus_ones"] == 3


class TestAuthenticationRequired:
    """Test that authentication is required for all protected endpoints."""

    async def test_create_guest_requires_auth(self, client, workspace_id, invitation_id):
        """Creating a guest without auth should fail."""
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={"name": "Unauthorized Guest"},
        )
        assert response.status_code == 401

    async def test_list_guests_requires_auth(self, client, workspace_id, invitation_id):
        """Listing guests without auth should fail."""
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
        )
        assert response.status_code == 401

    async def test_get_guest_requires_auth(self, client, workspace_id):
        """Getting a guest without auth should fail."""
        guest_id = uuid4()
        response = await client.get(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
        )
        assert response.status_code == 401

    async def test_update_guest_requires_auth(self, client, workspace_id):
        """Updating a guest without auth should fail."""
        guest_id = uuid4()
        response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            json={"name": "New Name"},
        )
        assert response.status_code == 401

    async def test_delete_guest_requires_auth(self, client, workspace_id):
        """Deleting a guest without auth should fail."""
        guest_id = uuid4()
        response = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
        )
        assert response.status_code == 401
