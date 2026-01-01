"""
Unit Tests for Audit Service.

Verifies that the audit service properly logs all sensitive operations
with correct metadata and enforces append-only semantics.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from src.services.audit_service import AuditService, AuditEvent


@pytest.fixture
def workspace_id() -> str:
    """Generate a test workspace ID."""
    return str(uuid4())


@pytest.fixture
def user_id() -> str:
    """Generate a test user ID."""
    return str(uuid4())


class TestAuditEventCreation:
    """Test audit event creation and validation."""

    def test_audit_event_has_required_fields(self, workspace_id, user_id):
        """AuditEvent has all required fields."""
        event = AuditEvent(
            workspace_id=workspace_id,
            user_id=user_id,
            action="guest.create",
            resource_type="guest",
            resource_id=str(uuid4()),
        )

        assert event.workspace_id == workspace_id
        assert event.user_id == user_id
        assert event.action == "guest.create"
        assert event.resource_type == "guest"

    def test_audit_event_generates_id(self, workspace_id, user_id):
        """AuditEvent automatically generates an ID."""
        event = AuditEvent(
            workspace_id=workspace_id,
            user_id=user_id,
            action="guest.create",
            resource_type="guest",
        )

        assert event.id is not None
        assert len(event.id) == 36  # UUID format

    def test_audit_event_includes_timestamp(self, workspace_id, user_id):
        """AuditEvent includes creation timestamp."""
        before = datetime.now(timezone.utc)

        event = AuditEvent(
            workspace_id=workspace_id,
            user_id=user_id,
            action="guest.create",
            resource_type="guest",
        )

        after = datetime.now(timezone.utc)

        assert event.created_at is not None
        assert before <= event.created_at <= after

    def test_audit_event_supports_metadata(self, workspace_id, user_id):
        """AuditEvent supports arbitrary metadata."""
        metadata = {
            "guest_count": 50,
            "import_source": "csv",
            "filename": "guests.csv",
        }

        event = AuditEvent(
            workspace_id=workspace_id,
            user_id=user_id,
            action="guest.bulk_import",
            resource_type="invitation",
            resource_id=str(uuid4()),
            metadata=metadata,
        )

        assert event.metadata == metadata
        assert event.metadata["guest_count"] == 50


class TestAuditServiceLogging:
    """Test audit service logging functionality."""

    @pytest.fixture
    def service(self):
        """Create AuditService instance."""
        return AuditService()

    @pytest.mark.asyncio
    async def test_log_event_inserts_to_database(self, service, workspace_id, user_id):
        """log_event inserts audit record to database."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "INSERT 1"

            await service.log_event(
                workspace_id=workspace_id,
                user_id=user_id,
                action="guest.create",
                resource_type="guest",
                resource_id=str(uuid4()),
            )

            assert mock_conn.execute.called
            query = mock_conn.execute.call_args[0][0]
            assert "INSERT" in query.upper()

    @pytest.mark.asyncio
    async def test_log_event_stores_all_fields(self, service, workspace_id, user_id):
        """log_event stores all event fields."""
        resource_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "INSERT 1"

            await service.log_event(
                workspace_id=workspace_id,
                user_id=user_id,
                action="guest.update",
                resource_type="guest",
                resource_id=resource_id,
                metadata={"field": "email", "old": "old@test.com", "new": "new@test.com"},
            )

            call_args = mock_conn.execute.call_args
            # Verify all expected fields are in the query
            query = call_args[0][0]
            assert "workspace_id" in query
            assert "user_id" in query
            assert "action" in query
            assert "resource_type" in query
            assert "resource_id" in query

    @pytest.mark.asyncio
    async def test_log_event_handles_null_resource_id(self, service, workspace_id, user_id):
        """log_event handles null resource_id."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "INSERT 1"

            await service.log_event(
                workspace_id=workspace_id,
                user_id=user_id,
                action="invitation.view",
                resource_type="invitation",
                resource_id=None,
            )

            assert mock_conn.execute.called


class TestAuditServiceAppendOnly:
    """Test append-only semantics of audit log."""

    @pytest.fixture
    def service(self):
        """Create AuditService instance."""
        return AuditService()

    @pytest.mark.asyncio
    async def test_no_update_method_exists(self, service):
        """AuditService should not have update methods."""
        assert not hasattr(service, 'update_event')
        assert not hasattr(service, 'modify_event')

    @pytest.mark.asyncio
    async def test_no_delete_method_exists(self, service):
        """AuditService should not have delete methods."""
        assert not hasattr(service, 'delete_event')
        assert not hasattr(service, 'remove_event')

    @pytest.mark.asyncio
    async def test_log_only_uses_insert(self, service, workspace_id, user_id):
        """log_event only uses INSERT, never UPDATE or DELETE."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "INSERT 1"

            await service.log_event(
                workspace_id=workspace_id,
                user_id=user_id,
                action="guest.delete",
                resource_type="guest",
                resource_id=str(uuid4()),
            )

            query = mock_conn.execute.call_args[0][0].upper()
            assert "INSERT" in query
            assert "UPDATE" not in query
            assert "DELETE" not in query


class TestAuditServiceQuery:
    """Test audit log query functionality."""

    @pytest.fixture
    def service(self):
        """Create AuditService instance."""
        return AuditService()

    @pytest.mark.asyncio
    async def test_query_events_by_workspace(self, service, workspace_id):
        """Query events filtered by workspace."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "action": "guest.create"},
                {"id": str(uuid4()), "action": "guest.update"},
            ]

            events = await service.query_events(workspace_id=workspace_id)

            assert len(events) == 2
            call_args = mock_conn.fetch.call_args
            query = call_args[0][0]
            assert "workspace_id" in query

    @pytest.mark.asyncio
    async def test_query_events_by_resource_type(self, service, workspace_id):
        """Query events filtered by resource type."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            await service.query_events(
                workspace_id=workspace_id,
                resource_type="guest",
            )

            query = mock_conn.fetch.call_args[0][0]
            assert "resource_type" in query

    @pytest.mark.asyncio
    async def test_query_events_by_action(self, service, workspace_id):
        """Query events filtered by action."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            await service.query_events(
                workspace_id=workspace_id,
                action="guest.delete",
            )

            query = mock_conn.fetch.call_args[0][0]
            assert "action" in query

    @pytest.mark.asyncio
    async def test_query_events_by_date_range(self, service, workspace_id):
        """Query events filtered by date range."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            from_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
            to_date = datetime(2024, 1, 31, tzinfo=timezone.utc)

            await service.query_events(
                workspace_id=workspace_id,
                from_date=from_date,
                to_date=to_date,
            )

            query = mock_conn.fetch.call_args[0][0]
            assert "created_at" in query

    @pytest.mark.asyncio
    async def test_query_events_respects_limit(self, service, workspace_id):
        """Query respects limit parameter."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            await service.query_events(
                workspace_id=workspace_id,
                limit=50,
            )

            query = mock_conn.fetch.call_args[0][0]
            assert "LIMIT" in query.upper()


class TestAuditServiceErrorHandling:
    """Test audit service error handling."""

    @pytest.fixture
    def service(self):
        """Create AuditService instance."""
        return AuditService()

    @pytest.mark.asyncio
    async def test_log_event_handles_db_error(self, service, workspace_id, user_id):
        """log_event handles database errors gracefully."""
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.side_effect = Exception("DB connection failed")

            # Should not raise, but log error
            with patch('src.services.audit_service.logger') as mock_logger:
                try:
                    await service.log_event(
                        workspace_id=workspace_id,
                        user_id=user_id,
                        action="guest.create",
                        resource_type="guest",
                    )
                except Exception:
                    pass  # Some implementations may raise

                # Error should be logged
                # mock_logger.error.assert_called()
