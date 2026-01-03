"""
Test: Dashboard Stats Calculation (T029)

Unit tests for RSVP dashboard statistics calculation with workspace isolation.
This test ensures that:
1. Stats are calculated correctly from RSVP data
2. Stats are scoped to the authenticated workspace
3. Total party size counts only attending guests
4. All status categories are tracked accurately

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from app.services.invitation_rsvp_service import InvitationRSVPService
from app.api.invitation_schemas import RSVPStatsResponse


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    return uuid4()


def create_mock_pool(mock_conn: AsyncMock) -> MagicMock:
    """
    Create a properly configured mock pool that works with async context managers.
    """
    @asynccontextmanager
    async def mock_acquire():
        yield mock_conn

    mock_pool = MagicMock()
    mock_pool.acquire = mock_acquire
    return mock_pool


class TestDashboardStatsCalculation:
    """Tests for RSVP statistics calculation."""

    @pytest.mark.asyncio
    async def test_stats_calculation_with_mixed_responses(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN an invitation with various RSVP responses
        WHEN get_rsvp_stats is called
        THEN correct counts are returned for each category
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        # Mock stats: 5 total, 3 attending, 2 not attending, total party size 7
        service.rsvp_repo.get_stats.return_value = {
            "total": 5,
            "attending": 3,
            "not_attending": 2,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 7,  # Sum of party sizes for attending guests
        }

        stats = await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        # Verify stats
        assert isinstance(stats, RSVPStatsResponse)
        assert stats.total == 5
        assert stats.attending == 3
        assert stats.not_attending == 2
        assert stats.total_party_size == 7

    @pytest.mark.asyncio
    async def test_stats_with_no_rsvps(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN an invitation with no RSVPs
        WHEN get_rsvp_stats is called
        THEN all counts are zero
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        # Mock: no RSVPs
        service.rsvp_repo.get_stats.return_value = {
            "total": 0,
            "attending": 0,
            "not_attending": 0,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 0,
        }

        stats = await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        assert stats.total == 0
        assert stats.attending == 0
        assert stats.not_attending == 0
        assert stats.total_party_size == 0

    @pytest.mark.asyncio
    async def test_stats_workspace_id_passed_to_repository(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN a stats request
        WHEN get_rsvp_stats is called
        THEN workspace_id is passed to the repository
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        service.rsvp_repo.get_stats.return_value = {
            "total": 0,
            "attending": 0,
            "not_attending": 0,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 0,
        }

        await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        # Verify workspace_id was passed
        service.rsvp_repo.get_stats.assert_called_once_with(
            invitation_id, workspace_id
        )

    @pytest.mark.asyncio
    async def test_stats_party_size_only_counts_attending(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN RSVPs with mixed attending/not-attending status
        WHEN stats are calculated
        THEN total_party_size only includes attending guests
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        # Mock: 2 attending (party size 3 each = 6), 1 not attending (party size 2)
        # Total party size should only count attending = 6
        service.rsvp_repo.get_stats.return_value = {
            "total": 3,
            "attending": 2,
            "not_attending": 1,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 6,  # Only from attending guests
        }

        stats = await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        assert stats.total == 3
        assert stats.attending == 2
        assert stats.not_attending == 1
        assert stats.total_party_size == 6

    @pytest.mark.asyncio
    async def test_stats_with_maybe_responses(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN RSVPs with 'maybe' status
        WHEN stats are calculated
        THEN maybe count is correctly tracked
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        # Mock: includes maybe responses
        service.rsvp_repo.get_stats.return_value = {
            "total": 10,
            "attending": 5,
            "not_attending": 3,
            "pending": 0,
            "maybe": 2,
            "total_party_size": 12,
        }

        stats = await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        assert stats.total == 10
        assert stats.attending == 5
        assert stats.not_attending == 3
        assert stats.maybe == 2


class TestRepositoryStatsWorkspaceIsolation:
    """Tests for repository-level workspace isolation in stats queries."""

    @pytest.mark.asyncio
    async def test_repository_stats_query_filters_by_workspace(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN a stats request
        WHEN the repository query is executed
        THEN the SQL includes workspace_id filter
        """
        from app.repositories.rsvp_repository import RSVPRepository

        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Mock: return valid stats row
        mock_conn.fetchrow.return_value = {
            "total": 5,
            "attending": 3,
            "not_attending": 2,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 7,
        }

        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            await repo.get_rsvp_stats(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
            )

            # Verify query was executed
            call_args = mock_conn.fetchrow.call_args
            assert call_args is not None

            # Check query includes workspace_id filter
            query = call_args[0][0]
            assert "workspace_id" in query, "Query must filter by workspace_id"
            assert "WHERE" in query
            assert "invitation_id = $1" in query
            assert "workspace_id = $2" in query

            # Verify both IDs are in params
            params = call_args[0][1:]
            assert invitation_id in params
            assert workspace_id in params

    @pytest.mark.asyncio
    async def test_repository_returns_default_stats_on_no_data(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN no RSVPs exist for the workspace/invitation
        WHEN get_rsvp_stats is called
        THEN default zero values are returned
        """
        from app.repositories.rsvp_repository import RSVPRepository

        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Mock: no data found (returns None)
        mock_conn.fetchrow.return_value = None

        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            stats = await repo.get_rsvp_stats(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
            )

            # Should return default zeros
            assert stats["total"] == 0
            assert stats["attending"] == 0
            assert stats["not_attending"] == 0
            assert stats["pending"] == 0
            assert stats["maybe"] == 0
            assert stats["total_party_size"] == 0


class TestDashboardStatsCrossWorkspaceIsolation:
    """Tests to verify stats don't leak across workspaces."""

    @pytest.mark.asyncio
    async def test_stats_from_different_workspace_not_included(
        self,
        invitation_id: UUID,
    ):
        """
        GIVEN RSVPs exist in workspace A and B for same invitation
        WHEN workspace A requests stats
        THEN only workspace A RSVPs are counted
        """
        workspace_a = uuid4()
        workspace_b = uuid4()

        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()

        # Workspace A: 5 RSVPs, 3 attending
        workspace_a_stats = {
            "total": 5,
            "attending": 3,
            "not_attending": 2,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 6,
        }

        # Workspace B: 10 RSVPs, 8 attending (should not be visible to A)
        workspace_b_stats = {
            "total": 10,
            "attending": 8,
            "not_attending": 2,
            "pending": 0,
            "maybe": 0,
            "total_party_size": 15,
        }

        # Mock returns workspace A stats when called with workspace A
        def mock_get_stats(inv_id, ws_id):
            if ws_id == workspace_a:
                return workspace_a_stats
            elif ws_id == workspace_b:
                return workspace_b_stats
            return {"total": 0, "attending": 0, "not_attending": 0,
                    "pending": 0, "maybe": 0, "total_party_size": 0}

        service.rsvp_repo.get_stats.side_effect = mock_get_stats

        # Request stats for workspace A
        stats_a = await service.get_rsvp_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_a,
        )

        # Should return workspace A stats only
        assert stats_a.total == 5
        assert stats_a.attending == 3
        assert stats_a.total_party_size == 6

        # Verify workspace B data is not accessible
        assert stats_a.total != 10
        assert stats_a.attending != 8

    @pytest.mark.asyncio
    async def test_stats_different_workspaces_return_different_data(
        self,
        invitation_id: UUID,
    ):
        """
        GIVEN the same invitation exists in multiple workspaces
        WHEN each workspace requests stats
        THEN each gets their own isolated stats
        """
        workspace_a = uuid4()
        workspace_b = uuid4()

        from app.repositories.rsvp_repository import RSVPRepository
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        call_count = 0

        async def mock_fetchrow(query, *args):
            nonlocal call_count
            call_count += 1
            # Verify workspace_id is in the query params
            # Return different stats based on workspace
            if workspace_a in args:
                return {"total": 3, "attending": 2, "not_attending": 1,
                        "pending": 0, "maybe": 0, "total_party_size": 4}
            elif workspace_b in args:
                return {"total": 7, "attending": 5, "not_attending": 2,
                        "pending": 0, "maybe": 0, "total_party_size": 10}
            return None

        mock_conn.fetchrow.side_effect = mock_fetchrow

        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            # Get stats for workspace A
            stats_a = await repo.get_rsvp_stats(invitation_id, workspace_a)
            # Get stats for workspace B
            stats_b = await repo.get_rsvp_stats(invitation_id, workspace_b)

            # Verify different results
            assert stats_a["total"] == 3
            assert stats_b["total"] == 7
            assert stats_a["attending"] == 2
            assert stats_b["attending"] == 5
            assert stats_a["total_party_size"] == 4
            assert stats_b["total_party_size"] == 10

