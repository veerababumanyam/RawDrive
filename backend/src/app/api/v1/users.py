"""User API endpoints.

All routes prefixed with /api/v1/users.
Implements Requirements: 23.2, 23.3
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status

from app.api.dependencies.auth import CurrentUserDep
from app.api.schemas import (
    AccountDeletionResponse,
    AvatarUploadResponse,
    BackupCodesResponse,
    ChangePasswordRequest,
    DataExportResponse,
    DeleteAccountRequest,
    DeletionStatusResponse,
    Disable2FARequest,
    EmailChangeRequest,
    ErrorResponse,
    ExtendedUserProfileResponse,
    MessageResponse,
    NotificationPreferencesResponse,
    PasswordConfirmRequest,
    PrivacySettingsResponse,
    SessionListResponse,
    SessionResponse,
    SessionLocationSchema,
    TwoFactorEnabledResponse,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
    UpdateNotificationPreferencesRequest,
    UpdatePrivacySettingsRequest,
    UpdateProfileRequest,
    UpdateUserRequest,
    UserProfileResponse,
    Verify2FARequest,
)
from app.db.postgres import get_postgres_pool
from app.services.session_service import SessionService
from app.services.auth_service import (
    AuthService,
    EmailAlreadyInUseError,
    EmailChangePendingError,
    PasswordIncorrectError,
)
from app.services.user_avatar_service import (
    get_user_avatar_service,
    UserAvatarError,
    UserAvatarFileTooLargeError,
    UserAvatarInvalidFormatError,
)
from app.services.audit_service import AuditService, AuditEventType
from app.services.totp_service import (
    get_totp_service,
    TOTPService,
    TOTPError,
    TOTPAlreadyEnabledError,
    TOTPNotEnabledError,
    TOTPInvalidCodeError,
    TOTPSetupExpiredError,
)
from app.api.exceptions import NotFoundError, ForbiddenError, AppError, InternalError
from app.services.notification_service import NotificationService
from app.services.privacy_service import PrivacyService
from app.services.data_export_service import (
    DataExportService,
    ExportRateLimitError,
)
from app.services.account_deletion_service import (
    AccountDeletionService,
    DeletionAlreadyRequestedError,
    DeletionNotFoundError,
    DeletionCannotBeCancelledError,
)
from app.services.rate_limit_service import (
    RateLimitService,
    RateLimitType,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _get_session_service() -> SessionService:
    return SessionService()


SessionServiceDep = Annotated[SessionService, Depends(_get_session_service)]


# ---------------------------------------------------------------------------
# User profile endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=ExtendedUserProfileResponse,
    summary="Get current user",
    description="Get the current authenticated user's extended profile including avatar, preferences, and security status.",
)
async def get_current_user_profile(
    current_user: CurrentUserDep,
) -> ExtendedUserProfileResponse:
    """Get current user extended profile.

    Returns all profile fields including:
    - Basic info (email, display_name, etc.)
    - Profile fields (avatar_url, job_title, phone, timezone, bio)
    - Security status (totp_enabled, last_password_changed_at)
    - Deletion status (deletion_requested_at)
    """
    pool = await get_postgres_pool()

    # Fetch user with all profile fields
    row = await pool.fetchrow(
        """
        SELECT
            u.user_id, u.email, u.display_name, u.email_verified,
            u.preferred_language, u.created_at,
            u.avatar_url, u.job_title, u.phone,
            COALESCE(u.timezone, 'Asia/Kolkata') as timezone,
            u.bio,
            u.last_password_changed_at, u.deletion_requested_at,
            COALESCE(t.totp_enabled, false) as totp_enabled
        FROM users u
        LEFT JOIN user_totp_settings t ON t.user_id = u.user_id
        WHERE u.user_id = $1
        """,
        current_user.user_id,
    )

    if not row:
        raise NotFoundError("User", str(current_user.user_id))

    return ExtendedUserProfileResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        email_verified=row["email_verified"],
        preferred_language=row["preferred_language"] or "en-IN",
        created_at=row["created_at"],
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
        # New profile fields
        avatar_url=row["avatar_url"],
        job_title=row["job_title"],
        phone=row["phone"],
        timezone=row["timezone"],
        bio=row["bio"],
        # Security status
        totp_enabled=row["totp_enabled"],
        last_password_changed_at=row["last_password_changed_at"],
        # Deletion status
        deletion_requested_at=row["deletion_requested_at"],
    )


@router.patch(
    "/me",
    response_model=ExtendedUserProfileResponse,
    summary="Update current user",
    description="Update the current user's profile including display name, job title, phone, timezone, bio, and language.",
)
async def update_current_user(
    request: UpdateProfileRequest,
    current_user: CurrentUserDep,
) -> ExtendedUserProfileResponse:
    """Update current user profile.

    Updatable fields:
    - display_name: Display name (1-100 chars)
    - job_title: Professional title (max 100 chars)
    - phone: Phone number (max 50 chars)
    - timezone: IANA timezone string (e.g., "Asia/Kolkata")
    - bio: Short biography (max 500 chars)
    - preferred_language: Language code (e.g., "en-IN")
    """
    pool = await get_postgres_pool()
    now = datetime.now(timezone.utc)

    # Build dynamic update
    updates = ["updated_at = $2"]
    params: list = [current_user.user_id, now]
    param_idx = 3

    if request.display_name is not None:
        updates.append(f"display_name = ${param_idx}")
        params.append(request.display_name.strip())
        param_idx += 1

    if request.job_title is not None:
        updates.append(f"job_title = ${param_idx}")
        params.append(request.job_title.strip() if request.job_title else None)
        param_idx += 1

    if request.phone is not None:
        updates.append(f"phone = ${param_idx}")
        params.append(request.phone.strip() if request.phone else None)
        param_idx += 1

    if request.timezone is not None:
        updates.append(f"timezone = ${param_idx}")
        params.append(request.timezone)
        param_idx += 1

    if request.bio is not None:
        updates.append(f"bio = ${param_idx}")
        params.append(request.bio.strip() if request.bio else None)
        param_idx += 1

    if request.preferred_language is not None:
        updates.append(f"preferred_language = ${param_idx}")
        params.append(request.preferred_language)
        param_idx += 1

    # Update user and fetch extended profile
    query = f"""
        UPDATE users SET {', '.join(updates)}
        WHERE user_id = $1
        RETURNING user_id, email, display_name, email_verified,
                  preferred_language, created_at,
                  avatar_url, job_title, phone,
                  COALESCE(timezone, 'Asia/Kolkata') as timezone,
                  bio, last_password_changed_at, deletion_requested_at
    """

    row = await pool.fetchrow(query, *params)

    if not row:
        raise NotFoundError("User", str(current_user.user_id))

    # Get TOTP status
    totp_row = await pool.fetchrow(
        "SELECT totp_enabled FROM user_totp_settings WHERE user_id = $1",
        current_user.user_id,
    )
    totp_enabled = totp_row["totp_enabled"] if totp_row else False

    fields_updated = [f for f in ["display_name", "job_title", "phone", "timezone", "bio", "preferred_language"]
                      if getattr(request, f, None) is not None]

    logger.info(
        "User profile updated",
        extra={
            "user_id": str(current_user.user_id),
            "fields_updated": fields_updated,
        },
    )

    # Audit log profile update
    audit_service = AuditService()
    await audit_service.log_event(
        event_type=AuditEventType.USER_PROFILE_UPDATED,
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
        actor_user_id=current_user.user_id,
        target_entity_type="user",
        target_entity_id=current_user.user_id,
        details={"fields_updated": fields_updated},
    )

    return ExtendedUserProfileResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        email_verified=row["email_verified"],
        preferred_language=row["preferred_language"] or "en-IN",
        created_at=row["created_at"],
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
        avatar_url=row["avatar_url"],
        job_title=row["job_title"],
        phone=row["phone"],
        timezone=row["timezone"],
        bio=row["bio"],
        totp_enabled=totp_enabled,
        last_password_changed_at=row["last_password_changed_at"],
        deletion_requested_at=row["deletion_requested_at"],
    )


# ---------------------------------------------------------------------------
# Avatar management endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/me/avatar",
    response_model=AvatarUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload user avatar",
    description="Upload a new profile avatar image. Accepts JPEG, PNG, or WebP up to 5MB.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid file"},
        413: {"model": ErrorResponse, "description": "File too large (max 5MB)"},
        422: {"model": ErrorResponse, "description": "Unsupported format"},
    },
)
async def upload_user_avatar(
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="Avatar image file (JPEG, PNG, or WebP)"),
    crop_x: Annotated[float | None, Query(ge=0, le=1, description="Crop X offset (0-1 scale)")] = None,
    crop_y: Annotated[float | None, Query(ge=0, le=1, description="Crop Y offset (0-1 scale)")] = None,
    crop_scale: Annotated[float | None, Query(ge=0.1, le=10.0, description="Crop zoom scale")] = None,
) -> AvatarUploadResponse:
    """Upload and process a new user avatar image.

    The image will be cropped to square, resized, and stored in multiple sizes:
    - original: 512x512
    - medium: 256x256
    - small: 128x128
    - tiny: 64x64
    """
    service = get_user_avatar_service()

    try:
        # Read file data
        file_data = await file.read()

        result = await service.upload_avatar(
            user_id=current_user.user_id,
            file_data=file_data,
            content_type=file.content_type,
            crop_x=crop_x,
            crop_y=crop_y,
            crop_scale=crop_scale,
        )

        logger.info(
            "User avatar uploaded",
            extra={"user_id": str(current_user.user_id)},
        )

        # Audit log avatar upload
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.USER_AVATAR_UPLOADED,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            actor_user_id=current_user.user_id,
            target_entity_type="user",
            target_entity_id=current_user.user_id,
            details={"avatar_url": result["avatar_url"]},
        )

        return AvatarUploadResponse(
            avatar_url=result["avatar_url"],
            thumbnails=result["thumbnails"],
        )

    except UserAvatarFileTooLargeError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=413,
        )
    except UserAvatarInvalidFormatError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=422,
        )
    except UserAvatarError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=400,
        )
    except Exception as e:
        logger.exception("Failed to upload user avatar")
        raise InternalError("Failed to upload avatar")


@router.delete(
    "/me/avatar",
    response_model=MessageResponse,
    summary="Delete user avatar",
    description="Remove the current user's avatar image.",
)
async def delete_user_avatar(
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Delete the current user's avatar."""
    service = get_user_avatar_service()

    try:
        await service.delete_avatar(current_user.user_id)

        logger.info(
            "User avatar deleted",
            extra={"user_id": str(current_user.user_id)},
        )

        # Audit log avatar deletion
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.USER_AVATAR_DELETED,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            actor_user_id=current_user.user_id,
            target_entity_type="user",
            target_entity_id=current_user.user_id,
        )

        return MessageResponse(message="Avatar deleted successfully")

    except UserAvatarError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=400,
        )
    except Exception as e:
        logger.exception("Failed to delete user avatar")
        raise InternalError("Failed to delete avatar")


# ---------------------------------------------------------------------------
# Email change endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/me/email",
    response_model=MessageResponse,
    summary="Request email change",
    description="Request to change email address. Sends verification email to new address.",
    responses={
        403: {"model": ErrorResponse, "description": "Password incorrect"},
        409: {"model": ErrorResponse, "description": "Email in use or change pending"},
    },
)
async def request_email_change(
    request: EmailChangeRequest,
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Request email address change.

    Requires current password verification. Sends verification email to the new address.
    The email change will only complete after the user clicks the verification link.
    """
    auth_service = AuthService()

    try:
        await auth_service.request_email_change(
            user_id=current_user.user_id,
            new_email=request.new_email,
            current_password=request.password,
        )

        logger.info(
            "Email change requested",
            extra={
                "user_id": str(current_user.user_id),
                "new_email": request.new_email,
            },
        )

        # Audit log email change request
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.USER_EMAIL_CHANGE_REQUESTED,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            actor_user_id=current_user.user_id,
            target_entity_type="user",
            target_entity_id=current_user.user_id,
            details={"new_email": request.new_email},
        )

        return MessageResponse(
            message="Verification email sent to your new address. Please check your inbox."
        )

    except PasswordIncorrectError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=403,
        )
    except EmailAlreadyInUseError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=409,
        )
    except EmailChangePendingError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=409,
        )
    except Exception as e:
        logger.exception("Failed to request email change")
        raise InternalError("Failed to request email change")


# ---------------------------------------------------------------------------
# Session management endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/me/sessions",
    response_model=SessionListResponse,
    summary="List active sessions",
    description="List all active sessions for the current user.",
)
async def list_user_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> SessionListResponse:
    """List all active sessions for current user."""
    sessions = await session_service.list_user_sessions(current_user.user_id)

    # Get current session ID from token (if available)
    current_session_id = getattr(current_user, "session_id", None)

    return SessionListResponse(
        items=[
            SessionResponse(
                session_id=s.session_id,
                device_info=s.device_info,
                ip_address=s.ip_address,
                user_agent=s.user_agent,
                created_at=s.created_at,
                last_used_at=s.last_used_at,
                is_current=s.session_id == current_session_id if current_session_id else False,
            )
            for s in sessions
        ]
    )


@router.delete(
    "/me/sessions/{session_id}",
    response_model=MessageResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Terminate session",
    description="Terminate a specific session (logout from that device).",
)
async def terminate_session(
    session_id: UUID,
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> MessageResponse:
    """Terminate a specific session.

    Property 9: Session Termination Token Invalidation
    """
    # Verify session belongs to current user
    pool = await get_postgres_pool()
    session = await pool.fetchrow(
        "SELECT user_id FROM sessions WHERE session_id = $1",
        session_id,
    )

    if not session:
        raise NotFoundError("Session", str(session_id))

    if session["user_id"] != current_user.user_id:
        raise ForbiddenError("Cannot terminate another user's session")

    await session_service.terminate_session(session_id)

    logger.info(
        "Session terminated",
        extra={
            "session_id": str(session_id),
            "user_id": str(current_user.user_id),
        },
    )

    return MessageResponse(message="Session terminated successfully")


@router.delete(
    "/me/sessions",
    response_model=MessageResponse,
    summary="Terminate all other sessions",
    description="Logout from all devices except the current one.",
)
async def terminate_all_other_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> MessageResponse:
    """Terminate all sessions except current."""
    current_session_id = getattr(current_user, "session_id", None)

    count = await session_service.terminate_all_sessions(
        user_id=current_user.user_id,
        except_session_id=current_session_id,
    )

    logger.info(
        "All other sessions terminated",
        extra={
            "user_id": str(current_user.user_id),
            "count": count,
        },
    )

    return MessageResponse(message=f"Terminated {count} session(s)")


# ---------------------------------------------------------------------------
# Security endpoints (T029-T036)
# ---------------------------------------------------------------------------


def _get_totp_service() -> TOTPService:
    return get_totp_service()


TOTPServiceDep = Annotated[TOTPService, Depends(_get_totp_service)]


@router.post(
    "/me/password",
    response_model=MessageResponse,
    summary="Change password",
    description="Change password with optional session invalidation.",
    responses={
        200: {"description": "Password changed successfully"},
        403: {"description": "Current password incorrect", "model": ErrorResponse},
    },
)
async def change_password(
    request: ChangePasswordRequest,
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Change user password.

    Requires current password verification. Optionally invalidates all other sessions.
    """
    auth_service = AuthService()
    audit_service = AuditService()

    try:
        current_session_id = getattr(current_user, "session_id", None)

        await auth_service.change_password(
            user_id=current_user.user_id,
            current_password=request.current_password,
            new_password=request.new_password,
            invalidate_other_sessions=True,
            current_session_id=current_session_id,
        )

        # Audit log
        await audit_service.log(
            event_type=AuditEventType.USER_SETTINGS_UPDATED,
            user_id=current_user.user_id,
            workspace_id=current_user.workspace_id,
            details={"action": "password_changed", "other_sessions_invalidated": True},
        )

        return MessageResponse(message="Password changed successfully")

    except PasswordIncorrectError as e:
        raise ForbiddenError(str(e))


@router.get(
    "/me/2fa",
    response_model=TwoFactorStatusResponse,
    summary="Get 2FA status",
    description="Check if two-factor authentication is enabled.",
)
async def get_2fa_status(
    current_user: CurrentUserDep,
    totp_service: TOTPServiceDep,
) -> TwoFactorStatusResponse:
    """Get 2FA status for current user."""
    status = await totp_service.get_status(current_user.user_id)

    return TwoFactorStatusResponse(
        enabled=status.enabled,
        enabled_at=status.enabled_at,
        backup_codes_remaining=status.backup_codes_remaining,
    )


@router.post(
    "/me/2fa/setup",
    response_model=TwoFactorSetupResponse,
    summary="Initialize 2FA setup",
    description="Start 2FA setup process. Returns secret and QR code.",
    responses={
        200: {"description": "Setup initiated"},
        409: {"description": "2FA already enabled", "model": ErrorResponse},
    },
)
async def setup_2fa(
    current_user: CurrentUserDep,
    totp_service: TOTPServiceDep,
) -> TwoFactorSetupResponse:
    """Initialize 2FA setup.

    Returns TOTP secret and QR code for authenticator app.
    User must verify with a code before 2FA is enabled.
    """
    try:
        result = await totp_service.setup(
            user_id=current_user.user_id,
            email=current_user.email,
        )

        return TwoFactorSetupResponse(
            secret=result.secret,
            qr_code_uri=result.qr_code_uri,
            qr_code_svg=result.qr_code_svg,
            issuer=result.issuer,
        )

    except TOTPAlreadyEnabledError as e:
        raise AppError(str(e), e.code, 409)


@router.post(
    "/me/2fa/verify",
    response_model=TwoFactorEnabledResponse,
    summary="Verify and enable 2FA",
    description="Verify TOTP code to complete 2FA setup.",
    responses={
        200: {"description": "2FA enabled successfully"},
        400: {"description": "Invalid code or setup expired", "model": ErrorResponse},
    },
)
async def verify_2fa(
    request: Verify2FARequest,
    current_user: CurrentUserDep,
    totp_service: TOTPServiceDep,
) -> TwoFactorEnabledResponse:
    """Verify TOTP code and enable 2FA.

    Returns backup codes that should be stored securely.
    """
    audit_service = AuditService()

    try:
        result = await totp_service.verify_and_enable(
            user_id=current_user.user_id,
            code=request.code,
        )

        # Audit log
        await audit_service.log(
            event_type=AuditEventType.USER_2FA_ENABLED,
            user_id=current_user.user_id,
            workspace_id=current_user.workspace_id,
            details={"backup_codes_generated": len(result.backup_codes)},
        )

        return TwoFactorEnabledResponse(
            message="Two-factor authentication enabled",
            backup_codes=result.backup_codes,
        )

    except TOTPSetupExpiredError as e:
        raise AppError(str(e), e.code, 400)
    except TOTPInvalidCodeError as e:
        raise AppError(str(e), e.code, 400)
    except TOTPAlreadyEnabledError as e:
        raise AppError(str(e), e.code, 409)


@router.delete(
    "/me/2fa",
    response_model=MessageResponse,
    summary="Disable 2FA",
    description="Disable two-factor authentication.",
    responses={
        200: {"description": "2FA disabled"},
        400: {"description": "Invalid code", "model": ErrorResponse},
        403: {"description": "2FA not enabled", "model": ErrorResponse},
    },
)
async def disable_2fa(
    request: Disable2FARequest,
    current_user: CurrentUserDep,
    totp_service: TOTPServiceDep,
) -> MessageResponse:
    """Disable 2FA.

    Requires both password and current TOTP code for security.
    """
    auth_service = AuthService()
    audit_service = AuditService()

    # Verify password first
    try:
        pool = await get_postgres_pool()
        row = await pool.fetchrow(
            "SELECT password_hash FROM user_identities WHERE user_id = $1 AND provider = 'local'",
            current_user.user_id,
        )
        if not row:
            raise ForbiddenError("Password verification failed")

        from app.utils.security import verify_password
        from app.config.settings import get_settings

        if not verify_password(request.password, row["password_hash"], get_settings()):
            raise ForbiddenError("Password verification failed")

    except ForbiddenError:
        raise

    try:
        await totp_service.disable(
            user_id=current_user.user_id,
            code=request.code,
        )

        # Audit log
        await audit_service.log(
            event_type=AuditEventType.USER_2FA_DISABLED,
            user_id=current_user.user_id,
            workspace_id=current_user.workspace_id,
            details={},
        )

        return MessageResponse(message="Two-factor authentication disabled")

    except TOTPNotEnabledError as e:
        raise ForbiddenError(str(e))
    except TOTPInvalidCodeError as e:
        raise AppError(str(e), e.code, 400)


@router.post(
    "/me/2fa/backup-codes",
    response_model=BackupCodesResponse,
    summary="Regenerate backup codes",
    description="Generate new backup codes, invalidating old ones.",
    responses={
        200: {"description": "New backup codes generated"},
        403: {"description": "2FA not enabled or password incorrect", "model": ErrorResponse},
    },
)
async def regenerate_backup_codes(
    request: PasswordConfirmRequest,
    current_user: CurrentUserDep,
    totp_service: TOTPServiceDep,
) -> BackupCodesResponse:
    """Regenerate backup codes.

    Requires password confirmation. All existing codes are invalidated.
    """
    # Verify password first
    pool = await get_postgres_pool()
    row = await pool.fetchrow(
        "SELECT password_hash FROM user_identities WHERE user_id = $1 AND provider = 'local'",
        current_user.user_id,
    )
    if not row:
        raise ForbiddenError("Password verification failed")

    from app.utils.security import verify_password
    from app.config.settings import get_settings

    if not verify_password(request.password, row["password_hash"], get_settings()):
        raise ForbiddenError("Password verification failed")

    try:
        backup_codes = await totp_service.regenerate_backup_codes(current_user.user_id)

        return BackupCodesResponse(backup_codes=backup_codes)

    except TOTPNotEnabledError as e:
        raise ForbiddenError(str(e))


# ---------------------------------------------------------------------------
# Notification preference endpoints (T045-T047)
# ---------------------------------------------------------------------------


def _get_notification_service() -> NotificationService:
    return NotificationService()


def _get_privacy_service() -> PrivacyService:
    return PrivacyService()


def _get_data_export_service() -> DataExportService:
    return DataExportService()


NotificationServiceDep = Annotated[NotificationService, Depends(_get_notification_service)]
PrivacyServiceDep = Annotated[PrivacyService, Depends(_get_privacy_service)]
DataExportServiceDep = Annotated[DataExportService, Depends(_get_data_export_service)]


@router.get(
    "/me/notifications",
    response_model=NotificationPreferencesResponse,
    summary="Get notification preferences",
    description="Get current notification preferences for email and in-app channels.",
)
async def get_notification_preferences(
    current_user: CurrentUserDep,
    notification_service: NotificationServiceDep,
) -> NotificationPreferencesResponse:
    """Get notification preferences.

    Returns preferences for:
    - Email notifications (gallery_activity, client_interactions, system_alerts, marketing)
    - In-app notifications (same categories)
    """
    prefs = await notification_service.get_preferences(current_user.user_id)

    return NotificationPreferencesResponse(
        email={
            "gallery_activity": prefs.email.gallery_activity,
            "client_interactions": prefs.email.client_interactions,
            "system_alerts": prefs.email.system_alerts,
            "marketing": prefs.email.marketing,
        },
        in_app={
            "gallery_activity": prefs.in_app.gallery_activity,
            "client_interactions": prefs.in_app.client_interactions,
            "system_alerts": prefs.in_app.system_alerts,
            "marketing": prefs.in_app.marketing,
        },
    )


@router.patch(
    "/me/notifications",
    response_model=NotificationPreferencesResponse,
    summary="Update notification preferences",
    description="Partially update notification preferences for email and/or in-app channels.",
)
async def update_notification_preferences(
    request: UpdateNotificationPreferencesRequest,
    current_user: CurrentUserDep,
    notification_service: NotificationServiceDep,
) -> NotificationPreferencesResponse:
    """Update notification preferences.

    Supports partial updates - only specified fields are changed.
    Example: {"email": {"marketing": false}} only changes email marketing preference.
    """
    prefs = await notification_service.update_preferences(
        user_id=current_user.user_id,
        email_updates=request.email,
        in_app_updates=request.in_app,
    )

    # Audit log (user-level setting, no specific workspace)
    audit_service = AuditService()
    await audit_service.log_event(
        event_type=AuditEventType.USER_SETTINGS_UPDATED,
        actor_user_id=current_user.user_id,
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
        details={
            "setting_type": "notifications",
            "email_updates": request.email,
            "in_app_updates": request.in_app,
        },
    )

    logger.info(
        "Notification preferences updated",
        extra={
            "user_id": str(current_user.user_id),
            "email_updates": request.email,
            "in_app_updates": request.in_app,
        },
    )

    return NotificationPreferencesResponse(
        email={
            "gallery_activity": prefs.email.gallery_activity,
            "client_interactions": prefs.email.client_interactions,
            "system_alerts": prefs.email.system_alerts,
            "marketing": prefs.email.marketing,
        },
        in_app={
            "gallery_activity": prefs.in_app.gallery_activity,
            "client_interactions": prefs.in_app.client_interactions,
            "system_alerts": prefs.in_app.system_alerts,
            "marketing": prefs.in_app.marketing,
        },
    )


# ---------------------------------------------------------------------------
# Privacy settings endpoints (T053-T054)
# ---------------------------------------------------------------------------


@router.get(
    "/me/privacy",
    response_model=PrivacySettingsResponse,
    summary="Get privacy settings",
    description="Retrieve current privacy settings for the authenticated user.",
)
async def get_privacy_settings(
    current_user: CurrentUserDep,
    privacy_service: PrivacyServiceDep,
) -> PrivacySettingsResponse:
    """Get current privacy settings."""
    settings = await privacy_service.get_settings(user_id=str(current_user.user_id))

    return PrivacySettingsResponse(
        analytics_enabled=settings.analytics_enabled,
        public_profile_enabled=settings.public_profile_enabled,
    )


@router.patch(
    "/me/privacy",
    response_model=PrivacySettingsResponse,
    summary="Update privacy settings",
    description="Update privacy settings. Only specified fields are changed.",
)
async def update_privacy_settings(
    request: UpdatePrivacySettingsRequest,
    current_user: CurrentUserDep,
    privacy_service: PrivacyServiceDep,
) -> PrivacySettingsResponse:
    """Update privacy settings."""
    settings = await privacy_service.update_settings(
        user_id=str(current_user.user_id),
        analytics_enabled=request.analytics_enabled,
        public_profile_enabled=request.public_profile_enabled,
    )

    # Audit log
    audit_service = AuditService()
    await audit_service.log_event(
        event_type=AuditEventType.USER_SETTINGS_UPDATED,
        actor_user_id=current_user.user_id,
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
        details={
            "setting_type": "privacy",
            "analytics_enabled": request.analytics_enabled,
            "public_profile_enabled": request.public_profile_enabled,
        },
    )

    logger.info(
        "Privacy settings updated",
        extra={
            "user_id": str(current_user.user_id),
            "analytics_enabled": request.analytics_enabled,
            "public_profile_enabled": request.public_profile_enabled,
        },
    )

    return PrivacySettingsResponse(
        analytics_enabled=settings.analytics_enabled,
        public_profile_enabled=settings.public_profile_enabled,
    )


# ---------------------------------------------------------------------------
# Data export endpoints (T055-T056)
# ---------------------------------------------------------------------------


@router.post(
    "/me/export",
    response_model=DataExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request data export",
    description="Request a GDPR-compliant export of all user data. Rate limited to 1 per 24 hours.",
    responses={
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)
async def request_data_export(
    current_user: CurrentUserDep,
    data_export_service: DataExportServiceDep,
) -> DataExportResponse:
    """Request data export. Creates an async job to gather all user data."""
    try:
        export = await data_export_service.request_export(user_id=str(current_user.user_id))

        # Audit log
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.DATA_EXPORT_REQUESTED,
            actor_user_id=current_user.user_id,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            details={"export_id": export.export_id},
        )

        logger.info(
            "Data export requested",
            extra={
                "user_id": str(current_user.user_id),
                "export_id": export.export_id,
            },
        )

        return DataExportResponse(
            export_id=export.export_id,
            status=export.status.value,
            requested_at=export.requested_at,
            completed_at=export.completed_at,
            download_url=export.download_url,
            expires_at=export.expires_at,
        )

    except ExportRateLimitError as e:
        raise AppError(
            message=f"You can only request one export per 24 hours. Try again in {e.retry_after_seconds // 3600} hours.",
            code="RATE_LIMIT_EXCEEDED",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(e.retry_after_seconds)},
        )


@router.get(
    "/me/export",
    response_model=DataExportResponse,
    summary="Get export status",
    description="Get the status of the latest data export request.",
    responses={
        404: {"model": ErrorResponse, "description": "No export request found"},
    },
)
async def get_export_status(
    current_user: CurrentUserDep,
    data_export_service: DataExportServiceDep,
) -> DataExportResponse:
    """Get the latest export request status."""
    export = await data_export_service.get_latest_export(user_id=str(current_user.user_id))

    if not export:
        raise NotFoundError(resource="Data export")

    return DataExportResponse(
        export_id=export.export_id,
        status=export.status.value,
        requested_at=export.requested_at,
        completed_at=export.completed_at,
        download_url=export.download_url,
        expires_at=export.expires_at,
    )


# ---------------------------------------------------------------------------
# Account deletion endpoints (T062-T079)
# ---------------------------------------------------------------------------


def _get_account_deletion_service() -> AccountDeletionService:
    return AccountDeletionService()


AccountDeletionServiceDep = Annotated[AccountDeletionService, Depends(_get_account_deletion_service)]


@router.post(
    "/me/deletion",
    response_model=AccountDeletionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request account deletion",
    description="Request GDPR-compliant account deletion with 30-day grace period.",
    responses={
        202: {"description": "Deletion request accepted"},
        403: {"description": "Password verification failed", "model": ErrorResponse},
        409: {"description": "Deletion already requested", "model": ErrorResponse},
        429: {"description": "Too many attempts", "model": ErrorResponse},
    },
)
async def request_account_deletion(
    request_obj: Request,
    request: DeleteAccountRequest,
    current_user: CurrentUserDep,
    account_deletion_service: AccountDeletionServiceDep,
) -> AccountDeletionResponse:
    """Request account deletion.

    Requires password verification with rate limiting. Initiates 30-day grace
    period during which the user can cancel the deletion by logging in.

    Rate limited: 10 attempts per 15 minutes per IP to prevent brute force.
    """
    # Rate limit password verification attempts by IP (same as auth endpoints)
    ip_address = request_obj.client.host if request_obj.client else "unknown"
    rate_limit_service = RateLimitService()
    rate_limit_result = await rate_limit_service.check_rate_limit(
        identifier=f"deletion:{ip_address}",
        limit_type=RateLimitType.AUTH,
    )

    if not rate_limit_result.allowed:
        raise AppError(
            message=f"Too many attempts. Please try again in {rate_limit_result.retry_after} seconds.",
            code="RATE_LIMIT_EXCEEDED",
            status_code=429,
        )

    # Use AuthService pattern for password verification
    from app.utils.security import verify_password
    from app.config.settings import get_settings

    pool = await get_postgres_pool()
    row = await pool.fetchrow(
        "SELECT password_hash FROM user_identities WHERE user_id = $1 AND provider = 'local'",
        current_user.user_id,
    )
    if not row:
        # No local identity - user may have signed up via OAuth only
        raise ForbiddenError("Password verification failed. OAuth-only accounts must use a different method.")

    if not verify_password(request.password, row["password_hash"], get_settings()):
        # Log failed attempt for security monitoring
        logger.warning(
            "Failed password verification for account deletion",
            extra={
                "user_id": str(current_user.user_id),
                "ip_address": ip_address,
            },
        )
        raise ForbiddenError("Password verification failed")

    try:
        deletion = await account_deletion_service.request_deletion(
            user_id=str(current_user.user_id),
            reason=request.reason,
        )

        # Audit log
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.USER_DELETION_REQUESTED,
            actor_user_id=current_user.user_id,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            details={
                "deletion_id": deletion.deletion_id,
                "scheduled_deletion_at": deletion.scheduled_deletion_at.isoformat(),
            },
        )

        logger.info(
            "Account deletion requested",
            extra={
                "user_id": str(current_user.user_id),
                "deletion_id": deletion.deletion_id,
                "scheduled_deletion_at": deletion.scheduled_deletion_at.isoformat(),
            },
        )

        return AccountDeletionResponse(
            deletion_id=deletion.deletion_id,
            status=deletion.status.value,
            reason=deletion.reason,
            requested_at=deletion.requested_at,
            scheduled_deletion_at=deletion.scheduled_deletion_at,
            cancelled_at=deletion.cancelled_at,
            completed_at=deletion.completed_at,
            days_until_deletion=deletion.days_until_deletion,
            can_cancel=deletion.status.value == "pending",
            message="Account deletion scheduled. You have 30 days to cancel by logging in.",
        )

    except DeletionAlreadyRequestedError as e:
        raise AppError(
            message=str(e),
            code="DELETION_ALREADY_REQUESTED",
            status_code=409,
        )


@router.get(
    "/me/deletion",
    response_model=DeletionStatusResponse,
    summary="Get deletion status",
    description="Check if there's a pending account deletion request.",
)
async def get_deletion_status(
    current_user: CurrentUserDep,
    account_deletion_service: AccountDeletionServiceDep,
) -> DeletionStatusResponse:
    """Get account deletion status."""
    deletion = await account_deletion_service.get_deletion_status(str(current_user.user_id))

    if not deletion or deletion.status.value not in ("pending", "processing"):
        return DeletionStatusResponse(
            has_pending_deletion=False,
            can_cancel=False,
        )

    return DeletionStatusResponse(
        has_pending_deletion=True,
        deletion_id=deletion.deletion_id,
        scheduled_deletion_at=deletion.scheduled_deletion_at,
        days_until_deletion=deletion.days_until_deletion,
        can_cancel=deletion.status.value == "pending",
    )


@router.delete(
    "/me/deletion",
    response_model=MessageResponse,
    summary="Cancel deletion request",
    description="Cancel a pending account deletion request during the grace period.",
    responses={
        200: {"description": "Deletion cancelled"},
        404: {"description": "No pending deletion found", "model": ErrorResponse},
        409: {"description": "Deletion cannot be cancelled", "model": ErrorResponse},
    },
)
async def cancel_deletion(
    current_user: CurrentUserDep,
    account_deletion_service: AccountDeletionServiceDep,
) -> MessageResponse:
    """Cancel account deletion request.

    Only possible during the 30-day grace period.
    """
    try:
        deletion = await account_deletion_service.cancel_deletion(str(current_user.user_id))

        # Audit log
        audit_service = AuditService()
        await audit_service.log_event(
            event_type=AuditEventType.USER_DELETION_CANCELLED,
            actor_user_id=current_user.user_id,
            workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
            details={"deletion_id": deletion.deletion_id},
        )

        logger.info(
            "Account deletion cancelled",
            extra={
                "user_id": str(current_user.user_id),
                "deletion_id": deletion.deletion_id,
            },
        )

        return MessageResponse(message="Account deletion cancelled. Your account is now active.")

    except DeletionNotFoundError as e:
        raise NotFoundError(resource="Deletion request")
    except DeletionCannotBeCancelledError as e:
        raise AppError(
            message=str(e),
            code="DELETION_CANNOT_BE_CANCELLED",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Data Export Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/me/export",
    response_model=DataExportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request data export",
    description="Request a copy of your data (GDPR/Takeout). One request allowed per 24 hours.",
    responses={
        429: {"description": "Rate limit exceeded (1 per 24h)", "model": ErrorResponse},
        409: {"description": "Export already pending", "model": ErrorResponse},
    },
)
async def request_data_export(
    current_user: CurrentUserDep,
) -> DataExportResponse:
    """Request data export.

    Creates a background job to collect all user data.
    """
    service = DataExportService()
    try:
        export = await service.request_export(str(current_user.user_id))
        return DataExportResponse(
            export_id=export.export_id,
            status=export.status,
            requested_at=export.requested_at,
            completed_at=export.completed_at,
            download_url=export.download_url,
            expires_at=export.expires_at,
        )
    except ExportRateLimitError as e:
        raise AppError(
            message=str(e),
            code="EXPORT_RATE_LIMITED",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )


@router.get(
    "/me/export",
    response_model=DataExportResponse,
    summary="Get export status",
    description="Get status of the latest data export request.",
    responses={
        404: {"description": "No export status found", "model": ErrorResponse},
    },
)
async def get_data_export_status(
    current_user: CurrentUserDep,
) -> DataExportResponse:
    """Get status of latest data export."""
    service = DataExportService()
    export = await service.get_latest_export(str(current_user.user_id))

    if not export:
        raise NotFoundError("Data export request")

    return DataExportResponse(
        export_id=export.export_id,
        status=export.status,
        requested_at=export.requested_at,
        completed_at=export.completed_at,
        download_url=export.download_url,
        expires_at=export.expires_at,
    )

