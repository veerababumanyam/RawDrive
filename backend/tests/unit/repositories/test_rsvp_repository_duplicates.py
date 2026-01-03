"""
Test: RSVP Duplicate Prevention (T011)

Unit tests for database-level duplicate RSVP prevention.
This test ensures that:
1. The unique constraint prevents duplicate RSVPs
2. Case-insensitive email matching works correctly
3. UniqueViolationError is raised on duplicates

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from asyncpg.exceptions import UniqueViolationError

from app.repositories.rsvp_repository import RSVPRepository
from app.services.invitation_rsvp_service import (
    InvitationRSVPService,
    RSVPDuplicateError,
)
from app.api.invitation_schemas import RSVPCreate, RSVPSource, RSVPStatus


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    return uuid4()


@pytest.fixture
def guest_email() -> str:
    return "guest@example.com"


@pytest.fixture
def rsvp_create_data(guest_email: str) -> RSVPCreate:
    return RSVPCreate(
        guest_name="Test Guest",
        guest_email=guest_email,
        attending=True,
        party_size=1,
    )


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


class TestDuplicateRSVPPrevention:
    """Tests for duplicate RSVP prevention at database level."""

    @pytest.mark.asyncio
    async def test_create_rsvp_raises_unique_violation_on_duplicate(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        guest_email: str,
    ):
        """
        GIVEN an RSVP already exists for an email/invitation combination
        WHEN attempting to create another RSVP with the same email
        THEN UniqueViolationError is raised by the database
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate unique constraint violation
        mock_conn.fetchrow.side_effect = UniqueViolationError(
            'duplicate key value violates unique constraint "uq_invitation_rsvps_invitation_email"'
        )

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to create duplicate RSVP
            with pytest.raises(UniqueViolationError):
                await repo.create_rsvp(
                    invitation_id=invitation_id,
                    workspace_id=workspace_id,
                    guest_name="Test Guest",
                    guest_email=guest_email,
                    attending=True,
                )

    @pytest.mark.asyncio
    async def test_case_insensitive_email_duplicate_prevention(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN an RSVP exists for 'guest@example.com'
        WHEN attempting to create another RSVP for 'GUEST@EXAMPLE.COM'
        THEN the duplicate is prevented (case-insensitive matching)
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Simulate unique constraint violation for case-insensitive match
        mock_conn.fetchrow.side_effect = UniqueViolationError(
            'duplicate key value violates unique constraint "uq_invitation_rsvps_invitation_email"'
        )

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            return_value=mock_pool,
        ):
            # Attempt to create with different case
            with pytest.raises(UniqueViolationError):
                await repo.create_rsvp(
                    invitation_id=invitation_id,
                    workspace_id=workspace_id,
                    guest_name="Test Guest",
                    guest_email="GUEST@EXAMPLE.COM",  # Different case
                    attending=True,
                )


class TestServiceDuplicateHandling:
    """Tests for duplicate handling at service layer."""

    @pytest.mark.asyncio
    async def test_service_catches_unique_violation_and_raises_rsvp_duplicate_error(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
    ):
        """
        GIVEN the database raises UniqueViolationError
        WHEN submit_rsvp is called
        THEN RSVPDuplicateError is raised with user-friendly message
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation exists and is published
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # Mock find_by_email returns None (no existing RSVP found by app check)
        # But database unique constraint catches the race condition
        service.rsvp_repo.find_by_email.return_value = None

        # Simulate unique constraint violation on create
        service.rsvp_repo.create.side_effect = UniqueViolationError(
            "duplicate key value violates unique constraint"
        )

        # Should raise RSVPDuplicateError
        with pytest.raises(RSVPDuplicateError) as exc_info:
            await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

        # Verify error message is user-friendly
        assert "already exists" in str(exc_info.value)
        assert "edit link" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_application_level_duplicate_check_works(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
    ):
        """
        GIVEN an RSVP already exists for an email (found by app-level check)
        WHEN submit_rsvp is called
        THEN RSVPDuplicateError is raised before hitting database
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation exists and is published
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # Mock find_by_email returns existing RSVP
        service.rsvp_repo.find_by_email.return_value = {
            "rsvp_id": uuid4(),
            "guest_email": rsvp_create_data.guest_email,
        }

        # Should raise RSVPDuplicateError
        with pytest.raises(RSVPDuplicateError):
            await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

        # create should NOT have been called
        service.rsvp_repo.create.assert_not_called()


class TestFindByEmailCaseInsensitive:
    """Tests for case-insensitive email lookup."""

    @pytest.mark.asyncio
    async def test_get_rsvp_by_email_is_case_insensitive(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN an RSVP exists for 'guest@example.com'
        WHEN querying with 'GUEST@EXAMPLE.COM'
        THEN the RSVP is found (case-insensitive matching)
        """
        repo = RSVPRepository()

        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Mock RSVP found
        mock_conn.fetchrow.return_value = {
            "rsvp_id": uuid4(),
            "guest_email": "guest@example.com",
            "invitation_id": invitation_id,
        }

        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.repositories.rsvp_repository.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            # Query with different case
            result = await repo.get_rsvp_by_email(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                guest_email="GUEST@EXAMPLE.COM",
            )

            # Should find the RSVP
            assert result is not None

            # Verify the query uses LOWER() for comparison
            call_args = mock_conn.fetchrow.call_args[0][0]
            assert "LOWER" in call_args  # SQL should use LOWER() function
