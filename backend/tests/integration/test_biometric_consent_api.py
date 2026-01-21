"""Integration tests for Biometric Consent API endpoints.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-001 - Biometric Consent Management
Task: T015

Tests GDPR Article 9 compliant consent management API for biometric data processing.
All endpoints require proper authentication and workspace authorization.

Routes tested:
- GET /api/v1/workspaces/{workspace_id}/biometric/settings
- POST /api/v1/workspaces/{workspace_id}/biometric/consent/grant
- POST /api/v1/workspaces/{workspace_id}/biometric/consent/withdraw
- PATCH /api/v1/workspaces/{workspace_id}/biometric/settings
- GET /api/v1/workspaces/{workspace_id}/biometric/consent/status
- GET /api/v1/workspaces/{workspace_id}/biometric/consent/history
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from app.api.v1.biometric_consent import (
    router,
    BiometricSettingsResponse,
    ConsentGrantResponse,
    ConsentWithdrawResponse,
    ConsentHistoryResponse,
    _settings_to_response,
    _extract_client_info,
    _check_workspace_access,
)
from app.services.biometric_consent_service import (
    BiometricConsentService,
    ConsentNotGrantedError,
)
from app.models.workspace_biometric_settings import (
    BiometricConsentStatus,
    BiometricConsentGrant,
    BiometricConsentWithdraw,
    WorkspaceBiometricSettings,
    WorkspaceBiometricSettingsUpdate,
)
from app.services.rbac_service import RBACService

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def other_workspace_id() -> UUID:
    """Another workspace ID for cross-workspace tests."""
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def admin_user_id() -> UUID:
    """Admin user ID for privileged operations."""
    return uuid4()


@pytest.fixture
def mock_current_user(user_id: UUID):
    """Mock authenticated user dependency."""
    user = MagicMock()
    user.user_id = user_id
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_admin_user(admin_user_id: UUID):
    """Mock authenticated admin user dependency."""
    user = MagicMock()
    user.user_id = admin_user_id
    user.email = "admin@example.com"
    return user


@pytest.fixture
def mock_consent_service():
    """Mock BiometricConsentService."""
    return AsyncMock(spec=BiometricConsentService)


@pytest.fixture
def mock_rbac_service():
    """Mock RBACService."""
    service = AsyncMock(spec=RBACService)
    # Default: user has workspace access but not admin
    service.check_workspace_membership = AsyncMock(return_value=True)
    service.user_has_role = AsyncMock(return_value=False)
    return service


@pytest.fixture
def mock_rbac_service_admin():
    """Mock RBACService with admin access."""
    service = AsyncMock(spec=RBACService)
    service.check_workspace_membership = AsyncMock(return_value=True)
    service.user_has_role = AsyncMock(return_value=True)
    return service


@pytest.fixture
def mock_request():
    """Mock FastAPI Request object."""
    request = MagicMock(spec=Request)
    request.headers = {
        "X-Forwarded-For": "192.168.1.100, 10.0.0.1",
        "User-Agent": "Mozilla/5.0 Test/1.0",
    }
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    return request


@pytest.fixture
def sample_settings(workspace_id: UUID, admin_user_id: UUID) -> WorkspaceBiometricSettings:
    """Sample biometric settings with consent granted."""
    now = datetime.now(timezone.utc)
    return WorkspaceBiometricSettings(
        id=uuid4(),
        workspace_id=workspace_id,
        face_detection_enabled=True,
        consent_status=BiometricConsentStatus.GRANTED,
        consented_by=admin_user_id,
        consented_at=now,
        consent_ip_address="192.168.1.100",
        consent_user_agent="Mozilla/5.0 Test/1.0",
        consent_policy_version="1.0",
        withdrawn_by=None,
        withdrawn_at=None,
        withdrawal_ip_address=None,
        withdrawal_reason=None,
        public_face_search_enabled=False,
        auto_clustering_enabled=True,
        ai_processing_consent=False,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def sample_settings_no_consent(workspace_id: UUID) -> WorkspaceBiometricSettings:
    """Sample biometric settings without consent."""
    now = datetime.now(timezone.utc)
    return WorkspaceBiometricSettings(
        id=uuid4(),
        workspace_id=workspace_id,
        face_detection_enabled=False,
        consent_status=BiometricConsentStatus.NOT_GRANTED,
        consented_by=None,
        consented_at=None,
        consent_ip_address=None,
        consent_user_agent=None,
        consent_policy_version=None,
        withdrawn_by=None,
        withdrawn_at=None,
        withdrawal_ip_address=None,
        withdrawal_reason=None,
        public_face_search_enabled=False,
        auto_clustering_enabled=True,
        ai_processing_consent=False,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def sample_withdrawn_settings(
    workspace_id: UUID, admin_user_id: UUID
) -> WorkspaceBiometricSettings:
    """Sample biometric settings with withdrawn consent."""
    now = datetime.now(timezone.utc)
    return WorkspaceBiometricSettings(
        id=uuid4(),
        workspace_id=workspace_id,
        face_detection_enabled=False,
        consent_status=BiometricConsentStatus.WITHDRAWN,
        consented_by=admin_user_id,
        consented_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        consent_ip_address="192.168.1.100",
        consent_user_agent="Mozilla/5.0",
        consent_policy_version="1.0",
        withdrawn_by=admin_user_id,
        withdrawn_at=now,
        withdrawal_ip_address="192.168.1.100",
        withdrawal_reason="GDPR request",
        public_face_search_enabled=False,
        auto_clustering_enabled=True,
        ai_processing_consent=False,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        updated_at=now,
    )


# =============================================================================
# HELPER FUNCTION TESTS
# =============================================================================


class TestExtractClientInfo:
    """Tests for _extract_client_info helper function."""

    def test_extracts_ip_from_forwarded_header(self, mock_request):
        """X-Forwarded-For header should be used for client IP."""
        ip, user_agent = _extract_client_info(mock_request)

        assert ip == "192.168.1.100"
        assert user_agent == "Mozilla/5.0 Test/1.0"

    def test_extracts_ip_from_client_when_no_forwarded(self):
        """Falls back to request.client.host when no X-Forwarded-For."""
        request = MagicMock(spec=Request)
        request.headers = {"User-Agent": "Test/1.0"}
        request.client = MagicMock()
        request.client.host = "10.0.0.5"

        ip, user_agent = _extract_client_info(request)

        assert ip == "10.0.0.5"
        assert user_agent == "Test/1.0"

    def test_handles_missing_client(self):
        """Returns None for IP when request.client is None."""
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = None

        ip, user_agent = _extract_client_info(request)

        assert ip is None
        assert user_agent is None


class TestCheckWorkspaceAccess:
    """Tests for _check_workspace_access helper function."""

    @pytest.mark.asyncio
    async def test_allows_workspace_member(
        self, user_id: UUID, workspace_id: UUID, mock_rbac_service
    ):
        """Workspace members should pass basic access check."""
        # Should not raise
        await _check_workspace_access(
            user_id, workspace_id, mock_rbac_service, require_admin=False
        )

        mock_rbac_service.check_workspace_membership.assert_called_once_with(
            user_id, workspace_id
        )

    @pytest.mark.asyncio
    async def test_denies_non_member(
        self, user_id: UUID, workspace_id: UUID, mock_rbac_service
    ):
        """Non-members should be denied access."""
        mock_rbac_service.check_workspace_membership = AsyncMock(return_value=False)

        with pytest.raises(HTTPException) as exc_info:
            await _check_workspace_access(
                user_id, workspace_id, mock_rbac_service, require_admin=False
            )

        assert exc_info.value.status_code == 403
        assert "Access denied" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_denies_non_admin_when_admin_required(
        self, user_id: UUID, workspace_id: UUID, mock_rbac_service
    ):
        """Non-admins should be denied when admin role required."""
        mock_rbac_service.user_has_role = AsyncMock(return_value=False)

        with pytest.raises(HTTPException) as exc_info:
            await _check_workspace_access(
                user_id, workspace_id, mock_rbac_service, require_admin=True
            )

        assert exc_info.value.status_code == 403
        assert "Admin or owner role required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_allows_admin_when_admin_required(
        self, admin_user_id: UUID, workspace_id: UUID, mock_rbac_service_admin
    ):
        """Admins should pass when admin role required."""
        # Should not raise
        await _check_workspace_access(
            admin_user_id, workspace_id, mock_rbac_service_admin, require_admin=True
        )

        mock_rbac_service_admin.user_has_role.assert_called_once_with(
            admin_user_id, workspace_id, ["owner", "admin"]
        )


class TestSettingsToResponse:
    """Tests for _settings_to_response conversion helper."""

    def test_converts_settings_to_response(self, sample_settings):
        """Domain model should be correctly converted to response model."""
        response = _settings_to_response(sample_settings)

        assert response.workspace_id == sample_settings.workspace_id
        assert response.face_detection_enabled == sample_settings.face_detection_enabled
        assert response.consent_status == sample_settings.consent_status
        assert response.consent_granted_at == sample_settings.consented_at.isoformat()
        assert response.public_face_search_enabled == sample_settings.public_face_search_enabled
        assert response.auto_clustering_enabled == sample_settings.auto_clustering_enabled
        assert response.ai_processing_consent == sample_settings.ai_processing_consent

    def test_handles_null_consent_timestamp(self, sample_settings_no_consent):
        """Null consent timestamp should be handled correctly."""
        response = _settings_to_response(sample_settings_no_consent)

        assert response.consent_granted_at is None
        assert response.consent_status == BiometricConsentStatus.NOT_GRANTED


# =============================================================================
# GET /settings ENDPOINT TESTS
# =============================================================================


class TestGetBiometricSettings:
    """Tests for GET /biometric/settings endpoint."""

    @pytest.mark.asyncio
    async def test_returns_settings_for_workspace_member(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
        sample_settings,
    ):
        """Workspace members can view biometric settings."""
        from app.api.v1.biometric_consent import get_biometric_settings

        mock_consent_service.get_settings = AsyncMock(return_value=sample_settings)

        response = await get_biometric_settings(
            workspace_id=workspace_id,
            current_user=mock_current_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service,
        )

        assert response.workspace_id == workspace_id
        assert response.face_detection_enabled is True
        assert response.consent_status == BiometricConsentStatus.GRANTED
        mock_consent_service.get_settings.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_returns_default_settings_when_none_exist(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Default settings returned when no settings exist for workspace."""
        from app.api.v1.biometric_consent import get_biometric_settings

        mock_consent_service.get_settings = AsyncMock(return_value=None)

        response = await get_biometric_settings(
            workspace_id=workspace_id,
            current_user=mock_current_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service,
        )

        assert response.workspace_id == workspace_id
        assert response.face_detection_enabled is False
        assert response.consent_status == BiometricConsentStatus.NOT_GRANTED
        assert response.consent_granted_at is None

    @pytest.mark.asyncio
    async def test_denies_access_to_non_member(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Non-members should be denied access to settings."""
        from app.api.v1.biometric_consent import get_biometric_settings

        mock_rbac_service.check_workspace_membership = AsyncMock(return_value=False)

        with pytest.raises(HTTPException) as exc_info:
            await get_biometric_settings(
                workspace_id=workspace_id,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# POST /consent/grant ENDPOINT TESTS
# =============================================================================


class TestGrantBiometricConsent:
    """Tests for POST /biometric/consent/grant endpoint."""

    @pytest.mark.asyncio
    async def test_grants_consent_for_admin(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_settings,
    ):
        """Admin users can grant biometric consent."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        mock_consent_service.grant_consent = AsyncMock(return_value=sample_settings)

        request_body = BiometricConsentGrant(policy_version="1.0")

        response = await grant_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        assert response.success is True
        assert "granted successfully" in response.message
        assert response.settings.workspace_id == workspace_id
        mock_consent_service.grant_consent.assert_called_once()

    @pytest.mark.asyncio
    async def test_records_client_info_in_grant(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_settings,
    ):
        """Grant should record client IP and user agent for audit trail."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        mock_consent_service.grant_consent = AsyncMock(return_value=sample_settings)

        request_body = BiometricConsentGrant(policy_version="1.0")

        await grant_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        # Verify grant_data passed to service includes client info
        call_kwargs = mock_consent_service.grant_consent.call_args.kwargs
        grant_data = call_kwargs["grant_data"]
        assert grant_data.ip_address == "192.168.1.100"
        assert grant_data.user_agent == "Mozilla/5.0 Test/1.0"

    @pytest.mark.asyncio
    async def test_denies_grant_for_non_admin(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
        mock_request,
    ):
        """Non-admin users cannot grant consent (GDPR requirement)."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        request_body = BiometricConsentGrant(policy_version="1.0")

        with pytest.raises(HTTPException) as exc_info:
            await grant_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403
        assert "Admin or owner role required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_handles_service_error_gracefully(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
    ):
        """Service errors should return 500 with generic message."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        mock_consent_service.grant_consent = AsyncMock(
            side_effect=Exception("Database connection failed")
        )

        request_body = BiometricConsentGrant(policy_version="1.0")

        with pytest.raises(HTTPException) as exc_info:
            await grant_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
            )

        assert exc_info.value.status_code == 500
        # Error should not expose internal details
        assert "Database" not in exc_info.value.detail


# =============================================================================
# POST /consent/withdraw ENDPOINT TESTS
# =============================================================================


class TestWithdrawBiometricConsent:
    """Tests for POST /biometric/consent/withdraw endpoint."""

    @pytest.mark.asyncio
    async def test_withdraws_consent_for_admin(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_withdrawn_settings,
    ):
        """Admin users can withdraw biometric consent."""
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        request_body = BiometricConsentWithdraw(reason="GDPR request")

        response = await withdraw_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
            cascade_delete=False,
        )

        assert response.success is True
        assert "withdrawn successfully" in response.message
        assert response.deletion_job_scheduled is False

    @pytest.mark.asyncio
    async def test_schedules_deletion_with_cascade_flag(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_withdrawn_settings,
    ):
        """Cascade delete flag should schedule deletion job (GDPR right to erasure)."""
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        request_body = BiometricConsentWithdraw(reason="GDPR erasure request")

        response = await withdraw_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
            cascade_delete=True,
        )

        assert response.deletion_job_scheduled is True
        # Verify cascade_delete passed to service
        call_kwargs = mock_consent_service.withdraw_consent.call_args.kwargs
        assert call_kwargs["cascade_delete"] is True

    @pytest.mark.asyncio
    async def test_records_withdrawal_reason(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_withdrawn_settings,
    ):
        """Withdrawal reason should be recorded for audit trail."""
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        request_body = BiometricConsentWithdraw(reason="User requested data deletion")

        await withdraw_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
            cascade_delete=False,
        )

        call_kwargs = mock_consent_service.withdraw_consent.call_args.kwargs
        withdraw_data = call_kwargs["withdraw_data"]
        assert withdraw_data.reason == "User requested data deletion"
        assert withdraw_data.ip_address == "192.168.1.100"

    @pytest.mark.asyncio
    async def test_denies_withdrawal_for_non_admin(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
        mock_request,
    ):
        """Non-admin users cannot withdraw consent."""
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        request_body = BiometricConsentWithdraw(reason="Test")

        with pytest.raises(HTTPException) as exc_info:
            await withdraw_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
                cascade_delete=False,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# PATCH /settings ENDPOINT TESTS
# =============================================================================


class TestUpdateBiometricSettings:
    """Tests for PATCH /biometric/settings endpoint."""

    @pytest.mark.asyncio
    async def test_updates_settings_when_consent_granted(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        sample_settings,
    ):
        """Settings can be updated when consent is already granted."""
        from app.api.v1.biometric_consent import update_biometric_settings

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=True)

        # Return updated settings
        updated_settings = sample_settings
        updated_settings.public_face_search_enabled = True
        mock_consent_service.update_settings = AsyncMock(return_value=updated_settings)

        request_body = WorkspaceBiometricSettingsUpdate(
            public_face_search_enabled=True
        )

        response = await update_biometric_settings(
            workspace_id=workspace_id,
            request_body=request_body,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        assert response.public_face_search_enabled is True
        mock_consent_service.update_settings.assert_called_once()

    @pytest.mark.asyncio
    async def test_denies_update_without_consent(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
    ):
        """Cannot update settings if consent not granted."""
        from app.api.v1.biometric_consent import update_biometric_settings

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=False)

        request_body = WorkspaceBiometricSettingsUpdate(
            public_face_search_enabled=True
        )

        with pytest.raises(HTTPException) as exc_info:
            await update_biometric_settings(
                workspace_id=workspace_id,
                request_body=request_body,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
            )

        assert exc_info.value.status_code == 400
        assert "consent not granted" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_denies_update_for_non_admin(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Non-admin users cannot update settings."""
        from app.api.v1.biometric_consent import update_biometric_settings

        request_body = WorkspaceBiometricSettingsUpdate(
            auto_clustering_enabled=False
        )

        with pytest.raises(HTTPException) as exc_info:
            await update_biometric_settings(
                workspace_id=workspace_id,
                request_body=request_body,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# GET /consent/status ENDPOINT TESTS
# =============================================================================


class TestCheckConsentStatus:
    """Tests for GET /biometric/consent/status endpoint."""

    @pytest.mark.asyncio
    async def test_returns_allowed_when_consent_granted(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Returns face_detection_allowed: true when consent granted."""
        from app.api.v1.biometric_consent import check_consent_status

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=True)

        response = await check_consent_status(
            workspace_id=workspace_id,
            current_user=mock_current_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service,
        )

        assert response["workspace_id"] == str(workspace_id)
        assert response["face_detection_allowed"] is True

    @pytest.mark.asyncio
    async def test_returns_not_allowed_when_no_consent(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Returns face_detection_allowed: false when consent not granted."""
        from app.api.v1.biometric_consent import check_consent_status

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=False)

        response = await check_consent_status(
            workspace_id=workspace_id,
            current_user=mock_current_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service,
        )

        assert response["face_detection_allowed"] is False

    @pytest.mark.asyncio
    async def test_accessible_by_any_workspace_member(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Status check should be accessible to any workspace member (not just admins)."""
        from app.api.v1.biometric_consent import check_consent_status

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=False)

        # Non-admin user should succeed
        response = await check_consent_status(
            workspace_id=workspace_id,
            current_user=mock_current_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service,
        )

        # Verify RBAC wasn't checking for admin role
        mock_rbac_service.user_has_role.assert_not_called()
        assert "face_detection_allowed" in response


# =============================================================================
# GET /consent/history ENDPOINT TESTS
# =============================================================================


class TestGetConsentHistory:
    """Tests for GET /biometric/consent/history endpoint."""

    @pytest.mark.asyncio
    async def test_returns_history_with_grant_event(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        sample_settings,
    ):
        """History should include grant event when consent was granted."""
        from app.api.v1.biometric_consent import get_consent_history

        mock_consent_service.get_settings = AsyncMock(return_value=sample_settings)

        response = await get_consent_history(
            workspace_id=workspace_id,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        assert response.workspace_id == workspace_id
        assert response.current_status == BiometricConsentStatus.GRANTED
        assert response.total_entries >= 1

        # Find the grant event
        grant_events = [e for e in response.history if e.event_type == "granted"]
        assert len(grant_events) == 1
        assert grant_events[0].policy_version == "1.0"

    @pytest.mark.asyncio
    async def test_returns_history_with_withdrawal_event(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        sample_withdrawn_settings,
    ):
        """History should include withdrawal event when consent was withdrawn."""
        from app.api.v1.biometric_consent import get_consent_history

        mock_consent_service.get_settings = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        response = await get_consent_history(
            workspace_id=workspace_id,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        assert response.current_status == BiometricConsentStatus.WITHDRAWN

        # Find the withdrawal event
        withdraw_events = [e for e in response.history if e.event_type == "withdrawn"]
        assert len(withdraw_events) == 1
        assert withdraw_events[0].reason == "GDPR request"

    @pytest.mark.asyncio
    async def test_history_sorted_most_recent_first(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        sample_withdrawn_settings,
    ):
        """History entries should be sorted with most recent first."""
        from app.api.v1.biometric_consent import get_consent_history

        mock_consent_service.get_settings = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        response = await get_consent_history(
            workspace_id=workspace_id,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        # Should have both grant and withdrawal events
        assert response.total_entries == 2

        # Verify descending order (withdrawal should be first as it's more recent)
        timestamps = [e.timestamp for e in response.history]
        assert timestamps == sorted(timestamps, reverse=True)

    @pytest.mark.asyncio
    async def test_denies_history_for_non_admin(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Non-admin users cannot view consent history (privacy protection)."""
        from app.api.v1.biometric_consent import get_consent_history

        with pytest.raises(HTTPException) as exc_info:
            await get_consent_history(
                workspace_id=workspace_id,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# GDPR COMPLIANCE TESTS
# =============================================================================


class TestGDPRCompliance:
    """Tests verifying GDPR Article 9 compliance for biometric consent."""

    @pytest.mark.asyncio
    async def test_consent_requires_admin_role(
        self,
        workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
        mock_request,
    ):
        """
        GDPR Article 9: Consent must be given by authorized representative.
        Only admin/owner can grant biometric consent.
        """
        from app.api.v1.biometric_consent import grant_biometric_consent

        request_body = BiometricConsentGrant(policy_version="1.0")

        with pytest.raises(HTTPException) as exc_info:
            await grant_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_consent_records_audit_trail(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_settings,
    ):
        """
        GDPR Article 9: Must maintain verifiable record of consent.
        Grant records IP, user agent, policy version, user ID, timestamp.
        """
        from app.api.v1.biometric_consent import grant_biometric_consent

        mock_consent_service.grant_consent = AsyncMock(return_value=sample_settings)

        request_body = BiometricConsentGrant(policy_version="2.0")

        await grant_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
        )

        call_kwargs = mock_consent_service.grant_consent.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_id
        assert call_kwargs["user_id"] == mock_admin_user.user_id
        grant_data = call_kwargs["grant_data"]
        assert grant_data.policy_version == "2.0"
        assert grant_data.ip_address is not None

    @pytest.mark.asyncio
    async def test_withdrawal_right_supported(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_withdrawn_settings,
    ):
        """
        GDPR Article 7: Right to withdraw consent at any time.
        Withdrawal endpoint exists and records reason.
        """
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        request_body = BiometricConsentWithdraw(reason="Exercising GDPR withdrawal right")

        response = await withdraw_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
            cascade_delete=False,
        )

        assert response.success is True
        call_kwargs = mock_consent_service.withdraw_consent.call_args.kwargs
        assert call_kwargs["withdraw_data"].reason == "Exercising GDPR withdrawal right"

    @pytest.mark.asyncio
    async def test_erasure_right_with_cascade_delete(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
        sample_withdrawn_settings,
    ):
        """
        GDPR Article 17: Right to erasure.
        Cascade delete schedules deletion of all face embeddings.
        """
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            return_value=sample_withdrawn_settings
        )

        request_body = BiometricConsentWithdraw(reason="GDPR Article 17 erasure request")

        response = await withdraw_biometric_consent(
            workspace_id=workspace_id,
            request_body=request_body,
            request=mock_request,
            current_user=mock_admin_user,
            consent_service=mock_consent_service,
            rbac_service=mock_rbac_service_admin,
            cascade_delete=True,
        )

        assert response.deletion_job_scheduled is True


# =============================================================================
# CROSS-WORKSPACE SECURITY TESTS
# =============================================================================


class TestCrossWorkspaceSecurity:
    """Tests for workspace isolation in biometric consent API."""

    @pytest.mark.asyncio
    async def test_cannot_access_other_workspace_settings(
        self,
        workspace_id: UUID,
        other_workspace_id: UUID,
        mock_current_user,
        mock_consent_service,
        mock_rbac_service,
    ):
        """Users cannot access biometric settings of workspaces they don't belong to."""
        from app.api.v1.biometric_consent import get_biometric_settings

        # User is not a member of other_workspace_id
        async def check_membership(user_id, ws_id):
            return ws_id == workspace_id

        mock_rbac_service.check_workspace_membership = AsyncMock(
            side_effect=check_membership
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_biometric_settings(
                workspace_id=other_workspace_id,
                current_user=mock_current_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service,
            )

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_cannot_grant_consent_in_other_workspace(
        self,
        workspace_id: UUID,
        other_workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
    ):
        """Admin of one workspace cannot grant consent in another workspace."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        # User is admin of workspace_id but not other_workspace_id
        async def check_membership(user_id, ws_id):
            return ws_id == workspace_id

        mock_rbac_service_admin.check_workspace_membership = AsyncMock(
            side_effect=check_membership
        )

        request_body = BiometricConsentGrant(policy_version="1.0")

        with pytest.raises(HTTPException) as exc_info:
            await grant_biometric_consent(
                workspace_id=other_workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestErrorHandling:
    """Tests for error handling in biometric consent API."""

    @pytest.mark.asyncio
    async def test_grant_service_error_returns_500(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
    ):
        """Service errors during grant should return 500."""
        from app.api.v1.biometric_consent import grant_biometric_consent

        mock_consent_service.grant_consent = AsyncMock(
            side_effect=Exception("Unexpected error")
        )

        request_body = BiometricConsentGrant(policy_version="1.0")

        with pytest.raises(HTTPException) as exc_info:
            await grant_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
            )

        assert exc_info.value.status_code == 500
        # Should not expose internal error details
        assert "Unexpected error" not in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_withdraw_service_error_returns_500(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
        mock_request,
    ):
        """Service errors during withdraw should return 500."""
        from app.api.v1.biometric_consent import withdraw_biometric_consent

        mock_consent_service.withdraw_consent = AsyncMock(
            side_effect=Exception("Database timeout")
        )

        request_body = BiometricConsentWithdraw(reason="Test")

        with pytest.raises(HTTPException) as exc_info:
            await withdraw_biometric_consent(
                workspace_id=workspace_id,
                request_body=request_body,
                request=mock_request,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
                cascade_delete=False,
            )

        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    async def test_update_service_error_returns_500(
        self,
        workspace_id: UUID,
        mock_admin_user,
        mock_consent_service,
        mock_rbac_service_admin,
    ):
        """Service errors during update should return 500."""
        from app.api.v1.biometric_consent import update_biometric_settings

        mock_consent_service.is_face_detection_allowed = AsyncMock(return_value=True)
        mock_consent_service.update_settings = AsyncMock(
            side_effect=Exception("Redis error")
        )

        request_body = WorkspaceBiometricSettingsUpdate(auto_clustering_enabled=False)

        with pytest.raises(HTTPException) as exc_info:
            await update_biometric_settings(
                workspace_id=workspace_id,
                request_body=request_body,
                current_user=mock_admin_user,
                consent_service=mock_consent_service,
                rbac_service=mock_rbac_service_admin,
            )

        assert exc_info.value.status_code == 500
