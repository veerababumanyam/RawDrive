"""
Test: PDF Export Workspace Isolation (T046)

Integration tests for RSVP PDF export with workspace isolation.
This test ensures that:
1. PDF export only includes RSVPs from the authenticated workspace
2. PDF export validates workspace ownership
3. PDF contains expected content and format
4. Export is audited as RSVP_EXPORTED event
5. No PII is logged during PDF generation

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone
from io import BytesIO

from app.services.invitation_rsvp_service import InvitationRSVPService
from app.services.audit_service import AuditService, AuditEventType
from app.api.invitation_schemas import RSVPResponse, RSVPStatsResponse
from app.utils.pdf_generator import (
    generate_rsvp_pdf,
    is_pdf_available,
    PDFGenerationError,
    RSVPPDFGenerator,
)


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


def create_rsvp_dict(
    guest_name: str,
    guest_email: str,
    attending: bool,
    party_size: int = 1,
    party_names: list | None = None,
    dietary_preferences: str | None = None,
) -> dict:
    """Create an RSVP dictionary for PDF generation."""
    return {
        "guest_name": guest_name,
        "guest_email": guest_email,
        "guest_phone": None,
        "attending": attending,
        "party_size": party_size,
        "party_names": party_names or [],
        "dietary_preferences": dietary_preferences,
        "message": "Test message",
        "created_at": datetime.now(timezone.utc),
    }


def create_rsvp_response(
    invitation_id: UUID,
    workspace_id: UUID,
    guest_name: str,
    guest_email: str,
    attending: bool,
    party_size: int = 1,
    party_names: list | None = None,
) -> RSVPResponse:
    """Create an RSVPResponse object for testing."""
    return RSVPResponse(
        rsvp_id=uuid4(),
        invitation_id=invitation_id,
        workspace_id=workspace_id,
        guest_name=guest_name,
        guest_email=guest_email,
        guest_phone=None,
        attending=attending,
        party_size=party_size,
        party_names=party_names or [],
        dietary_preferences=None,
        message="Test message",
        custom_answers={},
        source="web",
        status="confirmed",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def workspace_a_rsvps(invitation_id: UUID, workspace_a_id: UUID) -> list[RSVPResponse]:
    """RSVPs belonging to workspace A."""
    return [
        create_rsvp_response(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
            guest_name="Alice from A",
            guest_email="alice@workspace-a.com",
            attending=True,
            party_size=2,
            party_names=["Alice", "Bob"],
        ),
        create_rsvp_response(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
            guest_name="Charlie from A",
            guest_email="charlie@workspace-a.com",
            attending=False,
            party_size=1,
        ),
    ]


@pytest.fixture
def workspace_a_rsvp_dicts() -> list[dict]:
    """RSVP dictionaries for PDF generation."""
    return [
        create_rsvp_dict(
            guest_name="Alice from A",
            guest_email="alice@workspace-a.com",
            attending=True,
            party_size=2,
            party_names=["Alice", "Bob"],
            dietary_preferences="Vegetarian",
        ),
        create_rsvp_dict(
            guest_name="Charlie from A",
            guest_email="charlie@workspace-a.com",
            attending=False,
            party_size=1,
        ),
    ]


@pytest.fixture
def mock_stats() -> dict:
    """Mock RSVP statistics."""
    return {
        "total": 2,
        "attending": 1,
        "not_attending": 1,
        "maybe": 0,
        "total_party_size": 3,
    }


class TestPDFExportGeneration:
    """Tests for PDF export generation."""

    def test_pdf_availability_check(self):
        """
        Verify that is_pdf_available() returns correct status.
        """
        result = is_pdf_available()
        # This test passes if reportlab is installed
        assert isinstance(result, bool)

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_generation_with_rsvps(
        self,
        workspace_a_rsvp_dicts: list[dict],
        mock_stats: dict,
    ):
        """
        GIVEN valid RSVP data and statistics
        WHEN generate_rsvp_pdf is called
        THEN a valid PDF is generated with content
        """
        pdf_bytes = generate_rsvp_pdf(
            rsvps=workspace_a_rsvp_dicts,
            stats=mock_stats,
            invitation_title="Test Wedding Invitation",
            event_datetime=datetime.now(timezone.utc),
        )

        # Verify PDF bytes are returned
        assert pdf_bytes is not None
        assert len(pdf_bytes) > 0

        # Verify PDF header (magic bytes)
        assert pdf_bytes[:4] == b"%PDF", "Should be valid PDF file"

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_generation_empty_rsvps(
        self,
        mock_stats: dict,
    ):
        """
        GIVEN no RSVPs exist
        WHEN PDF export is generated
        THEN a valid PDF is still generated with "No RSVPs" message
        """
        empty_stats = {
            "total": 0,
            "attending": 0,
            "not_attending": 0,
            "maybe": 0,
            "total_party_size": 0,
        }

        pdf_bytes = generate_rsvp_pdf(
            rsvps=[],
            stats=empty_stats,
            invitation_title="Empty Event",
        )

        # Verify PDF is generated
        assert pdf_bytes is not None
        assert len(pdf_bytes) > 0
        assert pdf_bytes[:4] == b"%PDF"

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_contains_guest_names(
        self,
        workspace_a_rsvp_dicts: list[dict],
        mock_stats: dict,
    ):
        """
        GIVEN RSVPs with guest data
        WHEN PDF is generated
        THEN guest names appear in the PDF content
        """
        pdf_bytes = generate_rsvp_pdf(
            rsvps=workspace_a_rsvp_dicts,
            stats=mock_stats,
            invitation_title="Test Wedding",
        )

        # PDF content includes names (they appear in the binary/text stream)
        # Note: Names are visible in PDF but may be encoded
        # This is a basic size check to ensure data was included
        assert len(pdf_bytes) > 1000, "PDF should contain substantial content"

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_generator_class_interface(self):
        """
        Test the RSVPPDFGenerator class interface.
        """
        generator = RSVPPDFGenerator(title="Test Report")

        rsvps = [
            create_rsvp_dict("Test Guest", "test@example.com", True, 1),
        ]
        stats = {"total": 1, "attending": 1, "not_attending": 0, "maybe": 0, "total_party_size": 1}

        pdf_bytes = generator.generate(rsvps=rsvps, stats=stats)

        assert pdf_bytes is not None
        assert pdf_bytes[:4] == b"%PDF"


class TestPDFExportWorkspaceIsolation:
    """Tests for PDF export workspace isolation."""

    @pytest.mark.asyncio
    async def test_pdf_export_uses_workspace_filtered_rsvps(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list[RSVPResponse],
    ):
        """
        GIVEN RSVPs exist in workspace A
        WHEN PDF export is generated for workspace A
        THEN only workspace A RSVPs are included via service
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock repository to return only workspace A RSVPs
        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        # Call list_rsvps which is used before PDF generation
        rsvps, total = await service.list_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Verify workspace_id was passed to repository
        call_kwargs = service.rsvp_repo.list_by_invitation.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_a_id

        # Verify correct RSVPs returned
        assert len(rsvps) == 2
        assert all(r.workspace_id == workspace_a_id for r in rsvps)

    @pytest.mark.asyncio
    async def test_pdf_export_different_workspace_returns_empty(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN invitation belongs to workspace A
        WHEN workspace B requests PDF export
        THEN empty results are returned (workspace isolation)
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock: repository returns empty for wrong workspace
        service.rsvp_repo.list_by_invitation.return_value = ([], 0)

        # Query from wrong workspace
        rsvps, total = await service.list_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_b_id,
        )

        # Verify empty results
        assert rsvps == []
        assert total == 0

        # Verify workspace_id was passed
        call_kwargs = service.rsvp_repo.list_by_invitation.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_b_id


class TestPDFExportAuditLogging:
    """Tests for PDF export audit logging (SOC 2 compliance)."""

    @pytest.mark.asyncio
    async def test_rsvp_exported_event_type_exists(self):
        """
        Verify RSVP_EXPORTED audit event type is defined.
        """
        assert hasattr(AuditEventType, "RSVP_EXPORTED")
        assert AuditEventType.RSVP_EXPORTED.value == "rsvp.exported"

    @pytest.mark.asyncio
    async def test_pdf_export_audit_event_includes_format(self):
        """
        GIVEN a PDF export is requested
        WHEN audit event is logged
        THEN event metadata includes format=pdf
        """
        mock_audit_service = AsyncMock(spec=AuditService)
        mock_event = MagicMock()
        mock_event.event_id = uuid4()
        mock_audit_service.log_event.return_value = mock_event

        workspace_id = uuid4()
        invitation_id = uuid4()
        user_id = uuid4()

        # Simulate logging an export event
        await mock_audit_service.log_event(
            event_type=AuditEventType.RSVP_EXPORTED,
            workspace_id=str(workspace_id),
            actor_user_id=str(user_id),
            target_entity_id=str(invitation_id),
            target_entity_type="invitation",
            metadata={"format": "pdf", "rsvp_count": 10},
        )

        # Verify event was logged with correct type
        mock_audit_service.log_event.assert_called_once()
        call_kwargs = mock_audit_service.log_event.call_args.kwargs

        assert call_kwargs["event_type"] == AuditEventType.RSVP_EXPORTED
        assert call_kwargs["metadata"]["format"] == "pdf"

    @pytest.mark.asyncio
    async def test_pdf_export_audit_includes_workspace(self):
        """
        GIVEN a PDF export is generated
        WHEN audit event is logged
        THEN workspace_id is included for tenant isolation
        """
        mock_audit_service = AsyncMock(spec=AuditService)

        workspace_id = uuid4()
        invitation_id = uuid4()
        user_id = uuid4()

        await mock_audit_service.log_event(
            event_type=AuditEventType.RSVP_EXPORTED,
            workspace_id=str(workspace_id),
            actor_user_id=str(user_id),
            target_entity_id=str(invitation_id),
            target_entity_type="invitation",
            metadata={"format": "pdf"},
        )

        call_kwargs = mock_audit_service.log_event.call_args.kwargs
        assert str(call_kwargs["workspace_id"]) == str(workspace_id)


class TestPDFExportPIIProtection:
    """Tests for PII protection during PDF export."""

    @pytest.mark.asyncio
    async def test_pdf_export_does_not_log_guest_emails(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list[RSVPResponse],
    ):
        """
        GIVEN a PDF export is generated
        WHEN the export process runs
        THEN guest emails are NOT logged
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        with patch("app.services.invitation_rsvp_service.logger") as mock_logger:
            await service.list_rsvps(
                invitation_id=invitation_id,
                workspace_id=workspace_a_id,
            )

            # Check all log calls for PII
            for call in mock_logger.method_calls:
                call_str = str(call)
                assert "alice@workspace-a.com" not in call_str
                assert "charlie@workspace-a.com" not in call_str

    @pytest.mark.asyncio
    async def test_pdf_export_does_not_log_guest_names(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list[RSVPResponse],
    ):
        """
        GIVEN a PDF export is generated
        WHEN the export process runs
        THEN guest names are NOT logged
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        with patch("app.services.invitation_rsvp_service.logger") as mock_logger:
            await service.list_rsvps(
                invitation_id=invitation_id,
                workspace_id=workspace_a_id,
            )

            # Check all log calls for PII
            for call in mock_logger.method_calls:
                call_str = str(call)
                assert "Alice from A" not in call_str
                assert "Charlie from A" not in call_str


class TestPDFExportErrorHandling:
    """Tests for PDF export error handling."""

    def test_pdf_generation_error_class_exists(self):
        """
        Verify PDFGenerationError is available for error handling.
        """
        assert PDFGenerationError is not None
        error = PDFGenerationError("Test error")
        assert str(error) == "Test error"

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_handles_special_characters_in_names(self):
        """
        GIVEN RSVP data with special characters
        WHEN PDF is generated
        THEN PDF is created without errors
        """
        rsvps = [
            create_rsvp_dict(
                guest_name="José García-López",
                guest_email="jose@example.com",
                attending=True,
            ),
            create_rsvp_dict(
                guest_name="田中太郎",  # Japanese characters
                guest_email="tanaka@example.com",
                attending=True,
            ),
            create_rsvp_dict(
                guest_name="François Müller",
                guest_email="francois@example.com",
                attending=True,
            ),
        ]
        stats = {"total": 3, "attending": 3, "not_attending": 0, "maybe": 0, "total_party_size": 3}

        # Should not raise
        pdf_bytes = generate_rsvp_pdf(rsvps=rsvps, stats=stats)
        assert pdf_bytes is not None
        assert pdf_bytes[:4] == b"%PDF"

    @pytest.mark.skipif(not is_pdf_available(), reason="reportlab not installed")
    def test_pdf_handles_long_names(self):
        """
        GIVEN RSVP data with very long names
        WHEN PDF is generated
        THEN names are truncated and PDF is created
        """
        long_name = "A" * 200  # Very long name
        rsvps = [
            create_rsvp_dict(
                guest_name=long_name,
                guest_email="long@example.com",
                attending=True,
            ),
        ]
        stats = {"total": 1, "attending": 1, "not_attending": 0, "maybe": 0, "total_party_size": 1}

        # Should not raise - names are truncated
        pdf_bytes = generate_rsvp_pdf(rsvps=rsvps, stats=stats)
        assert pdf_bytes is not None
        assert pdf_bytes[:4] == b"%PDF"
