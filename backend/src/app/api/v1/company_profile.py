"""Company Profile API Endpoints.

Routes for managing company branding and profile settings.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status, HTTPException, Response
from fastapi.responses import StreamingResponse

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
    SlugAlreadyExistsError
)
from app.services.vcard_service import VCardService
from app.services.qr_service import QRCodeService
from app.services.seo_service import SEOSchemaService
from app.services.ai_policy_service import get_ai_policy_service, PolicyType
from app.api.exceptions import AppError, ForbiddenError, NotFoundError, ValidationAppError, InternalError
from app.services.audit_service import log_workspace_event, AuditEventType

logger = logging.getLogger(__name__)


public_router = APIRouter()

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
        # We can inject SEO schema into the response or return it alongside
        # For now, client likely requests schema separately or we include it in 'seo_schema' field
        # Use full profile model to generate schema? 
        # get_public_profile returns dict. We need to cast it or change service to return Model.
        # But let's assume dict is sufficient if we match schema fields.
        # Actually Service returns filtered dict.
        
        # NOTE: SEOSchemaService expects CompanyProfileResponse (Pydantic).
        # We should probably instantiate it to be safe.
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
    """Download profile vCard."""
    service = get_company_profile_service()
    try:
        # Get full profile (filtered by public visible inside vcard service anyway, but service.get_public_profile already filters?
        # VCardService takes CompanyProfileResponse. 
        # service.get_public_profile returns FILTERED dict.
        # We should probably get the profile data.
        # But get_public_profile applies visibility. VCardService ALSO applies visibility if we tell it to.
        # Since we are public endpoint, we must use filtered data.
        data = await service.get_public_profile(slug)
        profile_obj = CompanyProfileResponse(**data)
        
        vcard_content = VCardService.generate_vcard(profile_obj, include_private=False)
        filename = VCardService.get_filename(data["name"])
        
        return Response(
            content=vcard_content,
            media_type="text/vcard",
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
