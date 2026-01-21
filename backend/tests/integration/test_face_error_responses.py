"""Integration tests for generic face error responses.

Tests that face detection API endpoints return sanitized error messages
that do not leak sensitive information like face IDs, group IDs, or workspace IDs.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Task: T049 - Integration test for generic error responses
Finding: SEC-002 (Face ID in error messages)

Security Model:
- Error messages should be generic to prevent ID enumeration attacks
- Technical details are logged server-side but never exposed to clients
- Cross-workspace access returns same error as non-existent resource
- Correlation IDs are included for support troubleshooting
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1 import faces, face_groups
from app.models.user import User


# =============================================================================
# TEST FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id():
    """Sample workspace ID."""
    return uuid.uuid4()


@pytest.fixture
def other_workspace_id():
    """Another workspace ID for cross-workspace tests."""
    return uuid.uuid4()


@pytest.fixture
def user_id():
    """Sample user ID."""
    return uuid.uuid4()


@pytest.fixture
def face_id():
    """Sample face ID that doesn't exist."""
    return uuid.uuid4()


@pytest.fixture
def group_id():
    """Sample face group ID that doesn't exist."""
    return uuid.uuid4()


@pytest.fixture
def mock_user(workspace_id, user_id):
    """Create a mock authenticated user."""
    user = MagicMock(spec=User)
    user.user_id = user_id
    user.workspace_id = workspace_id
    user.email = "test@example.com"
    user.role = "admin"
    return user


@pytest.fixture
def app():
    """Create a FastAPI test app with face routes."""
    app = FastAPI()
    app.include_router(faces.router, prefix="/api/v1")
    app.include_router(face_groups.router, prefix="/api/v1")
    return app


@pytest.fixture
def mock_face_repo():
    """Mock face repository."""
    repo = AsyncMock()
    repo.find_by_id = AsyncMock(return_value=None)
    repo.find_by_workspace = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def mock_face_group_repo():
    """Mock face group repository."""
    repo = AsyncMock()
    repo.find_by_id = AsyncMock(return_value=None)
    repo.get_by_id = AsyncMock(side_effect=Exception("Not found"))
    return repo


# =============================================================================
# FACE NOT FOUND ERROR TESTS
# =============================================================================


class TestFaceNotFoundErrors:
    """Tests for face not found error message sanitization."""

    @pytest.mark.asyncio
    async def test_get_face_returns_generic_message(
        self, workspace_id, face_id, mock_user
    ):
        """GET /faces/{face_id} should return generic 'Face not found' message."""
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch("app.api.v1.faces.get_face_repository", return_value=mock_repo):
            with patch("app.api.v1.faces.get_current_user", return_value=mock_user):
                from app.api.v1.faces import get_face

                try:
                    await get_face(face_id, mock_user)
                except Exception as e:
                    # Should be HTTPException with generic message
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # CRITICAL: Error should NOT contain the face ID
                    assert str(face_id) not in error_detail
                    # Should be generic message
                    assert "Face not found" in error_detail or "not found" in error_detail.lower()

    @pytest.mark.asyncio
    async def test_assign_face_returns_generic_message_for_missing_face(
        self, workspace_id, face_id, mock_user
    ):
        """POST /faces/{face_id}/assign should return generic message when face not found."""
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch("app.api.v1.faces.get_face_repository", return_value=mock_repo):
            with patch("app.api.v1.faces.get_current_user", return_value=mock_user):
                from app.api.v1.faces import assign_face_to_group
                from app.api.v1.faces import FaceAssignRequest

                request = FaceAssignRequest(group_id=uuid.uuid4())

                try:
                    await assign_face_to_group(face_id, request, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # CRITICAL: Error should NOT contain the face ID
                    assert str(face_id) not in error_detail

    def test_face_not_found_error_class_uses_generic_message(self, face_id):
        """FaceNotFoundError should use generic user message."""
        from app.services.face_exceptions import FaceNotFoundError

        error = FaceNotFoundError(face_id)

        # Technical message can have ID (for logging)
        assert str(face_id) in error.message

        # User message MUST NOT have ID
        assert str(face_id) not in error.user_message
        assert error.user_message == "This face could not be found. It may have been removed."


# =============================================================================
# FACE GROUP NOT FOUND ERROR TESTS
# =============================================================================


class TestFaceGroupNotFoundErrors:
    """Tests for face group not found error message sanitization."""

    @pytest.mark.asyncio
    async def test_get_face_group_returns_generic_message(
        self, workspace_id, group_id, mock_user
    ):
        """GET /face-groups/{group_id} should return generic message."""
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch(
            "app.api.v1.face_groups.get_face_group_repository", return_value=mock_repo
        ):
            with patch(
                "app.api.v1.face_groups.get_current_user", return_value=mock_user
            ):
                from app.api.v1.face_groups import get_face_group

                try:
                    await get_face_group(group_id, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # CRITICAL: Error should NOT contain the group ID
                    assert str(group_id) not in error_detail
                    # Should be generic message
                    assert "Face group not found" in error_detail or "not found" in error_detail.lower()

    @pytest.mark.asyncio
    async def test_update_face_group_returns_generic_message(
        self, workspace_id, group_id, mock_user
    ):
        """PUT /face-groups/{group_id} should return generic message when not found."""
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch(
            "app.api.v1.face_groups.get_face_group_repository", return_value=mock_repo
        ):
            with patch(
                "app.api.v1.face_groups.get_current_user", return_value=mock_user
            ):
                from app.api.v1.face_groups import update_face_group
                from app.api.v1.face_groups import FaceGroupUpdateRequest

                request = FaceGroupUpdateRequest(name="New Name")

                try:
                    await update_face_group(group_id, request, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # CRITICAL: Error should NOT contain the group ID
                    assert str(group_id) not in error_detail

    @pytest.mark.asyncio
    async def test_delete_face_group_returns_generic_message(
        self, workspace_id, group_id, mock_user
    ):
        """DELETE /face-groups/{group_id} should return generic message when not found."""
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)
        mock_repo.delete = AsyncMock(return_value=False)

        with patch(
            "app.api.v1.face_groups.get_face_group_repository", return_value=mock_repo
        ):
            with patch(
                "app.api.v1.face_groups.get_current_user", return_value=mock_user
            ):
                from app.api.v1.face_groups import delete_face_group

                try:
                    await delete_face_group(group_id, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # CRITICAL: Error should NOT contain the group ID
                    assert str(group_id) not in error_detail

    def test_face_group_not_found_error_class_uses_generic_message(self, group_id):
        """FaceGroupNotFoundError should use generic user message."""
        from app.services.face_exceptions import FaceGroupNotFoundError

        error = FaceGroupNotFoundError(group_id)

        # Technical message can have ID (for logging)
        assert str(group_id) in error.message

        # User message MUST NOT have ID
        assert str(group_id) not in error.user_message
        assert error.user_message == "This face group no longer exists. It may have been deleted."


# =============================================================================
# CROSS-WORKSPACE ACCESS TESTS
# =============================================================================


class TestCrossWorkspaceErrorConsistency:
    """Tests that cross-workspace access returns same error as non-existent resources."""

    @pytest.mark.asyncio
    async def test_face_in_other_workspace_returns_same_error(
        self, workspace_id, other_workspace_id, face_id, mock_user
    ):
        """
        Accessing a face from another workspace should return the same
        generic error as a non-existent face (prevents enumeration).
        """
        # Mock: face exists but in different workspace (query returns None due to workspace filter)
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch("app.api.v1.faces.get_face_repository", return_value=mock_repo):
            with patch("app.api.v1.faces.get_current_user", return_value=mock_user):
                from app.api.v1.faces import get_face

                try:
                    await get_face(face_id, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # Same generic error - attacker cannot distinguish between:
                    # 1. Face doesn't exist at all
                    # 2. Face exists but in different workspace
                    assert "Face not found" in error_detail
                    assert str(face_id) not in error_detail
                    assert str(workspace_id) not in error_detail
                    assert str(other_workspace_id) not in error_detail

    @pytest.mark.asyncio
    async def test_face_group_in_other_workspace_returns_same_error(
        self, workspace_id, other_workspace_id, group_id, mock_user
    ):
        """
        Accessing a face group from another workspace should return the same
        generic error as a non-existent group (prevents enumeration).
        """
        mock_repo = AsyncMock()
        mock_repo.find_by_id = AsyncMock(return_value=None)

        with patch(
            "app.api.v1.face_groups.get_face_group_repository", return_value=mock_repo
        ):
            with patch(
                "app.api.v1.face_groups.get_current_user", return_value=mock_user
            ):
                from app.api.v1.face_groups import get_face_group

                try:
                    await get_face_group(group_id, mock_user)
                except Exception as e:
                    assert hasattr(e, "detail")
                    error_detail = str(e.detail)

                    # Same generic error regardless of actual reason
                    assert "Face group not found" in error_detail
                    assert str(group_id) not in error_detail
                    assert str(workspace_id) not in error_detail


# =============================================================================
# AUTHORIZATION ERROR TESTS
# =============================================================================


class TestAuthorizationErrors:
    """Tests for authorization error message sanitization."""

    def test_workspace_access_denied_uses_generic_message(self, workspace_id, user_id):
        """WorkspaceAccessDeniedError should use generic user message."""
        from app.services.face_exceptions import WorkspaceAccessDeniedError

        error = WorkspaceAccessDeniedError(workspace_id, user_id)

        # Technical message can have IDs
        assert str(workspace_id) in error.message

        # User message MUST NOT have IDs
        assert str(workspace_id) not in error.user_message
        assert str(user_id) not in error.user_message
        assert "permission" in error.user_message.lower() or "access" in error.user_message.lower()

    def test_cross_workspace_access_uses_generic_message(
        self, workspace_id, other_workspace_id
    ):
        """CrossWorkspaceAccessError should use generic user message."""
        from app.services.face_exceptions import CrossWorkspaceAccessError

        error = CrossWorkspaceAccessError(workspace_id, other_workspace_id)

        # Technical message can have IDs
        assert str(workspace_id) in error.message

        # User message MUST NOT have IDs
        assert str(workspace_id) not in error.user_message
        assert str(other_workspace_id) not in error.user_message

    def test_detection_disabled_uses_generic_message(self, workspace_id):
        """DetectionDisabledError should use generic user message."""
        from app.services.face_exceptions import DetectionDisabledError

        error = DetectionDisabledError(workspace_id)

        # Technical message can have workspace ID
        assert str(workspace_id) in error.message

        # User message MUST NOT have workspace ID
        assert str(workspace_id) not in error.user_message
        assert "disabled" in error.user_message.lower()


# =============================================================================
# PROVIDER ERROR TESTS
# =============================================================================


class TestProviderErrorSanitization:
    """Tests that provider errors don't leak internal details."""

    def test_provider_unavailable_hides_provider_name(self):
        """ProviderUnavailableError should hide provider name from user."""
        from app.services.face_exceptions import ProviderUnavailableError

        error = ProviderUnavailableError("google-cloud-vision", "API key invalid")

        # Technical message can have provider name
        assert "google-cloud-vision" in error.message

        # User message MUST NOT have provider name
        assert "google" not in error.user_message.lower()
        assert "cloud" not in error.user_message.lower()
        assert "API key" not in error.user_message

    def test_provider_rate_limited_hides_provider_name(self):
        """ProviderRateLimitedError should hide provider name from user."""
        from app.services.face_exceptions import ProviderRateLimitedError

        error = ProviderRateLimitedError("openai-embeddings", retry_after_seconds=60)

        # Technical message can have provider name
        assert "openai" in error.message.lower()

        # User message MUST NOT have provider name
        assert "openai" not in error.user_message.lower()

    def test_all_providers_failed_hides_provider_details(self):
        """AllProvidersFailedError should hide provider details from user."""
        from app.services.face_exceptions import AllProvidersFailedError

        error = AllProvidersFailedError([
            {"provider": "google-vision", "error": "quota exceeded"},
            {"provider": "azure-face", "error": "timeout"},
        ])

        # Technical message can have provider names
        assert "google-vision" in error.message or "google" in error.message.lower()

        # User message MUST NOT have provider names
        assert "google" not in error.user_message.lower()
        assert "azure" not in error.user_message.lower()
        assert "quota" not in error.user_message.lower()


# =============================================================================
# EMBEDDING ERROR TESTS
# =============================================================================


class TestEmbeddingErrorSanitization:
    """Tests that embedding errors don't leak technical details."""

    def test_embedding_dimension_mismatch_uses_generic_message(self):
        """EmbeddingDimensionMismatchError should use generic user message."""
        from app.services.face_exceptions import EmbeddingDimensionMismatchError

        error = EmbeddingDimensionMismatchError(expected_dim=512, actual_dim=128)

        # Technical message can have dimensions
        assert "512" in error.message
        assert "128" in error.message

        # User message should be user-friendly
        assert "dimension" not in error.user_message.lower() or "reprocess" in error.user_message.lower()

    def test_embedding_not_normalized_uses_generic_message(self):
        """EmbeddingNotNormalizedError should use generic user message."""
        from app.services.face_exceptions import EmbeddingNotNormalizedError

        error = EmbeddingNotNormalizedError(l2_norm=1.5)

        # Technical message can have L2 norm
        assert "1.5" in error.message

        # User message should not have technical details
        assert "l2" not in error.user_message.lower()
        assert "norm" not in error.user_message.lower() or "reprocess" in error.user_message.lower()


# =============================================================================
# ERROR RESPONSE STRUCTURE TESTS
# =============================================================================


class TestErrorResponseStructure:
    """Tests for error response structure consistency."""

    def test_face_detection_error_to_api_response_structure(self, face_id):
        """FaceDetectionError.to_api_response() should have correct structure."""
        from app.services.face_exceptions import FaceNotFoundError

        error = FaceNotFoundError(face_id)
        response = error.to_api_response()

        # Required fields
        assert "success" in response
        assert response["success"] is False
        assert "error" in response
        assert "code" in response["error"]
        assert "message" in response["error"]

        # Code should be the enum value
        assert response["error"]["code"] == "FACE_NOT_FOUND"

        # Message should be user-friendly
        assert str(face_id) not in response["error"]["message"]

    def test_error_response_includes_correlation_id_when_provided(self, face_id):
        """Error response should include correlation_id when provided."""
        from app.services.face_exceptions import FaceNotFoundError

        correlation_id = str(uuid.uuid4())
        error = FaceNotFoundError(face_id)
        error.correlation_id = correlation_id

        response = error.to_api_response()

        assert "correlation_id" in response["error"]
        assert response["error"]["correlation_id"] == correlation_id


# =============================================================================
# HTTP STATUS CODE TESTS
# =============================================================================


class TestHttpStatusCodes:
    """Tests for correct HTTP status codes on errors."""

    def test_face_not_found_returns_404(self, face_id):
        """FaceNotFoundError should return 404."""
        from app.services.face_exceptions import FaceNotFoundError

        error = FaceNotFoundError(face_id)
        assert error.http_status == 404

    def test_face_group_not_found_returns_404(self, group_id):
        """FaceGroupNotFoundError should return 404."""
        from app.services.face_exceptions import FaceGroupNotFoundError

        error = FaceGroupNotFoundError(group_id)
        assert error.http_status == 404

    def test_workspace_access_denied_returns_403(self, workspace_id):
        """WorkspaceAccessDeniedError should return 403."""
        from app.services.face_exceptions import WorkspaceAccessDeniedError

        error = WorkspaceAccessDeniedError(workspace_id)
        assert error.http_status == 403

    def test_provider_rate_limited_returns_429(self):
        """ProviderRateLimitedError should return 429."""
        from app.services.face_exceptions import ProviderRateLimitedError

        error = ProviderRateLimitedError("test-provider")
        assert error.http_status == 429

    def test_provider_unavailable_returns_503(self):
        """ProviderUnavailableError should return 503."""
        from app.services.face_exceptions import ProviderUnavailableError

        error = ProviderUnavailableError("test-provider")
        assert error.http_status == 503


# =============================================================================
# SEC-002 COMPLIANCE VERIFICATION
# =============================================================================


class TestSEC002Compliance:
    """
    Comprehensive tests verifying SEC-002 fix is properly implemented.

    SEC-002: Face ID in error messages
    - Risk: Information disclosure, ID enumeration attacks
    - Fix: Generic error messages that don't reveal resource IDs
    """

    @pytest.mark.parametrize(
        "error_class,args",
        [
            ("FaceNotFoundError", (uuid.uuid4(),)),
            ("FaceGroupNotFoundError", (uuid.uuid4(),)),
            ("WorkspaceAccessDeniedError", (uuid.uuid4(),)),
            ("CrossWorkspaceAccessError", (uuid.uuid4(), uuid.uuid4())),
            ("DetectionDisabledError", (uuid.uuid4(),)),
            ("PhotoNotFoundError", (uuid.uuid4(),)),
        ],
    )
    def test_no_uuid_in_user_message(self, error_class, args):
        """User messages should never contain UUIDs."""
        import app.services.face_exceptions as exc_module

        error_cls = getattr(exc_module, error_class)
        error = error_cls(*args)

        # Check no UUID appears in user message
        for arg in args:
            if isinstance(arg, uuid.UUID):
                assert str(arg) not in error.user_message, (
                    f"{error_class} user_message contains UUID: {error.user_message}"
                )

    @pytest.mark.parametrize(
        "error_class,args",
        [
            ("FaceNotFoundError", (uuid.uuid4(),)),
            ("FaceGroupNotFoundError", (uuid.uuid4(),)),
        ],
    )
    def test_no_uuid_in_api_response(self, error_class, args):
        """API responses should never contain resource UUIDs in error messages."""
        import app.services.face_exceptions as exc_module

        error_cls = getattr(exc_module, error_class)
        error = error_cls(*args)
        response = error.to_api_response()

        # Check no UUID appears in response message
        response_str = str(response)
        for arg in args:
            if isinstance(arg, uuid.UUID):
                # UUID might appear as correlation_id, which is OK
                # But it should NOT appear as the resource ID
                error_message = response["error"]["message"]
                assert str(arg) not in error_message, (
                    f"{error_class} API response message contains UUID: {error_message}"
                )
