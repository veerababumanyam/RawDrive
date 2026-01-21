"""Unit tests for BiometricConsentService.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-001 - Biometric Consent Management
Task: T014

Tests GDPR Article 9 compliant consent management for biometric data processing.
"""

import pytest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from app.services.biometric_consent_service import (
    BiometricConsentService,
    BiometricConsentError,
    ConsentNotGrantedError,
    ConsentAlreadyGrantedError,
    ConsentNotActiveError,
    get_biometric_consent_service,
    require_biometric_consent,
    require_public_face_search_enabled,
    CONSENT_CACHE_TTL,
    CONSENT_CACHE_PREFIX,
)
from app.models.workspace_biometric_settings import (
    BiometricConsentStatus,
    BiometricConsentGrant,
    BiometricConsentWithdraw,
    WorkspaceBiometricSettings,
    WorkspaceBiometricSettingsUpdate,
)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def mock_postgres_pool():
    """Mock PostgreSQL connection pool."""
    with patch("app.services.biometric_consent_service.get_postgres_pool") as mock:
        pool = AsyncMock()
        conn = AsyncMock()
        pool.acquire.return_value.__aenter__.return_value = conn
        mock.return_value = pool
        yield conn


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    with patch("app.services.biometric_consent_service.get_redis_client") as mock:
        redis = AsyncMock()
        mock.return_value = redis
        yield redis


@pytest.fixture
def service() -> BiometricConsentService:
    """Fresh service instance for testing."""
    return BiometricConsentService()


@pytest.fixture
def sample_db_row(workspace_id: UUID) -> dict:
    """Sample database row for biometric settings."""
    now = datetime.now(timezone.utc)
    return {
        "id": uuid4(),
        "workspace_id": workspace_id,
        "face_detection_enabled": True,
        "consent_status": "granted",
        "consented_by": uuid4(),
        "consented_at": now,
        "consent_ip_address": "192.168.1.1",
        "consent_user_agent": "Mozilla/5.0",
        "consent_policy_version": "1.0",
        "withdrawn_by": None,
        "withdrawn_at": None,
        "withdrawal_ip_address": None,
        "withdrawal_reason": None,
        "public_face_search_enabled": False,
        "auto_clustering_enabled": True,
        "ai_processing_consent": False,
        "created_at": now,
        "updated_at": now,
    }


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
        "daily_quota_reset_at": now,
        "is_unlimited": False,
        "rate_limit_multiplier": Decimal("1.0"),
        "created_at": now,
        "updated_at": now,
    }


# =============================================================================
# EXCEPTION TESTS
# =============================================================================


class TestBiometricConsentExceptions:
    """Tests for custom exception classes."""

    def test_biometric_consent_error(self):
        """Test base BiometricConsentError."""
        error = BiometricConsentError(
            message="Test error",
            code="TEST_ERROR",
            status=400,
        )

        assert str(error) == "Test error"
        assert error.code == "TEST_ERROR"
        assert error.status == 400

    def test_biometric_consent_error_defaults(self):
        """Test BiometricConsentError default values."""
        error = BiometricConsentError(message="Test")

        assert error.code == "BIOMETRIC_CONSENT_ERROR"
        assert error.status == 400

    def test_consent_not_granted_error(self, workspace_id: UUID):
        """Test ConsentNotGrantedError."""
        error = ConsentNotGrantedError(workspace_id)

        assert "not granted" in str(error).lower()
        assert error.code == "CONSENT_NOT_GRANTED"
        assert error.status == 403
        assert error.workspace_id == workspace_id

    def test_consent_already_granted_error(self, workspace_id: UUID):
        """Test ConsentAlreadyGrantedError."""
        error = ConsentAlreadyGrantedError(workspace_id)

        assert "already granted" in str(error).lower()
        assert error.code == "CONSENT_ALREADY_GRANTED"
        assert error.status == 409
        assert error.workspace_id == workspace_id

    def test_consent_not_active_error(self, workspace_id: UUID):
        """Test ConsentNotActiveError."""
        error = ConsentNotActiveError(workspace_id)

        assert "not active" in str(error).lower() or "no active consent" in str(error).lower()
        assert error.code == "CONSENT_NOT_ACTIVE"
        assert error.status == 400
        assert error.workspace_id == workspace_id


# =============================================================================
# GET_SETTINGS TESTS
# =============================================================================


class TestGetSettings:
    """Tests for get_settings method."""

    @pytest.mark.asyncio
    async def test_get_settings_existing(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test get_settings returns existing settings."""
        mock_postgres_pool.fetchrow.return_value = sample_db_row

        result = await service.get_settings(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.face_detection_enabled is True
        assert result.consent_status == BiometricConsentStatus.GRANTED
        mock_postgres_pool.fetchrow.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_settings_creates_default_when_not_found(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_settings creates default settings when none exist."""
        now = datetime.now(timezone.utc)
        default_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": "not_granted",
            "consented_by": None,
            "consented_at": None,
            "consent_ip_address": None,
            "consent_user_agent": None,
            "consent_policy_version": None,
            "withdrawn_by": None,
            "withdrawn_at": None,
            "withdrawal_ip_address": None,
            "withdrawal_reason": None,
            "public_face_search_enabled": False,
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

        # First fetchrow returns None, second returns the created default
        mock_postgres_pool.fetchrow.side_effect = [None, default_row]

        result = await service.get_settings(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.face_detection_enabled is False
        assert result.consent_status == BiometricConsentStatus.NOT_GRANTED
        # Called twice: once for SELECT, once for INSERT
        assert mock_postgres_pool.fetchrow.call_count == 2


# =============================================================================
# GET_SETTINGS_SUMMARY TESTS
# =============================================================================


class TestGetSettingsSummary:
    """Tests for get_settings_summary method."""

    @pytest.mark.asyncio
    async def test_get_settings_summary_from_cache(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_settings_summary returns cached data when available."""
        cached_data = {
            "face_detection_enabled": "true",
            "consent_status": "granted",
            "public_face_search_enabled": "false",
            "auto_clustering_enabled": "true",
            "consented_at": "2024-01-01T00:00:00+00:00",
        }
        mock_redis.hgetall.return_value = cached_data

        result = await service.get_settings_summary(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.consent_status == BiometricConsentStatus.GRANTED
        mock_redis.hgetall.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_settings_summary_from_db_when_not_cached(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test get_settings_summary fetches from DB when not cached."""
        # No cache
        mock_redis.hgetall.return_value = {}
        mock_postgres_pool.fetchrow.return_value = sample_db_row

        result = await service.get_settings_summary(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.consent_status == BiometricConsentStatus.GRANTED
        # Should cache the result
        mock_redis.hset.assert_called_once()
        mock_redis.expire.assert_called_once()


# =============================================================================
# IS_FACE_DETECTION_ALLOWED TESTS
# =============================================================================


class TestIsFaceDetectionAllowed:
    """Tests for is_face_detection_allowed method."""

    @pytest.mark.asyncio
    async def test_allowed_when_granted_and_enabled(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test returns True when consent granted AND detection enabled."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "true",
            "consent_status": "granted",
        }

        result = await service.is_face_detection_allowed(workspace_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_not_allowed_when_not_granted(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test returns False when consent not granted."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "true",
            "consent_status": "not_granted",
        }

        result = await service.is_face_detection_allowed(workspace_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_not_allowed_when_disabled(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test returns False when detection disabled even if granted."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "false",
            "consent_status": "granted",
        }

        result = await service.is_face_detection_allowed(workspace_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_not_allowed_when_withdrawn(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test returns False when consent withdrawn."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "true",
            "consent_status": "withdrawn",
        }

        result = await service.is_face_detection_allowed(workspace_id)

        assert result is False


# =============================================================================
# CHECK_CONSENT_OR_RAISE TESTS
# =============================================================================


class TestCheckConsentOrRaise:
    """Tests for check_consent_or_raise method."""

    @pytest.mark.asyncio
    async def test_passes_when_allowed(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test does not raise when consent granted and enabled."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "true",
            "consent_status": "granted",
        }

        # Should not raise
        await service.check_consent_or_raise(workspace_id)

    @pytest.mark.asyncio
    async def test_raises_when_not_allowed(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test raises ConsentNotGrantedError when not allowed."""
        mock_redis.hgetall.return_value = {
            "face_detection_enabled": "false",
            "consent_status": "not_granted",
        }

        with pytest.raises(ConsentNotGrantedError) as exc:
            await service.check_consent_or_raise(workspace_id)

        assert exc.value.workspace_id == workspace_id


# =============================================================================
# GRANT_CONSENT TESTS
# =============================================================================


class TestGrantConsent:
    """Tests for grant_consent method."""

    @pytest.mark.asyncio
    async def test_grant_consent_success(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_db_row: dict,
    ):
        """Test successful consent grant."""
        # No existing consent
        mock_postgres_pool.fetchrow.side_effect = [
            None,  # Check for existing
            sample_db_row,  # Insert result
        ]
        mock_postgres_pool.execute.return_value = None

        grant_data = BiometricConsentGrant(
            policy_version="1.0",
            ip_address="192.168.1.1",
            user_agent="Test Agent",
        )

        result = await service.grant_consent(workspace_id, user_id, grant_data)

        assert result.consent_status == BiometricConsentStatus.GRANTED
        assert result.face_detection_enabled is True
        # Cache should be invalidated
        mock_redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_grant_consent_already_granted(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test raises ConsentAlreadyGrantedError when already granted."""
        # Existing granted consent
        mock_postgres_pool.fetchrow.return_value = {
            "consent_status": "granted",
        }

        grant_data = BiometricConsentGrant(
            policy_version="1.0",
        )

        with pytest.raises(ConsentAlreadyGrantedError) as exc:
            await service.grant_consent(workspace_id, user_id, grant_data)

        assert exc.value.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_grant_consent_creates_rate_limit_config(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_db_row: dict,
    ):
        """Test grant_consent creates rate limit config."""
        mock_postgres_pool.fetchrow.side_effect = [
            None,  # Check for existing
            sample_db_row,  # Insert result
        ]
        mock_postgres_pool.execute.return_value = None

        grant_data = BiometricConsentGrant(policy_version="1.0")

        await service.grant_consent(workspace_id, user_id, grant_data)

        # Should call execute to create rate limit config
        assert mock_postgres_pool.execute.called


# =============================================================================
# WITHDRAW_CONSENT TESTS
# =============================================================================


class TestWithdrawConsent:
    """Tests for withdraw_consent method."""

    @pytest.mark.asyncio
    async def test_withdraw_consent_success(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test successful consent withdrawal."""
        now = datetime.now(timezone.utc)
        withdrawn_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": "withdrawn",
            "consented_by": None,
            "consented_at": None,
            "consent_ip_address": None,
            "consent_user_agent": None,
            "consent_policy_version": None,
            "withdrawn_by": user_id,
            "withdrawn_at": now,
            "withdrawal_ip_address": "192.168.1.1",
            "withdrawal_reason": "Test reason",
            "public_face_search_enabled": False,
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

        mock_postgres_pool.fetchrow.side_effect = [
            {"consent_status": "granted"},  # Check for existing
            withdrawn_row,  # Update result
        ]

        withdraw_data = BiometricConsentWithdraw(
            reason="Test reason",
            ip_address="192.168.1.1",
        )

        result = await service.withdraw_consent(
            workspace_id, user_id, withdraw_data, cascade_delete=False
        )

        assert result.consent_status == BiometricConsentStatus.WITHDRAWN
        assert result.face_detection_enabled is False
        # Cache should be invalidated
        mock_redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_withdraw_consent_cascade_delete(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test consent withdrawal with cascade delete creates job."""
        now = datetime.now(timezone.utc)
        pending_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": "pending_deletion",
            "consented_by": None,
            "consented_at": None,
            "consent_ip_address": None,
            "consent_user_agent": None,
            "consent_policy_version": None,
            "withdrawn_by": user_id,
            "withdrawn_at": now,
            "withdrawal_ip_address": None,
            "withdrawal_reason": None,
            "public_face_search_enabled": False,
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

        mock_postgres_pool.fetchrow.side_effect = [
            {"consent_status": "granted"},  # Check for existing
            pending_row,  # Update result
            {"id": uuid4()},  # Job creation result
        ]

        withdraw_data = BiometricConsentWithdraw()

        result = await service.withdraw_consent(
            workspace_id, user_id, withdraw_data, cascade_delete=True
        )

        assert result.consent_status == BiometricConsentStatus.PENDING_DELETION
        # Should create a deletion job
        assert mock_postgres_pool.fetchrow.call_count == 3

    @pytest.mark.asyncio
    async def test_withdraw_consent_not_active(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test raises ConsentNotActiveError when no active consent."""
        mock_postgres_pool.fetchrow.return_value = {
            "consent_status": "not_granted",
        }

        withdraw_data = BiometricConsentWithdraw()

        with pytest.raises(ConsentNotActiveError) as exc:
            await service.withdraw_consent(workspace_id, user_id, withdraw_data)

        assert exc.value.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_withdraw_consent_no_record(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test raises ConsentNotActiveError when no record exists."""
        mock_postgres_pool.fetchrow.return_value = None

        withdraw_data = BiometricConsentWithdraw()

        with pytest.raises(ConsentNotActiveError):
            await service.withdraw_consent(workspace_id, user_id, withdraw_data)


# =============================================================================
# UPDATE_FEATURE_TOGGLES TESTS
# =============================================================================


class TestUpdateFeatureToggles:
    """Tests for update_feature_toggles method."""

    @pytest.mark.asyncio
    async def test_update_single_toggle(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test updating a single feature toggle."""
        updated_row = sample_db_row.copy()
        updated_row["public_face_search_enabled"] = True
        mock_postgres_pool.fetchrow.return_value = updated_row

        result = await service.update_feature_toggles(
            workspace_id, public_face_search_enabled=True
        )

        assert result.public_face_search_enabled is True
        mock_redis.delete.assert_called_once()  # Cache invalidated

    @pytest.mark.asyncio
    async def test_update_multiple_toggles(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test updating multiple feature toggles."""
        updated_row = sample_db_row.copy()
        updated_row["public_face_search_enabled"] = True
        updated_row["auto_clustering_enabled"] = False
        updated_row["ai_processing_consent"] = True
        mock_postgres_pool.fetchrow.return_value = updated_row

        result = await service.update_feature_toggles(
            workspace_id,
            public_face_search_enabled=True,
            auto_clustering_enabled=False,
            ai_processing_consent=True,
        )

        assert result.public_face_search_enabled is True
        assert result.auto_clustering_enabled is False
        assert result.ai_processing_consent is True

    @pytest.mark.asyncio
    async def test_update_no_changes(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test update with no changes returns current settings."""
        mock_redis.hgetall.return_value = {}  # No cache
        mock_postgres_pool.fetchrow.return_value = sample_db_row

        result = await service.update_feature_toggles(workspace_id)

        # Should return current settings without update
        assert result.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_update_creates_default_if_not_exists(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test update creates default settings if they don't exist."""
        now = datetime.now(timezone.utc)
        default_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": "not_granted",
            "consented_by": None,
            "consented_at": None,
            "consent_ip_address": None,
            "consent_user_agent": None,
            "consent_policy_version": None,
            "withdrawn_by": None,
            "withdrawn_at": None,
            "withdrawal_ip_address": None,
            "withdrawal_reason": None,
            "public_face_search_enabled": True,  # Updated value
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

        # First update returns None (no record), then creates default, then retry update
        mock_postgres_pool.fetchrow.side_effect = [
            None,  # First update
            default_row,  # Create default
            default_row,  # Retry update
        ]

        result = await service.update_feature_toggles(
            workspace_id, public_face_search_enabled=True
        )

        assert result.public_face_search_enabled is True


# =============================================================================
# UPDATE_SETTINGS TESTS
# =============================================================================


class TestUpdateSettings:
    """Tests for update_settings method."""

    @pytest.mark.asyncio
    async def test_update_settings_wrapper(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test update_settings uses update_feature_toggles."""
        updated_row = sample_db_row.copy()
        updated_row["public_face_search_enabled"] = True
        mock_postgres_pool.fetchrow.return_value = updated_row

        update_data = WorkspaceBiometricSettingsUpdate(
            public_face_search_enabled=True,
        )

        result = await service.update_settings(workspace_id, update_data)

        assert result.public_face_search_enabled is True


# =============================================================================
# GET_RATE_LIMIT_CONFIG TESTS
# =============================================================================


class TestGetRateLimitConfig:
    """Tests for get_rate_limit_config method."""

    @pytest.mark.asyncio
    async def test_get_rate_limit_config_exists(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_rate_limit_row: dict,
    ):
        """Test get_rate_limit_config returns existing config."""
        mock_postgres_pool.fetchrow.return_value = sample_rate_limit_row

        result = await service.get_rate_limit_config(workspace_id)

        assert result is not None
        assert result.workspace_id == workspace_id
        assert result.face_search_rpm == 20
        assert result.face_detection_daily_quota == 1000

    @pytest.mark.asyncio
    async def test_get_rate_limit_config_not_exists(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
    ):
        """Test get_rate_limit_config returns None when not configured."""
        mock_postgres_pool.fetchrow.return_value = None

        result = await service.get_rate_limit_config(workspace_id)

        assert result is None


# =============================================================================
# CACHE TESTS
# =============================================================================


class TestCacheBehavior:
    """Tests for cache management methods."""

    @pytest.mark.asyncio
    async def test_cache_key_format(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test correct cache key format is used."""
        mock_redis.hgetall.return_value = {}

        await service._get_cached_consent(workspace_id)

        expected_key = f"{CONSENT_CACHE_PREFIX}:{workspace_id}"
        mock_redis.hgetall.assert_called_with(expected_key)

    @pytest.mark.asyncio
    async def test_cache_ttl(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test cache uses correct TTL."""
        mock_redis.hgetall.return_value = {}
        mock_postgres_pool.fetchrow.return_value = sample_db_row

        await service.get_settings_summary(workspace_id)

        mock_redis.expire.assert_called_once()
        call_args = mock_redis.expire.call_args
        assert call_args[0][1] == CONSENT_CACHE_TTL

    @pytest.mark.asyncio
    async def test_cache_handles_errors_gracefully(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        sample_db_row: dict,
    ):
        """Test cache errors don't break the service."""
        mock_redis.hgetall.side_effect = Exception("Redis connection error")
        mock_postgres_pool.fetchrow.return_value = sample_db_row

        # Should not raise, should fallback to DB
        result = await service.get_settings(workspace_id)

        assert result.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_cache_invalidation_on_grant(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        mock_postgres_pool: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_db_row: dict,
    ):
        """Test cache is invalidated when consent is granted."""
        mock_postgres_pool.fetchrow.side_effect = [None, sample_db_row]
        mock_postgres_pool.execute.return_value = None

        grant_data = BiometricConsentGrant(policy_version="1.0")

        await service.grant_consent(workspace_id, user_id, grant_data)

        expected_key = f"{CONSENT_CACHE_PREFIX}:{workspace_id}"
        mock_redis.delete.assert_called_with(expected_key)


# =============================================================================
# FASTAPI DEPENDENCY TESTS
# =============================================================================


class TestFastAPIDependencies:
    """Tests for FastAPI dependency functions."""

    @pytest.mark.asyncio
    async def test_require_biometric_consent_passes(
        self,
        workspace_id: UUID,
    ):
        """Test require_biometric_consent passes when allowed."""
        mock_service = AsyncMock()
        mock_service.check_consent_or_raise = AsyncMock()

        await require_biometric_consent(workspace_id, service=mock_service)

        mock_service.check_consent_or_raise.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_require_biometric_consent_raises(
        self,
        workspace_id: UUID,
    ):
        """Test require_biometric_consent raises when not allowed."""
        mock_service = AsyncMock()
        mock_service.check_consent_or_raise = AsyncMock(
            side_effect=ConsentNotGrantedError(workspace_id)
        )

        with pytest.raises(ConsentNotGrantedError):
            await require_biometric_consent(workspace_id, service=mock_service)

    @pytest.mark.asyncio
    async def test_require_public_face_search_passes(
        self,
        workspace_id: UUID,
    ):
        """Test require_public_face_search_enabled passes when allowed."""
        mock_service = AsyncMock()
        mock_settings = MagicMock()
        mock_settings.face_detection_enabled = True
        mock_settings.consent_status = BiometricConsentStatus.GRANTED
        mock_settings.public_face_search_enabled = True
        mock_service.get_settings = AsyncMock(return_value=mock_settings)

        await require_public_face_search_enabled(workspace_id, service=mock_service)

    @pytest.mark.asyncio
    async def test_require_public_face_search_raises_consent_not_granted(
        self,
        workspace_id: UUID,
    ):
        """Test require_public_face_search_enabled raises when consent not granted."""
        mock_service = AsyncMock()
        mock_settings = MagicMock()
        mock_settings.face_detection_enabled = False
        mock_settings.consent_status = BiometricConsentStatus.NOT_GRANTED
        mock_service.get_settings = AsyncMock(return_value=mock_settings)

        with pytest.raises(ConsentNotGrantedError):
            await require_public_face_search_enabled(workspace_id, service=mock_service)

    @pytest.mark.asyncio
    async def test_require_public_face_search_raises_disabled(
        self,
        workspace_id: UUID,
    ):
        """Test require_public_face_search_enabled raises when disabled."""
        mock_service = AsyncMock()
        mock_settings = MagicMock()
        mock_settings.face_detection_enabled = True
        mock_settings.consent_status = BiometricConsentStatus.GRANTED
        mock_settings.public_face_search_enabled = False
        mock_service.get_settings = AsyncMock(return_value=mock_settings)

        with pytest.raises(BiometricConsentError) as exc:
            await require_public_face_search_enabled(workspace_id, service=mock_service)

        assert exc.value.code == "PUBLIC_FACE_SEARCH_DISABLED"


# =============================================================================
# SINGLETON TESTS
# =============================================================================


class TestSingleton:
    """Tests for service singleton."""

    def test_get_biometric_consent_service_returns_singleton(self):
        """Test get_biometric_consent_service returns same instance."""
        # Clear singleton
        import app.services.biometric_consent_service as module
        module._service = None

        service1 = get_biometric_consent_service()
        service2 = get_biometric_consent_service()

        assert service1 is service2


# =============================================================================
# EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_map_settings_with_all_fields(
        self,
        service: BiometricConsentService,
        sample_db_row: dict,
    ):
        """Test _map_settings handles all fields."""
        result = service._map_settings(sample_db_row)

        assert result.id == sample_db_row["id"]
        assert result.workspace_id == sample_db_row["workspace_id"]
        assert result.face_detection_enabled == sample_db_row["face_detection_enabled"]
        assert result.consent_status == BiometricConsentStatus(sample_db_row["consent_status"])
        assert result.consent_ip_address == sample_db_row["consent_ip_address"]
        assert result.consent_user_agent == sample_db_row["consent_user_agent"]
        assert result.consent_policy_version == sample_db_row["consent_policy_version"]

    @pytest.mark.asyncio
    async def test_cache_handles_bytes_values(
        self,
        service: BiometricConsentService,
        mock_redis: AsyncMock,
        workspace_id: UUID,
    ):
        """Test cache handles byte values from Redis correctly."""
        # Redis may return bytes
        mock_redis.hgetall.return_value = {
            b"face_detection_enabled": b"true",
            b"consent_status": b"granted",
            b"public_face_search_enabled": b"false",
            b"auto_clustering_enabled": b"true",
        }

        result = await service.get_settings_summary(workspace_id)

        assert result.consent_status == BiometricConsentStatus.GRANTED

    @pytest.mark.asyncio
    async def test_withdraw_consent_with_reason(
        self,
        service: BiometricConsentService,
        mock_postgres_pool: AsyncMock,
        mock_redis: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
    ):
        """Test withdraw consent stores reason correctly."""
        now = datetime.now(timezone.utc)
        withdrawn_row = {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": "withdrawn",
            "consented_by": None,
            "consented_at": None,
            "consent_ip_address": None,
            "consent_user_agent": None,
            "consent_policy_version": None,
            "withdrawn_by": user_id,
            "withdrawn_at": now,
            "withdrawal_ip_address": "10.0.0.1",
            "withdrawal_reason": "GDPR data deletion request",
            "public_face_search_enabled": False,
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

        mock_postgres_pool.fetchrow.side_effect = [
            {"consent_status": "granted"},
            withdrawn_row,
        ]

        withdraw_data = BiometricConsentWithdraw(
            reason="GDPR data deletion request",
            ip_address="10.0.0.1",
        )

        result = await service.withdraw_consent(workspace_id, user_id, withdraw_data)

        assert result.withdrawal_reason == "GDPR data deletion request"
        assert result.withdrawal_ip_address == "10.0.0.1"
