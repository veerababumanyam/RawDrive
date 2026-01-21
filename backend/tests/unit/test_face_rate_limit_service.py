"""Unit tests for Face Rate Limiting Service.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: SEC-001 - Rate Limiting for Face Detection
Task: T031

Tests per-workspace rate limiting for face operations including:
- Face search rate limits (20/min default)
- Face detection daily quota (1000/day default)
- Bulk operations rate limits (30/min default)
- Group merge rate limits (10/min default)
"""

import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from app.repositories.face_rate_limit_repository import (
    FaceRateLimitConfigRepository,
    get_face_rate_limit_repository,
    DEFAULT_FACE_SEARCH_RPM,
    DEFAULT_FACE_DETECT_DAILY_QUOTA,
    DEFAULT_BULK_OPERATIONS_RPM,
    DEFAULT_GROUP_MERGE_RPM,
)
from app.api.dependencies.face_rate_limit import (
    FaceRateLimitError,
    _check_face_rate_limit,
    check_face_search_rate_limit,
    check_face_detect_rate_limit,
    check_face_bulk_rate_limit,
    check_face_group_merge_rate_limit,
    increment_face_detection_count,
)
from app.models.workspace_biometric_settings import (
    FaceRateLimitConfig,
    FaceRateLimitConfigCreate,
    FaceRateLimitConfigUpdate,
    FaceRateLimitUsage,
)
from app.services.rate_limit_service import RateLimitType


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def mock_postgres_pool():
    """Mock PostgreSQL connection pool."""
    with patch("app.repositories.face_rate_limit_repository.get_postgres_pool") as mock:
        pool = AsyncMock()
        conn = AsyncMock()
        pool.acquire.return_value.__aenter__.return_value = conn
        mock.return_value = pool
        yield conn


@pytest.fixture
def repository() -> FaceRateLimitConfigRepository:
    """Fresh repository instance for testing."""
    return FaceRateLimitConfigRepository()


@pytest.fixture
def sample_rate_limit_row(workspace_id: UUID) -> dict:
    """Sample database row for rate limit config."""
    now = datetime.now(timezone.utc)
    return {
        "id": uuid4(),
        "workspace_id": workspace_id,
        "face_search_rpm": 20,
        "face_detection_daily_quota": 1000,
        "bulk_operations_rpm": 30,
        "group_merge_rpm": 10,
        "current_daily_detections": 50,
        "daily_quota_reset_at": now + timedelta(hours=12),
        "is_unlimited": False,
        "rate_limit_multiplier": Decimal("1.0"),
        "created_at": now,
        "updated_at": now,
    }


@pytest.fixture
def sample_unlimited_row(workspace_id: UUID) -> dict:
    """Sample database row for unlimited rate limit config."""
    now = datetime.now(timezone.utc)
    return {
        "id": uuid4(),
        "workspace_id": workspace_id,
        "face_search_rpm": 20,
        "face_detection_daily_quota": 1000,
        "bulk_operations_rpm": 30,
        "group_merge_rpm": 10,
        "current_daily_detections": 500,
        "daily_quota_reset_at": now + timedelta(hours=12),
        "is_unlimited": True,
        "rate_limit_multiplier": Decimal("1.0"),
        "created_at": now,
        "updated_at": now,
    }


# =============================================================================
# FACE RATE LIMIT ERROR TESTS
# =============================================================================


class TestFaceRateLimitError:
    """Tests for FaceRateLimitError exception."""

    def test_error_basic(self):
        """Test basic error creation."""
        error = FaceRateLimitError(
            operation="search",
            limit=20,
            retry_after=60,
            is_daily_quota=False,
        )

        assert error.status_code == 429
        assert error.detail["error"] == "face_rate_limit_exceeded"
        assert error.detail["limit"] == 20
        assert error.detail["retry_after"] == 60
        assert error.detail["is_daily_quota"] is False
        assert error.headers["Retry-After"] == "60"

    def test_error_daily_quota(self):
        """Test error for daily quota exceeded."""
        error = FaceRateLimitError(
            operation="detection",
            limit=1000,
            retry_after=86400,
            is_daily_quota=True,
        )

        assert error.detail["is_daily_quota"] is True
        assert error.detail["retry_after"] == 86400
        assert "detection" in error.detail["message"]


# =============================================================================
# REPOSITORY - GET OPERATIONS TESTS
# =============================================================================


class TestRepositoryGetOperations:
    """Tests for FaceRateLimitConfigRepository read operations."""

    @pytest.mark.asyncio
    async def test_get_by_workspace_exists(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_by_workspace returns existing config."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_by_workspace(workspace_id)

        assert result is not None
        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == 20
        assert result.face_detection_daily_quota == 1000

    @pytest.mark.asyncio
    async def test_get_by_workspace_not_exists(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_by_workspace returns None when not found."""
        mock_postgres_pool.fetchrow.return_value = None

        result = await repository.get_by_workspace(workspace_id)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_or_create_defaults_existing(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_or_create_defaults returns existing config."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_or_create_defaults(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == 20
        # Should only call fetchrow once (no create)
        assert mock_postgres_pool.fetchrow.call_count == 1

    @pytest.mark.asyncio
    async def test_get_or_create_defaults_creates(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_or_create_defaults creates new config with defaults."""
        now = datetime.now(timezone.utc)
        created_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_search_rpm": DEFAULT_FACE_SEARCH_RPM,
            "face_detection_daily_quota": DEFAULT_FACE_DETECT_DAILY_QUOTA,
            "bulk_operations_rpm": DEFAULT_BULK_OPERATIONS_RPM,
            "group_merge_rpm": DEFAULT_GROUP_MERGE_RPM,
            "current_daily_detections": 0,
            "daily_quota_reset_at": None,
            "is_unlimited": False,
            "rate_limit_multiplier": Decimal("1.0"),
            "created_at": now,
            "updated_at": now,
        }

        # First call returns None (not exists), second returns created
        mock_postgres_pool.fetchrow.side_effect = [None, created_row]

        result = await repository.get_or_create_defaults(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == DEFAULT_FACE_SEARCH_RPM
        assert result.face_detection_daily_quota == DEFAULT_FACE_DETECT_DAILY_QUOTA

    @pytest.mark.asyncio
    async def test_get_effective_limits_with_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_effective_limits with existing config."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == 20
        assert result["face_detection_daily_quota"] == 1000
        assert result["bulk_operations_rpm"] == 30
        assert result["group_merge_rpm"] == 10

    @pytest.mark.asyncio
    async def test_get_effective_limits_with_multiplier(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_effective_limits applies multiplier."""
        sample_rate_limit_row["rate_limit_multiplier"] = Decimal("2.0")
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == 40  # 20 * 2.0
        assert result["face_detection_daily_quota"] == 2000  # 1000 * 2.0
        assert result["bulk_operations_rpm"] == 60  # 30 * 2.0

    @pytest.mark.asyncio
    async def test_get_effective_limits_unlimited(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_unlimited_row: dict,
    ):
        """Test get_effective_limits returns high values for unlimited."""
        mock_postgres_pool.fetchrow.return_value = sample_unlimited_row

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == 10000
        assert result["face_detection_daily_quota"] == 1000000
        assert result["bulk_operations_rpm"] == 1000
        assert result["group_merge_rpm"] == 500

    @pytest.mark.asyncio
    async def test_get_effective_limits_defaults(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_effective_limits returns defaults when no config."""
        mock_postgres_pool.fetchrow.return_value = None

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == DEFAULT_FACE_SEARCH_RPM
        assert result["face_detection_daily_quota"] == DEFAULT_FACE_DETECT_DAILY_QUOTA
        assert result["bulk_operations_rpm"] == DEFAULT_BULK_OPERATIONS_RPM
        assert result["group_merge_rpm"] == DEFAULT_GROUP_MERGE_RPM


# =============================================================================
# REPOSITORY - CREATE OPERATIONS TESTS
# =============================================================================


class TestRepositoryCreateOperations:
    """Tests for FaceRateLimitConfigRepository create operations."""

    @pytest.mark.asyncio
    async def test_create_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test creating new rate limit config."""
        now = datetime.now(timezone.utc)
        created_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_search_rpm": 30,
            "face_detection_daily_quota": 2000,
            "bulk_operations_rpm": 50,
            "group_merge_rpm": 20,
            "current_daily_detections": 0,
            "daily_quota_reset_at": None,
            "is_unlimited": False,
            "rate_limit_multiplier": Decimal("1.5"),
            "created_at": now,
            "updated_at": now,
        }
        mock_postgres_pool.fetchrow.return_value = created_row

        config = FaceRateLimitConfigCreate(
            workspace_id=workspace_id,
            face_search_rpm=30,
            face_detection_daily_quota=2000,
            bulk_operations_rpm=50,
            group_merge_rpm=20,
            is_unlimited=False,
            rate_limit_multiplier=Decimal("1.5"),
        )

        result = await repository.create(config)

        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == 30
        assert result.face_detection_daily_quota == 2000
        assert result.rate_limit_multiplier == Decimal("1.5")


# =============================================================================
# REPOSITORY - UPDATE OPERATIONS TESTS
# =============================================================================


class TestRepositoryUpdateOperations:
    """Tests for FaceRateLimitConfigRepository update operations."""

    @pytest.mark.asyncio
    async def test_update_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test updating rate limit config."""
        updated_row = sample_rate_limit_row.copy()
        updated_row["face_search_rpm"] = 50
        mock_postgres_pool.fetchrow.return_value = updated_row

        update_data = FaceRateLimitConfigUpdate(face_search_rpm=50)

        result = await repository.update(workspace_id, update_data)

        assert result is not None
        assert result.face_search_rpm == 50

    @pytest.mark.asyncio
    async def test_update_config_not_found(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test update returns None when config not found."""
        mock_postgres_pool.fetchrow.return_value = None

        update_data = FaceRateLimitConfigUpdate(face_search_rpm=50)

        result = await repository.update(workspace_id, update_data)

        assert result is None

    @pytest.mark.asyncio
    async def test_update_no_changes(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test update with no changes returns current config."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        update_data = FaceRateLimitConfigUpdate()  # Empty update

        result = await repository.update(workspace_id, update_data)

        assert result is not None


# =============================================================================
# REPOSITORY - DAILY QUOTA TESTS
# =============================================================================


class TestRepositoryDailyQuota:
    """Tests for daily quota tracking operations."""

    @pytest.mark.asyncio
    async def test_increment_daily_detections(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test incrementing daily detection count."""
        mock_postgres_pool.fetchrow.return_value = {"current_daily_detections": 51}

        result = await repository.increment_daily_detections(workspace_id, count=1)

        assert result == 51

    @pytest.mark.asyncio
    async def test_increment_daily_detections_batch(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test incrementing daily detection count by batch."""
        mock_postgres_pool.fetchrow.return_value = {"current_daily_detections": 60}

        result = await repository.increment_daily_detections(workspace_id, count=10)

        assert result == 60

    @pytest.mark.asyncio
    async def test_check_daily_quota_within_limit(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test check_daily_quota when within limit."""
        sample_rate_limit_row["current_daily_detections"] = 500
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        assert within_quota is True
        assert current == 500
        assert limit == 1000

    @pytest.mark.asyncio
    async def test_check_daily_quota_exceeded(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test check_daily_quota when limit exceeded."""
        sample_rate_limit_row["current_daily_detections"] = 1001
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        assert within_quota is False
        assert current == 1001
        assert limit == 1000

    @pytest.mark.asyncio
    async def test_check_daily_quota_reset_passed(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test check_daily_quota resets when reset time passed."""
        # Set reset time in the past
        sample_rate_limit_row["daily_quota_reset_at"] = datetime.now(timezone.utc) - timedelta(hours=1)
        sample_rate_limit_row["current_daily_detections"] = 999
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        # Should treat as reset (count = 0)
        assert within_quota is True
        assert current == 0

    @pytest.mark.asyncio
    async def test_check_daily_quota_unlimited(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_unlimited_row: dict,
    ):
        """Test check_daily_quota for unlimited workspaces."""
        mock_postgres_pool.fetchrow.return_value = sample_unlimited_row

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        assert within_quota is True
        assert limit == 1000000

    @pytest.mark.asyncio
    async def test_check_daily_quota_no_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test check_daily_quota uses defaults when no config."""
        mock_postgres_pool.fetchrow.return_value = None

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        assert within_quota is True
        assert current == 0
        assert limit == DEFAULT_FACE_DETECT_DAILY_QUOTA

    @pytest.mark.asyncio
    async def test_reset_daily_detections(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test manual reset of daily detections."""
        mock_postgres_pool.execute.return_value = "UPDATE 1"

        result = await repository.reset_daily_detections(workspace_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_reset_daily_detections_not_found(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test reset returns False when config not found."""
        mock_postgres_pool.execute.return_value = "UPDATE 0"

        result = await repository.reset_daily_detections(workspace_id)

        assert result is False


# =============================================================================
# REPOSITORY - DELETE OPERATIONS TESTS
# =============================================================================


class TestRepositoryDeleteOperations:
    """Tests for FaceRateLimitConfigRepository delete operations."""

    @pytest.mark.asyncio
    async def test_delete_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test deleting rate limit config."""
        mock_postgres_pool.execute.return_value = "DELETE 1"

        result = await repository.delete(workspace_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_delete_config_not_found(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test delete returns False when config not found."""
        mock_postgres_pool.execute.return_value = "DELETE 0"

        result = await repository.delete(workspace_id)

        assert result is False


# =============================================================================
# REPOSITORY - USAGE STATISTICS TESTS
# =============================================================================


class TestRepositoryUsageStatistics:
    """Tests for usage statistics operations."""

    @pytest.mark.asyncio
    async def test_get_usage_with_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_usage returns current usage."""
        sample_rate_limit_row["current_daily_detections"] = 250
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_usage(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.current_daily_detections == 250
        assert result.face_detection_daily_quota == 1000
        assert result.daily_quota_remaining == 750

    @pytest.mark.asyncio
    async def test_get_usage_no_config(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_usage returns defaults when no config."""
        mock_postgres_pool.fetchrow.return_value = None

        result = await repository.get_usage(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.current_daily_detections == 0
        assert result.face_detection_daily_quota == DEFAULT_FACE_DETECT_DAILY_QUOTA
        assert result.daily_quota_remaining == DEFAULT_FACE_DETECT_DAILY_QUOTA

    @pytest.mark.asyncio
    async def test_get_summary(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_summary returns summary view."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_summary(workspace_id)

        assert result is not None
        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == 20
        assert result.is_unlimited is False

    @pytest.mark.asyncio
    async def test_get_summary_not_found(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_summary returns None when not found."""
        mock_postgres_pool.fetchrow.return_value = None

        result = await repository.get_summary(workspace_id)

        assert result is None


# =============================================================================
# DEPENDENCY TESTS - CHECK RATE LIMITS
# =============================================================================


class TestRateLimitDependencies:
    """Tests for FastAPI rate limit dependencies."""

    @pytest.mark.asyncio
    async def test_check_face_search_rate_limit_allowed(
        self,
        workspace_id: UUID,
    ):
        """Test face search rate limit passes when allowed."""
        mock_repo = AsyncMock()
        mock_repo.get_effective_limits.return_value = {
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        }

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.check_rate_limit.return_value = MagicMock(allowed=True, retry_after=None)
            mock_service_class.return_value = mock_service

            # Should not raise
            await check_face_search_rate_limit(workspace_id, mock_repo)

    @pytest.mark.asyncio
    async def test_check_face_search_rate_limit_exceeded(
        self,
        workspace_id: UUID,
    ):
        """Test face search rate limit raises when exceeded."""
        mock_repo = AsyncMock()
        mock_repo.get_effective_limits.return_value = {
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        }

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.check_rate_limit.return_value = MagicMock(allowed=False, retry_after=30)
            mock_service_class.return_value = mock_service

            with patch("app.api.dependencies.face_rate_limit.get_audit_service") as mock_audit:
                mock_audit_service = AsyncMock()
                mock_audit.return_value = mock_audit_service

                with pytest.raises(FaceRateLimitError) as exc:
                    await check_face_search_rate_limit(workspace_id, mock_repo)

                assert exc.value.status_code == 429
                assert exc.value.detail["operation"] == "search"

    @pytest.mark.asyncio
    async def test_check_face_detect_rate_limit_quota_exceeded(
        self,
        workspace_id: UUID,
    ):
        """Test face detection raises when daily quota exceeded."""
        mock_repo = AsyncMock()
        mock_repo.check_daily_quota.return_value = (False, 1001, 1000)

        with patch("app.api.dependencies.face_rate_limit.get_audit_service") as mock_audit:
            mock_audit_service = AsyncMock()
            mock_audit.return_value = mock_audit_service

            with pytest.raises(FaceRateLimitError) as exc:
                await check_face_detect_rate_limit(workspace_id, mock_repo)

            assert exc.value.detail["is_daily_quota"] is True
            assert exc.value.detail["retry_after"] == 86400

    @pytest.mark.asyncio
    async def test_check_face_bulk_rate_limit_allowed(
        self,
        workspace_id: UUID,
    ):
        """Test bulk operations rate limit passes when allowed."""
        mock_repo = AsyncMock()
        mock_repo.get_effective_limits.return_value = {
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        }

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.check_rate_limit.return_value = MagicMock(allowed=True, retry_after=None)
            mock_service_class.return_value = mock_service

            # Should not raise
            await check_face_bulk_rate_limit(workspace_id, mock_repo)

    @pytest.mark.asyncio
    async def test_check_face_group_merge_rate_limit_allowed(
        self,
        workspace_id: UUID,
    ):
        """Test group merge rate limit passes when allowed."""
        mock_repo = AsyncMock()
        mock_repo.get_effective_limits.return_value = {
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        }

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.check_rate_limit.return_value = MagicMock(allowed=True, retry_after=None)
            mock_service_class.return_value = mock_service

            # Should not raise
            await check_face_group_merge_rate_limit(workspace_id, mock_repo)

    @pytest.mark.asyncio
    async def test_check_face_group_merge_rate_limit_exceeded(
        self,
        workspace_id: UUID,
    ):
        """Test group merge rate limit raises when exceeded."""
        mock_repo = AsyncMock()
        mock_repo.get_effective_limits.return_value = {
            "face_search_rpm": 20,
            "face_detection_daily_quota": 1000,
            "bulk_operations_rpm": 30,
            "group_merge_rpm": 10,
        }

        with patch("app.api.dependencies.face_rate_limit.RateLimitService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.check_rate_limit.return_value = MagicMock(allowed=False, retry_after=45)
            mock_service_class.return_value = mock_service

            with pytest.raises(FaceRateLimitError) as exc:
                await check_face_group_merge_rate_limit(workspace_id, mock_repo)

            assert exc.value.detail["operation"] == "group merge"


# =============================================================================
# INCREMENT DETECTION COUNT TESTS
# =============================================================================


class TestIncrementDetectionCount:
    """Tests for increment_face_detection_count function."""

    @pytest.mark.asyncio
    async def test_increment_detection_count(
        self,
        workspace_id: UUID,
    ):
        """Test incrementing detection count."""
        mock_repo = AsyncMock()
        mock_repo.increment_daily_detections.return_value = 51

        result = await increment_face_detection_count(workspace_id, count=1, rate_limit_repo=mock_repo)

        assert result == 51
        mock_repo.increment_daily_detections.assert_called_once_with(workspace_id, 1)

    @pytest.mark.asyncio
    async def test_increment_detection_count_batch(
        self,
        workspace_id: UUID,
    ):
        """Test incrementing detection count by batch."""
        mock_repo = AsyncMock()
        mock_repo.increment_daily_detections.return_value = 60

        result = await increment_face_detection_count(workspace_id, count=10, rate_limit_repo=mock_repo)

        assert result == 60
        mock_repo.increment_daily_detections.assert_called_once_with(workspace_id, 10)


# =============================================================================
# SINGLETON TESTS
# =============================================================================


class TestSingleton:
    """Tests for repository singleton."""

    def test_get_face_rate_limit_repository_returns_singleton(self):
        """Test get_face_rate_limit_repository returns same instance."""
        # Clear singleton
        import app.repositories.face_rate_limit_repository as module
        module._repository = None

        repo1 = get_face_rate_limit_repository()
        repo2 = get_face_rate_limit_repository()

        assert repo1 is repo2


# =============================================================================
# EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_multiplier_at_maximum(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test rate limits with maximum multiplier (10.0)."""
        sample_rate_limit_row["rate_limit_multiplier"] = Decimal("10.0")
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == 200  # 20 * 10
        assert result["face_detection_daily_quota"] == 10000  # 1000 * 10

    @pytest.mark.asyncio
    async def test_multiplier_at_minimum(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test rate limits with minimum multiplier (0.1)."""
        sample_rate_limit_row["rate_limit_multiplier"] = Decimal("0.1")
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_effective_limits(workspace_id)

        assert result["face_search_rpm"] == 2  # 20 * 0.1
        assert result["face_detection_daily_quota"] == 100  # 1000 * 0.1

    @pytest.mark.asyncio
    async def test_quota_remaining_at_zero(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test usage when exactly at quota limit."""
        sample_rate_limit_row["current_daily_detections"] = 1000
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_usage(workspace_id)

        assert result.daily_quota_remaining == 0

    @pytest.mark.asyncio
    async def test_quota_negative_remaining_clamped(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test usage when over quota (remaining should be 0, not negative)."""
        sample_rate_limit_row["current_daily_detections"] = 1500
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await repository.get_usage(workspace_id)

        assert result.daily_quota_remaining == 0  # max(0, ...)

    @pytest.mark.asyncio
    async def test_check_daily_quota_with_multiplier(
        self,
        repository: FaceRateLimitConfigRepository,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test daily quota check applies multiplier."""
        sample_rate_limit_row["rate_limit_multiplier"] = Decimal("2.0")
        sample_rate_limit_row["current_daily_detections"] = 1500  # Over 1000 but under 2000
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        within_quota, current, limit = await repository.check_daily_quota(workspace_id)

        assert within_quota is True  # 1500 < 2000
        assert limit == 2000  # 1000 * 2.0
