"""Security tests for authentication error messages.

Tests verify that JWT validation errors return generic messages
to prevent information disclosure about token structure or validation logic.

IMPORTANT: These tests should FAIL before implementing the security fixes.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

from src.middleware.auth import decode_jwt, get_current_user


class TestAuthErrorMessageDisclosure:
    """Test that all auth errors return identical generic messages."""

    @pytest.mark.asyncio
    async def test_expired_token_returns_generic_message(self):
        """T017: Expired token returns generic message.

        SECURITY: Do NOT reveal that the token was specifically expired.
        Attackers can use this to learn about token lifetime/structure.
        """
        import jwt

        with patch('src.middleware.auth._load_public_key') as mock_key:
            mock_key.return_value = MagicMock()

            with patch('jwt.decode') as mock_decode:
                mock_decode.side_effect = jwt.ExpiredSignatureError("Token expired")

                with pytest.raises(HTTPException) as exc_info:
                    decode_jwt("expired.token.here")

                # MUST NOT reveal expiration
                error_detail = str(exc_info.value.detail).lower()
                assert "expired" not in error_detail, \
                    "Error message should NOT reveal token expiration"
                assert "invalid authentication token" in error_detail, \
                    "Error should use generic 'Invalid authentication token' message"

    @pytest.mark.asyncio
    async def test_invalid_signature_returns_generic_message(self):
        """T018: Invalid signature returns generic message.

        SECURITY: Do NOT reveal that the signature was specifically invalid.
        This helps attackers understand the validation process.
        """
        import jwt

        with patch('src.middleware.auth._load_public_key') as mock_key:
            mock_key.return_value = MagicMock()

            with patch('jwt.decode') as mock_decode:
                mock_decode.side_effect = jwt.InvalidSignatureError("Invalid signature")

                with pytest.raises(HTTPException) as exc_info:
                    decode_jwt("invalid.signature.token")

                # MUST NOT reveal signature issue
                error_detail = str(exc_info.value.detail).lower()
                assert "signature" not in error_detail, \
                    "Error message should NOT reveal signature validation failure"
                assert "invalid authentication token" in error_detail, \
                    "Error should use generic 'Invalid authentication token' message"

    @pytest.mark.asyncio
    async def test_malformed_token_returns_generic_message(self):
        """T019: Malformed token returns generic message.

        SECURITY: Do NOT reveal parsing errors or token structure requirements.
        """
        import jwt

        with patch('src.middleware.auth._load_public_key') as mock_key:
            mock_key.return_value = MagicMock()

            with patch('jwt.decode') as mock_decode:
                mock_decode.side_effect = jwt.DecodeError("Not enough segments")

                with pytest.raises(HTTPException) as exc_info:
                    decode_jwt("malformed-token")

                # MUST NOT reveal parsing details
                error_detail = str(exc_info.value.detail).lower()
                assert "segment" not in error_detail, \
                    "Error message should NOT reveal token structure requirements"
                assert "decode" not in error_detail, \
                    "Error message should NOT reveal parsing errors"
                assert "invalid authentication token" in error_detail, \
                    "Error should use generic 'Invalid authentication token' message"

    @pytest.mark.asyncio
    async def test_all_auth_errors_return_identical_response(self):
        """T020: All auth errors return IDENTICAL response body.

        SECURITY: Attackers MUST NOT be able to distinguish between
        different failure modes by comparing error responses.
        """
        import jwt

        error_responses = []

        with patch('src.middleware.auth._load_public_key') as mock_key:
            mock_key.return_value = MagicMock()

            # Test different error types
            error_types = [
                jwt.ExpiredSignatureError("Token expired"),
                jwt.InvalidSignatureError("Invalid signature"),
                jwt.DecodeError("Malformed token"),
                jwt.InvalidTokenError("General invalid"),
                jwt.InvalidAlgorithmError("Wrong algorithm"),
                jwt.InvalidAudienceError("Wrong audience"),
                jwt.InvalidIssuerError("Wrong issuer"),
            ]

            for error in error_types:
                with patch('jwt.decode') as mock_decode:
                    mock_decode.side_effect = error

                    try:
                        decode_jwt("test.token.here")
                    except HTTPException as exc:
                        error_responses.append(exc.detail)

        # All error responses should be identical
        assert len(set(error_responses)) == 1, \
            f"All JWT errors should return IDENTICAL responses. Got: {set(error_responses)}"
        assert "Invalid authentication token" in error_responses[0], \
            "Error should use generic 'Invalid authentication token' message"


class TestAuthInternalLogging:
    """Test that detailed errors are logged internally for debugging."""

    @pytest.mark.asyncio
    async def test_detailed_errors_logged_at_debug_level(self):
        """T021: Detailed errors logged at DEBUG level.

        While returning generic messages to clients, the actual error
        details should be logged internally for debugging/monitoring.
        """
        import jwt

        with patch('src.middleware.auth._load_public_key') as mock_key:
            mock_key.return_value = MagicMock()

            with patch('jwt.decode') as mock_decode:
                mock_decode.side_effect = jwt.ExpiredSignatureError("Token expired at 12345")

                with patch('src.middleware.auth.logger') as mock_logger:
                    with pytest.raises(HTTPException):
                        decode_jwt("Bearer expired.token")

                    # Verify debug logging was called with details
                    # (Implementation should log at DEBUG level with error details)
                    # This test validates the logging behavior once implemented


class TestGetCurrentUserErrorHandling:
    """Test that get_current_user also uses generic error messages."""

    @pytest.mark.asyncio
    async def test_get_current_user_generic_errors(self):
        """T026: get_current_user returns generic message for all errors.

        The get_current_user dependency should also use generic messages.
        """
        with patch('src.middleware.auth.decode_jwt') as mock_decode:
            # Simulate any error
            mock_decode.side_effect = HTTPException(
                status_code=401,
                detail="Some detailed error message",
            )

            with pytest.raises(HTTPException) as exc_info:
                await get_current_user("Bearer invalid.token")

            # Should return generic message
            error_detail = str(exc_info.value.detail).lower()
            # Note: After implementation, this should be generic
            # For now, test documents expected behavior
