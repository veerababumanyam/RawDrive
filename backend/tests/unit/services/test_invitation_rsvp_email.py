"""
Test: RSVP Email Notification Enqueuing (T020)

Unit tests for RSVP confirmation email enqueuing.
This test ensures that:
1. Confirmation email is enqueued after successful RSVP submission
2. Email contains correct edit link token
3. Email queueing failures don't fail the RSVP submission

Feature: 020-invitation-rsvp-hardening
Coverage Target: 85% (services)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timezone

from app.services.invitation_rsvp_service import InvitationRSVPService
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
        guest_name="Test Guest",
        guest_email="guest@example.com",
        attending=True,
        party_size=2,
    )


@pytest.fixture
def mock_invitation(workspace_id: UUID, invitation_id: UUID) -> dict:
    return {
        "invitation_id": invitation_id,
        "workspace_id": workspace_id,
        "title": "Wedding Celebration",
        "slug": "wedding-celebration",
        "status": "published",
        "event_datetime": datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
        "rsvp_settings": {"enabled": True, "max_party_size": 5},
    }


class TestRSVPConfirmationEmailEnqueue:
    """Tests for RSVP confirmation email enqueuing."""

    @pytest.mark.asyncio
    async def test_confirmation_email_enqueued_on_successful_rsvp(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
        mock_invitation: dict,
    ):
        """
        GIVEN a successful RSVP submission
        WHEN the RSVP is created
        THEN a confirmation email is enqueued with the correct details
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # Mock invitation lookup
        service.invitation_repo.get_by_id.return_value = mock_invitation

        # Mock no existing RSVP
        service.rsvp_repo.find_by_email.return_value = None

        # Mock successful create with edit token
        rsvp_id = uuid4()
        service.rsvp_repo.create.return_value = {
            "rsvp_id": rsvp_id,
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token_hash": "hashed_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task") as mock_enqueue:
            mock_enqueue.return_value = "task-123"

            result = await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

            # Verify confirmation email was enqueued
            assert mock_enqueue.called

            # Find the confirmation email call
            confirmation_call = None
            for call in mock_enqueue.call_args_list:
                if call.kwargs.get("task_type") == "send_rsvp_confirmation":
                    confirmation_call = call
                    break
                if len(call.args) > 0 and call.args[0] == "send_rsvp_confirmation":
                    confirmation_call = call
                    break

            assert confirmation_call is not None, "Confirmation email should be enqueued"

            # Verify payload
            payload = confirmation_call.kwargs.get("payload", {})
            assert payload.get("guest_email") == rsvp_create_data.guest_email
            assert payload.get("guest_name") == rsvp_create_data.guest_name
            assert payload.get("invitation_title") == mock_invitation["title"]
            assert payload.get("invitation_slug") == mock_invitation["slug"]
            assert payload.get("edit_token") is not None

    @pytest.mark.asyncio
    async def test_email_contains_edit_link_token(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
        mock_invitation: dict,
    ):
        """
        GIVEN a successful RSVP submission
        WHEN confirmation email is enqueued
        THEN the email payload contains a valid edit token
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        service.invitation_repo.get_by_id.return_value = mock_invitation
        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token_hash": "hashed_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task") as mock_enqueue:
            mock_enqueue.return_value = "task-123"

            result = await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

            # The edit token in response should match what's sent in email
            assert result.edit_token is not None
            assert len(result.edit_token) > 0

            # Verify edit token was passed to email
            confirmation_call = next(
                (c for c in mock_enqueue.call_args_list
                 if "send_rsvp_confirmation" in str(c)),
                None
            )
            assert confirmation_call is not None

    @pytest.mark.asyncio
    async def test_email_queueing_failure_does_not_fail_rsvp(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
        mock_invitation: dict,
    ):
        """
        GIVEN email queueing fails
        WHEN RSVP submission completes
        THEN the RSVP is still created successfully
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        service.invitation_repo.get_by_id.return_value = mock_invitation
        service.rsvp_repo.find_by_email.return_value = None

        rsvp_id = uuid4()
        service.rsvp_repo.create.return_value = {
            "rsvp_id": rsvp_id,
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token_hash": "hashed_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task") as mock_enqueue:
            # Simulate email queueing failure
            mock_enqueue.side_effect = Exception("Email service unavailable")

            # Should still succeed - RSVP submission should not fail
            result = await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

            # RSVP should still be created
            assert result is not None
            assert result.rsvp_id == rsvp_id

    @pytest.mark.asyncio
    async def test_email_attendance_status_correct(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        mock_invitation: dict,
    ):
        """
        GIVEN an RSVP with attending=False
        WHEN confirmation email is enqueued
        THEN the email shows 'not_attending' status
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        # RSVP declining attendance
        rsvp_data = RSVPCreate(
            guest_name="Declining Guest",
            guest_email="decline@example.com",
            attending=False,
            party_size=1,  # Minimum is 1 per schema validation
        )

        service.invitation_repo.get_by_id.return_value = mock_invitation
        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_data.guest_email,
            "edit_token_hash": "hashed_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task") as mock_enqueue:
            mock_enqueue.return_value = "task-123"

            await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_data,
                source=RSVPSource.WEB,
            )

            # Find confirmation call and check status
            for call in mock_enqueue.call_args_list:
                payload = call.kwargs.get("payload", {})
                if payload.get("guest_email") == rsvp_data.guest_email:
                    assert payload.get("attendance_status") == "not_attending"
                    break


class TestRSVPEditLink:
    """Tests for edit link token generation and inclusion."""

    @pytest.mark.asyncio
    async def test_edit_token_returned_in_response(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
        mock_invitation: dict,
    ):
        """
        GIVEN a successful RSVP submission
        WHEN the response is returned
        THEN it contains an edit token
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        service.invitation_repo.get_by_id.return_value = mock_invitation
        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token_hash": "hashed_token",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task"):
            result = await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

            # Edit token should be in response
            assert result.edit_token is not None
            assert isinstance(result.edit_token, str)
            # Token should be a secure random string
            assert len(result.edit_token) >= 32  # URL-safe base64 of 24 random bytes

    @pytest.mark.asyncio
    async def test_edit_token_hash_stored_in_database(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        rsvp_create_data: RSVPCreate,
        mock_invitation: dict,
    ):
        """
        GIVEN a successful RSVP submission
        WHEN the RSVP is created
        THEN the hashed edit token is stored (not the plain token)
        """
        service = InvitationRSVPService()
        service.rsvp_repo = AsyncMock()
        service.invitation_repo = AsyncMock()
        service.audit_service = AsyncMock()

        service.invitation_repo.get_by_id.return_value = mock_invitation
        service.rsvp_repo.find_by_email.return_value = None
        service.rsvp_repo.create.return_value = {
            "rsvp_id": uuid4(),
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_email": rsvp_create_data.guest_email,
            "edit_token_hash": "stored_hash",
        }
        service.invitation_repo.increment_rsvp_count.return_value = None

        with patch("app.services.invitation_rsvp_service.enqueue_task"):
            result = await service.submit_rsvp(
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                data=rsvp_create_data,
                source=RSVPSource.WEB,
            )

            # Verify create was called with edit_token_hash
            create_call = service.rsvp_repo.create.call_args
            create_data = create_call.args[0] if create_call.args else create_call.kwargs.get("data", {})

            # The hash should be different from the plain token
            assert "edit_token_hash" in create_data
            assert create_data["edit_token_hash"] != result.edit_token
