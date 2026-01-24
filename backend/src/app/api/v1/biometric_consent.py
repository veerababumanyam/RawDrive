"""Biometric Consent API endpoints.

GDPR Article 9 compliant biometric consent management for face detection.

All routes prefixed with /api/v1/workspaces/{workspace_id}/biometric.
Implements Requirements: COM-001 (Biometric Consent Management)

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep
from app.api.exceptions import ForbiddenError
from app.models.workspace_biometric_settings import (
    BiometricConsentGrant,
    BiometricConsentStatus,
    BiometricConsentWithdraw,
    WorkspaceBiometricSettings,
    WorkspaceBiometricSettingsSummary,
    WorkspaceBiometricSettingsUpdate,
)
from app.services.biometric_consent_service import (
    BiometricConsentService,
    ConsentNotGrantedError,
    get_biometric_consent_service,
)
from app.services.rbac_service import RBACService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/biometric",
    tags=["biometric-consent"],
)


# =============================================================================
# DEPENDENCIES
# =============================================================================


def _get_consent_service() -> BiometricConsentService:
    return get_biometric_consent_service()


def _get_rbac_service() -> RBACService:
    return RBACService()


ConsentServiceDep = Annotated[BiometricConsentService, Depends(_get_consent_service)]
RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


# =============================================================================
# RESPONSE MODELS
# =============================================================================


class BiometricSettingsResponse(BaseModel):
    """Response model for biometric settings."""

    workspace_id: UUID
    face_detection_enabled: bool
    consent_status: BiometricConsentStatus
    consent_granted_at: str | None = None
    public_face_search_enabled: bool
    auto_clustering_enabled: bool
    ai_processing_consent: bool


class ConsentGrantResponse(BaseModel):
    """Response model for consent grant operation."""

    success: bool
    message: str
    settings: BiometricSettingsResponse


class ConsentWithdrawResponse(BaseModel):
    """Response model for consent withdraw operation."""

    success: bool
    message: str
    settings: BiometricSettingsResponse
    deletion_job_scheduled: bool = False


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
    details: dict | None = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _extract_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract client IP and user agent from request."""
    # Get IP from X-Forwarded-For header (for proxied requests)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip()
    elif request.client:
        ip_address = request.client.host
    else:
        ip_address = None

    user_agent = request.headers.get("User-Agent")
    return ip_address, user_agent


def _settings_to_response(settings: WorkspaceBiometricSettings) -> BiometricSettingsResponse:
    """Convert domain model to response model."""
    return BiometricSettingsResponse(
        workspace_id=settings.workspace_id,
        face_detection_enabled=settings.face_detection_enabled,
        consent_status=settings.consent_status,
        consent_granted_at=settings.consented_at.isoformat() if settings.consented_at else None,
        public_face_search_enabled=settings.public_face_search_enabled,
        auto_clustering_enabled=settings.auto_clustering_enabled,
        ai_processing_consent=settings.ai_processing_consent,
    )


async def _check_workspace_access(
    user_id: UUID,
    workspace_id: UUID,
    rbac_service: RBACService,
    require_admin: bool = False,
) -> None:
    """Check if user has access to workspace.

    Args:
        user_id: Current user ID
        workspace_id: Target workspace ID
        rbac_service: RBAC service instance
        require_admin: If True, require write permissions

    Raises:
        HTTPException: If user lacks required access
    """
    # Check permission based on operation type
    required_perm = "settings:write" if require_admin else "settings:read"
    permission = await rbac_service.check_permission(
        user_id=user_id,
        workspace_id=workspace_id,
        required_permissions=required_perm,
    )

    if not permission.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permissions: {', '.join(permission.missing_permissions)}"
                   if permission.missing_permissions
                   else "Access denied to workspace",
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================


@router.get(
    "/settings",
    response_model=BiometricSettingsResponse,
    summary="Get biometric settings",
    description="Get current biometric consent settings for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Settings not found"},
    },
)
async def get_biometric_settings(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
) -> BiometricSettingsResponse:
    """Get biometric consent settings for a workspace.

    Returns the current consent status and feature toggles.
    Any workspace member can view settings.
    """
    await _check_workspace_access(current_user.user_id, workspace_id, rbac_service)

    settings = await consent_service.get_settings(workspace_id)
    if not settings:
        # Return default settings if none exist
        return BiometricSettingsResponse(
            workspace_id=workspace_id,
            face_detection_enabled=False,
            consent_status=BiometricConsentStatus.NOT_GRANTED,
            consent_granted_at=None,
            public_face_search_enabled=False,
            auto_clustering_enabled=True,
            ai_processing_consent=False,
        )

    return _settings_to_response(settings)


@router.post(
    "/consent/grant",
    response_model=ConsentGrantResponse,
    status_code=status.HTTP_200_OK,
    summary="Grant biometric consent",
    description="Grant GDPR Article 9 consent for biometric data processing.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied or admin required"},
    },
)
async def grant_biometric_consent(
    workspace_id: UUID,
    request_body: BiometricConsentGrant,
    request: Request,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
) -> ConsentGrantResponse:
    """Grant biometric consent for face detection processing.

    This is a privileged operation requiring admin/owner role.
    Records full audit trail including IP, user agent, and policy version.

    COM-001: GDPR Article 9 requires explicit consent for biometric data.
    """
    await _check_workspace_access(
        current_user.user_id, workspace_id, rbac_service, require_admin=True
    )

    # Extract client info for audit trail
    ip_address, user_agent = _extract_client_info(request)

    # Create grant data with client info
    grant_data = BiometricConsentGrant(
        policy_version=request_body.policy_version,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    try:
        settings = await consent_service.grant_consent(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            grant_data=grant_data,
        )

        logger.info(
            "Biometric consent granted",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "policy_version": request_body.policy_version,
            },
        )

        return ConsentGrantResponse(
            success=True,
            message="Biometric consent granted successfully",
            settings=_settings_to_response(settings),
        )

    except Exception as e:
        logger.error(
            "Failed to grant biometric consent",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to grant consent. Please try again.",
        )


@router.post(
    "/consent/withdraw",
    response_model=ConsentWithdrawResponse,
    status_code=status.HTTP_200_OK,
    summary="Withdraw biometric consent",
    description="Withdraw GDPR Article 9 consent for biometric data processing.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied or admin required"},
    },
)
async def withdraw_biometric_consent(
    workspace_id: UUID,
    request_body: BiometricConsentWithdraw,
    request: Request,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
    cascade_delete: bool = False,
) -> ConsentWithdrawResponse:
    """Withdraw biometric consent and optionally delete all face data.

    This is a privileged operation requiring admin/owner role.

    Args:
        cascade_delete: If True, schedule deletion of all face embeddings
                       for this workspace (GDPR right to erasure).

    COM-001: GDPR Article 17 provides the right to erasure.
    """
    await _check_workspace_access(
        current_user.user_id, workspace_id, rbac_service, require_admin=True
    )

    # Extract client info for audit trail
    ip_address, _ = _extract_client_info(request)

    # Create withdraw data with client info
    withdraw_data = BiometricConsentWithdraw(
        reason=request_body.reason,
        ip_address=ip_address,
    )

    try:
        settings = await consent_service.withdraw_consent(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            withdraw_data=withdraw_data,
            cascade_delete=cascade_delete,
        )

        logger.info(
            "Biometric consent withdrawn",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "cascade_delete": cascade_delete,
                "reason": request_body.reason,
            },
        )

        return ConsentWithdrawResponse(
            success=True,
            message="Biometric consent withdrawn successfully",
            settings=_settings_to_response(settings),
            deletion_job_scheduled=cascade_delete,
        )

    except Exception as e:
        logger.error(
            "Failed to withdraw biometric consent",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to withdraw consent. Please try again.",
        )


@router.patch(
    "/settings",
    response_model=BiometricSettingsResponse,
    summary="Update biometric settings",
    description="Update biometric feature toggles (requires active consent).",
    responses={
        400: {"model": ErrorResponse, "description": "Consent not granted"},
        403: {"model": ErrorResponse, "description": "Access denied or admin required"},
    },
)
async def update_biometric_settings(
    workspace_id: UUID,
    request_body: WorkspaceBiometricSettingsUpdate,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
) -> BiometricSettingsResponse:
    """Update biometric feature toggles.

    Can only update settings when consent is already granted.
    This is a privileged operation requiring admin/owner role.

    Updatable settings:
    - public_face_search_enabled: Allow face search on public galleries
    - auto_clustering_enabled: Auto-cluster detected faces
    - ai_processing_consent: Allow AI-powered face features
    """
    await _check_workspace_access(
        current_user.user_id, workspace_id, rbac_service, require_admin=True
    )

    # Check if consent is granted
    is_allowed = await consent_service.is_face_detection_allowed(workspace_id)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update settings: biometric consent not granted",
        )

    try:
        settings = await consent_service.update_settings(
            workspace_id=workspace_id,
            update_data=request_body,
        )

        logger.info(
            "Biometric settings updated",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "updates": request_body.model_dump(exclude_unset=True),
            },
        )

        return _settings_to_response(settings)

    except Exception as e:
        logger.error(
            "Failed to update biometric settings",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update settings. Please try again.",
        )


@router.get(
    "/consent/status",
    response_model=dict,
    summary="Check consent status",
    description="Quick check if face detection is allowed for this workspace.",
)
async def check_consent_status(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
) -> dict:
    """Check if face detection is currently allowed.

    Returns a simple boolean indicating if face detection can proceed.
    Useful for UI to show/hide face features.
    """
    await _check_workspace_access(current_user.user_id, workspace_id, rbac_service)

    is_allowed = await consent_service.is_face_detection_allowed(workspace_id)

    return {
        "workspace_id": str(workspace_id),
        "face_detection_allowed": is_allowed,
    }


# =============================================================================
# CONSENT HISTORY ENDPOINT (T022)
# =============================================================================


class ConsentHistoryEntry(BaseModel):
    """A single consent history entry."""

    event_type: str  # 'granted', 'withdrawn', 'pending_deletion'
    timestamp: str
    user_id: UUID | None
    ip_address: str | None
    policy_version: str | None = None
    reason: str | None = None


class ConsentHistoryResponse(BaseModel):
    """Response model for consent history."""

    workspace_id: UUID
    current_status: BiometricConsentStatus
    history: list[ConsentHistoryEntry]
    total_entries: int


@router.get(
    "/consent/history",
    response_model=ConsentHistoryResponse,
    summary="Get consent history",
    description="Get the biometric consent history for the workspace (COM-001 audit trail).",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied or admin required"},
    },
)
async def get_consent_history(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    consent_service: ConsentServiceDep,
    rbac_service: RBACServiceDep,
    page: int = 1,
    page_size: int = 20,
) -> ConsentHistoryResponse:
    """Get biometric consent history for compliance audit.

    Returns the history of consent grants and withdrawals for the workspace.
    This implements COM-001 audit trail requirements per GDPR Article 9.

    Requires admin/owner role.

    Args:
        page: Page number (1-indexed)
        page_size: Number of entries per page
    """
    await _check_workspace_access(
        current_user.user_id, workspace_id, rbac_service, require_admin=True
    )

    settings = await consent_service.get_settings(workspace_id)

    # Build history from stored consent/withdrawal records
    history: list[ConsentHistoryEntry] = []

    # Add grant event if consent was ever granted
    if settings.consented_at:
        history.append(ConsentHistoryEntry(
            event_type="granted",
            timestamp=settings.consented_at.isoformat(),
            user_id=settings.consented_by,
            ip_address=settings.consent_ip_address,
            policy_version=settings.consent_policy_version,
        ))

    # Add withdrawal event if consent was withdrawn
    if settings.withdrawn_at:
        history.append(ConsentHistoryEntry(
            event_type="withdrawn",
            timestamp=settings.withdrawn_at.isoformat(),
            user_id=settings.withdrawn_by,
            ip_address=settings.withdrawal_ip_address,
            reason=settings.withdrawal_reason,
        ))

    # Sort by timestamp (most recent first)
    history.sort(key=lambda x: x.timestamp, reverse=True)

    return ConsentHistoryResponse(
        workspace_id=workspace_id,
        current_status=settings.consent_status,
        history=history,
        total_entries=len(history),
    )
