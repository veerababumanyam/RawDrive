"""Integration tests for Face Rate Limiting.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: SEC-001 - Rate Limiting for Face Detection
Task: T032

Tests the face rate limiting integration including:
- Per-workspace rate limits for search, detect, and bulk operations
- Daily quota enforcement for face detection
- Retry-After header responses
- Audit logging of rate limit events
- Custom workspace limit overrides
"""

from __future__ import annotations

import pytest
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.api.dependencies.face_rate_limit import (
    FaceRateLimitError,
    check_face_search_rate_limit,
    check_face_detect_rate_limit,
    check_face_bulk_rate_limit,
    check_face_group_merge_rate_limit,
    increment_face_detection_count,
    _check_face_rate_limit,
)
from app.services.rate_limit_service import (
    RateLimitConfig,
    RateLimitResult,
    RateLimitService,
    RateLimitType,
    DEFAULT_LIMITS,
)
from app.repositories.face_rate_limit_repository import (
    FaceRateLimitConfigRepository,
)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def other_workspace_id() -> UUID:
    """Another workspace for isolation tests."""
    return uuid4()


@pytest.fixture
def mock_rate_limit_repo():
    """Mock FaceRateLimitConfigRepository."""
    repo = AsyncMock(spec=FaceRateLimitConfigRepository)
    # Default limits matching spec
    repo.get_effective_limits = AsyncMock(return_value={
        "face_search_rpm": 20,
        "face_detection_daily_quota": 1000,
        "bulk_operations_rpm": 30,
        "group_merge_rpm": 10,
    })
    repo.check_daily_quota = AsyncMock(return_value=(True, 0, 1000))
    repo.increment_daily_detections = AsyncMock(return_value=1)
    return repo


@pytest.fixture
def mock_rate_limit_service():
    """Mock RateLimitService that allows requests."""
    with patch("app.api.dependencies.face_rate_limit.RateLimitService") as MockService:
        service = AsyncMock(spec=RateLimitService)
        service.check_rate_limit = AsyncMock(return_value=RateLimitResult(
            allowed=True,
            limit=20,
            remaining=19,
            reset_at=int(time.time()) + 60,
            retry_after=None,
        ))
        MockService.return_value = service
        yield service


@pytest.fixture
def mock_rate_limit_service_blocked():
    """Mock RateLimitService that blocks requests."""
    with patch("app.api.dependencies.face_rate_limit.RateLimitService") as MockService:
        service = AsyncMock(spec=RateLimitService)
        service.check_rate_limit = AsyncMock(return_value=RateLimitResult(
            allowed=False,
            limit=20,
            remaining=0,
            reset_at=int(time.time()) + 60,
            retry_after=45,
        ))
        MockService.return_value = service
        yield service


@pytest.fixture
def mock_audit_service():
    """Mock audit service."""
    with patch("app.api.dependencies.face_rate_limit.get_audit_service") as mock:
        audit_svc = AsyncMock()
        mock.return_value = audit_svc
        yield audit_svc


# =============================================================================
# FACE SEARCH RATE LIMIT TESTS
# =============================================================================


class TestFaceSearchRateLimiting:
    """Tests for face search rate limiting (SEC-001)."""

    @pytest.mark.asyncio
    async def test_allows_request_within_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Requests within rate limit should be allowed."""
        # Should not raise
        await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_service.check_rate_limit.assert_called_once()

    @pytest.mark.asyncio
    async def test_blocks_request_exceeding_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Requests exceeding rate limit should be blocked with 429."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        assert exc_info.value.status_code == 429
        assert "rate limit exceeded" in str(exc_info.value.detail).lower()

    @pytest.mark.asyncio
    async def test_returns_retry_after_header(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Blocked requests should include Retry-After header."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        assert "Retry-After" in exc_info.value.headers
        assert int(exc_info.value.headers["Retry-After"]) > 0

    @pytest.mark.asyncio
    async def test_uses_workspace_specific_limits(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Should use workspace-specific limits from repository."""
        custom_limit = 50
        mock_rate_limit_repo.get_effective_limits = AsyncMock(return_value={
            "face_search_rpm": custom_limit,
            "face_detection_daily_quota": 2000,
            "bulk_operations_rpm": 60,
            "group_merge_rpm": 20,
        })

        await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_repo.get_effective_limits.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_logs_rate_limit_event_on_block(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Rate limit exceeded should be logged for audit."""
        with pytest.raises(FaceRateLimitError):
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_audit_service.log_event.assert_called_once()
        call_kwargs = mock_audit_service.log_event.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_id
        assert "operation" in call_kwargs["details"]


# =============================================================================
# FACE DETECTION RATE LIMIT TESTS
# =============================================================================


class TestFaceDetectionRateLimiting:
    """Tests for face detection rate limiting (daily quota + per-minute)."""

    @pytest.mark.asyncio
    async def test_allows_request_within_daily_quota(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Requests within daily quota should be allowed."""
        mock_rate_limit_repo.check_daily_quota = AsyncMock(return_value=(True, 500, 1000))

        await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_repo.check_daily_quota.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_blocks_request_exceeding_daily_quota(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_audit_service,
    ):
        """Requests exceeding daily quota should be blocked."""
        mock_rate_limit_repo.check_daily_quota = AsyncMock(return_value=(False, 1000, 1000))

        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail["is_daily_quota"] is True

    @pytest.mark.asyncio
    async def test_daily_quota_retry_after_24_hours(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_audit_service,
    ):
        """Daily quota exceeded should show 24-hour retry."""
        mock_rate_limit_repo.check_daily_quota = AsyncMock(return_value=(False, 1000, 1000))

        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        assert int(exc_info.value.headers["Retry-After"]) == 86400

    @pytest.mark.asyncio
    async def test_checks_both_quota_and_rate_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Detection should check both daily quota AND minute-level rate limit."""
        mock_rate_limit_repo.check_daily_quota = AsyncMock(return_value=(True, 500, 1000))

        await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        # Both checks should have been made
        mock_rate_limit_repo.check_daily_quota.assert_called_once()
        mock_rate_limit_service.check_rate_limit.assert_called_once()

    @pytest.mark.asyncio
    async def test_logs_quota_exhausted_event(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_audit_service,
    ):
        """Quota exhaustion should be logged for audit."""
        mock_rate_limit_repo.check_daily_quota = AsyncMock(return_value=(False, 1000, 1000))

        with pytest.raises(FaceRateLimitError):
            await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_audit_service.log_event.assert_called_once()
        call_kwargs = mock_audit_service.log_event.call_args.kwargs
        assert "current_count" in call_kwargs["details"]
        assert "quota_limit" in call_kwargs["details"]


# =============================================================================
# FACE BULK OPERATIONS RATE LIMIT TESTS
# =============================================================================


class TestFaceBulkOperationsRateLimiting:
    """Tests for bulk face operations rate limiting."""

    @pytest.mark.asyncio
    async def test_allows_bulk_operation_within_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Bulk operations within limit should be allowed."""
        await check_face_bulk_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_service.check_rate_limit.assert_called_once()

    @pytest.mark.asyncio
    async def test_blocks_bulk_operation_exceeding_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Bulk operations exceeding limit should be blocked."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_bulk_rate_limit(workspace_id, mock_rate_limit_repo)

        assert exc_info.value.status_code == 429
        assert "bulk operation" in exc_info.value.detail["message"]


# =============================================================================
# FACE GROUP MERGE RATE LIMIT TESTS
# =============================================================================


class TestFaceGroupMergeRateLimiting:
    """Tests for face group merge rate limiting."""

    @pytest.mark.asyncio
    async def test_allows_merge_within_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Group merges within limit should be allowed."""
        await check_face_group_merge_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_service.check_rate_limit.assert_called_once()

    @pytest.mark.asyncio
    async def test_blocks_merge_exceeding_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
    ):
        """Group merges exceeding limit should be blocked."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_group_merge_rate_limit(workspace_id, mock_rate_limit_repo)

        assert exc_info.value.status_code == 429
        assert "group merge" in exc_info.value.detail["message"]

    @pytest.mark.asyncio
    async def test_uses_separate_merge_identifier(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Merge operations should use separate tracking from bulk."""
        await check_face_group_merge_rate_limit(workspace_id, mock_rate_limit_repo)

        # Verify merge-specific identifier used
        call_args = mock_rate_limit_service.check_rate_limit.call_args
        identifier = call_args[0][0]
        assert ":merge" in identifier


# =============================================================================
# DETECTION COUNT INCREMENT TESTS
# =============================================================================


class TestDetectionCountIncrement:
    """Tests for daily detection count tracking."""

    @pytest.mark.asyncio
    async def test_increments_count_on_detection(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
    ):
        """Successful detection should increment counter."""
        mock_rate_limit_repo.increment_daily_detections = AsyncMock(return_value=5)

        new_count = await increment_face_detection_count(workspace_id, 3, mock_rate_limit_repo)

        mock_rate_limit_repo.increment_daily_detections.assert_called_once_with(
            workspace_id, 3
        )
        assert new_count == 5

    @pytest.mark.asyncio
    async def test_default_increment_is_one(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
    ):
        """Default increment count should be 1."""
        mock_rate_limit_repo.increment_daily_detections = AsyncMock(return_value=1)

        await increment_face_detection_count(workspace_id, rate_limit_repo=mock_rate_limit_repo)

        mock_rate_limit_repo.increment_daily_detections.assert_called_once_with(
            workspace_id, 1
        )


# =============================================================================
# WORKSPACE ISOLATION TESTS
# =============================================================================


class TestWorkspaceIsolation:
    """Tests ensuring rate limits are workspace-scoped."""

    @pytest.mark.asyncio
    async def test_different_workspaces_tracked_separately(
        self,
        workspace_id: UUID,
        other_workspace_id: UUID,
        mock_rate_limit_repo,
    ):
        """Different workspaces should have separate rate limit tracking."""
        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as MockService:
            service = AsyncMock()
            service.check_rate_limit = AsyncMock(return_value=RateLimitResult(
                allowed=True, limit=20, remaining=19, reset_at=int(time.time()) + 60
            ))
            MockService.return_value = service

            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)
            await check_face_search_rate_limit(other_workspace_id, mock_rate_limit_repo)

            # Should have been called with different identifiers
            calls = service.check_rate_limit.call_args_list
            assert len(calls) == 2
            assert calls[0][0][0] != calls[1][0][0]  # Different identifiers

    @pytest.mark.asyncio
    async def test_workspace_identifier_format(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Rate limit identifier should include workspace ID."""
        await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        call_args = mock_rate_limit_service.check_rate_limit.call_args
        identifier = call_args[0][0]
        assert f"workspace:{workspace_id}" == identifier


# =============================================================================
# ERROR RESPONSE FORMAT TESTS
# =============================================================================


class TestErrorResponseFormat:
    """Tests for rate limit error response format (SEC-001 compliance)."""

    @pytest.mark.asyncio
    async def test_error_response_structure(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Error response should match SEC-001 specification."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        detail = exc_info.value.detail
        assert "error" in detail
        assert "message" in detail
        assert "limit" in detail
        assert "retry_after" in detail
        assert "is_daily_quota" in detail

    @pytest.mark.asyncio
    async def test_error_code_is_face_rate_limit_exceeded(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Error code should be face_rate_limit_exceeded."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        assert exc_info.value.detail["error"] == "face_rate_limit_exceeded"

    @pytest.mark.asyncio
    async def test_message_is_user_friendly(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Error message should be user-friendly without exposing internals."""
        with pytest.raises(FaceRateLimitError) as exc_info:
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        message = exc_info.value.detail["message"]
        assert "rate limit exceeded" in message.lower()
        assert "Please try again later" in message
        # Should not expose internal details
        assert "redis" not in message.lower()
        assert "workspace_id" not in message.lower()


# =============================================================================
# DEFAULT RATE LIMIT CONFIGURATION TESTS
# =============================================================================


class TestDefaultRateLimitConfiguration:
    """Tests verifying default rate limits match SEC-001 specification."""

    def test_face_search_default_limit(self):
        """Face search should default to 20 requests per minute."""
        config = DEFAULT_LIMITS[RateLimitType.FACE_SEARCH]
        assert config.requests == 20
        assert config.window_seconds == 60

    def test_face_detect_default_limit(self):
        """Face detection should default to 1000 per day."""
        config = DEFAULT_LIMITS[RateLimitType.FACE_DETECT]
        assert config.requests == 1000
        assert config.window_seconds == 86400

    def test_face_bulk_default_limit(self):
        """Face bulk operations should default to 30 per minute."""
        config = DEFAULT_LIMITS[RateLimitType.FACE_BULK]
        assert config.requests == 30
        assert config.window_seconds == 60


# =============================================================================
# RATE LIMIT TYPE ENUM TESTS
# =============================================================================


class TestRateLimitTypeEnum:
    """Tests for face-specific rate limit types."""

    def test_face_search_type_exists(self):
        """FACE_SEARCH rate limit type should exist."""
        assert RateLimitType.FACE_SEARCH.value == "face_search"

    def test_face_detect_type_exists(self):
        """FACE_DETECT rate limit type should exist."""
        assert RateLimitType.FACE_DETECT.value == "face_detect"

    def test_face_bulk_type_exists(self):
        """FACE_BULK rate limit type should exist."""
        assert RateLimitType.FACE_BULK.value == "face_bulk"


# =============================================================================
# FACE RATE LIMIT ERROR CLASS TESTS
# =============================================================================


class TestFaceRateLimitError:
    """Tests for FaceRateLimitError exception class."""

    def test_creates_429_status_code(self):
        """Error should have 429 status code."""
        error = FaceRateLimitError(
            operation="search",
            limit=20,
            retry_after=60,
            is_daily_quota=False,
        )
        assert error.status_code == 429

    def test_includes_retry_after_header(self):
        """Error should include Retry-After header."""
        error = FaceRateLimitError(
            operation="search",
            limit=20,
            retry_after=45,
            is_daily_quota=False,
        )
        assert error.headers["Retry-After"] == "45"

    def test_includes_operation_in_message(self):
        """Error message should include operation type."""
        error = FaceRateLimitError(
            operation="detection",
            limit=1000,
            retry_after=86400,
            is_daily_quota=True,
        )
        assert "detection" in error.detail["message"]

    def test_indicates_daily_quota(self):
        """Error should indicate when it's a daily quota issue."""
        error = FaceRateLimitError(
            operation="detection",
            limit=1000,
            retry_after=86400,
            is_daily_quota=True,
        )
        assert error.detail["is_daily_quota"] is True

    def test_indicates_not_daily_quota(self):
        """Error should indicate when it's not a daily quota issue."""
        error = FaceRateLimitError(
            operation="search",
            limit=20,
            retry_after=60,
            is_daily_quota=False,
        )
        assert error.detail["is_daily_quota"] is False


# =============================================================================
# INTERNAL HELPER FUNCTION TESTS
# =============================================================================


class TestInternalCheckFaceRateLimit:
    """Tests for _check_face_rate_limit internal helper."""

    @pytest.mark.asyncio
    async def test_maps_face_search_to_config(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """FACE_SEARCH should use face_search_rpm config."""
        await _check_face_rate_limit(
            workspace_id=workspace_id,
            limit_type=RateLimitType.FACE_SEARCH,
            operation_name="search",
            rate_limit_repo=mock_rate_limit_repo,
        )

        mock_rate_limit_repo.get_effective_limits.assert_called_once()

    @pytest.mark.asyncio
    async def test_maps_face_detect_to_config(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """FACE_DETECT should use face_detection_daily_quota config."""
        await _check_face_rate_limit(
            workspace_id=workspace_id,
            limit_type=RateLimitType.FACE_DETECT,
            operation_name="detection",
            rate_limit_repo=mock_rate_limit_repo,
        )

        mock_rate_limit_repo.get_effective_limits.assert_called_once()

    @pytest.mark.asyncio
    async def test_maps_face_bulk_to_config(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """FACE_BULK should use bulk_operations_rpm config."""
        await _check_face_rate_limit(
            workspace_id=workspace_id,
            limit_type=RateLimitType.FACE_BULK,
            operation_name="bulk",
            rate_limit_repo=mock_rate_limit_repo,
        )

        mock_rate_limit_repo.get_effective_limits.assert_called_once()


# =============================================================================
# AUDIT LOGGING TESTS
# =============================================================================


class TestAuditLogging:
    """Tests for audit logging of rate limit events."""

    @pytest.mark.asyncio
    async def test_audit_includes_workspace_id(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Audit event should include workspace_id."""
        with pytest.raises(FaceRateLimitError):
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        call_kwargs = mock_audit_service.log_event.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_id

    @pytest.mark.asyncio
    async def test_audit_includes_limit_type(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Audit event should include limit_type."""
        with pytest.raises(FaceRateLimitError):
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        call_kwargs = mock_audit_service.log_event.call_args.kwargs
        assert "limit_type" in call_kwargs["details"]

    @pytest.mark.asyncio
    async def test_audit_continues_on_logging_failure(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service_blocked,
        mock_audit_service,
    ):
        """Rate limit should still be enforced if audit logging fails."""
        mock_audit_service.log_event = AsyncMock(side_effect=Exception("Audit error"))

        # Should still raise rate limit error even if audit fails
        with pytest.raises(FaceRateLimitError):
            await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)


# =============================================================================
# CUSTOM WORKSPACE LIMITS TESTS
# =============================================================================


class TestCustomWorkspaceLimits:
    """Tests for workspace-specific rate limit overrides."""

    @pytest.mark.asyncio
    async def test_uses_custom_search_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Should use custom workspace search limit."""
        mock_rate_limit_repo.get_effective_limits = AsyncMock(return_value={
            "face_search_rpm": 100,  # Higher than default
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        })

        await check_face_search_rate_limit(workspace_id, mock_rate_limit_repo)

        # Verify custom limit was used in config
        call_args = mock_rate_limit_service.check_rate_limit.call_args
        custom_config = call_args[0][2]
        assert custom_config.requests == 100

    @pytest.mark.asyncio
    async def test_uses_custom_detection_quota(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
    ):
        """Should use custom workspace detection quota."""
        custom_quota = 5000
        mock_rate_limit_repo.get_effective_limits = AsyncMock(return_value={
            "face_search_rpm": 20,
            "face_detection_daily_quota": custom_quota,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        })
        mock_rate_limit_repo.check_daily_quota = AsyncMock(
            return_value=(True, 2500, custom_quota)
        )

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as MockService:
            service = AsyncMock()
            service.check_rate_limit = AsyncMock(return_value=RateLimitResult(
                allowed=True, limit=1000, remaining=999, reset_at=int(time.time()) + 60
            ))
            MockService.return_value = service

            await check_face_detect_rate_limit(workspace_id, mock_rate_limit_repo)

        mock_rate_limit_repo.check_daily_quota.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_uses_custom_bulk_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Should use custom workspace bulk operation limit."""
        mock_rate_limit_repo.get_effective_limits = AsyncMock(return_value={
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 60,  # Higher than default
            "group_merge_rpm": 10,
        })

        await check_face_bulk_rate_limit(workspace_id, mock_rate_limit_repo)

        call_args = mock_rate_limit_service.check_rate_limit.call_args
        custom_config = call_args[0][2]
        assert custom_config.requests == 60

    @pytest.mark.asyncio
    async def test_uses_custom_merge_limit(
        self,
        workspace_id: UUID,
        mock_rate_limit_repo,
        mock_rate_limit_service,
    ):
        """Should use custom workspace merge limit."""
        mock_rate_limit_repo.get_effective_limits = AsyncMock(return_value={
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 25,  # Higher than default
        })

        await check_face_group_merge_rate_limit(workspace_id, mock_rate_limit_repo)

        call_args = mock_rate_limit_service.check_rate_limit.call_args
        custom_config = call_args[0][2]
        assert custom_config.requests == 25
