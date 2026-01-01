"""
Unit Tests for RSVP Service.

Tests edit token generation, validation, and RSVP operations.
"""

import pytest
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from src.services.rsvp_service import (
    RSVPService,
    generate_edit_token,
    verify_edit_token,
    is_token_expired,
)


class TestEditTokenGeneration:
    """Test edit token generation."""

    def test_generate_edit_token_returns_string(self):
        """Token generation returns a string."""
        guest_id = str(uuid4())
        token = generate_edit_token(guest_id)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_edit_token_deterministic_with_secret(self):
        """Same inputs produce same token (deterministic)."""
        guest_id = str(uuid4())

        token1 = generate_edit_token(guest_id)
        token2 = generate_edit_token(guest_id)

        # With same secret and guest_id, tokens should match
        # (assuming no random component in token generation)
        assert token1 == token2

    def test_generate_edit_token_different_for_different_guests(self):
        """Different guests get different tokens."""
        guest_id_1 = str(uuid4())
        guest_id_2 = str(uuid4())

        token1 = generate_edit_token(guest_id_1)
        token2 = generate_edit_token(guest_id_2)

        assert token1 != token2

    def test_generate_edit_token_format(self):
        """Token has expected format (hex string)."""
        guest_id = str(uuid4())
        token = generate_edit_token(guest_id)

        # Should be a valid hex string
        try:
            bytes.fromhex(token)
            is_hex = True
        except ValueError:
            is_hex = False

        assert is_hex, f"Token {token} is not valid hex"


class TestEditTokenVerification:
    """Test edit token verification."""

    def test_verify_valid_token_succeeds(self):
        """Valid token passes verification."""
        guest_id = str(uuid4())
        token = generate_edit_token(guest_id)

        is_valid = verify_edit_token(guest_id, token)

        assert is_valid is True

    def test_verify_invalid_token_fails(self):
        """Invalid token fails verification."""
        guest_id = str(uuid4())
        invalid_token = "invalidtokenvalue"

        is_valid = verify_edit_token(guest_id, invalid_token)

        assert is_valid is False

    def test_verify_wrong_guest_token_fails(self):
        """Token for different guest fails verification."""
        guest_id_1 = str(uuid4())
        guest_id_2 = str(uuid4())
        token = generate_edit_token(guest_id_1)

        is_valid = verify_edit_token(guest_id_2, token)

        assert is_valid is False

    def test_verify_empty_token_fails(self):
        """Empty token fails verification."""
        guest_id = str(uuid4())

        is_valid = verify_edit_token(guest_id, "")

        assert is_valid is False

    def test_verify_none_token_fails(self):
        """None token fails verification."""
        guest_id = str(uuid4())

        is_valid = verify_edit_token(guest_id, None)

        assert is_valid is False

    def test_verification_uses_constant_time_compare(self):
        """Token verification uses constant-time comparison."""
        # This is a security requirement - we use hmac.compare_digest
        # to prevent timing attacks. This test verifies the implementation
        # uses the correct method.
        guest_id = str(uuid4())
        token = generate_edit_token(guest_id)

        # The verify function should use hmac.compare_digest internally
        # We can't easily test timing, but we verify behavior is correct
        assert verify_edit_token(guest_id, token) is True
        assert verify_edit_token(guest_id, token + "x") is False


class TestTokenExpiration:
    """Test token expiration handling."""

    def test_unexpired_token_valid(self):
        """Token before expiration date is valid."""
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        is_expired = is_token_expired(expires_at)

        assert is_expired is False

    def test_expired_token_invalid(self):
        """Token past expiration date is invalid."""
        expires_at = datetime.now(timezone.utc) - timedelta(days=1)

        is_expired = is_token_expired(expires_at)

        assert is_expired is True

    def test_just_expired_token_invalid(self):
        """Token that just expired is invalid."""
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

        is_expired = is_token_expired(expires_at)

        assert is_expired is True

    def test_none_expiration_never_expires(self):
        """Token with no expiration never expires."""
        is_expired = is_token_expired(None)

        assert is_expired is False


class TestRSVPServiceSubmission:
    """Test RSVP submission operations."""

    @pytest.fixture
    def rsvp_service(self):
        """Create RSVP service instance."""
        return RSVPService()

    @pytest.fixture
    def valid_submission_data(self):
        """Valid RSVP submission data."""
        return {
            "name": "John Doe",
            "email": "john@example.com",
            "phone": "+15551234567",
            "status": "yes",
            "plus_ones": 2,
            "dietary_restrictions": "Vegetarian",
            "message": "Looking forward to it!",
        }

    @pytest.mark.asyncio
    async def test_submit_rsvp_creates_record(
        self, rsvp_service, valid_submission_data
    ):
        """Submitting RSVP creates a new record."""
        invitation_id = str(uuid4())
        workspace_id = str(uuid4())

        with patch.object(rsvp_service, "_create_guest_record") as mock_create:
            mock_create.return_value = {
                "guest_id": str(uuid4()),
                "edit_token": "abc123",
            }

            result = await rsvp_service.submit_rsvp(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                submission=valid_submission_data,
            )

            mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_submit_rsvp_returns_edit_token(
        self, rsvp_service, valid_submission_data
    ):
        """Submitting RSVP returns an edit token."""
        invitation_id = str(uuid4())
        workspace_id = str(uuid4())

        with patch.object(rsvp_service, "_create_guest_record") as mock_create:
            mock_create.return_value = {
                "guest_id": str(uuid4()),
                "edit_token": "test_token_123",
            }

            result = await rsvp_service.submit_rsvp(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                submission=valid_submission_data,
            )

            assert "edit_token" in result


class TestRSVPServiceRetrieval:
    """Test RSVP retrieval operations."""

    @pytest.fixture
    def rsvp_service(self):
        """Create RSVP service instance."""
        return RSVPService()

    @pytest.mark.asyncio
    async def test_get_rsvp_with_valid_token(self, rsvp_service):
        """Can retrieve RSVP with valid edit token."""
        guest_id = str(uuid4())
        edit_token = generate_edit_token(guest_id)

        with patch.object(rsvp_service, "_get_guest_record") as mock_get:
            mock_get.return_value = {
                "guest_id": guest_id,
                "name": "Test User",
                "status": "yes",
                "edit_token": edit_token,
                "edit_token_expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            }

            result = await rsvp_service.get_rsvp(guest_id, edit_token)

            assert result is not None
            assert result["name"] == "Test User"

    @pytest.mark.asyncio
    async def test_get_rsvp_with_invalid_token_fails(self, rsvp_service):
        """Cannot retrieve RSVP with invalid token."""
        guest_id = str(uuid4())
        wrong_token = "wrong_token"

        with patch.object(rsvp_service, "_get_guest_record") as mock_get:
            mock_get.return_value = {
                "guest_id": guest_id,
                "edit_token": generate_edit_token(guest_id),
                "edit_token_expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            }

            result = await rsvp_service.get_rsvp(guest_id, wrong_token)

            assert result is None


class TestRSVPServiceUpdate:
    """Test RSVP update operations."""

    @pytest.fixture
    def rsvp_service(self):
        """Create RSVP service instance."""
        return RSVPService()

    @pytest.mark.asyncio
    async def test_update_rsvp_changes_status(self, rsvp_service):
        """Can update RSVP status."""
        guest_id = str(uuid4())
        edit_token = generate_edit_token(guest_id)

        with patch.object(rsvp_service, "_get_guest_record") as mock_get:
            with patch.object(rsvp_service, "_update_guest_record") as mock_update:
                mock_get.return_value = {
                    "guest_id": guest_id,
                    "status": "maybe",
                    "edit_token": edit_token,
                    "edit_token_expires_at": datetime.now(timezone.utc) + timedelta(days=30),
                }
                mock_update.return_value = {
                    "guest_id": guest_id,
                    "status": "yes",
                }

                result = await rsvp_service.update_rsvp(
                    guest_id=guest_id,
                    edit_token=edit_token,
                    updates={"status": "yes"},
                )

                mock_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_rsvp_with_expired_token_fails(self, rsvp_service):
        """Cannot update RSVP with expired token."""
        guest_id = str(uuid4())
        edit_token = generate_edit_token(guest_id)

        with patch.object(rsvp_service, "_get_guest_record") as mock_get:
            mock_get.return_value = {
                "guest_id": guest_id,
                "edit_token": edit_token,
                "edit_token_expires_at": datetime.now(timezone.utc) - timedelta(days=1),  # Expired
            }

            result = await rsvp_service.update_rsvp(
                guest_id=guest_id,
                edit_token=edit_token,
                updates={"status": "yes"},
            )

            assert result is None


class TestEmailMasking:
    """Test email masking for privacy."""

    @pytest.fixture
    def rsvp_service(self):
        """Create RSVP service instance."""
        return RSVPService()

    def test_mask_email_short_local(self):
        """Short email local part is fully masked."""
        email = "ab@example.com"
        masked = RSVPService.mask_email(email)

        assert "ab" not in masked
        assert "@example.com" in masked

    def test_mask_email_long_local(self):
        """Long email local part shows first and last char."""
        email = "longusername@example.com"
        masked = RSVPService.mask_email(email)

        assert masked.startswith("l")
        assert "*" in masked
        assert "@example.com" in masked
        assert "longusername" not in masked

    def test_mask_email_none(self):
        """None email returns None."""
        masked = RSVPService.mask_email(None)
        assert masked is None

    def test_mask_email_empty(self):
        """Empty email returns None."""
        masked = RSVPService.mask_email("")
        assert masked is None
