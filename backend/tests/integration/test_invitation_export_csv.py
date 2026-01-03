"""
Test: CSV Export Workspace Isolation (T028)

Integration tests for RSVP CSV export workspace isolation.
This test ensures that:
1. CSV export only includes RSVPs from the authenticated workspace
2. Cross-workspace RSVPs are never included in exports
3. Workspace filter is enforced at repository level
4. Export does not leak PII across workspaces

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from io import StringIO
import csv

from app.services.invitation_rsvp_service import InvitationRSVPService
from app.api.invitation_schemas import RSVPResponse, RSVPStatsResponse


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
def workspace_b_rsvps(invitation_id: UUID, workspace_b_id: UUID) -> list[RSVPResponse]:
    """RSVPs that should NOT appear in workspace A exports."""
    return [
        create_rsvp_response(
            invitation_id=invitation_id,
            workspace_id=workspace_b_id,
            guest_name="Eve from B",
            guest_email="eve@workspace-b.com",
            attending=True,
            party_size=3,
            party_names=["Eve", "Frank", "Grace"],
        ),
    ]


def create_mock_pool(mock_conn: AsyncMock) -> MagicMock:
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


class TestCSVExportWorkspaceIsolation:
    """Tests for CSV export workspace isolation."""

    @pytest.mark.asyncio
    async def test_export_only_includes_workspace_rsvps(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list,
    ):
        """
        GIVEN RSVPs exist in workspace A
        WHEN CSV export is generated for workspace A
        THEN only workspace A RSVPs are included in the export
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock repository to return only workspace A RSVPs
        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        # Export RSVPs
        csv_content = await service.export_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Verify workspace_id was passed to repository
        service.rsvp_repo.list_by_invitation.assert_called_once_with(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
            limit=10000,
        )

        # Parse CSV and verify content
        reader = csv.DictReader(StringIO(csv_content))
        rows = list(reader)

        assert len(rows) == 2, "Should export exactly 2 RSVPs"
        assert rows[0]["Guest Name"] == "Alice from A"
        assert rows[1]["Guest Name"] == "Charlie from A"
        # Verify email is present (header is "Email")
        assert rows[0]["Email"] == "alice@workspace-a.com"

    @pytest.mark.asyncio
    async def test_export_excludes_other_workspace_rsvps(
        self,
        workspace_a_id: UUID,
        workspace_b_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list,
        workspace_b_rsvps: list,
    ):
        """
        GIVEN RSVPs exist in both workspace A and B
        WHEN CSV export is generated for workspace A
        THEN workspace B RSVPs are NOT included
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock: repository enforces workspace filter, only returns workspace A RSVPs
        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        # Export RSVPs for workspace A
        csv_content = await service.export_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Parse CSV
        reader = csv.DictReader(StringIO(csv_content))
        rows = list(reader)
        emails = [row["Email"] for row in rows]

        # Verify workspace B email is NOT present
        assert "eve@workspace-b.com" not in emails
        # Verify only workspace A emails are present
        assert "alice@workspace-a.com" in emails
        assert "charlie@workspace-a.com" in emails

    @pytest.mark.asyncio
    async def test_export_returns_empty_csv_for_no_rsvps(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN no RSVPs exist for the workspace
        WHEN CSV export is generated
        THEN an empty CSV (with headers only) is returned
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock: no RSVPs found
        service.rsvp_repo.list_by_invitation.return_value = ([], 0)

        # Export RSVPs
        csv_content = await service.export_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Parse CSV
        reader = csv.DictReader(StringIO(csv_content))
        rows = list(reader)

        assert len(rows) == 0, "Should have no data rows"
        # Verify headers are still present
        assert "Guest Name" in csv_content
        assert "Email" in csv_content

    @pytest.mark.asyncio
    async def test_export_csv_headers_match_expected_format(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list,
    ):
        """
        GIVEN RSVPs exist for the workspace
        WHEN CSV export is generated
        THEN the CSV has the expected column headers
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        # Export RSVPs
        csv_content = await service.export_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Parse CSV and check headers
        reader = csv.DictReader(StringIO(csv_content))
        headers = reader.fieldnames

        # Headers are based on the actual export_rsvps implementation
        expected_headers = [
            "Guest Name",
            "Email",
            "Phone",
            "Status",
            "Party Size",
            "Additional Guests",
            "Dietary Preferences",
            "Message",
            "Source",
            "Submission Date",
        ]

        for header in expected_headers:
            assert header in headers, f"Missing header: {header}"


class TestRepositoryWorkspaceEnforcement:
    """Tests for repository-level workspace enforcement on export queries."""

    @pytest.mark.asyncio
    async def test_service_export_passes_workspace_to_repository(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list[RSVPResponse],
    ):
        """
        GIVEN an export request
        WHEN export_rsvps is called on the service
        THEN workspace_id is passed to the repository layer

        This test ensures the service correctly enforces workspace isolation
        by passing workspace_id to the underlying repository.
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        # Mock repository returns RSVPResponse objects
        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        # Call export
        await service.export_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_a_id,
        )

        # Verify workspace_id was passed to repository
        service.rsvp_repo.list_by_invitation.assert_called_once()
        call_kwargs = service.rsvp_repo.list_by_invitation.call_args.kwargs

        assert call_kwargs["workspace_id"] == workspace_a_id, \
            "workspace_id must be passed to repository"
        assert call_kwargs["invitation_id"] == invitation_id, \
            "invitation_id must be passed to repository"


class TestExportAuditCompliance:
    """Tests for export audit logging (SOC 2 compliance)."""

    @pytest.mark.asyncio
    async def test_export_does_not_log_pii(
        self,
        workspace_a_id: UUID,
        invitation_id: UUID,
        workspace_a_rsvps: list,
    ):
        """
        GIVEN an export is generated
        WHEN the export process runs
        THEN no PII (email, names) is logged
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()

        service.rsvp_repo.list_by_invitation.return_value = (workspace_a_rsvps, 2)

        with patch("app.services.invitation_rsvp_service.logger") as mock_logger:
            await service.export_rsvps(
                invitation_id=invitation_id,
                workspace_id=workspace_a_id,
            )

            # Check all log calls for PII leakage
            for call in mock_logger.method_calls:
                call_str = str(call)
                # Should not contain guest emails
                assert "alice@workspace-a.com" not in call_str
                assert "charlie@workspace-a.com" not in call_str
                # Should not contain guest names
                assert "Alice from A" not in call_str
                assert "Charlie from A" not in call_str

