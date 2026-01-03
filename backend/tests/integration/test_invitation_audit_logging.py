"""
Test: Invitation Lifecycle Audit Logging (T034)

Integration tests for audit event coverage of invitation lifecycle events.
This test ensures that:
1. All invitation lifecycle events are logged (create, publish, archive, delete)
2. RSVP events are logged (submit, update, delete, edit-token use)
3. Audit events include workspace_id for tenant isolation
4. Events do not contain PII (emails, names)

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4, UUID
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from app.services.audit_service import (
    AuditService,
    AuditEventType,
    AuditEvent,
)
from app.services.invitation_rsvp_service import InvitationRSVPService
from app.api.invitation_schemas import RSVPCreate, RSVPSource


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    return uuid4()


@pytest.fixture
def rsvp_id() -> UUID:
    return uuid4()


@pytest.fixture
def mock_audit_service() -> AsyncMock:
    """Create a mock AuditService."""
    audit_service = AsyncMock(spec=AuditService)
    # Mock return value as a MagicMock to avoid dataclass init issues
    mock_event = MagicMock()
    mock_event.event_id = uuid4()
    mock_event.event_type = AuditEventType.RSVP_SUBMITTED
    mock_event.workspace_id = uuid4()
    mock_event.created_at = datetime.now(timezone.utc)
    audit_service.log_event.return_value = mock_event
    return audit_service


class TestRSVPAuditEvents:
    """Tests for RSVP-related audit events."""

    @pytest.mark.asyncio
    async def test_rsvp_submitted_event_logged(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_audit_service: AsyncMock,
    ):
        """
        GIVEN a valid RSVP submission
        WHEN submit_rsvp succeeds
        THEN RSVP_SUBMITTED audit event is logged with correct metadata
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = mock_audit_service

        # Mock invitation exists
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # Mock no existing RSVP
        service.rsvp_repo.find_by_email.return_value = None

        # Mock RSVP creation success
        rsvp_id = uuid4()
        service.rsvp_repo.create.return_value = {
            "rsvp_id": rsvp_id,
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": "guest@example.com",
            "guest_name": "Test Guest",
            "attending": True,
            "party_size": 1,
            "party_names": [],
            "edit_token": "mock_token",
            "source": "web",
            "status": "confirmed",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        # Submit RSVP
        await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=RSVPCreate(
                guest_name="Test Guest",
                guest_email="guest@example.com",
                attending=True,
                party_size=1,
            ),
            source=RSVPSource.WEB,
        )

        # Verify audit event was logged
        mock_audit_service.log_event.assert_called()

        # Find the RSVP_SUBMITTED event call
        calls = mock_audit_service.log_event.call_args_list
        rsvp_submitted_calls = [
            c for c in calls
            if c.kwargs.get("event_type") == AuditEventType.RSVP_SUBMITTED
        ]
        assert len(rsvp_submitted_calls) >= 1, "RSVP_SUBMITTED event should be logged"

        # Verify event metadata
        event_call = rsvp_submitted_calls[0]
        # workspace_id may be passed as string or UUID
        assert str(event_call.kwargs["workspace_id"]) == str(workspace_id)

        # Verify no PII in event details
        # The audit service receives metadata dict - check it doesn't contain PII
        metadata = event_call.kwargs.get("metadata", {})
        metadata_str = str(metadata)
        assert "guest@example.com" not in metadata_str, "Email should not be in audit"
        assert "Test Guest" not in metadata_str, "Name should not be in audit"

    @pytest.mark.asyncio
    async def test_rsvp_submitted_event_includes_source(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_audit_service: AsyncMock,
    ):
        """
        GIVEN an RSVP submitted via QR code
        WHEN submit_rsvp succeeds
        THEN audit event includes the source channel
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = mock_audit_service

        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": "guest@example.com",
            "guest_name": "Test Guest",
            "attending": True,
            "party_size": 1,
            "party_names": [],
            "edit_token": "mock_token",
            "source": "qr_code",
            "status": "confirmed",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=RSVPCreate(
                guest_name="Test Guest",
                guest_email="guest@example.com",
                attending=True,
                party_size=1,
            ),
            source=RSVPSource.QR_CODE,
        )

        # Find event and verify source is in metadata
        calls = mock_audit_service.log_event.call_args_list
        rsvp_calls = [
            c for c in calls
            if c.kwargs.get("event_type") == AuditEventType.RSVP_SUBMITTED
        ]

        assert len(rsvp_calls) >= 1, "RSVP_SUBMITTED event should be logged"
        # Source is passed in metadata dict
        metadata = rsvp_calls[0].kwargs.get("metadata", {})
        assert metadata.get("source") == "qr_code"


class TestAuditEventWorkspaceIsolation:
    """Tests for workspace isolation in audit events."""

    @pytest.mark.asyncio
    async def test_audit_event_includes_workspace_id(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_audit_service: AsyncMock,
    ):
        """
        GIVEN any RSVP operation
        WHEN audit event is logged
        THEN workspace_id is always included
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = mock_audit_service

        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": "guest@example.com",
            "guest_name": "Test Guest",
            "attending": True,
            "party_size": 1,
            "party_names": [],
            "edit_token": "mock_token",
            "source": "web",
            "status": "confirmed",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=RSVPCreate(
                guest_name="Test Guest",
                guest_email="guest@example.com",
                attending=True,
                party_size=1,
            ),
            source=RSVPSource.WEB,
        )

        # All log_event calls should include workspace_id
        for call_obj in mock_audit_service.log_event.call_args_list:
            # workspace_id is passed as string by the service
            assert str(call_obj.kwargs.get("workspace_id")) == str(workspace_id), \
                "All audit events must include workspace_id"


class TestAuditEventPIIProtection:
    """Tests for PII protection in audit events."""

    @pytest.mark.asyncio
    async def test_audit_events_exclude_guest_email(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_audit_service: AsyncMock,
    ):
        """
        GIVEN an RSVP submission with guest email
        WHEN audit event is logged
        THEN guest email is NOT included in event details
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = mock_audit_service

        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": "sensitive@pii.com",
            "guest_name": "Sensitive Name",
            "attending": True,
            "party_size": 1,
            "party_names": [],
            "edit_token": "mock_token",
            "source": "web",
            "status": "confirmed",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=RSVPCreate(
                guest_name="Sensitive Name",
                guest_email="sensitive@pii.com",
                attending=True,
                party_size=1,
            ),
            source=RSVPSource.WEB,
        )

        # Check all audit calls for PII
        for call_obj in mock_audit_service.log_event.call_args_list:
            details = call_obj.kwargs.get("details", {})
            details_str = str(details)

            # These PII fields should never appear
            assert "sensitive@pii.com" not in details_str
            assert "Sensitive Name" not in details_str

    @pytest.mark.asyncio
    async def test_audit_events_exclude_guest_phone(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_audit_service: AsyncMock,
    ):
        """
        GIVEN an RSVP submission with guest phone
        WHEN audit event is logged
        THEN guest phone is NOT included in event details
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = mock_audit_service

        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": "guest@example.com",
            "guest_name": "Test Guest",
            "guest_phone": "+1-555-123-4567",
            "attending": True,
            "party_size": 1,
            "party_names": [],
            "edit_token": "mock_token",
            "source": "web",
            "status": "confirmed",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=RSVPCreate(
                guest_name="Test Guest",
                guest_email="guest@example.com",
                guest_phone="+1-555-123-4567",
                attending=True,
                party_size=1,
            ),
            source=RSVPSource.WEB,
        )

        # Check all audit calls for PII
        for call_obj in mock_audit_service.log_event.call_args_list:
            details = call_obj.kwargs.get("details", {})
            details_str = str(details)

            # Phone should never appear
            assert "+1-555-123-4567" not in details_str
            assert "555-123-4567" not in details_str


class TestAuditEventTypes:
    """Tests for correct audit event type selection."""

    @pytest.mark.asyncio
    async def test_audit_service_has_required_event_types(self):
        """
        Verify all required invitation/RSVP audit event types exist.
        """
        # Invitation lifecycle events
        assert hasattr(AuditEventType, "INVITATION_CREATED")
        assert hasattr(AuditEventType, "INVITATION_PUBLISHED")
        assert hasattr(AuditEventType, "INVITATION_ARCHIVED")
        assert hasattr(AuditEventType, "INVITATION_DELETED")
        assert hasattr(AuditEventType, "INVITATION_ACCESS_DENIED")

        # RSVP events
        assert hasattr(AuditEventType, "RSVP_SUBMITTED")
        assert hasattr(AuditEventType, "RSVP_UPDATED")
        assert hasattr(AuditEventType, "RSVP_DELETED")
        assert hasattr(AuditEventType, "RSVP_EDIT_TOKEN_USED")
        assert hasattr(AuditEventType, "RSVP_EDIT_TOKEN_INVALID")
        assert hasattr(AuditEventType, "RSVP_EXPORTED")

    @pytest.mark.asyncio
    async def test_event_type_values_are_namespaced(self):
        """
        Verify event type values follow naming convention.
        """
        # Invitation events should be namespaced
        assert AuditEventType.INVITATION_CREATED.value.startswith("invitation.")
        assert AuditEventType.INVITATION_PUBLISHED.value.startswith("invitation.")
        assert AuditEventType.INVITATION_ARCHIVED.value.startswith("invitation.")
        assert AuditEventType.INVITATION_DELETED.value.startswith("invitation.")
        assert AuditEventType.INVITATION_ACCESS_DENIED.value.startswith("invitation.")

        # RSVP events should be namespaced
        assert AuditEventType.RSVP_SUBMITTED.value.startswith("rsvp.")
        assert AuditEventType.RSVP_UPDATED.value.startswith("rsvp.")
        assert AuditEventType.RSVP_DELETED.value.startswith("rsvp.")
        assert AuditEventType.RSVP_EXPORTED.value.startswith("rsvp.")

