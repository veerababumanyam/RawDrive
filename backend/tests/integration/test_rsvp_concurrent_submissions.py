"""
Test: RSVP Concurrent Submission Handling (T012)

Integration tests for handling concurrent RSVP submissions.
This test ensures that:
1. Simultaneous submissions with same email don't create duplicates
2. Race conditions are prevented atomically by database constraint
3. Only one submission succeeds, others get appropriate error

Feature: 020-invitation-rsvp-hardening
Coverage Target: 95% (security-critical)
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4, UUID
from datetime import datetime, timezone
from typing import List, Tuple

from asyncpg.exceptions import UniqueViolationError

from app.services.invitation_rsvp_service import (
    InvitationRSVPService,
    RSVPDuplicateError,
)
from app.api.invitation_schemas import RSVPCreate, RSVPSource


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    return uuid4()


@pytest.fixture
def rsvp_create_data() -> RSVPCreate:
    return RSVPCreate(
        guest_name="Concurrent Guest",
        guest_email="concurrent@example.com",
        attending=True,
        party_size=2,
    )


class TestConcurrentRSVPSubmissions:
    """Tests for concurrent RSVP submission handling."""

    @pytest.mark.asyncio
    async def test_concurrent_submissions_only_one_succeeds(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
    ):
        """
        GIVEN two concurrent RSVP submissions with the same email
        WHEN both requests are processed simultaneously
        THEN only one succeeds and the other gets RSVPDuplicateError

        This simulates the race condition scenario where:
        1. Both requests pass the find_by_email check (returns None)
        2. Both attempt to INSERT
        3. Database unique constraint catches the second one
        """
        # Track results
        results: List[Tuple[bool, Exception | None]] = []
        call_count = 0

        # Mock service
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # Mock find_by_email returns None for both (simulating race condition)
        service.rsvp_repo.find_by_email.return_value = None

        async def mock_create(data):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First call succeeds
                return {
                    "rsvp_id": uuid4(),
                    "invitation_id": invitation_id,
                    "workspace_id": workspace_id,
                    "guest_email": data["guest_email"],
                    "edit_token": "mock_token",
                }
            else:
                # Second call hits unique constraint
                raise UniqueViolationError(
                    "duplicate key value violates unique constraint"
                )

        service.rsvp_repo.create.side_effect = mock_create
        service.invitation_repo.increment_rsvp_count.return_value = None

        # Submit two RSVPs concurrently
        async def submit_rsvp():
            try:
                result = await service.submit_rsvp(
                    invitation_id=invitation_id,
                    workspace_id=workspace_id,
                    data=rsvp_create_data,
                    source=RSVPSource.WEB,
                )
                results.append((True, None))
                return result
            except RSVPDuplicateError as e:
                results.append((False, e))
                return None
            except Exception as e:
                results.append((False, e))
                return None

        # Run both concurrently
        await asyncio.gather(submit_rsvp(), submit_rsvp())

        # Verify results
        successes = [r for r in results if r[0]]
        failures = [r for r in results if not r[0]]

        assert len(successes) == 1, "Exactly one submission should succeed"
        assert len(failures) == 1, "Exactly one submission should fail"
        assert isinstance(failures[0][1], RSVPDuplicateError), \
            "Failed submission should get RSVPDuplicateError"

    @pytest.mark.asyncio
    async def test_rapid_sequential_submissions_handled(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
    ):
        """
        GIVEN rapid sequential RSVP submissions with same email
        WHEN processed one after another quickly
        THEN second submission is rejected with duplicate error
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # First call: no existing RSVP
        # Second call: existing RSVP found
        find_by_email_returns = [
            None,  # First call
            {"rsvp_id": uuid4(), "guest_email": rsvp_create_data.guest_email},  # Second call
        ]
        service.rsvp_repo.find_by_email.side_effect = find_by_email_returns

        # First create succeeds
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token": "mock_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        # First submission succeeds
        result1 = await service.submit_rsvp(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            data=rsvp_create_data,
            source=RSVPSource.WEB,
        )
        assert result1 is not None

        # Second submission should fail with duplicate error
        with pytest.raises(RSVPDuplicateError):
            await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )


class TestAtomicDuplicatePrevention:
    """Tests for atomic duplicate prevention at database level."""

    @pytest.mark.asyncio
    async def test_database_constraint_is_atomic(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        Verify that the database unique constraint provides atomic protection.

        This test simulates the scenario where the application-level check
        passes for both concurrent requests, but the database constraint
        prevents the duplicate atomically.
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        # find_by_email always returns None (simulating race)
        service.rsvp_repo.find_by_email.return_value = None

        # create raises UniqueViolationError (database caught the duplicate)
        service.rsvp_repo.create.side_effect = UniqueViolationError(
            "duplicate key value violates unique constraint"
        )

        # Should raise RSVPDuplicateError (not UniqueViolationError)
        with pytest.raises(RSVPDuplicateError) as exc_info:
            await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=RSVPCreate(
                    guest_name="Test",
                    guest_email="test@example.com",
                    attending=True,
                    party_size=1,
                ),
                source=RSVPSource.WEB,
            )

        # Error message should be user-friendly, not technical
        error_message = str(exc_info.value)
        assert "already exists" in error_message
        assert "UniqueViolationError" not in error_message

    @pytest.mark.asyncio
    async def test_logging_on_duplicate_prevented_by_constraint(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        Verify that duplicate prevention by database constraint is logged.
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation
        service.invitation_repo.get_by_id.return_value = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "status": "published",
            "rsvp_settings": {"enabled": True},
            "title": "Test Event",
            "slug": "test-event",
        }

        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.side_effect = UniqueViolationError(
            "duplicate key value violates unique constraint"
        )

        with patch("app.services.invitation_rsvp_service.logger") as mock_logger:
            with pytest.raises(RSVPDuplicateError):
                await service.submit_rsvp(
                    invitation_id=invitation_id,
                    workspace_id=workspace_id,
                    data=RSVPCreate(
                        guest_name="Test",
                        guest_email="test@example.com",
                        attending=True,
                        party_size=1,
                    ),
                    source=RSVPSource.WEB,
                )

            # Verify logging occurred (without PII)
            mock_logger.info.assert_called()
            log_call = mock_logger.info.call_args_list[-1]
            log_message = log_call[0][0]
            assert "Duplicate RSVP prevented" in log_message
            # Should NOT contain email
            log_extra = log_call[1].get("extra", {})
            assert "email" not in log_extra
            assert "guest_email" not in log_extra
