"""
Test: RSVP Workspace Isolation (T010)

Security test to verify that RSVP data is properly isolated between workspaces.
This test ensures that:
1. RSVPs can only be accessed within their own workspace
2. Cross-workspace RSVP queries return no data
3. Workspace ID is enforced in all RSVP operations

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from app.repositories.rsvp_repository import RSVPRepository
from app.services.invitation_rsvp_service import InvitationRSVPService


@pytest.fixture
def workspace_a_id() -> UUID:
    """Workspace A - owns the invitation."""
    return uuid4()


@pytest.fixture
def workspace_b_id() -> UUID:
    """Workspace B - should not have access."""
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    """Invitation belonging to workspace A."""
    return uuid4()


@pytest.fixture
def rsvp_id() -> UUID:
    """RSVP belonging to the invitation."""
    return uuid4()


def create_mock_pool(mock_conn: AsyncMock) -> AsyncMock:
    """
    Create a properly configured mock pool that works with async context managers.

    The pattern used in repository is:
        pool = await get_postgres_pool()  # async function returning pool
        async with pool.acquire() as conn:  # pool.acquire() returns async CM
    """
    @asynccontextmanager
    async def mock_acquire():
        yield mock_conn

    mock_pool = MagicMock()
    mock_pool.acquire = mock_acquire
    return mock_pool


class TestRSVPWorkspaceIsolation:
    """Tests for RSVP workspace isolation security."""

    @pytest.mark.asyncio
    async def test_get_rsvp_by_id_enforces_workspace_isolation(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        rsvp_id: UUID,
    ):
        """
        GIVEN an RSVP exists in workspace A
        WHEN workspace B attempts to access it
        THEN no data is returned (workspace isolation enforced)
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate RSVP exists in workspace A, not in workspace B
        mock_conn.fetchrow.return_value = None  # No result for wrong workspace

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to access from workspace B
            result = await repo.get_rsvp_by_id(rsvp_id, workspace_b_id)

            # Should return None (access denied by workspace filter)
            assert result is None

            # Verify the query included workspace_id filter
            call_args = mock_conn.fetchrow.call_args
            assert workspace_b_id in call_args[0]  # workspace_id should be in query params

    @pytest.mark.asyncio
    async def test_delete_rsvp_enforces_workspace_isolation(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        rsvp_id: UUID,
    ):
        """
        GIVEN an RSVP exists in workspace A
        WHEN workspace B attempts to delete it
        THEN the deletion fails (returns False)
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate no rows affected (wrong workspace)
        mock_conn.execute.return_value = "DELETE 0"

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to delete from wrong workspace
            result = await repo.delete_rsvp(rsvp_id, workspace_b_id)

            # Should return False (no rows deleted)
            assert result is False

    @pytest.mark.asyncio
    async def test_update_rsvp_enforces_workspace_isolation(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        rsvp_id: UUID,
    ):
        """
        GIVEN an RSVP exists in workspace A
        WHEN workspace B attempts to update it
        THEN the update returns None (no rows updated)
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate no rows returned (wrong workspace)
        mock_conn.fetchrow.return_value = None

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to update from wrong workspace
            result = await repo.update_rsvp(rsvp_id, workspace_b_id, attending=False)

            # Should return None (no rows updated)
            assert result is None

    @pytest.mark.asyncio
    async def test_list_rsvps_enforces_workspace_isolation(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN RSVPs exist for an invitation in workspace A
        WHEN workspace B attempts to list them
        THEN an empty list is returned
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate count query returns 0 for wrong workspace
        mock_conn.fetchrow.return_value = {"count": 0}
        mock_conn.fetch.return_value = []

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to list from wrong workspace
            rsvps, total = await repo.list_rsvps(invitation_id, workspace_b_id)

            # Should return empty results
            assert rsvps == []
            assert total == 0

    @pytest.mark.asyncio
    async def test_alias_methods_require_workspace_id(self):
        """
        Verify that alias methods now require workspace_id parameter.
        This test ensures the dangerous aliases were fixed.
        """
        repo = RSVPRepository()

        # The delete alias should now require workspace_id
        # (If it didn't, this would raise TypeError)
        import inspect
        sig = inspect.signature(repo.delete)
        params = list(sig.parameters.keys())
        assert "workspace_id" in params, "delete() must require workspace_id parameter"

        # The update alias should now require workspace_id
        sig = inspect.signature(repo.update)
        params = list(sig.parameters.keys())
        assert "workspace_id" in params, "update() must require workspace_id parameter"


class TestServiceWorkspaceIsolation:
    """Tests for workspace isolation at service layer."""

    @pytest.mark.asyncio
    async def test_service_delete_rsvp_passes_workspace_id(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        rsvp_id: UUID,
    ):
        """
        GIVEN a request to delete an RSVP
        WHEN the service method is called
        THEN workspace_id is passed to the repository
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock get_by_id to return a valid RSVP
        mock_rsvp = {
            "rsvp_id": rsvp_id,
            "invitation_id": invitation_id,
            "workspace_id": workspace_a_id,
        }
        service.rsvp_repo.get_by_id.return_value = mock_rsvp
        service.rsvp_repo.delete.return_value = True
        service.invitation_repo.decrement_rsvp_count.return_value = None

        # Call delete
        await service.delete_rsvp(rsvp_id, invitation_id, workspace_a_id)

        # Verify workspace_id was passed to delete
        service.rsvp_repo.delete.assert_called_once_with(rsvp_id, workspace_a_id)
