"""Unit tests for face error handler middleware.

Tests the error boundary middleware for Face Detection API routes.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Task: T048 - Unit test for face error sanitization
Finding: SEC-002 (Generic error messages)
"""

import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.testclient import TestClient

from app.api.face_schemas import FaceDetectionErrorCode
from app.middleware.face_error_handler import (
    FaceDetectionErrorMiddleware,
    async_handler,
    create_error_response,
    create_validation_error_response,
    face_detection_exception_handler,
    generate_correlation_id,
    generic_exception_handler,
    get_correlation_id,
    setup_face_detection_error_handlers,
)
from app.services.face_exceptions import (
    AllProvidersFailedError,
    CrossWorkspaceAccessError,
    DetectionDisabledError,
    DetectionFailedError,
    EmbeddingDimensionMismatchError,
    EmbeddingNotNormalizedError,
    FaceDetectionError,
    FaceGroupNotFoundError,
    FaceNotFoundError,
    ImageCorruptedError,
    ImageTooSmallError,
    InvalidConfigurationError,
    InvalidImageFormatError,
    InvalidMergeOperationError,
    InvalidSplitOperationError,
    PhotoNotFoundError,
    ProviderInvalidResponseError,
    ProviderNotConfiguredError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    WorkspaceAccessDeniedError,
    get_default_http_status,
    get_default_user_message,
)


# =============================================================================
# CORRELATION ID UTILITIES TESTS
# =============================================================================


class TestGenerateCorrelationId:
    """Tests for generate_correlation_id function."""

    def test_generates_valid_uuid(self):
        """Should generate a valid UUID string."""
        correlation_id = generate_correlation_id()

        # Should be a valid UUID format
        assert isinstance(correlation_id, str)
        parsed = uuid.UUID(correlation_id)
        assert str(parsed) == correlation_id

    def test_generates_unique_ids(self):
        """Should generate unique IDs each time."""
        ids = [generate_correlation_id() for _ in range(100)]

        # All should be unique
        assert len(set(ids)) == 100


class TestGetCorrelationId:
    """Tests for get_correlation_id function."""

    def _create_mock_request(self, headers: dict) -> MagicMock:
        """Create a mock Request with specified headers."""
        request = MagicMock(spec=Request)
        request.headers = headers
        return request

    def test_extracts_x_correlation_id_header(self):
        """Should extract x-correlation-id header."""
        expected_id = str(uuid.uuid4())
        request = self._create_mock_request({"x-correlation-id": expected_id})

        result = get_correlation_id(request)

        assert result == expected_id

    def test_extracts_x_request_id_header(self):
        """Should extract x-request-id header if x-correlation-id missing."""
        expected_id = str(uuid.uuid4())
        request = self._create_mock_request({"x-request-id": expected_id})

        result = get_correlation_id(request)

        assert result == expected_id

    def test_extracts_request_id_header(self):
        """Should extract request-id header if others missing."""
        expected_id = str(uuid.uuid4())
        request = self._create_mock_request({"request-id": expected_id})

        result = get_correlation_id(request)

        assert result == expected_id

    def test_prefers_x_correlation_id_over_others(self):
        """Should prefer x-correlation-id over other headers."""
        correlation_id = str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        request = self._create_mock_request({
            "x-correlation-id": correlation_id,
            "x-request-id": request_id,
            "request-id": "other-id",
        })

        result = get_correlation_id(request)

        assert result == correlation_id

    def test_generates_new_id_when_no_headers(self):
        """Should generate new ID when no headers present."""
        request = self._create_mock_request({})

        result = get_correlation_id(request)

        # Should be a valid UUID
        assert isinstance(result, str)
        uuid.UUID(result)  # Should not raise


# =============================================================================
# EXCEPTION HANDLERS TESTS
# =============================================================================


class TestFaceDetectionExceptionHandler:
    """Tests for face_detection_exception_handler."""

    def _create_mock_request(
        self,
        user_id: str | None = None,
        workspace_id: str | None = None,
        correlation_id: str | None = None,
    ) -> MagicMock:
        """Create a mock Request with specified attributes."""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.state.user_id = user_id
        request.state.workspace_id = workspace_id
        request.url.path = "/api/v1/faces/test"
        request.method = "GET"

        headers = {}
        if correlation_id:
            headers["x-correlation-id"] = correlation_id
        request.headers = headers

        return request

    @pytest.mark.asyncio
    async def test_returns_json_response_with_correct_status(self):
        """Should return JSONResponse with correct HTTP status."""
        request = self._create_mock_request()
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face abc123 not found",
        )

        response = await face_detection_exception_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_response_includes_error_code(self):
        """Should include error code in response."""
        request = self._create_mock_request()
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND,
            message="Group not found",
        )

        response = await face_detection_exception_handler(request, exc)

        body = response.body.decode()
        assert '"code": "FACE_GROUP_NOT_FOUND"' in body or '"code":"FACE_GROUP_NOT_FOUND"' in body

    @pytest.mark.asyncio
    async def test_response_includes_user_message_not_technical(self):
        """Should include user-friendly message, not technical details."""
        request = self._create_mock_request()
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face abc123-def456 not found in workspace xyz789",  # Technical
        )

        response = await face_detection_exception_handler(request, exc)

        body = response.body.decode()
        # Should NOT contain face ID or workspace ID
        assert "abc123-def456" not in body
        assert "xyz789" not in body
        # Should contain user-friendly message
        assert "could not be found" in body or "no longer exists" in body

    @pytest.mark.asyncio
    async def test_response_includes_correlation_id_from_exception(self):
        """Should include correlation ID from exception."""
        request = self._create_mock_request()
        correlation_id = str(uuid.uuid4())
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
            correlation_id=correlation_id,
        )

        response = await face_detection_exception_handler(request, exc)

        body = response.body.decode()
        assert correlation_id in body

    @pytest.mark.asyncio
    async def test_response_generates_correlation_id_if_missing(self):
        """Should generate correlation ID if not on exception."""
        request = self._create_mock_request()
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
        )

        response = await face_detection_exception_handler(request, exc)

        body = response.body.decode()
        assert "correlation_id" in body

    @pytest.mark.asyncio
    async def test_logs_error_with_appropriate_level(self):
        """Should log with appropriate level based on HTTP status."""
        request = self._create_mock_request()

        # 4xx should log WARNING
        exc_404 = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
        )

        with patch("app.middleware.face_error_handler.logger") as mock_logger:
            await face_detection_exception_handler(request, exc_404)
            mock_logger.log.assert_called()
            call_args = mock_logger.log.call_args
            assert call_args[0][0] == logging.WARNING

        # 5xx should log ERROR
        exc_500 = FaceDetectionError(
            code=FaceDetectionErrorCode.DETECTION_FAILED,
            message="Detection failed",
        )

        with patch("app.middleware.face_error_handler.logger") as mock_logger:
            await face_detection_exception_handler(request, exc_500)
            call_args = mock_logger.log.call_args
            assert call_args[0][0] == logging.ERROR

    @pytest.mark.asyncio
    async def test_success_flag_is_false(self):
        """Should set success flag to false."""
        request = self._create_mock_request()
        exc = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
        )

        response = await face_detection_exception_handler(request, exc)

        body = response.body.decode()
        assert '"success": false' in body or '"success":false' in body


class TestGenericExceptionHandler:
    """Tests for generic_exception_handler."""

    def _create_mock_request(self) -> MagicMock:
        """Create a mock Request."""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.state.user_id = None
        request.state.workspace_id = None
        request.url.path = "/api/v1/faces/test"
        request.method = "POST"
        request.headers = {}
        return request

    @pytest.mark.asyncio
    async def test_returns_500_status(self):
        """Should always return 500 for unexpected errors."""
        request = self._create_mock_request()
        exc = ValueError("Something went wrong")

        response = await generic_exception_handler(request, exc)

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_returns_generic_error_message(self):
        """Should return generic message, not internal error details."""
        request = self._create_mock_request()
        exc = RuntimeError("Database connection failed at host:5432 with secret xyz")

        response = await generic_exception_handler(request, exc)

        body = response.body.decode()
        # Should NOT contain internal details
        assert "Database" not in body
        assert "5432" not in body
        assert "secret" not in body
        assert "xyz" not in body
        # Should contain generic message
        assert "unexpected error" in body.lower()

    @pytest.mark.asyncio
    async def test_returns_internal_error_code(self):
        """Should return INTERNAL_ERROR code."""
        request = self._create_mock_request()
        exc = Exception("Test error")

        response = await generic_exception_handler(request, exc)

        body = response.body.decode()
        assert "INTERNAL_ERROR" in body

    @pytest.mark.asyncio
    async def test_includes_correlation_id(self):
        """Should include correlation ID in response."""
        request = self._create_mock_request()
        exc = Exception("Test error")

        response = await generic_exception_handler(request, exc)

        body = response.body.decode()
        assert "correlation_id" in body

    @pytest.mark.asyncio
    async def test_logs_full_error_details(self):
        """Should log full error details for debugging."""
        request = self._create_mock_request()
        exc = RuntimeError("Sensitive internal error")

        with patch("app.middleware.face_error_handler.logger") as mock_logger:
            await generic_exception_handler(request, exc)

            mock_logger.error.assert_called()
            call_args = mock_logger.error.call_args
            # Should log the error message
            assert "Sensitive internal error" in str(call_args)
            # Should include exc_info for stack trace
            assert call_args[1].get("exc_info") is True


# =============================================================================
# ASYNC HANDLER DECORATOR TESTS
# =============================================================================


class TestAsyncHandlerDecorator:
    """Tests for async_handler decorator."""

    @pytest.mark.asyncio
    async def test_passes_through_successful_result(self):
        """Should pass through successful results unchanged."""
        @async_handler
        async def handler():
            return {"result": "success"}

        result = await handler()

        assert result == {"result": "success"}

    @pytest.mark.asyncio
    async def test_re_raises_face_detection_error(self):
        """Should re-raise FaceDetectionError for exception handler."""
        @async_handler
        async def handler():
            raise FaceDetectionError(
                code=FaceDetectionErrorCode.FACE_NOT_FOUND,
                message="Face not found",
            )

        with pytest.raises(FaceDetectionError):
            await handler()

    @pytest.mark.asyncio
    async def test_re_raises_unexpected_errors(self):
        """Should re-raise unexpected errors after logging."""
        @async_handler
        async def handler():
            raise ValueError("Unexpected error")

        with patch("app.middleware.face_error_handler.logger") as mock_logger:
            with pytest.raises(ValueError):
                await handler()

            # Should log the error
            mock_logger.error.assert_called()

    @pytest.mark.asyncio
    async def test_preserves_function_name(self):
        """Should preserve wrapped function name."""
        @async_handler
        async def my_handler():
            pass

        assert my_handler.__name__ == "my_handler"


# =============================================================================
# MIDDLEWARE CLASS TESTS
# =============================================================================


class TestFaceDetectionErrorMiddleware:
    """Tests for FaceDetectionErrorMiddleware class."""

    @pytest.mark.asyncio
    async def test_passes_through_non_face_routes(self):
        """Should pass through requests not matching face routes."""
        app = MagicMock()
        middleware = FaceDetectionErrorMiddleware(app, path_prefix="/api/v1/faces")

        request = MagicMock()
        request.url.path = "/api/v1/galleries"
        request.headers = {}

        call_next = AsyncMock(return_value=MagicMock())

        await middleware.dispatch(request, call_next)

        call_next.assert_called_once()

    @pytest.mark.asyncio
    async def test_handles_face_detection_errors(self):
        """Should handle FaceDetectionError from face routes."""
        app = MagicMock()
        middleware = FaceDetectionErrorMiddleware(app, path_prefix="/api/v1/faces")

        request = MagicMock()
        request.url.path = "/api/v1/faces/123"
        request.method = "GET"
        request.headers = {}
        request.state = MagicMock()
        request.state.user_id = None
        request.state.workspace_id = None

        async def call_next_raises(req):
            raise FaceDetectionError(
                code=FaceDetectionErrorCode.FACE_NOT_FOUND,
                message="Face not found",
            )

        response = await middleware.dispatch(request, call_next_raises)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_handles_generic_errors(self):
        """Should handle generic errors from face routes."""
        app = MagicMock()
        middleware = FaceDetectionErrorMiddleware(app, path_prefix="/api/v1/faces")

        request = MagicMock()
        request.url.path = "/api/v1/faces/123"
        request.method = "GET"
        request.headers = {}
        request.state = MagicMock()
        request.state.user_id = None
        request.state.workspace_id = None

        async def call_next_raises(req):
            raise RuntimeError("Internal error")

        response = await middleware.dispatch(request, call_next_raises)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_adds_correlation_id_to_request_state(self):
        """Should add correlation ID to request state."""
        app = MagicMock()
        middleware = FaceDetectionErrorMiddleware(app, path_prefix="/api/v1/faces")

        request = MagicMock()
        request.url.path = "/api/v1/faces/123"
        request.headers = {}
        request.state = MagicMock()

        call_next = AsyncMock(return_value=MagicMock())

        await middleware.dispatch(request, call_next)

        # Should have set correlation_id on request state
        assert hasattr(request.state, "correlation_id")


# =============================================================================
# ERROR RESPONSE HELPER TESTS
# =============================================================================


class TestCreateErrorResponse:
    """Tests for create_error_response helper."""

    def test_creates_json_response_with_status(self):
        """Should create JSONResponse with correct status."""
        response = create_error_response(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
            http_status=404,
        )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404

    def test_includes_error_code_and_message(self):
        """Should include error code and message."""
        response = create_error_response(
            code=FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND,
            message="Group not found",
            http_status=404,
        )

        body = response.body.decode()
        assert "FACE_GROUP_NOT_FOUND" in body
        assert "Group not found" in body

    def test_includes_correlation_id_when_provided(self):
        """Should include correlation ID when provided."""
        correlation_id = str(uuid.uuid4())
        response = create_error_response(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
            http_status=404,
            correlation_id=correlation_id,
        )

        body = response.body.decode()
        assert correlation_id in body

    def test_includes_details_when_provided(self):
        """Should include details when provided."""
        response = create_error_response(
            code=FaceDetectionErrorCode.INVALID_IMAGE_FORMAT,
            message="Invalid format",
            http_status=400,
            details=[{"field": "image", "message": "Must be JPEG"}],
        )

        body = response.body.decode()
        assert "details" in body
        assert "image" in body

    def test_success_is_false(self):
        """Should set success to false."""
        response = create_error_response(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
            http_status=404,
        )

        body = response.body.decode()
        assert '"success": false' in body or '"success":false' in body


class TestCreateValidationErrorResponse:
    """Tests for create_validation_error_response helper."""

    def test_returns_422_status(self):
        """Should return 422 status for validation errors."""
        response = create_validation_error_response(
            field_errors=[("image", "Required field")],
        )

        assert response.status_code == 422

    def test_formats_field_errors(self):
        """Should format field errors correctly."""
        response = create_validation_error_response(
            field_errors=[
                ("image", "Required field"),
                ("format", "Must be JPEG"),
            ],
        )

        body = response.body.decode()
        assert "image" in body
        assert "Required field" in body
        assert "format" in body
        assert "Must be JPEG" in body

    def test_includes_correlation_id_when_provided(self):
        """Should include correlation ID when provided."""
        correlation_id = str(uuid.uuid4())
        response = create_validation_error_response(
            field_errors=[("test", "error")],
            correlation_id=correlation_id,
        )

        body = response.body.decode()
        assert correlation_id in body


# =============================================================================
# SETUP HELPER TESTS
# =============================================================================


class TestSetupFaceDetectionErrorHandlers:
    """Tests for setup_face_detection_error_handlers."""

    def test_registers_exception_handler(self):
        """Should register FaceDetectionError exception handler."""
        app = MagicMock()

        setup_face_detection_error_handlers(app)

        app.add_exception_handler.assert_called_once()
        call_args = app.add_exception_handler.call_args
        # First arg should be the exception type
        assert call_args[0][0] == FaceDetectionError
        # Second arg should be the handler function
        assert call_args[0][1] == face_detection_exception_handler


# =============================================================================
# FACE EXCEPTION CLASSES TESTS
# =============================================================================


class TestGetDefaultUserMessage:
    """Tests for get_default_user_message function."""

    def test_returns_user_friendly_message_for_face_not_found(self):
        """Should return user-friendly message without IDs."""
        message = get_default_user_message(FaceDetectionErrorCode.FACE_NOT_FOUND)

        # Should be user-friendly
        assert "could not be found" in message or "no longer exists" in message
        # Should NOT mention technical details
        assert "face_id" not in message.lower()

    def test_returns_user_friendly_message_for_face_group_not_found(self):
        """Should return user-friendly message without IDs."""
        message = get_default_user_message(FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND)

        # Should be user-friendly
        assert "no longer exists" in message or "could not be found" in message
        # Should NOT mention technical details
        assert "group_id" not in message.lower()

    def test_returns_fallback_for_unknown_code(self):
        """Should return fallback message for unknown codes."""
        # Create a mock code not in the mapping
        mock_code = MagicMock()
        mock_code.value = "UNKNOWN_CODE"

        message = get_default_user_message(mock_code)

        assert "unexpected error" in message.lower()

    @pytest.mark.parametrize("code", [
        FaceDetectionErrorCode.PROVIDER_UNAVAILABLE,
        FaceDetectionErrorCode.PROVIDER_RATE_LIMITED,
        FaceDetectionErrorCode.PROVIDER_TIMEOUT,
        FaceDetectionErrorCode.INVALID_IMAGE_FORMAT,
        FaceDetectionErrorCode.IMAGE_TOO_SMALL,
        FaceDetectionErrorCode.DETECTION_DISABLED,
        FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED,
    ])
    def test_all_codes_have_messages(self, code):
        """All error codes should have user-friendly messages."""
        message = get_default_user_message(code)

        assert isinstance(message, str)
        assert len(message) > 10  # Should be meaningful


class TestGetDefaultHttpStatus:
    """Tests for get_default_http_status function."""

    def test_face_not_found_returns_404(self):
        """FACE_NOT_FOUND should return 404."""
        status = get_default_http_status(FaceDetectionErrorCode.FACE_NOT_FOUND)
        assert status == 404

    def test_face_group_not_found_returns_404(self):
        """FACE_GROUP_NOT_FOUND should return 404."""
        status = get_default_http_status(FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND)
        assert status == 404

    def test_provider_rate_limited_returns_429(self):
        """PROVIDER_RATE_LIMITED should return 429."""
        status = get_default_http_status(FaceDetectionErrorCode.PROVIDER_RATE_LIMITED)
        assert status == 429

    def test_provider_unavailable_returns_503(self):
        """PROVIDER_UNAVAILABLE should return 503."""
        status = get_default_http_status(FaceDetectionErrorCode.PROVIDER_UNAVAILABLE)
        assert status == 503

    def test_invalid_image_format_returns_400(self):
        """INVALID_IMAGE_FORMAT should return 400."""
        status = get_default_http_status(FaceDetectionErrorCode.INVALID_IMAGE_FORMAT)
        assert status == 400

    def test_unknown_code_returns_500(self):
        """Unknown codes should return 500."""
        mock_code = MagicMock()
        mock_code.value = "UNKNOWN_CODE"

        status = get_default_http_status(mock_code)
        assert status == 500


class TestFaceDetectionErrorBase:
    """Tests for FaceDetectionError base class."""

    def test_initializes_with_required_fields(self):
        """Should initialize with code and message."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face 123 not found",
        )

        assert error.code == FaceDetectionErrorCode.FACE_NOT_FOUND
        assert error.message == "Face 123 not found"

    def test_auto_generates_user_message(self):
        """Should auto-generate user-friendly message."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face abc-123 not found in workspace xyz",  # Technical
        )

        # User message should be friendly, not technical
        assert "abc-123" not in error.user_message
        assert "xyz" not in error.user_message
        assert "could not be found" in error.user_message or "no longer exists" in error.user_message

    def test_allows_custom_user_message(self):
        """Should allow custom user message."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Technical message",
            user_message="Custom user message",
        )

        assert error.user_message == "Custom user message"

    def test_auto_generates_http_status(self):
        """Should auto-generate HTTP status from code."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
        )

        assert error.http_status == 404

    def test_allows_custom_http_status(self):
        """Should allow custom HTTP status."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
            http_status=410,  # Gone
        )

        assert error.http_status == 410

    def test_stores_details(self):
        """Should store additional details."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
            details={"face_id": "123", "workspace_id": "xyz"},
        )

        assert error.details == {"face_id": "123", "workspace_id": "xyz"}

    def test_stores_correlation_id(self):
        """Should store correlation ID."""
        correlation_id = str(uuid.uuid4())
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Not found",
            correlation_id=correlation_id,
        )

        assert error.correlation_id == correlation_id

    def test_to_api_response_excludes_technical_details(self):
        """to_api_response should exclude technical details."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face abc-123-def-456 not found in workspace xyz-789",  # Technical
            details={"face_id": "abc-123", "workspace_id": "xyz-789"},  # Technical
        )

        response = error.to_api_response()

        # Should NOT contain technical details
        response_str = str(response)
        assert "abc-123-def-456" not in response_str
        assert "xyz-789" not in response_str
        # Should have success=false and error info
        assert response["success"] is False
        assert "code" in response["error"]
        assert "message" in response["error"]

    def test_str_includes_code_and_message(self):
        """__str__ should include code and message."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
        )

        error_str = str(error)

        assert "FACE_NOT_FOUND" in error_str
        assert "Face not found" in error_str

    def test_repr_includes_all_fields(self):
        """__repr__ should include all fields."""
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face not found",
            http_status=404,
            correlation_id="corr-123",
        )

        error_repr = repr(error)

        assert "FACE_NOT_FOUND" in error_repr
        assert "Face not found" in error_repr
        assert "404" in error_repr
        assert "corr-123" in error_repr


# =============================================================================
# SPECIALIZED EXCEPTION CLASSES TESTS
# =============================================================================


class TestFaceNotFoundError:
    """Tests for FaceNotFoundError."""

    def test_user_message_does_not_contain_face_id(self):
        """User message should NOT contain face ID (SEC-002 fix)."""
        face_id = uuid.uuid4()
        error = FaceNotFoundError(face_id)

        # Technical message can have ID for logging
        assert str(face_id) in error.message
        # User message should NOT have ID
        assert str(face_id) not in error.user_message

    def test_returns_404_status(self):
        """Should return 404 status."""
        error = FaceNotFoundError(uuid.uuid4())
        assert error.http_status == 404


class TestFaceGroupNotFoundError:
    """Tests for FaceGroupNotFoundError."""

    def test_user_message_does_not_contain_group_id(self):
        """User message should NOT contain group ID (SEC-002 fix)."""
        group_id = uuid.uuid4()
        error = FaceGroupNotFoundError(group_id)

        # Technical message can have ID for logging
        assert str(group_id) in error.message
        # User message should NOT have ID
        assert str(group_id) not in error.user_message

    def test_returns_404_status(self):
        """Should return 404 status."""
        error = FaceGroupNotFoundError(uuid.uuid4())
        assert error.http_status == 404


class TestProviderErrors:
    """Tests for provider-related errors."""

    def test_provider_unavailable_error(self):
        """ProviderUnavailableError should have correct code."""
        error = ProviderUnavailableError("google-vision", "Service maintenance")

        assert error.code == FaceDetectionErrorCode.PROVIDER_UNAVAILABLE
        assert error.http_status == 503
        # User message should not expose provider name
        assert "google-vision" not in error.user_message

    def test_provider_rate_limited_error(self):
        """ProviderRateLimitedError should have correct code."""
        error = ProviderRateLimitedError("openai", retry_after_seconds=60)

        assert error.code == FaceDetectionErrorCode.PROVIDER_RATE_LIMITED
        assert error.http_status == 429
        # Technical message has details
        assert "60" in error.message

    def test_provider_timeout_error(self):
        """ProviderTimeoutError should have correct code."""
        error = ProviderTimeoutError("azure", timeout_ms=30000)

        assert error.code == FaceDetectionErrorCode.PROVIDER_TIMEOUT
        assert error.http_status == 504

    def test_all_providers_failed_error(self):
        """AllProvidersFailedError should have correct code."""
        error = AllProvidersFailedError([
            {"provider": "google", "error": "timeout"},
            {"provider": "azure", "error": "rate_limited"},
        ])

        assert error.code == FaceDetectionErrorCode.ALL_PROVIDERS_FAILED
        assert error.http_status == 503


class TestImageErrors:
    """Tests for image-related errors."""

    def test_invalid_image_format_error(self):
        """InvalidImageFormatError should have correct code."""
        error = InvalidImageFormatError("BMP", ["JPEG", "PNG"])

        assert error.code == FaceDetectionErrorCode.INVALID_IMAGE_FORMAT
        assert error.http_status == 400

    def test_image_too_small_error(self):
        """ImageTooSmallError should have correct code."""
        error = ImageTooSmallError(50, 50, 100, 100)

        assert error.code == FaceDetectionErrorCode.IMAGE_TOO_SMALL
        assert error.http_status == 400

    def test_image_corrupted_error(self):
        """ImageCorruptedError should have correct code."""
        error = ImageCorruptedError("Invalid JPEG header")

        assert error.code == FaceDetectionErrorCode.IMAGE_CORRUPTED
        assert error.http_status == 400


class TestOperationErrors:
    """Tests for operation-related errors."""

    def test_invalid_merge_operation_error(self):
        """InvalidMergeOperationError should have correct code."""
        error = InvalidMergeOperationError(
            "Cannot merge with itself",
            source_group_id=uuid.uuid4(),
            target_group_id=uuid.uuid4(),
        )

        assert error.code == FaceDetectionErrorCode.INVALID_MERGE_OPERATION
        assert error.http_status == 400

    def test_invalid_split_operation_error(self):
        """InvalidSplitOperationError should have correct code."""
        error = InvalidSplitOperationError("Group has only one face")

        assert error.code == FaceDetectionErrorCode.INVALID_SPLIT_OPERATION
        assert error.http_status == 400


class TestAuthorizationErrors:
    """Tests for authorization-related errors."""

    def test_workspace_access_denied_error(self):
        """WorkspaceAccessDeniedError should have correct code."""
        workspace_id = uuid.uuid4()
        user_id = uuid.uuid4()
        error = WorkspaceAccessDeniedError(workspace_id, user_id)

        assert error.code == FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED
        assert error.http_status == 403
        # User message should not expose workspace or user ID
        assert str(workspace_id) not in error.user_message
        assert str(user_id) not in error.user_message

    def test_cross_workspace_access_error(self):
        """CrossWorkspaceAccessError should have correct code."""
        error = CrossWorkspaceAccessError(uuid.uuid4(), uuid.uuid4())

        assert error.code == FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS
        assert error.http_status == 403


class TestConfigurationErrors:
    """Tests for configuration-related errors."""

    def test_provider_not_configured_error(self):
        """ProviderNotConfiguredError should have correct code."""
        error = ProviderNotConfiguredError("google-vision")

        assert error.code == FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED
        assert error.http_status == 503

    def test_invalid_configuration_error(self):
        """InvalidConfigurationError should have correct code."""
        error = InvalidConfigurationError("threshold", "must be between 0 and 1")

        assert error.code == FaceDetectionErrorCode.INVALID_CONFIGURATION
        assert error.http_status == 500


class TestEmbeddingErrors:
    """Tests for embedding-related errors."""

    def test_embedding_dimension_mismatch_error(self):
        """EmbeddingDimensionMismatchError should have correct code."""
        error = EmbeddingDimensionMismatchError(512, 128)

        assert error.code == FaceDetectionErrorCode.EMBEDDING_DIMENSION_MISMATCH
        assert error.http_status == 400

    def test_embedding_not_normalized_error(self):
        """EmbeddingNotNormalizedError should have correct code."""
        error = EmbeddingNotNormalizedError(1.5)

        assert error.code == FaceDetectionErrorCode.EMBEDDING_NOT_NORMALIZED
        assert error.http_status == 400


class TestFeatureToggleErrors:
    """Tests for feature toggle errors."""

    def test_detection_disabled_error(self):
        """DetectionDisabledError should have correct code."""
        workspace_id = uuid.uuid4()
        error = DetectionDisabledError(workspace_id)

        assert error.code == FaceDetectionErrorCode.DETECTION_DISABLED
        assert error.http_status == 403
        # User message should not expose workspace ID
        assert str(workspace_id) not in error.user_message


class TestResourceNotFoundErrors:
    """Tests for resource not found errors."""

    def test_photo_not_found_error(self):
        """PhotoNotFoundError should have correct code."""
        photo_id = uuid.uuid4()
        error = PhotoNotFoundError(photo_id)

        assert error.code == FaceDetectionErrorCode.PHOTO_NOT_FOUND
        assert error.http_status == 404
        # User message should not expose photo ID
        assert str(photo_id) not in error.user_message


# =============================================================================
# SEC-002 FIX VERIFICATION TESTS
# =============================================================================


class TestSEC002GenericErrorMessages:
    """Verify SEC-002 fix: Face IDs and group IDs not in error messages."""

    def test_face_not_found_user_message_is_generic(self):
        """FaceNotFoundError user message should be generic."""
        # Even with a specific face ID, user message should be generic
        face_id = "abc123-specific-id"
        error = FaceNotFoundError(face_id)

        # Technical message can have ID
        assert face_id in error.message
        # User-facing message must NOT have ID
        assert face_id not in error.user_message
        assert error.user_message == "This face could not be found. It may have been removed."

    def test_face_group_not_found_user_message_is_generic(self):
        """FaceGroupNotFoundError user message should be generic."""
        group_id = "xyz789-specific-id"
        error = FaceGroupNotFoundError(group_id)

        # Technical message can have ID
        assert group_id in error.message
        # User-facing message must NOT have ID
        assert group_id not in error.user_message
        assert error.user_message == "This face group no longer exists. It may have been deleted."

    def test_api_response_does_not_leak_ids(self):
        """API response should not contain IDs."""
        face_id = uuid.uuid4()
        error = FaceNotFoundError(face_id)

        response = error.to_api_response()
        response_str = str(response)

        assert str(face_id) not in response_str

    def test_exception_handler_does_not_leak_ids(self):
        """Exception handler response should not contain IDs."""
        import asyncio

        face_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # Create error with sensitive IDs in technical message
        error = FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message=f"Face {face_id} not found in workspace {workspace_id}",
            details={"face_id": str(face_id), "workspace_id": str(workspace_id)},
        )

        request = MagicMock()
        request.state = MagicMock()
        request.state.user_id = None
        request.state.workspace_id = None
        request.url.path = "/api/v1/faces/test"
        request.method = "GET"
        request.headers = {}

        response = asyncio.get_event_loop().run_until_complete(
            face_detection_exception_handler(request, error)
        )

        body = response.body.decode()

        # Response should NOT contain IDs
        assert str(face_id) not in body
        assert str(workspace_id) not in body
