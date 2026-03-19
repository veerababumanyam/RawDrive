"""Company Profile API Endpoints.

Routes for managing company branding and profile settings.
"""

import logging
from pathlib import Path as FilePath
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status, HTTPException, Response, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.company_profile_schemas import (
    CreateCompanyProfileRequest,
    CompanyProfileResponse,
    UpdateCompanyProfileRequest
)
from app.services.company_profile_service import (
    get_company_profile_service,
    CompanyProfileError,
    ProfileNotFoundError,
    SlugAlreadyExistsError,
    LogoUploadError
)
from app.services.vcard_service import VCardService
from app.services.qr_service import QRCodeService
from app.services.seo_service import SEOSchemaService, get_seo_service
from app.services.ai_policy_service import get_ai_policy_service, PolicyType
from app.api.exceptions import AppError, ForbiddenError, NotFoundError, ValidationAppError, InternalError
from app.services.audit_service import log_workspace_event, AuditEventType
from app.api.workspace_settings_schemas import (
    WorkspaceAISettings,
    UpdateWorkspaceAISettingsRequest,
    WorkspaceSecuritySettings,
    UpdateWorkspaceSecuritySettingsRequest,
    WorkspaceNotificationSettings,
    UpdateWorkspaceNotificationSettingsRequest,
    WorkspacePrivacySettings,
    UpdateWorkspacePrivacySettingsRequest,
    WorkspaceDeletionRequest
)
from app.services.workspace_settings_service import get_workspace_settings_service

logger = logging.getLogger(__name__)


public_router = APIRouter()

# Jinja2 templates for server-rendered HTML shell (SEO / social crawlers)
_templates_dir = FilePath(__file__).parent.parent.parent / "templates"
_company_templates = Jinja2Templates(directory=str(_templates_dir))


@public_router.get(
    "/{slug}/page",
    response_class=HTMLResponse,
    summary="Get company profile HTML shell for SEO",
)
async def get_company_profile_html_shell(
    request: Request,
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Serve server-rendered HTML shell with OG/Twitter/JSON-LD meta tags for company profiles."""
    service = get_company_profile_service()
    try:
        data = await service.get_public_profile(slug)
    except CompanyProfileError as e:
        if e.status == 404:
            raise NotFoundError("Profile", slug)
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception:
        logger.exception("Failed to get company profile for HTML shell")
        raise InternalError("Failed to retrieve profile")

    name = data.get("name") or "Photography Studio"
    tagline = data.get("tagline") or ""
    description = tagline[:160] if tagline else f"{name} - Photography Studio on RawDrive"

    from app.config.settings import get_settings
    settings = get_settings()
    base_url = getattr(settings, "public_url", None) or "https://rawdrive.ai"
    canonical_url = f"{base_url}/p/{slug}"
    og_image_url = f"{base_url}/api/v1/p/{slug}/og-image"

    # JSON-LD structured data
    json_ld = "{}"
    try:
        profile_obj = CompanyProfileResponse(**data)
        json_ld = SEOSchemaService.generate_business_schema(profile_obj)
    except Exception:
        logger.warning("Failed to generate JSON-LD for company profile %s", slug, exc_info=True)

    # Check indexability
    indexable = False
    workspace_id = data.get("workspace_id")
    if workspace_id:
        try:
            seo_svc = get_seo_service()
            indexable = await seo_svc.is_profile_indexable(workspace_id)
        except Exception:
            logger.warning("Failed to check indexable status", exc_info=True)

    return _company_templates.TemplateResponse("profile_shell.html", {
        "request": request,
        "title": name,
        "description": description,
        "keywords": "",
        "canonical_url": canonical_url,
        "og_image": og_image_url,
        "json_ld": json_ld,
        "indexable": indexable,
        "dev_mode": False,
    })


@public_router.get(
    "/{slug}/og-image",
    summary="Get company profile OG image",
)
async def get_company_profile_og_image(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Generate and serve a 1200x630 PNG Open Graph image for company profile sharing."""
    service = get_company_profile_service()
    try:
        data = await service.get_public_profile(slug)
    except CompanyProfileError as e:
        if e.status == 404:
            raise NotFoundError("Profile", slug)
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception:
        logger.exception("Failed to get company profile for OG image")
        raise InternalError("Failed to retrieve profile")

    name = data.get("name") or ""
    tagline = data.get("tagline") or ""
    accent_color = data.get("brand_color") or "#3B82F6"

    # Try to fetch logo bytes
    logo_bytes = None
    try:
        result = await service.get_logo_image_by_slug(slug, 256)
        if result and isinstance(result, bytes):
            logo_bytes = result
    except Exception:
        logger.debug("No logo available for company OG image: %s", slug)

    from app.services.og_image_service import get_og_image_service
    og_service = get_og_image_service()
    img_bytes = og_service.generate_og_image(
        name=name,
        title=tagline,
        avatar_bytes=logo_bytes,
        accent_color=accent_color,
        primary_color="#1A1A1A",
    )

    return Response(
        content=img_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@public_router.get(
    "/{slug}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get public profile",
)
async def get_public_profile(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Get public company profile by slug."""
    service = get_company_profile_service()
    try:
        data = await service.get_public_profile(slug)

        # Check if workspace allows search engine indexing
        indexable = False
        workspace_id = data.get("workspace_id")
        if workspace_id:
            try:
                seo_service = get_seo_service()
                indexable = await seo_service.is_profile_indexable(workspace_id)
            except Exception:
                logger.warning("Failed to check indexable status", exc_info=True)

        data["indexable"] = indexable

        # Generate SEO schema
        try:
            profile_obj = CompanyProfileResponse(**data)
            data["seo_schema"] = SEOSchemaService.generate_business_schema(profile_obj)
        except Exception:
            logger.warning("Failed to generate SEO schema, skipping", exc_info=True)

        return data
    except CompanyProfileError as e:
        if e.status == 404:
            raise NotFoundError("Profile", slug)
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to get public profile")
        raise InternalError("Failed to retrieve public profile")

@public_router.get(
    "/{slug}/vcard",
    response_class=Response,
    summary="Download vCard",
)
async def get_profile_vcard(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Download profile vCard with embedded logo (if available)."""
    service = get_company_profile_service()
    try:
        # Get public profile data
        data = await service.get_public_profile(slug)
        profile_obj = CompanyProfileResponse(**data)

        # Try to fetch logo for embedding in vCard
        logo_bytes = None
        try:
            logo_bytes = await service.get_logo_image_by_slug(slug, 256)
        except Exception as e:
            logger.debug(f"No logo available for vCard: {e}")

        # Generate vCard with logo if available
        vcard_content = VCardService.generate_vcard(
            profile_obj,
            include_private=False,
            logo_bytes=logo_bytes,
            logo_mime_type="image/webp",
        )
        filename = VCardService.get_filename(data["name"])

        return Response(
            content=vcard_content.encode('utf-8'),
            media_type=VCardService.get_content_type(),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except CompanyProfileError as e:
        if e.status == 404:
            raise NotFoundError("Profile", slug)
        raise AppError(message=str(e), code=e.code, status_code=e.status)

@public_router.get(
    "/{slug}/qr-code",
    response_class=Response,
    summary="Get QR Code",
)
async def get_profile_qr(
    slug: Annotated[str, Path(..., description="Profile slug")],
):
    """Get QR Code for public profile."""
    # Use centralized URL generation
    service = get_company_profile_service()
    public_url = service.generate_public_url(slug)

    try:
        qr_bytes = QRCodeService.generate_qr_code(public_url)
        return Response(content=qr_bytes, media_type="image/png")
    except Exception as e:
        logger.exception("Failed to generate QR code")
        raise InternalError("Failed to generate QR code")


@public_router.get(
    "/{slug}/logo/{size}",
    response_class=Response,
    summary="Get public profile logo",
)
async def get_public_profile_logo(
    slug: Annotated[str, Path(..., description="Profile slug")],
    size: Annotated[int, Path(..., description="Logo size (64, 128, 256, 512)")],
):
    """Get the public profile logo image at specified size."""
    service = get_company_profile_service()
    try:
        image_data = await service.get_logo_image_by_slug(slug, size)

        if not image_data:
            raise NotFoundError("Logo", slug)

        if isinstance(image_data, dict) and "redirect_url" in image_data:
            from starlette.responses import RedirectResponse
            return RedirectResponse(url=image_data["redirect_url"], status_code=302)

        return Response(
            content=image_data,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=86400",  # 24 hour cache for public logos
                "Content-Length": str(len(image_data)),
            }
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get public logo")
        raise InternalError("Failed to get logo")


router = APIRouter()

# ---------------------------------------------------------------------------
# Workspace Scoped Routes
# ---------------------------------------------------------------------------

@router.get("/ping")
async def ping():
    return {"status": "ok"}

@router.post(
    "",
    response_model=CompanyProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create company profile",
)
async def create_company_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateCompanyProfileRequest,
):
    """Create a company profile for the workspace."""
    service = get_company_profile_service()
    try:
        result = await service.create_profile(workspace_id, request)
        
        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_CREATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="company_profile",
            target_entity_id=UUID(str(result["profile_id"])),
            details={"name": result["name"], "slug": result["slug"]}
        )
        
        return CompanyProfileResponse(**result)
    except SlugAlreadyExistsError as e:
        raise ValidationAppError(str(e), field="slug")
    except CompanyProfileError as e:
        if e.code == "PROFILE_EXISTS":
            raise AppError(message=str(e), code="CONFLICT", status_code=409)
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to create company profile")
        raise InternalError("Failed to create company profile")


@router.get(
    "",
    response_model=CompanyProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get company profile",
)
async def get_company_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get the company profile for the workspace."""
    service = get_company_profile_service()
    try:
        result = await service.get_profile(workspace_id)
        return CompanyProfileResponse(**result)
    except ProfileNotFoundError:
        raise NotFoundError("Company Profile", str(workspace_id))
    except Exception as e:
        logger.exception("Failed to get company profile")
        raise InternalError("Failed to get company profile")


@router.get(
    "/check-slug",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Check slug availability",
)
async def check_slug_availability(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    slug: Annotated[str, Query(..., description="Slug to check", min_length=3, max_length=100)],
):
    """Check if a slug is available for use."""
    service = get_company_profile_service()
    try:
        result = await service.check_slug_availability(slug, workspace_id)
        return result
    except Exception as e:
        logger.exception("Failed to check slug availability")
        raise InternalError("Failed to check slug availability")


@router.post(
    "/logo",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Upload company logo",
)
async def upload_company_logo(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="Logo image file"),
    crop_x: Annotated[float, Query(description="Crop X offset percentage")] = None,
    crop_y: Annotated[float, Query(description="Crop Y offset percentage")] = None,
    crop_scale: Annotated[float, Query(description="Crop scale factor")] = None,
):
    """Upload a logo image for the company profile."""
    service = get_company_profile_service()
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

        result = await service.upload_logo(
            workspace_id,
            file_data,
            content_type=file.content_type,
            crop_data=crop_data
        )

        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_UPDATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="company_profile",
            details={"action": "logo_uploaded", "logo_id": result.get("logo_id")}
        )

        return result
    except LogoUploadError as e:
        raise ValidationAppError(str(e), field="file")
    except Exception as e:
        logger.exception("Failed to upload logo")
        raise InternalError("Failed to upload logo")


@router.get(
    "/logo/{size}",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Get company logo",
)
async def get_company_logo(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    size: Annotated[int, Path(..., description="Logo size (64, 128, 256, 512)")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get the company logo image at specified size."""
    service = get_company_profile_service()
    try:
        image_data = await service.get_logo_image(workspace_id, size)

        if not image_data:
            raise NotFoundError("Logo", str(workspace_id))

        if isinstance(image_data, dict) and "redirect_url" in image_data:
            from starlette.responses import RedirectResponse
            return RedirectResponse(url=image_data["redirect_url"], status_code=302)

        return Response(
            content=image_data,
            media_type="image/webp",
            headers={
                "Cache-Control": "private, max-age=3600",
                "Content-Length": str(len(image_data)),
            }
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get logo")
        raise InternalError("Failed to get logo")


@router.patch(
    "",
    response_model=CompanyProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Update company profile",
)
async def update_company_profile(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: UpdateCompanyProfileRequest,
):
    """Update company profile settings."""
    service = get_company_profile_service()
    try:
        result = await service.update_profile(workspace_id, request)
        
        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.PROFILE_UPDATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="company_profile",
            target_entity_id=UUID(str(result["profile_id"])),
            details={"updated_fields": list(request.model_dump(exclude_unset=True).keys())}
        )
        
        return CompanyProfileResponse(**result)
    except ProfileNotFoundError:
        raise NotFoundError("Company Profile", str(workspace_id))
    except SlugAlreadyExistsError as e:
        raise ValidationAppError(str(e), field="slug")
    except Exception as e:
        logger.exception("Failed to update company profile")
        raise InternalError("Failed to update company profile")



@router.post(
    "/policies/generate",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Generate AI legal policy",
)
async def generate_policy(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    policy_type: PolicyType,
):
    """Generate a legal policy (Privacy, Terms, Refund) using company profile data."""
    profile_service = get_company_profile_service()
    policy_service = get_ai_policy_service()
    
    try:
        # Fetch profile
        profile_data = await profile_service.get_profile(workspace_id)
        profile = CompanyProfileResponse(**profile_data)
        
        # Generate policy
        content = policy_service.generate_policy(profile, policy_type)
        
        # Log audit event
        await log_workspace_event(
            event_type=AuditEventType.POLICY_GENERATED,
            workspace_id=workspace_id,
            actor_user_id=current_user.user_id,
            target_entity_type="company_profile",
            target_entity_id=profile.profile_id,
            details={"policy_type": policy_type}
        )
        
        return {"type": policy_type, "content": content}
        
    except ProfileNotFoundError:
        raise NotFoundError("Company Profile", str(workspace_id))
    except ValueError as e:
        raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to generate policy")
        raise InternalError("Failed to generate policy")


# ---------------------------------------------------------------------------
# Workspace Settings Routes
# ---------------------------------------------------------------------------

from app.services.workspace_ai_settings_service import get_workspace_ai_settings_service
from app.services.workspace_security_service import get_workspace_security_service
from app.services.workspace_notification_service import get_workspace_notification_service
from app.services.workspace_privacy_service import get_workspace_privacy_service
from app.services.workspace_deletion_service import get_workspace_deletion_service

# ... (Previous imports kept by tool, but we need to remove get_workspace_settings_service if no longer used)
# Actually, I should remove 'from app.services.workspace_settings_service import get_workspace_settings_service' 
# but replace_file_content targets a block. I will target the imports + the routes.

# Let's replace the imports first or include them in the chunk.
# The user tool 'replace_file_content' replaces a contiguous block. 
# I will do a large replacement from line 43 (import) to the end.

# ---------------------------------------------------------------------------
# Workspace Settings Routes
# ---------------------------------------------------------------------------

@router.get(
    "/settings/ai",
    response_model=WorkspaceAISettings,
    summary="Get AI settings"
)
async def get_ai_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
):
    """Get workspace AI settings."""
    service = get_workspace_ai_settings_service()
    return await service.get_ai_settings(workspace_id)

@router.patch(
    "/settings/ai",
    response_model=WorkspaceAISettings,
    summary="Update AI settings"
)
async def update_ai_settings(
    request: UpdateWorkspaceAISettingsRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Update workspace AI settings."""
    _, workspace_id = workspace_access
    service = get_workspace_ai_settings_service()
    result = await service.update_ai_settings(workspace_id, request)
    
    await log_workspace_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace_settings",
        details={"type": "ai", "updated_fields": list(request.model_dump(exclude_unset=True).keys())}
    )
    return result

@router.get(
    "/settings/security",
    response_model=WorkspaceSecuritySettings,
    summary="Get security settings"
)
async def get_security_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
):
    """Get workspace security settings."""
    service = get_workspace_security_service()
    return await service.get_security_settings(workspace_id)

@router.patch(
    "/settings/security",
    response_model=WorkspaceSecuritySettings,
    summary="Update security settings"
)
async def update_security_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request: UpdateWorkspaceSecuritySettingsRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Update workspace security settings."""
    service = get_workspace_security_service()
    result = await service.update_security_settings(workspace_id, request)
    
    await log_workspace_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace_settings",
        details={"type": "security", "updated_fields": list(request.model_dump(exclude_unset=True).keys())}
    )
    return result

@router.get(
    "/settings/notifications",
    response_model=WorkspaceNotificationSettings,
    summary="Get notification settings"
)
async def get_notification_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
):
    """Get workspace notification settings."""
    service = get_workspace_notification_service()
    return await service.get_notification_settings(workspace_id)

@router.patch(
    "/settings/notifications",
    response_model=WorkspaceNotificationSettings,
    summary="Update notification settings"
)
async def update_notification_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request: UpdateWorkspaceNotificationSettingsRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Update workspace notification settings."""
    service = get_workspace_notification_service()
    result = await service.update_notification_settings(workspace_id, request)
    
    await log_workspace_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace_settings",
        details={"type": "notifications", "updated_fields": list(request.model_dump(exclude_unset=True).keys())}
    )
    return result

@router.get(
    "/settings/privacy",
    response_model=WorkspacePrivacySettings,
    summary="Get privacy settings"
)
async def get_privacy_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
):
    """Get workspace privacy settings."""
    service = get_workspace_privacy_service()
    return await service.get_privacy_settings(workspace_id)

@router.patch(
    "/settings/privacy",
    response_model=WorkspacePrivacySettings,
    summary="Update privacy settings"
)
async def update_privacy_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request: UpdateWorkspacePrivacySettingsRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Update workspace privacy settings."""
    service = get_workspace_privacy_service()
    result = await service.update_privacy_settings(workspace_id, request)
    
    await log_workspace_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace_settings",
        details={"type": "privacy", "updated_fields": list(request.model_dump(exclude_unset=True).keys())}
    )
    return result

@router.post(
    "/delete",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request workspace deletion"
)
async def request_workspace_deletion(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request: WorkspaceDeletionRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Request deletion of the workspace."""
    if request.confirmation_phrase != "DELETE":
         raise ValidationAppError("Confirmation phrase mismatch. Please type DELETE.", field="confirmation_phrase")
    
    service = get_workspace_deletion_service()
    result = await service.request_workspace_deletion(workspace_id, request.reason, request.reason_details, current_user.user_id)
    
    await log_workspace_event(
        event_type=AuditEventType.WORKSPACE_DELETED, # Intentional reuse for tracking
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace",
        details={"action": "deletion_requested", "reason": request.reason.value}
    )
    
    return result

@router.delete(
    "/delete",
    status_code=status.HTTP_200_OK,
    summary="Cancel workspace deletion"
)
async def cancel_workspace_deletion(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Cancel a pending workspace deletion request."""
    service = get_workspace_deletion_service()
    result = await service.cancel_workspace_deletion(workspace_id, current_user.user_id)
    
    await log_workspace_event(
        event_type=AuditEventType.WORKSPACE_DELETED,
        workspace_id=workspace_id,
        actor_user_id=current_user.user_id,
        target_entity_type="workspace",
        details={"action": "deletion_cancelled"}
    )
    
    return result

@router.get(
    "/delete/status",
    status_code=status.HTTP_200_OK,
    summary="Get deletion status"
)
async def get_deletion_status(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
):
    """Get current workspace deletion status."""
    service = get_workspace_deletion_service()
    return await service.get_deletion_status(workspace_id)
