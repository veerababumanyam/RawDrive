"""Unit tests for ActivityService.

Task 34.4: ActivityService Unit Tests
Tests activity recording, timeline retrieval, ordering, filtering, and workspace isolation.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.services.activity_service import (
    ActivityService,
    VALID_ACTIVITY_TYPES,
    VALID_ENTITY_TYPES,
)
from app.services.client_exceptions import (
    ActivityNotFoundError,
    ClientNotFoundError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db_pool():
    """Mock database pool with async context manager."""
    pool = AsyncMock()
    conn = AsyncMock()

    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None

    def acquire_side_effect():
        return MockAcquire(conn)

    pool.acquire = MagicMock(side_effect=acquire_side_effect)

    return pool, conn


@pytest.fixture
def sample_activity_row():
    """Sample activity database row."""
    now = datetime.now(timezone.utc)
    return {
        "activity_id": uuid4(),
        "activity_type": "gallery_linked",
        "related_entity_type": "gallery",
        "related_entity_id": uuid4(),
        "description": "Linked to gallery 'Wedding Album 2024'",
        "metadata": {"role": "primary"},
        "created_by_user_id": uuid4(),
        "created_at": now,
    }


# ---------------------------------------------------------------------------
# ActivityService.record_activity Tests
# ---------------------------------------------------------------------------


class TestRecordActivity:
    """Tests for ActivityService.record_activity."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_records_activity_successfully(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Successfully records an activity."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        # Mock client exists
        conn.fetchval.return_value = 1

        # Mock activity creation
        conn.fetchrow.return_value = sample_activity_row

        result = await service.record_activity(
            workspace_id=uuid4(),
            client_id=uuid4(),
            activity_type="gallery_linked",
            description="Linked to gallery",
            related_entity_type="gallery",
            related_entity_id=sample_activity_row["related_entity_id"],
            metadata={"role": "primary"},
            created_by_user_id=sample_activity_row["created_by_user_id"],
        )

        assert result["activity_id"] == sample_activity_row["activity_id"]
        assert result["activity_type"] == "gallery_linked"
        assert result["metadata"] == {"role": "primary"}

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.record_activity(
                workspace_id=uuid4(),
                client_id=uuid4(),
                activity_type="gallery_linked",
            )

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_accepts_all_valid_activity_types(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Accepts all defined valid activity types."""
        for activity_type in VALID_ACTIVITY_TYPES:
            pool, conn = mock_db_pool
            mock_get_pool.return_value = pool
            service = ActivityService()

            conn.fetchval.return_value = 1
            sample_activity_row["activity_type"] = activity_type
            conn.fetchrow.return_value = sample_activity_row

            result = await service.record_activity(
                workspace_id=uuid4(),
                client_id=uuid4(),
                activity_type=activity_type,
            )

            assert result["activity_type"] == activity_type

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_accepts_unknown_activity_type_with_warning(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Accepts unknown activity types but logs warning."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.return_value = 1
        sample_activity_row["activity_type"] = "unknown_type"
        conn.fetchrow.return_value = sample_activity_row

        # Should not raise, just warn
        result = await service.record_activity(
            workspace_id=uuid4(),
            client_id=uuid4(),
            activity_type="unknown_type",
        )

        assert result["activity_type"] == "unknown_type"

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_accepts_all_valid_entity_types(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Accepts all defined valid entity types."""
        for entity_type in VALID_ENTITY_TYPES:
            pool, conn = mock_db_pool
            mock_get_pool.return_value = pool
            service = ActivityService()

            conn.fetchval.return_value = 1
            sample_activity_row["related_entity_type"] = entity_type
            conn.fetchrow.return_value = sample_activity_row

            result = await service.record_activity(
                workspace_id=uuid4(),
                client_id=uuid4(),
                activity_type="gallery_linked",
                related_entity_type=entity_type,
                related_entity_id=uuid4(),
            )

            assert result["related_entity_type"] == entity_type

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_records_without_optional_fields(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Records activity without optional fields."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.return_value = 1
        sample_activity_row["description"] = None
        sample_activity_row["related_entity_type"] = None
        sample_activity_row["related_entity_id"] = None
        sample_activity_row["metadata"] = None
        sample_activity_row["created_by_user_id"] = None
        conn.fetchrow.return_value = sample_activity_row

        result = await service.record_activity(
            workspace_id=uuid4(),
            client_id=uuid4(),
            activity_type="profile_updated",
        )

        assert result["activity_id"] is not None
        assert result["description"] is None
        assert result["metadata"] is None


# ---------------------------------------------------------------------------
# ActivityService.get_activity_timeline Tests
# ---------------------------------------------------------------------------


class TestGetActivityTimeline:
    """Tests for ActivityService.get_activity_timeline."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_returns_paginated_timeline(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Returns paginated activity timeline."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        # Mock client exists
        conn.fetchval.side_effect = [1, 50]  # exists, total count

        # Mock activities
        conn.fetch.return_value = [sample_activity_row]

        result = await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            page=1,
            limit=20,
        )

        assert "activities" in result
        assert "meta" in result
        assert len(result["activities"]) == 1
        assert result["meta"]["page"] == 1
        assert result["meta"]["limit"] == 20
        assert result["meta"]["total"] == 50
        assert result["meta"]["total_pages"] == 3

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_orders_by_created_at_desc(self, mock_get_pool, mock_db_pool):
        """Activities are ordered newest first."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        # Verify ORDER BY clause
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]

        assert "ORDER BY created_at DESC" in sql

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_filters_by_activity_type(self, mock_get_pool, mock_db_pool):
        """Filters activities by type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            activity_type="gallery_linked",
        )

        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "activity_type = $" in sql
        assert "gallery_linked" in params

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_filters_by_entity_type(self, mock_get_pool, mock_db_pool):
        """Filters activities by related entity type."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            entity_type="gallery",
        )

        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "related_entity_type = $" in sql
        assert "gallery" in params

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_filters_by_date_range(self, mock_get_pool, mock_db_pool):
        """Filters activities by date range."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        date_from = datetime.now(timezone.utc) - timedelta(days=7)
        date_to = datetime.now(timezone.utc)

        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            date_from=date_from,
            date_to=date_to,
        )

        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "created_at >=" in sql
        assert "created_at <=" in sql
        assert date_from in params
        assert date_to in params

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.get_activity_timeline(
                workspace_id=uuid4(),
                client_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_limits_page_size(self, mock_get_pool, mock_db_pool):
        """Enforces maximum page size limit."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        result = await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
            limit=500,  # Exceeds max
        )

        assert result["meta"]["limit"] == 100


# ---------------------------------------------------------------------------
# ActivityService.get_recent_activities Tests
# ---------------------------------------------------------------------------


class TestGetRecentActivities:
    """Tests for ActivityService.get_recent_activities."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_returns_recent_activities(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Returns recent activities for a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetch.return_value = [sample_activity_row]

        result = await service.get_recent_activities(
            workspace_id=uuid4(),
            client_id=uuid4(),
            limit=5,
        )

        assert len(result) == 1
        assert result[0]["activity_type"] == "gallery_linked"

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_filters_by_activity_types(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Filters by specified activity types."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetch.return_value = [sample_activity_row]

        await service.get_recent_activities(
            workspace_id=uuid4(),
            client_id=uuid4(),
            limit=5,
            activity_types=["gallery_linked", "payment_received"],
        )

        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "ANY($3::text[])" in sql
        assert ["gallery_linked", "payment_received"] in params

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_limits_results(self, mock_get_pool, mock_db_pool):
        """Limits results to maximum 20."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetch.return_value = []

        await service.get_recent_activities(
            workspace_id=uuid4(),
            client_id=uuid4(),
            limit=50,  # Exceeds max
        )

        fetch_call = conn.fetch.call_args
        params = fetch_call[0][1:]

        # Last param should be limit capped at 20
        assert params[-1] == 20


# ---------------------------------------------------------------------------
# ActivityService.get_activity_summary Tests
# ---------------------------------------------------------------------------


class TestGetActivitySummary:
    """Tests for ActivityService.get_activity_summary."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_returns_activity_summary(self, mock_get_pool, mock_db_pool):
        """Returns activity summary with counts."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        now = datetime.now(timezone.utc)

        # Mock counts by type
        conn.fetch.return_value = [
            {"activity_type": "gallery_linked", "count": 5},
            {"activity_type": "payment_received", "count": 3},
        ]

        # Mock total and last activity
        conn.fetchval.side_effect = [8, now]

        result = await service.get_activity_summary(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        assert result["total_activities"] == 8
        assert result["last_activity_at"] == now
        assert result["by_type"]["gallery_linked"] == 5
        assert result["by_type"]["payment_received"] == 3

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_handles_no_activities(self, mock_get_pool, mock_db_pool):
        """Handles clients with no activities."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetch.return_value = []
        conn.fetchval.side_effect = [0, None]

        result = await service.get_activity_summary(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        assert result["total_activities"] == 0
        assert result["last_activity_at"] is None
        assert result["by_type"] == {}


# ---------------------------------------------------------------------------
# ActivityService.delete_activity Tests
# ---------------------------------------------------------------------------


class TestDeleteActivity:
    """Tests for ActivityService.delete_activity."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_deletes_activity_successfully(self, mock_get_pool, mock_db_pool):
        """Successfully deletes an activity."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.execute.return_value = "DELETE 1"

        result = await service.delete_activity(
            workspace_id=uuid4(),
            client_id=uuid4(),
            activity_id=uuid4(),
        )

        assert "deleted successfully" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_raises_activity_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ActivityNotFoundError when activity doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.execute.return_value = "DELETE 0"

        with pytest.raises(ActivityNotFoundError):
            await service.delete_activity(
                workspace_id=uuid4(),
                client_id=uuid4(),
                activity_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# ActivityService.add_note Tests
# ---------------------------------------------------------------------------


class TestAddNote:
    """Tests for ActivityService.add_note."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_adds_note_successfully(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Successfully adds a note as activity."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        user_id = uuid4()
        sample_activity_row["activity_type"] = "note_added"
        sample_activity_row["description"] = "Client prefers morning sessions"
        sample_activity_row["created_by_user_id"] = user_id

        conn.fetchval.return_value = 1
        conn.fetchrow.return_value = sample_activity_row

        result = await service.add_note(
            workspace_id=uuid4(),
            client_id=uuid4(),
            note="Client prefers morning sessions",
            user_id=user_id,
        )

        assert result["activity_type"] == "note_added"
        assert result["description"] == "Client prefers morning sessions"
        assert result["created_by_user_id"] == user_id


# ---------------------------------------------------------------------------
# Workspace Isolation Tests
# ---------------------------------------------------------------------------


class TestActivityWorkspaceIsolation:
    """Tests ensuring workspace isolation for activity operations."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_record_uses_workspace_id(self, mock_get_pool, mock_db_pool, sample_activity_row):
        """Record operation includes workspace_id in queries."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        workspace_id = uuid4()
        conn.fetchval.return_value = 1
        conn.fetchrow.return_value = sample_activity_row

        await service.record_activity(
            workspace_id=workspace_id,
            client_id=uuid4(),
            activity_type="gallery_linked",
        )

        # Verify workspace_id in client check
        client_check_call = conn.fetchval.call_args
        assert workspace_id in client_check_call[0]

        # Verify workspace_id in INSERT
        insert_call = conn.fetchrow.call_args
        assert workspace_id in insert_call[0]

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_timeline_filters_by_workspace(self, mock_get_pool, mock_db_pool):
        """Timeline retrieval filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        workspace_id = uuid4()
        conn.fetchval.side_effect = [1, 0]
        conn.fetch.return_value = []

        await service.get_activity_timeline(
            workspace_id=workspace_id,
            client_id=uuid4(),
        )

        # Verify workspace_id in WHERE clause
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "workspace_id = $1" in sql
        assert workspace_id in params

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_delete_filters_by_workspace(self, mock_get_pool, mock_db_pool):
        """Delete operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        workspace_id = uuid4()
        conn.execute.return_value = "DELETE 1"

        await service.delete_activity(
            workspace_id=workspace_id,
            client_id=uuid4(),
            activity_id=uuid4(),
        )

        # Verify DELETE includes workspace_id
        execute_call = conn.execute.call_args
        sql = execute_call[0][0]
        params = execute_call[0][1:]

        assert "workspace_id = $1" in sql
        assert workspace_id in params


# ---------------------------------------------------------------------------
# Ordering Tests
# ---------------------------------------------------------------------------


class TestActivityOrdering:
    """Tests ensuring correct chronological ordering."""

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_timeline_orders_newest_first(self, mock_get_pool, mock_db_pool):
        """Timeline returns activities in reverse chronological order."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        now = datetime.now(timezone.utc)
        older = now - timedelta(hours=1)
        oldest = now - timedelta(hours=2)

        conn.fetchval.side_effect = [1, 3]
        conn.fetch.return_value = [
            {"activity_id": uuid4(), "activity_type": "a", "created_at": now,
             "related_entity_type": None, "related_entity_id": None,
             "description": None, "metadata": None, "created_by_user_id": None},
            {"activity_id": uuid4(), "activity_type": "b", "created_at": older,
             "related_entity_type": None, "related_entity_id": None,
             "description": None, "metadata": None, "created_by_user_id": None},
            {"activity_id": uuid4(), "activity_type": "c", "created_at": oldest,
             "related_entity_type": None, "related_entity_id": None,
             "description": None, "metadata": None, "created_by_user_id": None},
        ]

        result = await service.get_activity_timeline(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        # Verify order
        assert result["activities"][0]["created_at"] == now
        assert result["activities"][1]["created_at"] == older
        assert result["activities"][2]["created_at"] == oldest

    @pytest.mark.asyncio
    @patch('app.services.activity_service.get_postgres_pool')
    async def test_recent_activities_orders_newest_first(self, mock_get_pool, mock_db_pool):
        """Recent activities returns newest first."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = ActivityService()

        conn.fetch.return_value = []

        await service.get_recent_activities(
            workspace_id=uuid4(),
            client_id=uuid4(),
        )

        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]

        assert "ORDER BY created_at DESC" in sql
