"""Personal Profile API Endpoints.

Routes for managing personal profile digital visiting cards.
"""

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query, Request, status, Response, UploadFile, File

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.personal_profile_schemas import (
    CreatePersonalProfileRequest,
    UpdatePersonalProfileRequest,
    PersonalProfileResponse,
    PublicPersonalProfileResponse,
    SlugAvailabilityResponse,
    AvatarUploadResponse,
)
from app.services.personal_profile_service import (
    get_personal_profile_service,
    PersonalProfileError,
    ProfileNotFoundError,
    ProfileAlreadyExistsError,
    SlugAlreadyExistsError,
    AvatarUploadError,
    PublicProfileNotFoundError,
)
from app.services.profile_analytics_service import get_profile_analytics_service
from app.services.vcard_service import VCardService
from app.services.qr_service import QRCodeService
from app.api.exceptions import AppError, NotFoundError, ValidationAppError, InternalError
from app.services.audit_service import log_workspace_event, AuditEventType

logger = logging.getLogger(__name__)


# =============================================================================
# PUBLIC ROUTER (No Authentication Required)
# =============================================================================

public_router = APIRouter()


@public_router.get(
    "/{slug}",
    response_model=PublicPersonalProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get public personal profile",
)
async def get_public_personal_profile(
    slug: Annotated[str, Path(..., description="Profile slug")],
    response: Response,
):
    """Get public personal profile by slug.

    Returns filtered profile data based on visibility settings.
    Only accessible if the profile has is_public=true.
    """
    # Set cache control for 60 seconds to reduce DB load
    response.headers["Cache-Control"] = "public, max-age=60"
    
    service = get_personal_profile_service()
    try:
        data = await service.get_public_profile(slug)

        # Check if workspace allows search engine indexing
        indexable = False
        workspace_id = data.get("workspace_id")
        if workspace_id:
            try:
                from app.services.seo_service import get_seo_service
                seo_service = get_seo_service()
                indexable = await seo_service.is_profile_indexable(workspace_id)
            except Exception:
                logger.warning("Failed to check indexable status", exc_info=True)

        data["indexable"] = indexable

        # Generate SEO schema
        try:
            from app.services.seo_service import SEOSchemaService

            # Build Person schema
            seo_schema = SEOSchemaService.generate_person_schema(data)
            data["seo_schema"] = seo_schema
        except Exception:
            logger.warning("Failed to generate SEO schema, skipping", exc_info=True)

        return data
    except PublicProfileNotFoundError:
        raise NotFoundError("Profile", slug)
    except PersonalProfileError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to get public personal profile")
        raise InternalError("Failed to retrieve public profile")


@public_router.get(
    "/{slug}/vcard",
    response_class=Response,
    summary="Download personal profile vCard",
)
async def get_personal_profile_vcard(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Download personal profile vCard with embedded avatar (if available)."""
    service = get_personal_profile_service()
    try:
        # Get public profile data
        data = await service.get_public_profile(slug)

        # Check if vCard is visible
        if not data.get("show_vcard", True):
            raise NotFoundError("vCard", slug)

        # Try to fetch avatar for embedding
        avatar_bytes = None
        try:
            result = await service.get_avatar_image_by_slug(slug, 256)
            if result:
                avatar_bytes, _ = result
        except Exception as e:
            logger.debug(f"No avatar available for vCard: {e}")

        # Generate personal vCard
        vcard_content = VCardService.generate_personal_vcard(
            data,
            include_private=False,
            avatar_bytes=avatar_bytes,
            avatar_mime_type="image/webp",
        )

        display_name = data.get("display_name", "contact")
        filename = VCardService.get_filename(display_name)

        return Response(
            content=vcard_content.encode("utf-8"),
            media_type=VCardService.get_content_type(),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except NotFoundError:
        raise
    except PublicProfileNotFoundError:
        raise NotFoundError("Profile", slug)
    except PersonalProfileError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to generate personal vCard")
        raise InternalError("Failed to generate vCard")


@public_router.get(
    "/{slug}/qr-code",
    response_class=Response,
    summary="Get personal profile QR Code",
)
async def get_personal_profile_qr(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Get QR Code for public personal profile."""
    service = get_personal_profile_service()

    # Verify profile exists and is public
    try:
        data = await service.get_public_profile(slug)

        # Check if QR code is visible
        if not data.get("show_qr_code", True):
            raise NotFoundError("QR Code", slug)
    except PublicProfileNotFoundError:
        raise NotFoundError("Profile", slug)

    # Generate QR code with public URL
    public_url = service.generate_public_url(slug)

    try:
        qr_bytes = QRCodeService.generate_qr_code(public_url)
        return Response(
            content=qr_bytes,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        logger.exception("Failed to generate QR code")
        raise InternalError("Failed to generate QR code")


@public_router.get(
    "/{slug}/avatar/{size}",
    response_class=Response,
    summary="Get public profile avatar",
)
async def get_public_personal_profile_avatar(
    slug: Annotated[str, Path(..., description="Profile slug")],
    size: Annotated[int, Path(..., description="Avatar size (64, 128, 256, 512)")],
):
    """Get the public profile avatar image at specified size."""
    service = get_personal_profile_service()
    try:
        result = await service.get_avatar_image_by_slug(slug, size)

        if not result:
            raise NotFoundError("Avatar", slug)

        image_data, content_type = result
        return Response(
            content=image_data,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",  # 24 hour cache
                "Content-Length": str(len(image_data)),
            },
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get public avatar")
        raise InternalError("Failed to get avatar")


@public_router.post(
    "/{slug}/track-view",
    status_code=status.HTTP_200_OK,
    summary="Track profile view",
)
async def track_profile_view(
    slug: Annotated[str, Path(..., description="Profile slug")],
    request: Request,
    referrer: Annotated[Optional[str], Header(alias="Referer")] = None,
    user_agent: Annotated[Optional[str], Header(alias="User-Agent")] = None,
    x_forwarded_for: Annotated[Optional[str], Header(alias="X-Forwarded-For")] = None,
    cf_ipcountry: Annotated[Optional[str], Header(alias="CF-IPCountry")] = None,
    cf_region: Annotated[Optional[str], Header(alias="CF-Region")] = None,
):
    """Track a view on a public profile.

    This endpoint anonymously tracks profile views for analytics.
    No personally identifiable information (PII) is stored.

    Rate limited: One tracked view per visitor per profile per hour.
    """
    analytics_service = get_profile_analytics_service()

    # Get client IP (prefer X-Forwarded-For for proxied requests)
    client_ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else request.client.host if request.client else None

    try:
        result = await analytics_service.track_view(
            profile_slug=slug,
            ip_address=client_ip,
            user_agent=user_agent,
            referrer=referrer,
            country_code=cf_ipcountry,
            region=cf_region,
        )
        return result
    except Exception as e:
        logger.warning(f"Failed to track view for profile {slug}: {e}")
        # Don't fail the request - tracking is non-critical
        return {"success": False, "message": "View tracking temporarily unavailable"}


# =============================================================================
# WORKSPACE-SCOPED ROUTER (Authentication Required)
# =============================================================================

router = APIRouter()


@router.get(
    "/me",
    response_model=PersonalProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get my personal profile",
)
async def get_my_personal_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get the current user's personal profile in this workspace."""
    service = get_personal_profile_service()
    try:
        result = await service.get_profile(workspace_id, current_user.user_id)
        return PersonalProfileResponse(**result)
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except Exception as e:
        logger.exception("Failed to get personal profile")
        raise InternalError("Failed to get personal profile")


@router.get(
    "/me/exists",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Check if personal profile exists",
)
async def check_personal_profile_exists(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Check if current user has a personal profile in this workspace."""
    service = get_personal_profile_service()
    profile = await service.get_profile_optional(workspace_id, current_user.user_id)
    return {"exists": profile is not None, "slug": profile.get("slug") if profile else None}


@router.get(
    "/me/prefill",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get pre-fill data from user profile",
)
async def get_prefill_data(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get suggested pre-fill data from user profile for creating a personal profile."""
    service = get_personal_profile_service()
    return await service.pre_populate_from_user(workspace_id, current_user.user_id)


@router.post(
    "",
    response_model=PersonalProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create personal profile",
)
async def create_personal_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreatePersonalProfileRequest,
):
    """Create a personal profile for the current user in this workspace.

    Each user can have only one personal profile per workspace.
    Slugs are globally unique across all personal profiles.
    """
    service = get_personal_profile_service()
    try:
        result = await service.create_profile(
            workspace_id, current_user.user_id, request
        )

        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_CREATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="personal_profile",
            target_entity_id=UUID(str(result["profile_id"])),
            details={
                "display_name": result["display_name"],
                "slug": result["slug"],
            },
        )

        return PersonalProfileResponse(**result)
    except ProfileAlreadyExistsError:
        raise AppError(
            message="You already have a personal profile in this workspace",
            code="PROFILE_EXISTS",
            status_code=409,
        )
    except SlugAlreadyExistsError as e:
        raise ValidationAppError(str(e), field="slug")
    except PersonalProfileError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to create personal profile")
        raise InternalError("Failed to create personal profile")


@router.patch(
    "/me",
    response_model=PersonalProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Update my personal profile",
)
async def update_my_personal_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: UpdatePersonalProfileRequest,
):
    """Update the current user's personal profile."""
    service = get_personal_profile_service()
    try:
        result = await service.update_profile(
            workspace_id, current_user.user_id, request
        )

        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_UPDATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="personal_profile",
            target_entity_id=UUID(str(result["profile_id"])),
            details={
                "updated_fields": list(request.model_dump(exclude_unset=True).keys())
            },
        )

        return PersonalProfileResponse(**result)
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except SlugAlreadyExistsError as e:
        raise ValidationAppError(str(e), field="slug")
    except PersonalProfileError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to update personal profile")
        raise InternalError("Failed to update personal profile")


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete my personal profile (GDPR right to erasure)",
)
async def delete_my_personal_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Permanently delete the current user's personal profile.

    This action is irreversible and will:
    - Delete all profile data
    - Remove avatar images
    - Clear cached data
    - Log deletion in audit trail for compliance

    Supports GDPR Article 17 (Right to Erasure).
    """
    service = get_personal_profile_service()
    try:
        # Delete profile and get metadata for audit
        deleted_metadata = await service.delete_profile(
            workspace_id, current_user.user_id
        )

        # Log audit event with metadata (no PII)
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_DELETED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="personal_profile",
            target_entity_id=UUID(deleted_metadata["profile_id"]),
            details={
                "slug": deleted_metadata["slug"],
                "was_public": deleted_metadata["was_public"],
                "deletion_reason": "user_requested",
            },
        )

        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except PersonalProfileError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to delete personal profile")
        raise InternalError("Failed to delete personal profile")


@router.get(
    "/check-slug",
    response_model=SlugAvailabilityResponse,
    status_code=status.HTTP_200_OK,
    summary="Check slug availability",
)
async def check_slug_availability(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    slug: Annotated[
        str, Query(..., description="Slug to check", min_length=3, max_length=100)
    ],
):
    """Check if a slug is available for use."""
    service = get_personal_profile_service()

    # Get current profile to exclude from check
    current_profile = await service.get_profile_optional(
        workspace_id, current_user.user_id
    )
    exclude_id = (
        UUID(current_profile["profile_id"]) if current_profile else None
    )

    try:
        result = await service.check_slug_availability(slug, exclude_id)
        return SlugAvailabilityResponse(**result)
    except Exception as e:
        logger.exception("Failed to check slug availability")
        raise InternalError("Failed to check slug availability")


@router.post(
    "/me/avatar",
    response_model=AvatarUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload profile avatar",
)
async def upload_personal_profile_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="Avatar image file"),
    crop_x: Annotated[float, Query(description="Crop X offset percentage")] = None,
    crop_y: Annotated[float, Query(description="Crop Y offset percentage")] = None,
    crop_scale: Annotated[float, Query(description="Crop scale factor")] = None,
):
    """Upload an avatar image for the personal profile."""
    service = get_personal_profile_service()
    try:
        # Read file content
        file_data = await file.read()

        # Build crop data if provided
        crop_data = None
        if crop_x is not None or crop_y is not None or crop_scale is not None:
            crop_data = {
                "crop_x": crop_x if crop_x is not None else 50.0,
                "crop_y": crop_y if crop_y is not None else 50.0,
                "crop_scale": crop_scale if crop_scale is not None else 1.0,
            }

        result = await service.upload_avatar(
            workspace_id,
            current_user.user_id,
            file_data,
            content_type=file.content_type,
            crop_data=crop_data,
        )

        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_UPDATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="personal_profile",
            details={"action": "avatar_uploaded"},
        )

        return AvatarUploadResponse(**result)
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except AvatarUploadError as e:
        raise ValidationAppError(str(e), field="file")
    except Exception as e:
        logger.exception("Failed to upload avatar")
        raise InternalError("Failed to upload avatar")


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete profile avatar",
)
async def delete_personal_profile_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Delete the avatar from the personal profile."""
    service = get_personal_profile_service()
    try:
        await service.delete_avatar(workspace_id, current_user.user_id)

        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_UPDATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="personal_profile",
            details={"action": "avatar_deleted"},
        )

        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except Exception as e:
        logger.exception("Failed to delete avatar")
        raise InternalError("Failed to delete avatar")


@router.get(
    "/me/avatar/{size}",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Get my profile avatar",
)
async def get_my_personal_profile_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    size: Annotated[int, Path(..., description="Avatar size (64, 128, 256, 512)")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get the current user's profile avatar at specified size."""
    service = get_personal_profile_service()
    try:
        result = await service.get_avatar_image(
            workspace_id, current_user.user_id, size
        )

        if not result:
            raise NotFoundError("Avatar", str(current_user.user_id))

        image_data, content_type = result
        return Response(
            content=image_data,
            media_type=content_type,
            headers={
                "Cache-Control": "private, max-age=3600",
                "Content-Length": str(len(image_data)),
            },
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get avatar")
        raise InternalError("Failed to get avatar")


@router.get(
    "/me/preview",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get profile preview URL",
)
async def get_profile_preview_url(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get the public preview URL for the personal profile."""
    service = get_personal_profile_service()
    try:
        profile = await service.get_profile(workspace_id, current_user.user_id)
        slug = profile["slug"]
        public_url = service.generate_public_url(slug)

        return {
            "slug": slug,
            "public_url": public_url,
            "is_public": profile.get("is_public", False),
        }
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except Exception as e:
        logger.exception("Failed to get preview URL")
        raise InternalError("Failed to get preview URL")


# =============================================================================
# ANALYTICS ENDPOINTS
# =============================================================================


@router.get(
    "/me/analytics",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get profile analytics",
)
async def get_profile_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    days: Annotated[int, Query(description="Number of days of history", ge=1, le=90)] = 30,
):
    """Get comprehensive analytics for the current user's personal profile.

    Returns view counts, unique visitors, device breakdown, geographic data,
    referrer sources, and daily time series for charting.
    """
    profile_service = get_personal_profile_service()
    analytics_service = get_profile_analytics_service()

    try:
        # Get profile to ensure it exists
        profile = await profile_service.get_profile(workspace_id, current_user.user_id)
        profile_id = UUID(profile["profile_id"])

        # Get analytics data
        analytics = await analytics_service.get_analytics(
            profile_id=profile_id,
            workspace_id=workspace_id,
            days=days,
        )

        return analytics
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except Exception as e:
        logger.exception("Failed to get profile analytics")
        raise InternalError("Failed to get profile analytics")


@router.get(
    "/me/analytics/quick",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get quick profile stats",
)
async def get_profile_quick_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get quick summary statistics for the current user's personal profile.

    Lightweight endpoint suitable for dashboard widgets.
    Returns total views, today's views, week views, month views.
    """
    profile_service = get_personal_profile_service()
    analytics_service = get_profile_analytics_service()

    try:
        # Get profile to ensure it exists
        profile = await profile_service.get_profile(workspace_id, current_user.user_id)
        profile_id = UUID(profile["profile_id"])

        # Get quick stats
        stats = await analytics_service.get_quick_stats(
            profile_id=profile_id,
            workspace_id=workspace_id,
        )

        return stats
    except ProfileNotFoundError:
        raise NotFoundError("Personal Profile", str(current_user.user_id))
    except Exception as e:
        logger.exception("Failed to get profile quick stats")
        raise InternalError("Failed to get profile quick stats")
